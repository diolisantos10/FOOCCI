/**
 * Tests for AgentLibraryService.deleteSource.
 *
 * Linked techniques and the private original file are removed by the DB cascade
 * (onDelete: Cascade on both relations), so the service only needs to delete the
 * source row. We assert: existing → deleted (single delete on the source),
 * missing → false (route answers 404).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const findUnique = vi.fn();
const del = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    agentLibrarySource: { findUnique: (...a: unknown[]) => findUnique(...a), delete: (...a: unknown[]) => del(...a) },
  },
}));

// openai is imported by the service module; stub so import doesn't need a key.
vi.mock("@/lib/openai", () => ({ openai: {} }));

import { AgentLibraryService } from "./AgentLibraryService";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AgentLibraryService.deleteSource", () => {
  it("deletes an existing source (cascade removes techniques + file)", async () => {
    findUnique.mockResolvedValue({ id: "src_1" });
    del.mockResolvedValue({ id: "src_1" });

    const result = await AgentLibraryService.deleteSource("src_1");

    expect(result).toBe(true);
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith({ where: { id: "src_1" } });
  });

  it("returns false for a non-existent source (route → 404) without deleting", async () => {
    findUnique.mockResolvedValue(null);

    const result = await AgentLibraryService.deleteSource("nope");

    expect(result).toBe(false);
    expect(del).not.toHaveBeenCalled();
  });
});
