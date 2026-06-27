/**
 * Manual retrieval — lightweight RAG over the Operational Manual.
 *
 * The internal "Bíblia do Foocci" (OperationalManualChapter) is the knowledge
 * base for the lojista-facing help chat. There are no embeddings in the project,
 * so retrieval here is keyword-based: tokenise the question, score each
 * published + agent-visible chapter by term overlap (title weighted heavily),
 * and return the top matches as grounding context.
 *
 * Only chapters that are BOTH published AND agentVisibility=true are ever
 * exposed — the internal manual stays internal; the assistant only sees what
 * the Foocci team has explicitly cleared for agents.
 *
 * The ranking (`rankChapters`) is a pure function so it can be unit-tested
 * without a database; `retrieveRelevantChapters` is the thin Prisma wrapper.
 */

import { prisma } from "@/lib/prisma";

export interface ManualChapterInput {
  id: string;
  slug: string;
  title: string;
  area: string;
  content: string;
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
    select: { id: true, slug: true, title: true, area: true, content: true },
  });

  return rankChapters(question, chapters, limit);
}

/** Render retrieved chapters as a single grounding block for the prompt. */
export function buildManualContext(chapters: RetrievedChapter[]): string {
  if (chapters.length === 0) return "";
  return chapters
    .map((c, i) => `### Trecho ${i + 1} — ${c.title}\n${c.content}`)
    .join("\n\n");
}
