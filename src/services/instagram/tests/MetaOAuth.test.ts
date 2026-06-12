/**
 * Meta one-click connect — OAuth orchestration tests (hermetic: Graph client and
 * prisma are mocked; no network). Covers state generation, invalid-state
 * rejection, code→token exchange, page listing + Instagram detection, page
 * selection saving an ENCRYPTED token + IDs + RECEIVE_ONLY, tokens never
 * returned, and disconnect preserving conversations.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  metaOAuthState: { create: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  instagramChannelConfig: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
  customer: { delete: vi.fn(), deleteMany: vi.fn() },
  conversation: { delete: vi.fn(), deleteMany: vi.fn() },
  message: { delete: vi.fn(), deleteMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { encrypt } from "@/lib/crypto";
import {
  startMetaConnect, handleMetaCallback, listCandidates, selectPage, disconnectMeta,
  buildAuthUrl, getMetaAppCreds, type MetaGraph, type PageCandidate,
} from "../metaOAuth";

const REDIRECT = "https://foocci.com.br/api/integrations/meta/oauth/callback";

const pageWithIg: PageCandidate = { pageId: "PG1", pageName: "Sushi Cazza", pageAccessToken: "PAGE_TOKEN_SECRET_1", instagramBusinessAccountId: "IG1", instagramUsername: "sushicazza", hasInstagram: true };
const pageNoIg: PageCandidate = { pageId: "PG2", pageName: "Outra Página", pageAccessToken: "PAGE_TOKEN_SECRET_2", instagramBusinessAccountId: null, instagramUsername: null, hasInstagram: false };

function mockGraph(): MetaGraph {
  return {
    exchangeCode: vi.fn(async () => ({ accessToken: "USER_TOKEN_SECRET" })),
    listPages: vi.fn(async () => [pageWithIg, pageNoIg]),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ENCRYPTION_KEY = "0".repeat(64);
  process.env.META_APP_ID = "app-123";
  process.env.META_APP_SECRET = "secret-456";
  db.metaOAuthState.create.mockResolvedValue({ id: "st1" });
  db.metaOAuthState.update.mockResolvedValue({});
  db.metaOAuthState.updateMany.mockResolvedValue({});
  db.instagramChannelConfig.findUnique.mockResolvedValue(null);
  db.instagramChannelConfig.update.mockResolvedValue({});
  db.instagramChannelConfig.upsert.mockImplementation(async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => ({
    id: "c1", restaurantId: "r1", enabled: true, paused: false, mode: "RECEIVE_ONLY", scope: "TEST_ACCOUNT_ONLY",
    instagramBusinessAccountId: null, facebookPageId: null, pageAccessTokenEncrypted: null, verifyTokenHash: null,
    appId: null, appSecretRef: null, allowlistedExternalUserIds: [], lastWebhookAt: null, lastError: null, metadata: null,
    ...create, ...update,
  }));
});

describe("(1/11) start", () => {
  it("gera state e URL de OAuth da Meta", async () => {
    const r = await startMetaConnect({ restaurantId: "r1", userId: "u1", redirectUri: REDIRECT });
    expect(r.ok).toBe(true);
    expect(r.authUrl).toContain("facebook.com");
    expect(r.authUrl).toContain("dialog/oauth");
    expect(r.authUrl).toContain("instagram_manage_messages");
    const arg = db.metaOAuthState.create.mock.calls[0][0].data;
    expect(arg.status).toBe("PENDING");
    expect(typeof arg.state).toBe("string");
    expect(arg.state.length).toBeGreaterThan(20);
  });

  it("sem env Meta → BLOCKED_BY_META_APP_ENV", async () => {
    delete process.env.META_APP_ID; delete process.env.FACEBOOK_APP_ID;
    const r = await startMetaConnect({ restaurantId: "r1", userId: "u1", redirectUri: REDIRECT });
    expect(r.ok).toBe(false);
    expect(r.blocked).toBe("BLOCKED_BY_META_APP_ENV");
    expect(db.metaOAuthState.create).not.toHaveBeenCalled();
  });

  it("buildAuthUrl inclui scopes e state", () => {
    const url = buildAuthUrl({ appId: "a", redirectUri: REDIRECT, state: "xyz" });
    expect(url).toContain("client_id=a");
    expect(url).toContain("state=xyz");
    expect(url).toContain("pages_messaging");
    expect(getMetaAppCreds()).toEqual({ appId: "app-123", appSecret: "secret-456" });
  });
});

describe("(2/3/4/5) callback", () => {
  it("(2) rejeita state inválido/usado", async () => {
    db.metaOAuthState.findUnique.mockResolvedValue(null);
    const r = await handleMetaCallback({ state: "bad", code: "c", redirectUri: REDIRECT }, mockGraph());
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/inválida|usada/i);
  });

  it("rejeita state expirado", async () => {
    db.metaOAuthState.findUnique.mockResolvedValue({ id: "st1", restaurantId: "r1", status: "PENDING", expiresAt: new Date(Date.now() - 1000) });
    const r = await handleMetaCallback({ state: "s", code: "c", redirectUri: REDIRECT }, mockGraph());
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/expirou/i);
  });

  it("(3/4/5) troca code por token, lista páginas e detecta Instagram; candidatos SEM token", async () => {
    db.metaOAuthState.findUnique.mockResolvedValue({ id: "st1", restaurantId: "r1", status: "PENDING", expiresAt: new Date(Date.now() + 60000) });
    const graph = mockGraph();
    const r = await handleMetaCallback({ state: "s", code: "the-code", redirectUri: REDIRECT }, graph);
    expect(r.ok).toBe(true);
    expect(r.candidateCount).toBe(2);
    expect(graph.exchangeCode).toHaveBeenCalled();
    const upd = db.metaOAuthState.update.mock.calls[0][0].data;
    expect(upd.status).toBe("AWAITING_SELECTION");
    // candidatos persistidos NÃO contêm token
    expect(JSON.stringify(upd.candidates)).not.toContain("PAGE_TOKEN_SECRET");
    expect((upd.candidates as PageCandidate[])[0].hasInstagram).toBe(true);
    // user token guardado criptografado (não em texto puro)
    expect(String(upd.userAccessTokenEncrypted)).not.toContain("USER_TOKEN_SECRET");
  });
});

describe("(6/7/8/9) select-page", () => {
  beforeEach(() => {
    db.metaOAuthState.findFirst.mockResolvedValue({
      id: "st1", restaurantId: "r1", status: "AWAITING_SELECTION", expiresAt: new Date(Date.now() + 60000),
      userAccessTokenEncrypted: encrypt("USER_TOKEN_SECRET"),
      candidates: [{ pageId: "PG1", pageName: "Sushi Cazza", instagramBusinessAccountId: "IG1", instagramUsername: "sushicazza", hasInstagram: true },
                   { pageId: "PG2", pageName: "Outra", instagramBusinessAccountId: null, instagramUsername: null, hasInstagram: false }],
    });
  });

  it("(6/7/8) salva Page Token CRIPTOGRAFADO + IDs + mode RECEIVE_ONLY/scope TEST", async () => {
    const r = await selectPage({ restaurantId: "r1", pageId: "PG1" }, mockGraph());
    expect(r.ok).toBe(true);
    const arg = db.instagramChannelConfig.upsert.mock.calls[0][0].create as Record<string, unknown>;
    expect(arg.facebookPageId).toBe("PG1");
    expect(arg.instagramBusinessAccountId).toBe("IG1");
    expect(arg.mode).toBe("RECEIVE_ONLY");
    expect(arg.scope).toBe("TEST_ACCOUNT_ONLY");
    expect(arg.enabled).toBe(true);
    // token guardado criptografado, nunca em texto puro
    expect(String(arg.pageAccessTokenEncrypted)).not.toContain("PAGE_TOKEN_SECRET_1");
    expect(String(arg.pageAccessTokenEncrypted)).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
    // state consumido + user token apagado
    const consume = db.metaOAuthState.update.mock.calls.at(-1)![0].data;
    expect(consume.status).toBe("CONSUMED");
    expect(consume.userAccessTokenEncrypted).toBeNull();
  });

  it("(9) a resposta (view) nunca contém o token", async () => {
    const r = await selectPage({ restaurantId: "r1", pageId: "PG1" }, mockGraph());
    expect(JSON.stringify(r.view)).not.toContain("PAGE_TOKEN_SECRET");
    expect(JSON.stringify(r.view)).not.toMatch(/[0-9a-f]{32,}:[0-9a-f]+:/); // sem ciphertext
  });

  it("Página sem Instagram → erro humano, não salva", async () => {
    const r = await selectPage({ restaurantId: "r1", pageId: "PG2" }, mockGraph());
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("Instagram profissional");
    expect(db.instagramChannelConfig.upsert).not.toHaveBeenCalled();
  });

  it("sem conexão pendente → pede para conectar de novo", async () => {
    db.metaOAuthState.findFirst.mockResolvedValue(null);
    const r = await selectPage({ restaurantId: "r1", pageId: "PG1" }, mockGraph());
    expect(r.ok).toBe(false);
    expect(db.instagramChannelConfig.upsert).not.toHaveBeenCalled();
  });
});

describe("candidates list nunca tem token", () => {
  it("listCandidates devolve candidatos sem pageAccessToken", async () => {
    db.metaOAuthState.findFirst.mockResolvedValue({
      candidates: [{ pageId: "PG1", pageName: "X", instagramBusinessAccountId: "IG1", instagramUsername: "x", hasInstagram: true }],
    });
    const c = await listCandidates("r1");
    expect(c).toHaveLength(1);
    expect(JSON.stringify(c)).not.toContain("pageAccessToken");
  });
});

describe("(10) disconnect preserva conversas", () => {
  it("desativa + apaga token, NÃO apaga Customer/Conversation/Message", async () => {
    db.instagramChannelConfig.findUnique.mockResolvedValue({
      id: "c1", restaurantId: "r1", enabled: true, paused: false, mode: "RECEIVE_ONLY", scope: "TEST_ACCOUNT_ONLY",
      instagramBusinessAccountId: "IG1", facebookPageId: "PG1", pageAccessTokenEncrypted: "iv:tag:cipher", verifyTokenHash: null,
      appId: null, appSecretRef: null, allowlistedExternalUserIds: [], lastWebhookAt: null, lastError: null, metadata: {},
    });
    const r = await disconnectMeta("r1");
    expect(r.ok).toBe(true);
    expect(r.conversationsPreserved).toBe(true);
    const upd = db.instagramChannelConfig.update.mock.calls[0][0].data;
    expect(upd.enabled).toBe(false);
    expect(upd.paused).toBe(true);
    expect(upd.pageAccessTokenEncrypted).toBeNull();
    // history preserved
    expect(db.conversation.delete).not.toHaveBeenCalled();
    expect(db.conversation.deleteMany).not.toHaveBeenCalled();
    expect(db.customer.delete).not.toHaveBeenCalled();
    expect(db.message.deleteMany).not.toHaveBeenCalled();
  });
});
