/**
 * KnowledgeEmbeddingService — retrieval por similaridade de embedding sobre o
 * conhecimento curado (RestaurantKnowledgeItem). Plugado atrás da mesma costura
 * do ranking keyword em RestaurantKnowledgeAdapter.selectRelevantKnowledge():
 * qualquer erro aqui devolve null e o chamador cai no keyword EXATAMENTE como hoje.
 *
 * Best-effort por desenho:
 * - embeddings dos itens são calculados/persistidos lazily (backfill com cap por chamada);
 * - falha em UM item não derruba o ranking — o item só fica sem vetor;
 * - falha ao embedar a QUERY (ou zero itens com vetor) → null → fallback keyword.
 *
 * Exceção consciente à Regra de Ouro: embeddings não passam pelo chat dispatcher
 * (não é raciocínio de agente — é indexação vetorial). Este arquivo está listado
 * em FROZEN_EXCEPTIONS (architecture.test.ts) e em excludedFiles (.eslintrc.json).
 */

// embeddings não passam pelo chat dispatcher
// eslint-disable-next-line no-restricted-imports
import { openai } from "@/lib/openai";
import { prisma } from "@/lib/prisma";

export const KNOWLEDGE_EMBEDDING_MODEL = "text-embedding-3-small";

/** Cap de backfills (itens sem embedding persistido) por chamada de ranking. */
export const MAX_EMBEDDING_BACKFILLS_PER_CALL = 20;

/** Guarda-chuva de custo: nunca mandamos textos gigantes para a API. */
const MAX_EMBED_INPUT_CHARS = 2000;

/**
 * Shape GENÉRICO de qualquer documento embedável (item de conhecimento do
 * restaurante, capítulo do manual, …). O ranking não sabe o que o documento é:
 * quem chama informa como extrair o texto e como persistir o vetor.
 */
export interface EmbeddableDocument {
  id?: string;
  embedding?: unknown; // number[] persistido (Json) ou null
  embeddingModel?: string | null;
}

/** Shape mínimo que o ranking precisa — compatível com as rows do adapter. */
export interface EmbeddableKnowledgeItem extends EmbeddableDocument {
  title: string;
  questionPatterns: unknown; // string[] no banco (Json)
}

/** Como o ranking genérico lê o texto e grava o vetor de um tipo de documento. */
export interface EmbeddingDocumentCodec<T> {
  /** Texto canônico que representa o documento. */
  textOf: (item: T) => string;
  /** Persistência best-effort do vetor. Ausente = só memória (nunca falha). */
  persist?: (id: string, vector: number[]) => Promise<void>;
}

/** Texto canônico embedado por item: título + padrões de pergunta. */
export function embeddingTextOf(item: Pick<EmbeddableKnowledgeItem, "title" | "questionPatterns">): string {
  const patterns = Array.isArray(item.questionPatterns)
    ? (item.questionPatterns as unknown[]).filter((p): p is string => typeof p === "string").join(" ")
    : "";
  return `${item.title} ${patterns}`.trim();
}

function asVector(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  for (const n of value) if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return value as number[];
}

/** Embeda um texto com o modelo fixo. Lança em erro — quem chama decide o fallback. */
export async function embedText(text: string): Promise<number[]> {
  const input = text.slice(0, MAX_EMBED_INPUT_CHARS).trim();
  if (!input) throw new Error("texto vazio para embedding");
  const res = await openai.embeddings.create({ model: KNOWLEDGE_EMBEDDING_MODEL, input });
  const vector = asVector(res.data?.[0]?.embedding);
  if (!vector) throw new Error("resposta de embedding vazia/inválida");
  return vector;
}

/** Similaridade de cosseno em JS puro. Vetores incompatíveis/degenerados → 0. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

/**
 * Garante o embedding de UM documento: usa o persistido quando o modelo bate;
 * senão calcula e persiste (best-effort — falha de persistência não derruba
 * o vetor recém-calculado). Erros de API → null.
 */
export async function ensureDocumentEmbedding<T extends EmbeddableDocument>(
  item: T,
  codec: EmbeddingDocumentCodec<T>,
): Promise<number[] | null> {
  const existing = asVector(item.embedding);
  if (existing && item.embeddingModel === KNOWLEDGE_EMBEDDING_MODEL) return existing;

  try {
    const vector = await embedText(codec.textOf(item));
    if (item.id && codec.persist) {
      await codec.persist(item.id, vector).catch(() => undefined); // best-effort
    }
    return vector;
  } catch {
    return null;
  }
}

export interface EmbeddingRankOptions {
  /**
   * Piso de similaridade de cosseno: documento abaixo dele NÃO entra no
   * resultado — e documento SEM vetor também não, porque "não medi" não é
   * "passou" (ausência de informação não é informação).
   *
   * Ausente = comportamento histórico: só ORDENA, nunca corta. Ordenar sem
   * cortar significa que o pior documento do corpus volta no topo quando não há
   * nenhum bom — foi assim que o assistente do lojista nunca dizia "não sei"
   * (P0 de 04/08/2026, ver manualRetrieval.ts).
   */
  minScore?: number;
}

/**
 * Ranqueia documentos por similaridade de embedding com a query (1 call para a
 * query; no máx MAX_EMBEDDING_BACKFILLS_PER_CALL backfills de itens sem vetor).
 * Sem `minScore`: itens sem vetor vão para o fim, na ordem original.
 * Com `minScore`: quem não alcança o piso (ou não tem vetor) é descartado, e o
 * resultado PODE ser [] — que é diferente de null.
 *
 * Qualquer erro estrutural (query não embedou / nenhum item com vetor) → null,
 * o sinal para o chamador cair no ranking keyword. `null` = o portão não rodou;
 * `[]` = o portão rodou e ninguém passou. O chamador não pode confundir os dois.
 *
 * Genérico de propósito: item de conhecimento, capítulo de manual ou qualquer
 * documento futuro usa o MESMO ranking — só troca o codec.
 */
export async function rankDocumentsByEmbedding<T extends EmbeddableDocument>(
  queryText: string,
  items: T[],
  codec: EmbeddingDocumentCodec<T>,
  opts?: EmbeddingRankOptions,
): Promise<T[] | null> {
  if (!items.length) return null;

  let queryVector: number[];
  try {
    queryVector = await embedText(queryText);
  } catch {
    return null;
  }

  let backfills = 0;
  const scored: Array<{ item: T; order: number; score: number | null }> = [];
  for (const [order, item] of items.entries()) {
    let vector = asVector(item.embedding);
    if (!(vector && item.embeddingModel === KNOWLEDGE_EMBEDDING_MODEL)) {
      vector = null;
      if (backfills < MAX_EMBEDDING_BACKFILLS_PER_CALL) {
        backfills++;
        vector = await ensureDocumentEmbedding(item, codec);
      }
    }
    scored.push({ item, order, score: vector ? cosineSimilarity(queryVector, vector) : null });
  }

  if (!scored.some((s) => s.score !== null)) return null;

  // Com piso: corta antes de ordenar. Item sem vetor (score null) cai fora —
  // não medimos a relevância dele, e não medir não é aprovar.
  if (opts?.minScore !== undefined) {
    const floor = opts.minScore;
    return scored
      .filter((s): s is { item: T; order: number; score: number } => s.score !== null && s.score >= floor)
      .sort((a, b) => b.score - a.score || a.order - b.order)
      .map((s) => s.item);
  }

  scored.sort((a, b) => {
    if (a.score === null && b.score === null) return a.order - b.order;
    if (a.score === null) return 1;
    if (b.score === null) return -1;
    return b.score - a.score || a.order - b.order;
  });
  return scored.map((s) => s.item);
}

/** Codec do conhecimento curado do restaurante (RestaurantKnowledgeItem). */
const KNOWLEDGE_ITEM_CODEC: EmbeddingDocumentCodec<EmbeddableKnowledgeItem> = {
  textOf: embeddingTextOf,
  persist: async (id, vector) => {
    await prisma.restaurantKnowledgeItem.update({
      where: { id },
      data: { embedding: vector, embeddingModel: KNOWLEDGE_EMBEDDING_MODEL },
    });
  },
};

/** Compat: o ranking do conhecimento curado do restaurante. */
export async function ensureItemEmbedding(item: EmbeddableKnowledgeItem): Promise<number[] | null> {
  return ensureDocumentEmbedding(item, KNOWLEDGE_ITEM_CODEC);
}

/** Compat: ranking por embedding dos itens de conhecimento do restaurante. */
export async function rankByEmbedding<T extends EmbeddableKnowledgeItem>(
  queryText: string,
  items: T[],
): Promise<T[] | null> {
  return rankDocumentsByEmbedding(queryText, items, {
    textOf: (i) => embeddingTextOf(i),
    persist: KNOWLEDGE_ITEM_CODEC.persist,
  });
}
