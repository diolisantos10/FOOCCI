/**
 * Manual retrieval — RAG sobre o Manual Operacional para o assistente do lojista.
 *
 * CORREÇÃO DE UM COMENTÁRIO MENTIROSO (04/08/2026): este cabeçalho afirmava
 * "There are no embeddings in the project", o que era FALSO desde que o
 * KnowledgeEmbeddingService entrou (RestaurantKnowledgeItem.embedding, modelo
 * text-embedding-3-small). A frase induziu ao erro: o manual ficou com retrieval
 * keyword puro por decisão baseada num fato inexistente. Ausência de informação
 * não é informação — e comentário errado é pior que comentário ausente.
 *
 * Hoje o retrieval tem DOIS degraus, na mesma costura do RestaurantKnowledgeAdapter:
 *   1. EMBEDDINGS (v2) — similaridade de cosseno sobre título+descrição+conteúdo,
 *      com backfill lazy do vetor em OperationalManualChapter.embedding;
 *   2. KEYWORD (v1)   — `rankChapters`, puro e testável, é o piso: qualquer falha
 *      (sem OPENAI_API_KEY, erro de API, nenhum vetor) cai aqui EXATAMENTE como antes.
 *
 * Só capítulos publicados E com agentVisibility=true são expostos — o manual
 * interno segue interno; o assistente só vê o que o time liberou para agentes.
 */

import { prisma } from "@/lib/prisma";
import {
  KNOWLEDGE_EMBEDDING_MODEL,
  rankDocumentsByEmbedding,
  type EmbeddingDocumentCodec,
} from "@/services/brain/knowledge/KnowledgeEmbeddingService";

export interface ManualChapterInput {
  id: string;
  slug: string;
  title: string;
  area: string;
  content: string;
  description?: string | null;
  /** Vetor persistido (Json) ou null — usado pelo retrieval por embedding. */
  embedding?: unknown;
  embeddingModel?: string | null;
}

export interface RetrievedChapter extends ManualChapterInput {
  score: number;
}

// Common PT-BR + EN stopwords that carry no retrieval signal.
const STOPWORDS = new Set([
  "a", "o", "as", "os", "um", "uma", "uns", "umas", "de", "da", "do", "das",
  "dos", "e", "ou", "que", "qual", "quais", "como", "para", "pra", "por", "com",
  "sem", "em", "no", "na", "nos", "nas", "ao", "aos", "se", "sua", "seu", "suas",
  "seus", "meu", "minha", "eu", "voce", "vc", "me", "isso", "isto", "esse",
  "essa", "este", "esta", "onde", "quando", "quanto", "quantos", "posso",
  "fazer", "faco", "tem", "ter", "sobre", "mais", "menos", "ja", "nao", "sim",
  "the", "to", "of", "and", "is", "it", "my", "how", "what", "where", "can", "i",
]);

// Keep each grounding excerpt bounded so a few chapters fit the model context.
const MAX_CONTENT_CHARS = 1800;

/** Lowercase, strip accents and punctuation, collapse whitespace. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/**
 * Score and order chapters against a question. Pure — no I/O.
 * Returns best-first, only chapters with a positive score, content truncated.
 */
export function rankChapters(
  question: string,
  chapters: ManualChapterInput[],
  limit = 4,
): RetrievedChapter[] {
  const terms = Array.from(new Set(tokenize(question)));
  if (terms.length === 0) return [];

  const scored = chapters.map((ch) => {
    const titleN = normalize(ch.title);
    const contentN = normalize(ch.content);
    let score = 0;
    for (const term of terms) {
      // Title hit is a strong signal.
      if (titleN.includes(term)) score += 5;
      // Body frequency, capped so one stuffed chapter can't dominate.
      const occurrences = contentN.split(term).length - 1;
      score += Math.min(occurrences, 5);
    }
    return { ...ch, score };
  });

  return scored
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((c) => ({
      ...c,
      content:
        c.content.length > MAX_CONTENT_CHARS
          ? `${c.content.slice(0, MAX_CONTENT_CHARS)}…`
          : c.content,
    }));
}

// ── Degrau 2: embeddings ────────────────────────────────────────────────────────

/** Texto canônico embedado por capítulo: título + descrição + início do corpo. */
export function chapterEmbeddingText(ch: ManualChapterInput): string {
  return `${ch.title} ${ch.description ?? ""} ${ch.content.slice(0, 1200)}`.trim();
}

const CHAPTER_CODEC: EmbeddingDocumentCodec<ManualChapterInput> = {
  textOf: chapterEmbeddingText,
  persist: async (id, vector) => {
    await prisma.operationalManualChapter.update({
      where: { id },
      data: { embedding: vector, embeddingModel: KNOWLEDGE_EMBEDDING_MODEL },
    });
  },
};

function truncate(chapters: ManualChapterInput[], limit: number): RetrievedChapter[] {
  return chapters.slice(0, limit).map((c) => ({
    ...c,
    // Score sintético: a ordem já é o ranking; o número não é comparável entre degraus.
    score: 1,
    content:
      c.content.length > MAX_CONTENT_CHARS
        ? `${c.content.slice(0, MAX_CONTENT_CHARS)}…`
        : c.content,
  }));
}

/**
 * Ordena por similaridade de embedding; null quando não dá para usar embeddings
 * (sem chave, erro de API, nenhum capítulo com vetor) — aí o chamador usa keyword.
 */
export async function rankChaptersByEmbedding(
  question: string,
  chapters: ManualChapterInput[],
  limit = 4,
): Promise<RetrievedChapter[] | null> {
  if (!process.env.OPENAI_API_KEY || !chapters.length) return null;
  const ranked = await rankDocumentsByEmbedding(question, chapters, CHAPTER_CODEC).catch(() => null);
  if (!ranked || !ranked.length) return null;
  return truncate(ranked, limit);
}

/**
 * Fetch the relevant manual chapters for a question, best-first.
 * Returns [] when nothing matches — the caller should then refuse gracefully
 * and suggest escalating to the Foocci team.
 */
export async function retrieveRelevantChapters(
  question: string,
  limit = 4,
): Promise<RetrievedChapter[]> {
  if (tokenize(question).length === 0) return [];

  const chapters = await prisma.operationalManualChapter.findMany({
    where: { isPublished: true, agentVisibility: true },
    select: {
      id: true, slug: true, title: true, area: true, content: true,
      description: true, embedding: true, embeddingModel: true,
    },
  });

  const byEmbedding = await rankChaptersByEmbedding(question, chapters, limit);
  if (byEmbedding) return byEmbedding;

  return rankChapters(question, chapters, limit);
}

/** Render retrieved chapters as a single grounding block for the prompt. */
export function buildManualContext(chapters: RetrievedChapter[]): string {
  if (chapters.length === 0) return "";
  return chapters
    .map((c, i) => `### Trecho ${i + 1} — ${c.title}\n${c.content}`)
    .join("\n\n");
}
