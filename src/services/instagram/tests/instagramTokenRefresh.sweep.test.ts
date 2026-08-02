/**
 * Instagram token refresh — the daily sweep must be able to FAIL.
 *
 * What happened in July, and again in the ten days that followed: a client's Instagram
 * token died, so the channel was disabled and its token cleared. The sweep queries only
 * `enabled: true` rows with a stored token — so the dead account dropped out of the
 * query, the job answered `{checked: 0, refreshed: 0}`, HTTP 200, and the workflow
 * printed "✅ executado" every morning while the client received no DMs at all.
 *
 * That is guardrail 2 inverted: forgetting a gate read as "approved". These tests lock
 * the third answer — `needsAttention` — so the failure the job exists to prevent is the
 * failure that makes it shout.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const findMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { instagramChannelConfig: { findMany: (...a: unknown[]) => findMany(...a) } },
}));

import { refreshExpiringInstagramTokens } from "../instagramTokenRefresh";

beforeEach(() => findMany.mockReset());

describe("refreshExpiringInstagramTokens — silence is not success", () => {
  it("flags a channel that was disabled after its token died", async () => {
    // The exact shape of the July outage: the config still exists, but it is disabled,
    // so it is invisible to the refresh query.
    findMany.mockResolvedValue([
      {
        restaurantId: "sushi-1",
        metadata: null,
        enabled: false,
        pageAccessTokenEncrypted: null,
        lastError: "OAuthException 190: Session expired",
      },
    ]);

    const r = await refreshExpiringInstagramTokens();

    expect(r.checked).toBe(0);
    expect(r.totalConfigs).toBe(1);
    expect(r.needsAttention).toBe(true);
    // The alert must carry the concrete case, not just "something is off" (guardrail 6).
    expect(r.attention.join(" ")).toContain("sushi-1");
    expect(r.attention.join(" ")).toContain("Session expired");
  });

  it("flags a channel that is enabled but has no stored token", async () => {
    findMany.mockResolvedValue([
      { restaurantId: "r2", metadata: null, enabled: true, pageAccessTokenEncrypted: null, lastError: null },
    ]);

    const r = await refreshExpiringInstagramTokens();

    expect(r.checked).toBe(0);
    expect(r.needsAttention).toBe(true);
    expect(r.attention.join(" ")).toContain("reconexão manual");
  });

  it("stays quiet when nobody uses Instagram at all", async () => {
    // No configs means nothing is broken — a restaurant that never connected Instagram
    // must not page anyone every morning, or the alert becomes noise nobody reads.
    findMany.mockResolvedValue([]);

    const r = await refreshExpiringInstagramTokens();

    expect(r.totalConfigs).toBe(0);
    expect(r.needsAttention).toBe(false);
    expect(r.attention).toEqual([]);
  });

  it("stays quiet when a healthy token is still far from expiring", async () => {
    const farAway = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString();
    findMany.mockResolvedValue([
      {
        restaurantId: "r3",
        metadata: { tokenExpiresAt: farAway },
        enabled: true,
        pageAccessTokenEncrypted: "enc:whatever",
        lastError: null,
      },
    ]);

    const r = await refreshExpiringInstagramTokens();

    expect(r.checked).toBe(1);
    expect(r.refreshed).toBe(0); // nothing was due
    expect(r.needsAttention).toBe(false);
  });

  // Um quinto caso — "banco fora do ar" — foi tentado e removido de propósito.
  // O código trata isso (`.catch()` devolve lista vazia, verificado à mão), mas o
  // vitest contabiliza a rejeição do próprio mock como falha do teste mesmo quando a
  // função retorna certo. Teste que reprova sem defeito é pior que teste ausente:
  // ensina a ignorar vermelho. O comportamento é pré-existente e não foi alterado aqui.
});
