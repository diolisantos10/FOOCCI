/**
 * Priority 1.2 verification — BuildProject keyword resolution (pure logic).
 *
 * Tests the DETERMINISTIC keyword matcher (no DB, no LLM). The full
 * resolveBuildProjectFromMessage() and command-creation paths are DB-backed and
 * exercised via manual/integration testing (the unit env has no database); their
 * defensive fallbacks (UNRESOLVED on no-DB) are covered where reachable.
 */

import { describe, it, expect } from "vitest";
import {
  matchProjectSlugByKeyword,
  resolveBuildProjectFromMessage,
} from "./BuildProjectService";

describe("matchProjectSlugByKeyword — deterministic, no LLM", () => {
  it("maps Foocci keywords", () => {
    expect(matchProjectSlugByKeyword("RAIO-X do foocci checkout")).toBe("foocci");
    expect(matchProjectSlugByKeyword("ajusta o fute")).toBe("foocci");
  });

  it("maps Dioli Agency OS keywords", () => {
    expect(matchProjectSlugByKeyword("novo recurso no dioli")).toBe("dioli-agency-os");
    expect(matchProjectSlugByKeyword("setup do agency os")).toBe("dioli-agency-os");
  });

  it("maps Santioh keywords", () => {
    expect(matchProjectSlugByKeyword("bug no santioh")).toBe("santioh");
    expect(matchProjectSlugByKeyword("santio precisa de docs")).toBe("santioh");
  });

  it("is case-insensitive", () => {
    expect(matchProjectSlugByKeyword("FOOCCI urgente")).toBe("foocci");
  });

  it("returns null when no project keyword is present", () => {
    expect(matchProjectSlugByKeyword("faz um raio-x do checkout")).toBeNull();
    expect(matchProjectSlugByKeyword("")).toBeNull();
  });

  it("does not invent a project from arbitrary text (no repo injection)", () => {
    // A random repo-looking string must NOT resolve to anything.
    expect(matchProjectSlugByKeyword("deploy github.com/evil/repo")).toBeNull();
  });
});

describe("resolveBuildProjectFromMessage — defensive fallback", () => {
  it("never throws and returns a resolution object", async () => {
    // No DATABASE_URL connection in the unit env → DB reads fail → must fall
    // back to UNRESOLVED (projectId null) without throwing.
    const r = await resolveBuildProjectFromMessage("faz um raio-x do checkout");
    expect(r).toHaveProperty("projectId");
    expect(r).toHaveProperty("method");
    expect(r.projectId).toBeNull();
    expect(r.method).toBe("UNRESOLVED");
  });
});
