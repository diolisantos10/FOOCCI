/**
 * deepExtraction/chunking — pure, context-preserving text chunking + progress.
 *
 * No DB, no LLM. Splits long material into paragraph-aware chunks so each chunk
 * can be deep-extracted independently, with a safety cap on total chunks.
 */

/** Text longer than this is processed via the DEEP chunked path. */
export const DEEP_THRESHOLD_CHARS = 12_000;
/** Target characters per chunk (kept well under model limits). */
export const CHUNK_CHARS = 6_000;
/** Hard safety cap on chunks per source (cost / runtime guard). */
export const MAX_CHUNKS = 400;

export interface TextChunk {
  index: number;
  text: string;
  charCount: number;
}

/** True when the text is big enough to warrant deep chunked extraction. */
export function isDeepCandidate(text: string, threshold = DEEP_THRESHOLD_CHARS): boolean {
  return text.trim().length >= threshold;
}

/**
 * Splits text into context-preserving chunks. Paragraphs (blank-line separated)
 * are kept together until the target size; a single oversized paragraph is hard
 * split. Total chunks are capped at MAX_CHUNKS (the tail is truncated — the UI
 * must say so honestly).
 */
export function chunkText(text: string, targetChars = CHUNK_CHARS): TextChunk[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];

  const paragraphs = clean.split(/\n{2,}/);
  const raw: string[] = [];
  let cur = "";

  const flush = () => { if (cur) { raw.push(cur); cur = ""; } };

  for (const p of paragraphs) {
    if (p.length >= targetChars) {
      flush();
      for (let i = 0; i < p.length; i += targetChars) raw.push(p.slice(i, i + targetChars));
      continue;
    }
    const merged = cur ? `${cur}\n\n${p}` : p;
    if (merged.length > targetChars && cur) {
      flush();
      cur = p;
    } else {
      cur = merged;
    }
  }
  flush();

  return raw.slice(0, MAX_CHUNKS).map((t, index) => ({ index, text: t, charCount: t.length }));
}

/** True when the chunk plan was truncated by the safety cap. */
export function wasTruncated(text: string, targetChars = CHUNK_CHARS): boolean {
  const clean = text.replace(/\r\n/g, "\n").trim();
  // cheap upper bound on chunk count
  return Math.ceil(clean.length / targetChars) > MAX_CHUNKS;
}

export interface ProgressInput {
  totalChunks: number;
  processedChunks: number;
}

/** Whole-number progress 0–100. */
export function progressPercent({ totalChunks, processedChunks }: ProgressInput): number {
  if (totalChunks <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((processedChunks / totalChunks) * 100)));
}
