import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  waiterResultEvidence: { findMany: vi.fn(), create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import {
  collectResultEvidenceFromOrders,
  type FetchOrdersForEvidence,
  type FetchConversationExcerpt,
} from "./WaiterResultEvidenceCollector";

const ORDER_NO_CONV = {
  id: "o1", restaurantId: "r1", source: "pedido", total: 80, createdAt: new Date(), conversationId: null, upsellTotal: 0,
};
const ORDER_WITH_CONV_UPSELL = {
  id: "o2", restaurantId: "r1", source: "qr", total: 55, createdAt: new Date(), conversationId: "c2", upsellTotal: 15,
};

beforeEach(() => {
  vi.clearAllMocks();
  db.waiterResultEvidence.findMany.mockResolvedValue([]);
  db.waiterResultEvidence.create.mockImplementation(async (args: { data: unknown }) => ({ id: "ev", ...(args.data as object) }));
});

describe("WaiterResultEvidenceCollector — provas a partir de receita real", () => {
  it("(1/2) pedido Foocci gera SALE_CONVERSION com orderValue preservado e (3) DRAFT", async () => {
    const fetchOrders: FetchOrdersForEvidence = async () => [ORDER_NO_CONV];
    const r = await collectResultEvidenceFromOrders({}, { fetchOrders });
    expect(r.created).toBe(1);
    expect(r.documentedRevenue).toBe(80);
    const data = db.waiterResultEvidence.create.mock.calls[0]![0].data;
    expect(data.evidenceType).toBe("SALE_CONVERSION");
    expect(data.orderValue).toBe(80);
    expect(data.status).toBe("DRAFT");
  });

  it("(4) sem conversa: não inventa diálogo e marca confiança MEDIUM", async () => {
    const fetchOrders: FetchOrdersForEvidence = async () => [ORDER_NO_CONV];
    await collectResultEvidenceFromOrders({}, { fetchOrders });
    const data = db.waiterResultEvidence.create.mock.calls[0]![0].data;
    expect(data.sanitizedExcerpt).toBeNull();
    expect(data.summary).toContain("Conversa relacionada não encontrada");
    expect(data.metadata.confidence).toBe("MEDIUM");
  });

  it("(5) com conversa: excerpt é sanitizado e confiança HIGH; gera também UPSELL com incremental", async () => {
    const fetchOrders: FetchOrdersForEvidence = async () => [ORDER_WITH_CONV_UPSELL];
    const fetchExcerpt: FetchConversationExcerpt = async () => "Oi! meu telefone é (11) 98888-7777";
    const r = await collectResultEvidenceFromOrders({}, { fetchOrders, fetchExcerpt });
    expect(r.byType.SALE_CONVERSION).toBe(1);
    expect(r.byType.UPSELL).toBe(1);
    expect(r.documentedIncremental).toBe(15);
    const sale = db.waiterResultEvidence.create.mock.calls[0]![0].data;
    expect(sale.metadata.confidence).toBe("HIGH");
    expect(sale.sanitizedExcerpt).toContain("[telefone]");
    expect(sale.sanitizedExcerpt).not.toContain("98888");
    const upsell = db.waiterResultEvidence.create.mock.calls[1]![0].data;
    expect(upsell.evidenceType).toBe("UPSELL");
    expect(upsell.incrementalValue).toBe(15); // valueAfter(55) - valueBefore(40)
  });

  it("(7) deduplica por (pedido, tipo)", async () => {
    db.waiterResultEvidence.findMany.mockResolvedValue([{ sourceId: "o1", evidenceType: "SALE_CONVERSION" }]);
    const fetchOrders: FetchOrdersForEvidence = async () => [ORDER_NO_CONV];
    const r = await collectResultEvidenceFromOrders({}, { fetchOrders });
    expect(r.created).toBe(0);
    expect(db.waiterResultEvidence.create).not.toHaveBeenCalled();
  });

  it("nunca toca pedido/conversa: read-only e runtimeTouched=false", async () => {
    const fetchOrders: FetchOrdersForEvidence = async () => [ORDER_NO_CONV];
    const r = await collectResultEvidenceFromOrders({}, { fetchOrders });
    expect(r.runtimeTouched).toBe(false);
    // o collector só usa findMany/create de evidence — nenhuma mutação de order/conversation
    expect(Object.keys(db)).toEqual(["waiterResultEvidence"]);
  });
});
