/**
 * resolveTextForExtraction — decides which text feeds AI extraction.
 *
 * Pure / dependency-injected (no prisma, no IO) so it is unit-testable:
 *   1. if the source already has rawText → use it;
 *   2. else if an original file is stored → load it, parse it, return that text
 *      (the caller persists it as rawText);
 *   3. else → throw a clear error (nothing to extract).
 */

export interface StoredFile {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}

export interface ResolveTextDeps {
  rawText: string | null | undefined;
  loadFile: () => Promise<StoredFile | null>;
  parse: (buffer: Buffer, fileName: string, mimeType: string) => Promise<{ text: string }>;
}

export interface ResolvedText {
  text: string;
  /** true when the text was freshly parsed from the stored file (persist it). */
  fromFile: boolean;
}

export const NO_TEXT_NO_FILE_MESSAGE =
  "Esta fonte não tem texto nem arquivo armazenado para extração. Cole conteúdo ou adicione técnicas manualmente.";

export async function resolveTextForExtraction(deps: ResolveTextDeps): Promise<ResolvedText> {
  const existing = (deps.rawText ?? "").trim();
  if (existing) return { text: existing, fromFile: false };

  const file = await deps.loadFile();
  if (file) {
    const result = await deps.parse(file.buffer, file.fileName, file.mimeType);
    const text = (result.text ?? "").trim();
    if (text) return { text, fromFile: true };
  }

  throw new Error(NO_TEXT_NO_FILE_MESSAGE);
}
