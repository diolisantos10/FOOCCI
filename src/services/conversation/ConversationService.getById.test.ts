/**
 * ConversationService.getById — unified cross-channel thread.
 *
 * A customer can have separate conversations per channel (e.g. an anonymous
 * Cardápio/QR_AGENT session that later identified + a WhatsApp thread). The inbox
 * dedups these into one row, so the thread view must merge the messages of every
 * sibling conversation — otherwise the Cardápio AI replies go missing.
 * Fully hermetic: prisma is mocked.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  conversation: { findUnique: vi.fn(), findMany: vi.fn() },
  message: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { ConversationService } from "./ConversationService";

const REST = "r1";

function msg(id: string, sentAt: string, extra: Record<string, unknown> = {}) {
  return { id, sentAt: new Date(sentAt), direction: "INBOUND", senderType: "CUSTOMER", content: id, type: "TEXT", ...extra };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getById unified thread", () => {
  it("identificado: mescla mensagens de TODAS as conversas do mesmo customerId, ordenadas por sentAt", async () => {
    db.conversation.findUnique.mockResolvedValue({
      id: "wa", restaurantId: REST, customerId: "cust1", customerPhone: "5511999", channel: "WHATSAPP",
      customer: { id: "cust1", name: "Ana", phone: "5511999", email: null },
    });
    // sibling lookup by customerId returns the WhatsApp conv + the Cardápio conv
    db.conversation.findMany.mockResolvedValue([{ id: "wa" }, { id: "qr" }]);
    // merged messages across both conversations (the cardápio AI reply lives in "qr")
    db.message.findMany.mockResolvedValue([
      msg("wa-1", "2026-06-27T10:00:00Z"),
      msg("qr-ai", "2026-06-27T10:01:00Z", { senderType: "AI", direction: "OUTBOUND", metadata: { source: "CARDAPIO" } }),
    ]);

    const res = await ConversationService.getById(REST, "wa");
    expect(res.ok).toBe(true);
    const data = (res as { ok: true; data: { messages: { id: string }[] } }).data;
    // The Message query must span BOTH sibling conversation ids.
    const whereArg = db.message.findMany.mock.calls[0][0].where;
    expect(whereArg.conversationId.in.sort()).toEqual(["qr", "wa"]);
    expect(data.messages.map((m) => m.id)).toEqual(["wa-1", "qr-ai"]);
    // Sibling lookup keyed by customerId (not phone).
    expect(db.conversation.findMany.mock.calls[0][0].where).toMatchObject({ restaurantId: REST, customerId: "cust1" });
  });

  it("anônimo com telefone: mescla apenas irmãs anônimas (customerId null) pelo telefone", async () => {
    db.conversation.findUnique.mockResolvedValue({
      id: "qr", restaurantId: REST, customerId: null, customerPhone: "5511888", channel: "QR_AGENT",
      customer: null,
    });
    db.conversation.findMany.mockResolvedValue([{ id: "qr" }]);
    db.message.findMany.mockResolvedValue([msg("qr-1", "2026-06-27T09:00:00Z")]);

    const res = await ConversationService.getById(REST, "qr");
    expect(res.ok).toBe(true);
    // Anonymous merge is restricted to customerId: null siblings.
    expect(db.conversation.findMany.mock.calls[0][0].where).toMatchObject({
      restaurantId: REST, customerPhone: "5511888", customerId: null,
    });
  });

  it("sem customerId e sem telefone: usa só a própria conversa (sem lookup de irmãs)", async () => {
    db.conversation.findUnique.mockResolvedValue({
      id: "solo", restaurantId: REST, customerId: null, customerPhone: null, channel: "QR_AGENT", customer: null,
    });
    db.message.findMany.mockResolvedValue([msg("solo-1", "2026-06-27T08:00:00Z")]);

    const res = await ConversationService.getById(REST, "solo");
    expect(res.ok).toBe(true);
    expect(db.conversation.findMany).not.toHaveBeenCalled();
    expect(db.message.findMany.mock.calls[0][0].where.conversationId.in).toEqual(["solo"]);
  });

  it("404 quando a conversa não existe ou é de outro restaurante", async () => {
    db.conversation.findUnique.mockResolvedValue(null);
    const r1 = await ConversationService.getById(REST, "nope");
    expect(r1.ok).toBe(false);

    db.conversation.findUnique.mockResolvedValue({ id: "x", restaurantId: "other", customerId: null, customerPhone: null });
    const r2 = await ConversationService.getById(REST, "x");
    expect(r2.ok).toBe(false);
    expect(db.message.findMany).not.toHaveBeenCalled();
  });
});
