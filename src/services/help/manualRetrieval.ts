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
 *
 * ────────────────────────────────────────────────────────────────────────────
 * P0 DE CONFIANÇA (04/08/2026): ANTES, ESTE ARQUIVO NUNCA DEVOLVIA VAZIO.
 *
 * O ranking por embedding ORDENA e não CORTA; o keyword cortava só em score>0.
 * Como o chamador pegava os 4 primeiros, TODA pergunta voltava com guia — e o
 * helpAssistant injetava esses guias rotulados como VERDADE. Medido no corpus
 * real: 30/30 perguntas devolviam guia, inclusive "como emito nota fiscal"
 * (→ guia de acompanhar pedidos) e "cliente quer estorno do pix" (→ guia de
 * campanha de CRM). O agente então ensinava tela e botão que não existem.
 *
 * Agora há PISO DE ADMISSÃO, e ele é uma CONJUNÇÃO de dois testes:
 *   1. MIN_KEYWORD_SCORE — evidência absoluta: uma menção de passagem no corpo
 *      de um guia não é relevância (foi o que ligava "esqueci a senha do painel"
 *      ao guia de equipe, que cita "senha" uma vez);
 *   2. MIN_TERM_IDF_COVERAGE — o guia precisa cobrir uma fatia mínima da
 *      INFORMAÇÃO da pergunta, com os termos pesados por IDF sobre o próprio
 *      corpus. É o que barra "nota fiscal do pedido": casar só "pedido" (termo
 *      banal, presente em 21 dos 36 guias) não é casar a pergunta.
 * Nenhum guia passa nos dois → devolvemos [] e o agente diz que não sabe.
 * Ausência de informação não é informação: guia fraco não vira verdade.
 * ────────────────────────────────────────────────────────────────────────────
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
  /**
   * Fatia da informação da pergunta que este capítulo cobre, em [0,1], com os
   * termos pesados por IDF sobre o corpus. É a métrica que separa "casou a
   * pergunta" de "casou uma palavra banal da pergunta".
   */
  coverage: number;
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

/**
 * PISO 1 — evidência absoluta mínima para um capítulo ser admitido.
 *
 * CALIBRADO (04/08/2026) rodando o ranking sobre o corpus REAL de 36 guias
 * (howToGuidesContent) contra 31 perguntas de lojista — 22 cobertas pelo manual
 * e 9 sobre assunto que ele não cobre. Números que decidem, com o piso 2 já
 * aplicado:
 *   • menor score entre os guias CERTOS ................ 9  (guia-equipe)
 *   • maior score entre os guias ERRADOS ............... 6  (guia-configurar-pagamentos
 *                                                          em "cliente quer estorno do pix")
 * Qualquer valor em (6, 9] separa as duas classes; 8 fica no meio da faixa.
 * A varredura completa está registrada na oficina do agente `cerebro`.
 */
export const MIN_KEYWORD_SCORE = 8;

/**
 * PISO 2 — fatia mínima da informação da pergunta (IDF) que o capítulo cobre.
 *
 * CALIBRADO no mesmo corpus, com o piso 1 já aplicado:
 *   • menor cobertura entre os guias CERTOS ............ 0,42 (guia-criar-campanha-crm)
 *   • maior cobertura entre os guias ERRADOS ........... 0,36 (guia-criar-campanha-crm
 *                                                            em "cliente quer estorno do pix")
 * Faixa que separa: (0,36 · 0,42]. 0,40 fica dentro, com folga dos dois lados.
 * Quem mexer neste número roda manualRetrievalCorpus.test.ts — é lá que a conta
 * é refeita, com o corpus de verdade.
 */
export const MIN_TERM_IDF_COVERAGE = 0.4;

/**
 * PISO 3 — similaridade de cosseno mínima no degrau de embedding.
 *
 * HONESTIDADE SOBRE ESTE NÚMERO: ele NÃO está calibrado. Calibrar exige rodar
 * text-embedding-3-small contra o corpus real, e isso precisa de OPENAI_API_KEY
 * — que o ambiente de teste não tem. Por isso ele é deliberadamente BAIXO e não
 * é o portão que segura o sistema: quem decide QUEM pode virar verdade é o piso
 * lexical acima (calibrado e testável offline); o cosseno só remove sobrevivente
 * claramente desconexo. Subir este valor sem medir seria trocar um número
 * medido por um palpite.
 */
export const MIN_EMBEDDING_SIMILARITY = 0.2;

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

function truncateContent<T extends ManualChapterInput>(c: T): T {
  return {
    ...c,
    content:
      c.content.length > MAX_CONTENT_CHARS
        ? `${c.content.slice(0, MAX_CONTENT_CHARS)}…`
        : c.content,
  };
}

/**
 * Pontua e ORDENA todos os capítulos contra a pergunta. Puro, sem I/O e SEM
 * PISO — devolve inclusive o capítulo irrelevante, com score 0 e cobertura 0.
 *
 * Existe separado de `rankChapters` de propósito: aqui mora a mecânica
 * (pontuação, IDF, ordem) e lá mora a DECISÃO de admissão. Misturar os dois
 * fazia o teste de mecânica virar o teste do portão — e nenhum dos dois ficava
 * honesto. Quem chama em produção usa `rankChapters`.
 */
export function scoreChapters(
  question: string,
  chapters: ManualChapterInput[],
): RetrievedChapter[] {
  const terms = Array.from(new Set(tokenize(question)));
  if (terms.length === 0) return [];

  // Título e corpo (descrição + conteúdo) normalizados uma única vez.
  const hay = chapters.map((ch) => ({
    titleN: normalize(ch.title),
    bodyN: normalize(`${ch.description ?? ""} ${ch.content}`),
  }));

  // IDF sobre o PRÓPRIO corpus: termo presente em quase todo guia ("pedido")
  // quase não informa; termo raro ("cmv", "estorno") informa muito.
  const total = chapters.length;
  const idf = new Map<string, number>();
  for (const term of terms) {
    const df = hay.filter((h) => h.titleN.includes(term) || h.bodyN.includes(term)).length;
    idf.set(term, Math.log((total + 1) / (df + 1)) + 1);
  }
  const totalIdf = terms.reduce((sum, t) => sum + (idf.get(t) ?? 0), 0);

  return chapters
    .map((ch, i) => {
      const { titleN, bodyN } = hay[i]!;
      let score = 0;
      let matchedIdf = 0;
      for (const term of terms) {
        // Title hit is a strong signal.
        const inTitle = titleN.includes(term);
        if (inTitle) score += 5;
        // Body frequency, capped so one stuffed chapter can't dominate.
        const occurrences = bodyN.split(term).length - 1;
        score += Math.min(occurrences, 5);
        if (inTitle || occurrences > 0) matchedIdf += idf.get(term) ?? 0;
      }
      return { ...ch, score, coverage: totalIdf > 0 ? matchedIdf / totalIdf : 0 };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * O RANKING DE PRODUÇÃO: pontua, aplica o PISO DE ADMISSÃO e trunca.
 * Devolve [] quando nenhum capítulo passa — e [] é uma resposta legítima, não
 * um erro: significa "o manual não cobre isso". Quem chama deve dizer que não
 * sabe e oferecer o chamado, nunca preencher o vazio com o guia menos ruim.
 */
export function rankChapters(
  question: string,
  chapters: ManualChapterInput[],
  limit = 4,
): RetrievedChapter[] {
  return scoreChapters(question, chapters)
    .filter((c) => c.score >= MIN_KEYWORD_SCORE && c.coverage >= MIN_TERM_IDF_COVERAGE)
    .slice(0, limit)
    .map(truncateContent);
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

/**
 * Reordena os capítulos ADMITIDOS por similaridade de embedding, aplicando o
 * piso de cosseno. Devolve:
 *   • null → não deu para usar embeddings (sem chave, erro de API, nenhum vetor);
 *            o chamador fica com a ordem lexical, EXATAMENTE como antes;
 *   • []   → embeddings rodaram e nenhum capítulo passou do piso;
 *   • lista → os admitidos que passaram, do mais parecido para o menos.
 * A diferença entre `null` e `[]` é o guardrail 2 aplicado aqui: portão que não
 * rodou (null) não pode ser confundido com portão que rodou e reprovou ([]).
 */
export async function rankChaptersByEmbedding<T extends RetrievedChapter>(
  question: string,
  chapters: T[],
  limit = 4,
): Promise<T[] | null> {
  if (!process.env.OPENAI_API_KEY || !chapters.length) return null;
  const ranked = await rankDocumentsByEmbedding(question, chapters, CHAPTER_CODEC, {
    minScore: MIN_EMBEDDING_SIMILARITY,
  }).catch(() => null);
  if (!ranked) return null;
  return ranked.slice(0, limit);
}

/**
 * Busca os capítulos do manual relevantes para a pergunta, do melhor para o pior.
 *
 * A ADMISSÃO é lexical e calibrada (`rankChapters`): é ela que decide quem pode
 * virar VERDADE para o agente. Os embeddings entram DEPOIS, sobre os já
 * admitidos, para melhorar a ordem e cortar o desconexo — nunca para admitir
 * quem o piso barrou. A escolha é conservadora e consciente: um capítulo só
 * semanticamente parecido (zero sobreposição de palavras) fica de fora e o
 * agente diz que não sabe. Custa recall; paga em não mentir. Para inverter isso
 * é preciso primeiro CALIBRAR MIN_EMBEDDING_SIMILARITY com a chave real.
 *
 * Devolve [] quando nada passa — o chamador deve recusar com honestidade e
 * oferecer o chamado.
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

  // 1. Admissão (piso calibrado). Sem admitido, acabou: [] é a resposta certa.
  const admitted = rankChapters(question, chapters, limit);
  if (!admitted.length) return [];

  // 2. Reordenação semântica sobre os admitidos, com piso de cosseno.
  const byEmbedding = await rankChaptersByEmbedding(question, admitted, limit);
  return byEmbedding ?? admitted;
}

/** Render retrieved chapters as a single grounding block for the prompt. */
export function buildManualContext(chapters: RetrievedChapter[]): string {
  if (chapters.length === 0) return "";
  return chapters
    .map((c, i) => `### Trecho ${i + 1} — ${c.title}\n${c.content}`)
    .join("\n\n");
}
