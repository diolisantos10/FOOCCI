import { describe, it, expect } from "vitest";
import { compareRuntimePromptBlocks } from "./comparison";

describe("compareRuntimePromptBlocks (shadow/comparison helper)", () => {
  it("reports identical when both blocks are empty (CURRENT vs CURRENT)", () => {
    const cmp = compareRuntimePromptBlocks("", "");
    expect(cmp.identical).toBe(true);
    expect(cmp.addedLines).toHaveLength(0);
    expect(cmp.addedChars).toBe(0);
  });

  it("reports the added lines/chars LIBRARY_ASSISTED introduces over CURRENT", () => {
    const library = "\n\n━━━ TÉCNICAS ━━━\nLinha A\nLinha B";
    const cmp = compareRuntimePromptBlocks("", library);
    expect(cmp.identical).toBe(false);
    expect(cmp.addedLines).toContain("Linha A");
    expect(cmp.addedLines).toContain("Linha B");
    expect(cmp.addedChars).toBeGreaterThan(0);
    expect(cmp.summary).toMatch(/adiciona/i);
  });

  it("only counts lines NOT already present in the current block", () => {
    const cmp = compareRuntimePromptBlocks("Linha comum", "Linha comum\nLinha nova");
    expect(cmp.addedLines).toEqual(["Linha nova"]);
  });
});
