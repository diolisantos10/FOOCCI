/**
 * Instagram Direct foundation tests — parser, signature, config (no token leak),
 * inbound persistence into the central, idempotency, mode gates, and dry-run send.
 * Fully hermetic: prisma is mocked; the send client never hits the network.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  instagramChannelConfig: { findUnique: vi.fn(), findFirst: vi.fn(), upsert: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
  customerChannelIdentity: { findUnique: vi.fn(), upsert: vi.fn(), findFirst: vi.fn(), deleteMany: vi.fn() },
  customer: { create: vi.fn(), delete: vi.fn() },
  conversation: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  message: { findUnique: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
  $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { normalizeInstagramPayload, verifyInstagramSignature, extractAccountId } from "../InstagramWebhookParser";
import { sendInstagramText } from "../InstagramSendClient";
import { sha256, toView, verifyTokenMatches, type InstagramConfigRow } from "../InstagramConfigService";
import { handleWebhookEvent, handleCommentWebhookEvent, sendManualReply } from "../InstagramChannelService";
import { createHmac } from "crypto";

const ACCOUNT = "ig-acct-1";
const SENDER = "ig-sender-1";

function commentPayload(commentId: string, opts: { fromId?: string; text?: string } = {}) {
  return {
    object: "instagram",
    entry: [{ id: ACCOUNT, time: 1_700_000_000, changes: [{ field: "comments", value: {
      id: commentId, text: opts.text ?? "que delícia!",
      from: { id: opts.fromId ?? "ig-commenter-1", username: "cliente_feliz" }, media: { id: "media-1" },
    } }] }],
  };
}

function payload(mid: string, opts: { echo?: boolean; text?: string } = {}) {
  return {
    object: "instagram",
    entry: [{ id: ACCOUNT, time: Date.now(), messaging: [{
      sender: { id: SENDER }, recipient: { id: ACCOUNT }, timestamp: 1700000000000,
      message: { mid, text: opts.text ?? "oi", is_echo: opts.echo },
    }] }],
  };
}

const baseConfig: InstagramConfigRow = {
  id: "c1", restaurantId: "r1", enabled: true, paused: false, mode: "RECEIVE_ONLY", scope: "RESTAURANT_WIDE",
  instagramBusinessAccountId: ACCOUNT, facebookPageId: null, pageAccessTokenEncrypted: null, verifyTokenHash: null,
  appId: null, appSecretRef: null, allowlistedExternalUserIds: [], lastWebhookAt: null, lastError: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  db.instagramChannelConfig.findFirst.mockResolvedValue({ ...baseConfig });
  db.instagramChannelConfig.findUnique.mockResolvedValue({ ...baseConfig, mode: "REPLY_ONLY" });
  db.instagramChannelConfig.update.mockResolvedValue({});
  db.customerChannelIdentity.findUnique.mockResolvedValue(null);
  db.customerChannelIdentity.upsert.mockResolvedValue({ id: "ident1" });
  db.customerChannelIdentity.findFirst.mockResolvedValue({ externalUserId: SENDER });
  db.customer.create.mockResolvedValue({ id: "cust1" });
  db.conversation.findFirst.mockResolvedValue(null);
  db.conversation.create.mockResolvedValue({ id: "conv1" });
  db.conversation.update.mockResolvedValue({});
  db.message.findUnique.mockResolvedValue(null);
  db.message.create.mockResolvedValue({ id: "msg1" });
});

describe("(3/4) parser", () => {
  it("normaliza mensagem de texto", () => {
    const n = normalizeInstagramPayload(payload("m1"));
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ channel: "INSTAGRAM_DIRECT", senderId: SENDER, messageId: "m1", text: "oi", rawType: "text", isEcho: false });
  });
  it("classifica echo (não vira inbound)", () => {
    const n = normalizeInstagramPayload(payload("m2", { echo: true }));
    expect(n[0]!.isEcho).toBe(true);
    expect(n[0]!.rawType).toBe("echo");
  });
  it("ignora evento desconhecido sem quebrar", () => {
    expect(normalizeInstagramPayload({ object: "instagram", entry: [{ id: ACCOUNT, messaging: [{ foo: 1 }] }] })).toHaveLength(0);
    expect(normalizeInstagramPayload(null)).toHaveLength(0);
    expect(normalizeInstagramPayload({})).toHaveLength(0);
  });
  it("extractAccountId lê entry[].id", () => {
    expect(extractAccountId(payload("m3"))).toBe(ACCOUNT);
  });
});

describe("assinatura X-Hub-Signature-256", () => {
  it("opcional sem app secret; válida com secret correto; rejeita inválida", () => {
    const raw = JSON.stringify({ a: 1 });
    const good = "sha256=" + createHmac("sha256", "s3cr3t").update(raw).digest("hex");
    expect(verifyInstagramSignature(raw, null, null)).toBe(true);
    expect(verifyInstagramSignature(raw, good, "s3cr3t")).toBe(true);
    expect(verifyInstagramSignature(raw, "sha256=bad", "s3cr3t")).toBe(false);
    expect(verifyInstagramSignature(raw, null, "s3cr3t")).toBe(false);
  });
});

describe("(14) config nunca expõe token", () => {
  it("toView traz tokenConfigured boolean, nunca o token", () => {
    const v = toView({ ...baseConfig, pageAccessTokenEncrypted: "iv:tag:cipher", verifyTokenHash: sha256("vt") });
    expect(v.tokenConfigured).toBe(true);
    expect(v.verifyTokenConfigured).toBe(true);
    expect(JSON.stringify(v)).not.toContain("iv:tag:cipher");
    expect(JSON.stringify(v)).not.toContain("pageAccessToken");
  });
  it("verifyTokenMatches compara por hash", () => {
    const row = { ...baseConfig, verifyTokenHash: sha256("meu-token") };
    expect(verifyTokenMatches(row, "meu-token")).toBe(true);
    expect(verifyTokenMatches(row, "errado")).toBe(false);
    expect(verifyTokenMatches({ ...baseConfig, verifyTokenHash: null }, "x")).toBe(false);
  });
});

describe("(5/6/7) inbound entra na central", () => {
  it("cria identity + conversation INSTAGRAM_DIRECT + message INBOUND", async () => {
    const r = await handleWebhookEvent(payload("min-1"));
    expect(r.resolved).toBe(true);
    expect(r.persisted).toBe(1);
    expect(db.customerChannelIdentity.upsert).toHaveBeenCalled();
    const convArg = db.conversation.create.mock.calls[0][0];
    expect(convArg.data.channel).toBe("INSTAGRAM_DIRECT");
    expect(convArg.data.aiEnabled).toBe(false); // manual only in v1
    const msgArg = db.message.create.mock.calls[0][0];
    expect(msgArg.data.direction).toBe("INBOUND");
    expect(msgArg.data.senderType).toBe("CUSTOMER");
    expect(msgArg.data.externalMessageId).toBe("min-1");
    expect(r.runtimeTouched).toBe(false);
    expect(r.noRealInstagramSend).toBe(true);
  });

  it("(8) idempotência por externalMessageId — duplicado não persiste", async () => {
    db.message.findUnique.mockResolvedValueOnce({ id: "existing" });
    const r = await handleWebhookEvent(payload("dup-1"));
    expect(r.persisted).toBe(0);
    expect(r.skippedDuplicates).toBe(1);
    expect(db.message.create).not.toHaveBeenCalled();
  });

  it("reusa conversa aberta existente", async () => {
    db.conversation.findFirst.mockResolvedValue({ id: "conv-existing" });
    await handleWebhookEvent(payload("reuse-1"));
    expect(db.conversation.create).not.toHaveBeenCalled();
  });

  it("DISABLED/paused não persiste", async () => {
    db.instagramChannelConfig.findFirst.mockResolvedValue({ ...baseConfig, mode: "DISABLED" });
    const r = await handleWebhookEvent(payload("dis-1"));
    expect(r.persisted).toBe(0);
    expect(db.message.create).not.toHaveBeenCalled();
  });

  it("conta desconhecida é ignorada", async () => {
    db.instagramChannelConfig.findFirst.mockResolvedValue(null);
    const r = await handleWebhookEvent(payload("unk-1"));
    expect(r.resolved).toBe(false);
    expect(r.persisted).toBe(0);
  });
});

describe("scope/allowlist", () => {
  it("TEST_ACCOUNT_ONLY bloqueia sender fora da allowlist", async () => {
    db.instagramChannelConfig.findFirst.mockResolvedValue({ ...baseConfig, scope: "TEST_ACCOUNT_ONLY", allowlistedExternalUserIds: [] });
    const r = await handleWebhookEvent(payload("nal-1"));
    expect(r.persisted).toBe(0);
    expect(r.skippedNotAllowlisted).toBe(1);
  });
  it("TEST_ACCOUNT_ONLY permite sender allowlisted", async () => {
    db.instagramChannelConfig.findFirst.mockResolvedValue({ ...baseConfig, scope: "TEST_ACCOUNT_ONLY", allowlistedExternalUserIds: [SENDER] });
    const r = await handleWebhookEvent(payload("al-1"));
    expect(r.persisted).toBe(1);
  });
});

describe("(9/10/11) envio manual gated + dry-run", () => {
  it("(9) RECEIVE_ONLY bloqueia envio", async () => {
    db.instagramChannelConfig.findUnique.mockResolvedValue({ ...baseConfig, mode: "RECEIVE_ONLY" });
    const r = await sendManualReply("r1", "conv1", SENDER, "olá");
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/somente recebimento/i);
    expect(db.message.create).not.toHaveBeenCalled();
  });

  it("(10/11) REPLY_ONLY chama send client mas em dry-run não envia de verdade", async () => {
    db.instagramChannelConfig.findUnique.mockResolvedValue({ ...baseConfig, mode: "REPLY_ONLY" });
    const r = await sendManualReply("r1", "conv1", SENDER, "olá");
    expect(r.send.dryRun).toBe(true);
    expect(r.send.sent).toBe(false);
    // outbound persistido como pending (não enviado de verdade)
    const msgArg = db.message.create.mock.calls[0][0];
    expect(msgArg.data.direction).toBe("OUTBOUND");
    expect(msgArg.data.externalStatus).toBe("pending");
  });

  it("(11) send client em ambiente de teste nunca envia", async () => {
    const s = await sendInstagramText({ recipientId: SENDER, text: "x", pageAccessToken: "real-token" });
    expect(s.sent).toBe(false);
    expect(s.dryRun).toBe(true);
  });

  it("send sem token retorna erro operacional claro", async () => {
    const s = await sendInstagramText({ recipientId: SENDER, text: "x", pageAccessToken: null });
    expect(s.sent).toBe(false);
    expect(s.reason).toMatch(/não configurado/i);
  });
});

describe("comentários de post entram na central (INSTAGRAM_COMMENT)", () => {
  it("cria conversa INSTAGRAM_COMMENT + message INBOUND com commentId", async () => {
    const r = await handleCommentWebhookEvent(commentPayload("comment-1"));
    expect(r.resolved).toBe(true);
    expect(r.persisted).toBe(1);
    const convArg = db.conversation.create.mock.calls[0][0];
    expect(convArg.data.channel).toBe("INSTAGRAM_COMMENT");
    expect(convArg.data.aiEnabled).toBe(false);
    const msgArg = db.message.create.mock.calls[0][0];
    expect(msgArg.data.direction).toBe("INBOUND");
    expect(msgArg.data.externalMessageId).toBe("comment-1"); // idempotency = comment id
    expect((msgArg.data.metadata as { source: string }).source).toBe("INSTAGRAM_COMMENT");
    expect((msgArg.data.metadata as { mediaId: string }).mediaId).toBe("media-1");
  });

  it("idempotência por commentId — comentário repetido não persiste", async () => {
    db.message.findUnique.mockResolvedValueOnce({ id: "existing" });
    const r = await handleCommentWebhookEvent(commentPayload("comment-dup"));
    expect(r.persisted).toBe(0);
    expect(r.skippedDuplicates).toBe(1);
    expect(db.message.create).not.toHaveBeenCalled();
  });

  it("comentário do próprio negócio (echo) é ignorado", async () => {
    const r = await handleCommentWebhookEvent(commentPayload("comment-echo", { fromId: ACCOUNT }));
    expect(r.persisted).toBe(0);
    expect(r.skippedNonMessage).toBe(1);
  });

  it("DM e comentário não se confundem no mesmo handler", async () => {
    const dmAsComment = await handleCommentWebhookEvent(payload("m-x"));
    expect(dmAsComment.persisted).toBe(0); // DM payload has no comment changes
  });
});
