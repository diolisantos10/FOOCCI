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

/** Shape mínimo que o ranking precisa — compatível com as rows do adapter. */
export interface EmbeddableKnowledgeItem {
  id?: string;
  title: string;
  questionPatterns: unknown; // string[] no banco (Json)
  embedding?: unknown; // number[] persistido (Json) ou null
  embeddingModel?: string | null;
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
 * Garante o embedding de UM item: usa o persistido quando o modelo bate;
 * senão calcula e persiste (best-effort — falha de persistência não derruba
 * o vetor recém-calculado). Erros de API → null.
 */
export async function ensureItemEmbedding(item: EmbeddableKnowledgeItem): Promise<number[] | null> {
  const existing = asVector(item.embedding);
  if (existing && item.embeddingModel === KNOWLEDGE_EMBEDDING_MODEL) return existing;

  try {
    const vector = await embedText(embeddingTextOf(item));
    if (item.id) {
      await prisma.restaurantKnowledgeItem
        .update({
          where: { id: item.id },
          data: { embedding: vector, embeddingModel: KNOWLEDGE_EMBEDDING_MODEL },
        })
        .catch(() => undefined); // best-effort: ranking segue mesmo sem persistir
    }
    return vector;
  } catch {
    return null;
  }
}

/**
 * Ranqueia items por similaridade de embedding com a query (1 call para a query;
 * no máx MAX_EMBEDDING_BACKFILLS_PER_CALL backfills de itens sem embedding).
 * Itens sem vetor vão para o fim, na ordem original (que já é a de uso).
 * Qualquer erro estrutural (query não embedou / nenhum item com vetor) → null,
 * o sinal para o chamador cair no ranking keyword.
 */
export async function rankByEmbedding<T extends EmbeddableKnowledgeItem>(
  queryText: string,
  items: T[],
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
        vector = await ensureItemEmbedding(item);
      }
    }
    scored.push({ item, order, score: vector ? cosineSimilarity(queryVector, vector) : null });
  }

  if (!scored.some((s) => s.score !== null)) return null;

  scored.sort((a, b) => {
    if (a.score === null && b.score === null) return a.order - b.order;
    if (a.score === null) return 1;
    if (b.score === null) return -1;
    return b.score - a.score || a.order - b.order;
  });
  return scored.map((s) => s.item);
}
