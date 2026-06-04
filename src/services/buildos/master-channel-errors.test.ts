/**
 * BuildOSMasterChannelService — friendly Evolution error translation.
 *
 * Guarantees the Admin channel never surfaces a raw "HTTP 404" to the operator:
 * a missing instance, an auth failure, or any Evolution error is translated into
 * an actionable Portuguese message.
 */

import { describe, it, expect } from "vitest";
import { EvolutionApiError } from "@/lib/evolution/EvolutionClient";
import { friendlyEvolutionError } from "./BuildOSMasterChannelService";

describe("friendlyEvolutionError", () => {
  it("translates 404 to 'instância ainda não existe' (never raw HTTP 404)", () => {
    const msg = friendlyEvolutionError(new EvolutionApiError(404, null, "Evolution API GET /instance/connect/futi-admin → HTTP 404"), "futi-admin");
    expect(msg).toContain("futi-admin");
    expect(msg.toLowerCase()).toContain("ainda não existe");
    expect(msg).not.toMatch(/^HTTP 404/);
  });

  it("translates 401/403 to a permission message", () => {
    expect(friendlyEvolutionError(new EvolutionApiError(401, null, "x"), "futi-admin").toLowerCase()).toContain("permiss");
    expect(friendlyEvolutionError(new EvolutionApiError(403, null, "x"), "futi-admin").toLowerCase()).toContain("permiss");
  });

  it("gives a generic friendly message for other HTTP errors", () => {
    const msg = friendlyEvolutionError(new EvolutionApiError(500, null, "x"), "futi-admin");
    expect(msg).toContain("HTTP 500");
    expect(msg.toLowerCase()).toContain("evolution");
  });

  it("handles non-Evolution errors without leaking internals", () => {
    const msg = friendlyEvolutionError(new Error("Failed to parse URL"), "futi-admin");
    expect(msg.toLowerCase()).toContain("falha ao preparar/conectar");
  });
});
