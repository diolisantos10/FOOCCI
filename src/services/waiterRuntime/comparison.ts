/**
 * WaiterRuntimeComparisonService — PURE, admin-only comparison of the CURRENT vs
 * LIBRARY_ASSISTED prompt blocks. No customer ever sees this; it exists so an
 * operator can see exactly what the Library would add before activating.
 *
 * Pure string helper — no DB, no LLM, no side effects.
 */

export interface PromptBlockComparison {
  identical: boolean;
  currentLength: number;
  libraryLength: number;
  /** Characters the LIBRARY_ASSISTED block adds on top of CURRENT. */
  addedChars: number;
  /** Lines present in the library block but not in the current block. */
  addedLines: string[];
  summary: string;
}

/**
 * Compares two assembled prompt-block strings. CURRENT is typically "" (no
 * Library), LIBRARY_ASSISTED is the bridge's promptBlock.
 */
export function compareRuntimePromptBlocks(currentBlock: string, libraryBlock: string): PromptBlockComparison {
  const current = currentBlock ?? "";
  const library = libraryBlock ?? "";
  const identical = current.trim() === library.trim();

  const currentLines = new Set(
    current.split("\n").map((l) => l.trim()).filter(Boolean),
  );
  const addedLines = library
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !currentLines.has(l));

  const addedChars = Math.max(0, library.length - current.length);

  const summary = identical
    ? "Sem diferença: LIBRARY_ASSISTED não adiciona nada ao prompt atual."
    : `LIBRARY_ASSISTED adiciona ${addedLines.length} linha(s) e ~${addedChars} caractere(s) ao prompt atual.`;

  return {
    identical,
    currentLength: current.length,
    libraryLength: library.length,
    addedChars,
    addedLines,
    summary,
  };
}
