import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  conversation: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { maskPII, scanRealConversations } from "./realConversationScan";

beforeEach(() => {
  vi.clearAllMocks();
  db.conversation.findMany.mockResolvedValue([]);
});

describe("maskPII — one masker, stronger than any single source's", () => {
  it("masks e-mail", () => {
    const out = maskPII("manda no joao.silva@gmail.com por favor");
    expect(out).toContain("[EMAIL]");
    expect(out).not.toContain("joao.silva@gmail.com");
  });

  it("labels a formatted CPF and never leaks a bare 11-digit doc", () => {
    expect(maskPII("meu cpf é 123.456.789-09")).toContain("[CPF]");
    // a bare 11-digit number is ambiguous with a mobile — label may vary, but it is always masked
    expect(maskPII("cpf 12345678909 ok")).not.toMatch(/\d{8}/);
  });

  it("masks phone numbers in every common BR format, leaving no digit run behind", () => {
    for (const phone of ["11999998888", "(11) 99999-8888", "+55 11 99999-8888", "5511999998888"]) {
      const out = maskPII(`liga pra ${phone} agora`);
      expect(out, phone).toContain("[TELEFONE]");
      expect(out, phone).not.toMatch(/\d{8}/);
    }
  });

  it("masks a street address with number", () => {
    const out = maskPII("entrega na Rua das Flores, 123 - centro");
    expect(out).toContain("[ENDEREÇO]");
    expect(out).not.toContain("Flores");
  });

  it("masks CEP", () => {
    expect(maskPII("cep 13560-000 por favor")).toContain("[CEP]");
  });

  it("leaves no long digit run (ids/tokens) in the open", () => {
    expect(maskPII("pedido 998877665544 confirmado")).not.toMatch(/\d{8}/);
  });

  it("is null/empty safe", () => {
    expect(maskPII(undefined as unknown as string)).toBe("");
    expect(maskPII("")).toBe("");
  });
});

describe("scanRealConversations — the single canonical reader", () => {
  type Row = {
    content: string;
    senderType: string | null;
    direction?: string;
    type?: string;
    sentAt?: Date;
  };
  function msg(senderType: string | null, content: string, over: Partial<Row> = {}): Row {
    return { content, senderType, direction: "INBOUND", type: "text", sentAt: new Date("2026-06-22T10:00:00Z"), ...over };
  }

  it("maps role from senderType (AI/HUMAN→bot, SYSTEM→system, else customer) and masks content", async () => {
    db.conversation.findMany.mockResolvedValue([
      {
        id: "c1",
        restaurantId: "r1",
        channel: "WHATSAPP",
        status: "CLOSED",
        orderId: "o1",
        messages: [
          msg("CUSTOMER", "meu zap é 11999998888"),
          msg("AI", "claro!"),
          msg("HUMAN", "aqui é o gerente"),
          msg("SYSTEM", "handoff"),
          msg(null, "obrigado"),
        ],
      },
    ]);

    const out = await scanRealConversations();
    expect(out).toHaveLength(1);
    const conv = out[0]!;
    expect(conv.messages.map((m) => m.role)).toEqual(["customer", "bot", "bot", "system", "customer"]);
    // masked content, raw senderType preserved for downstream classifiers
    expect(conv.messages[0]!.content).toContain("[TELEFONE]");
    expect(conv.messages[0]!.content).not.toContain("11999998888");
    expect(conv.messages[1]!.senderType).toBe("AI");
    expect(conv.messages[0]!.sentAt).toBe("2026-06-22T10:00:00.000Z");
    expect(conv.restaurantId).toBe("r1");
    expect(conv.orderId).toBe("o1");
  });

  it("drops conversations under minMessages (default 2)", async () => {
    db.conversation.findMany.mockResolvedValue([
      { id: "short", restaurantId: "r1", channel: "WHATSAPP", status: "OPEN", orderId: null, messages: [msg("CUSTOMER", "oi")] },
      { id: "ok", restaurantId: "r1", channel: "WHATSAPP", status: "OPEN", orderId: null, messages: [msg("CUSTOMER", "oi"), msg("AI", "olá")] },
    ]);
    const out = await scanRealConversations();
    expect(out.map((c) => c.id)).toEqual(["ok"]);
  });

  it("passes optional filters + caps into the query", async () => {
    await scanRealConversations({ restaurantId: "r9", channel: "WHATSAPP", conversationType: "CUSTOMER", sinceHours: 48, maxConversations: 30 });
    const arg = db.conversation.findMany.mock.calls[0]![0] as {
      where: { restaurantId?: string; channel?: string; conversationType?: string; lastMessageAt: { gte: Date } };
      take: number;
      orderBy: unknown;
    };
    expect(arg.where).toMatchObject({ restaurantId: "r9", channel: "WHATSAPP", conversationType: "CUSTOMER" });
    expect(arg.where.lastMessageAt.gte).toBeInstanceOf(Date);
    expect(arg.take).toBe(30);
    expect(arg.orderBy).toEqual({ lastMessageAt: "desc" });
  });

  it("exposes raw (unmasked) text only when includeRaw is set", async () => {
    db.conversation.findMany.mockResolvedValue([
      { id: "c1", restaurantId: "r1", channel: "WHATSAPP", status: "OPEN", orderId: null, messages: [msg("CUSTOMER", "zap 11999998888"), msg("AI", "ok")] },
    ]);

    const masked = await scanRealConversations();
    expect(masked[0]!.messages[0]!.raw).toBeUndefined();
    expect(masked[0]!.messages[0]!.content).toContain("[TELEFONE]");

    const withRaw = await scanRealConversations({ includeRaw: true });
    expect(withRaw[0]!.messages[0]!.raw).toBe("zap 11999998888"); // unmasked, for in-memory detectors
    expect(withRaw[0]!.messages[0]!.content).toContain("[TELEFONE]"); // content still masked
  });

  it("omits filters that weren't provided and defaults the cap to 200", async () => {
    await scanRealConversations();
    const arg = db.conversation.findMany.mock.calls[0]![0] as { where: Record<string, unknown>; take: number };
    expect(arg.where).not.toHaveProperty("restaurantId");
    expect(arg.where).not.toHaveProperty("channel");
    expect(arg.where).not.toHaveProperty("conversationType");
    expect(arg.take).toBe(200);
  });
});
