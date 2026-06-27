/**
 * Meta/Instagram integration (lojista) — backing logic tests.
 * Covers: card metadata for the Integrations Center, store-owner mode labels,
 * the masked view never exposing the token/verify token, encryption on upsert,
 * and the hermetic diagnostic (no real send, runtimeTouched=false).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  instagramChannelConfig: { findUnique: vi.fn(), findFirst: vi.fn(), upsert: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
  restaurant: { findFirst: vi.fn() },
  customer: { create: vi.fn(), delete: vi.fn() },
  customerChannelIdentity: { deleteMany: vi.fn() },
  conversation: { findFirst: vi.fn(), delete: vi.fn() },
  message: { create: vi.fn(), deleteMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { INSTAGRAM_MODE_LABEL, INSTAGRAM_SCOPE_LABEL, INSTAGRAM_INTEGRATION_CARD, INSTAGRAM_CENTRAL_HREF } from "../labels";
import { toView, type InstagramConfigRow } from "../InstagramConfigService";
import { runInstagramChannelDiagnostic } from "../InstagramChannelDiagnostic";

describe("(1/7/8/11) card e labels do lojista", () => {
  it("card Meta / Instagram aponta para a sub-página de configuração", () => {
    expect(INSTAGRAM_INTEGRATION_CARD.name).toBe("Instagram");
    expect(INSTAGRAM_INTEGRATION_CARD.configureHref).toBe("/integracoes/instagram");
    expect(INSTAGRAM_INTEGRATION_CARD.description).toContain("Instagram Direct");
    expect(INSTAGRAM_INTEGRATION_CARD.description).toContain("comentários");
  });

  it("(7) RECEIVE_ONLY = 'Receber mensagens'; (8) REPLY_ONLY = 'Responder manualmente'", () => {
    expect(INSTAGRAM_MODE_LABEL.RECEIVE_ONLY).toContain("Receber mensagens");
    expect(INSTAGRAM_MODE_LABEL.REPLY_ONLY).toContain("Responder manualmente");
    expect(INSTAGRAM_MODE_LABEL.DISABLED).toBe("Desativado");
    expect(INSTAGRAM_MODE_LABEL.FULL).toContain("em breve"); // IA automática não ativa
    expect(INSTAGRAM_SCOPE_LABEL.TEST_ACCOUNT_ONLY).toBe("Conta de teste");
  });

  it("(11) link para a Central de Atendimento", () => {
    expect(INSTAGRAM_CENTRAL_HREF).toBe("/atendimento");
  });
});

const row: InstagramConfigRow = {
  id: "c1", restaurantId: "r1", enabled: true, paused: false, mode: "REPLY_ONLY", scope: "TEST_ACCOUNT_ONLY",
  instagramBusinessAccountId: "ig-1", facebookPageId: "pg-1",
  pageAccessTokenEncrypted: "iv:tag:cipherSECRET", verifyTokenHash: "deadbeefHASH",
  appId: null, appSecretRef: null, allowlistedExternalUserIds: ["IGSID1"], lastWebhookAt: null, lastError: null,
};

describe("(3/5) a UI nunca recebe o token nem o verify token", () => {
  it("toView traz apenas booleans de configuração, nunca os segredos", () => {
    const v = toView(row);
    const json = JSON.stringify(v);
    expect(v.tokenConfigured).toBe(true);
    expect(v.verifyTokenConfigured).toBe(true);
    // The SECRET VALUES (ciphertext + hash) must never appear in the view.
    expect(json).not.toContain("cipherSECRET");
    expect(json).not.toContain("deadbeefHASH");
    expect(json).not.toContain("iv:tag:cipher");
  });
});

describe("(4) PATCH salva token criptografado (nunca em texto puro)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ENCRYPTION_KEY = "0".repeat(64);
    db.instagramChannelConfig.upsert.mockImplementation(async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => ({
      ...row, ...create, ...update,
    }));
  });

  it("o valor armazenado não é o texto puro do token", async () => {
    const { upsertInstagramConfig } = await import("../InstagramConfigService");
    const r = await upsertInstagramConfig("r1", { pageAccessToken: "TOKEN_PLAINTEXT_123", verifyToken: "meu-verify" });
    expect(r.ok).toBe(true);
    const arg = db.instagramChannelConfig.upsert.mock.calls[0][0] as { create: Record<string, unknown> };
    const stored = String(arg.create.pageAccessTokenEncrypted);
    expect(stored).not.toContain("TOKEN_PLAINTEXT_123");
    expect(stored).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/); // iv:tag:cipher
    // verify token guardado como hash (não o valor)
    expect(String(arg.create.verifyTokenHash)).not.toContain("meu-verify");
  });
});

describe("(6) diagnóstico não envia mensagem real", () => {
  beforeEach(() => vi.clearAllMocks());
  it("retorna noRealInstagramSend=true e runtimeTouched=false (checks puros, sem DB)", async () => {
    const r = await runInstagramChannelDiagnostic(); // sem restaurantId → só checks puros
    expect(r.noRealInstagramSend).toBe(true);
    expect(r.runtimeTouched).toBe(false);
    expect(r.status).toBe("PASS");
    expect(db.message.create).not.toHaveBeenCalled();
  });
});
