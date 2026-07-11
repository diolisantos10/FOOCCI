import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({ order: { findMany: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { buildCustomerMemory } from "./CustomerMemoryService";

beforeEach(() => vi.clearAllMocks());

describe("CustomerMemoryService — memória durável, comportamental, sem PII", () => {
  it("cliente com histórico → resumo com favoritos, ticket e recência", async () => {
    db.order.findMany.mockResolvedValue([
      { createdAt: new Date(), total: 80, items: [{ name: "Combo Salmão", quantity: 2 }, { name: "Temaki", quantity: 1 }] },
      { createdAt: new Date(Date.now() - 7 * 86400000), total: 60, items: [{ name: "Combo Salmão", quantity: 1 }] },
    ]);
    const m = await buildCustomerMemory("r1", "cust_1");
    expect(m.orderCount).toBe(2);
    expect(m.summary).toContain("Combo Salmão");
    expect(m.summary).toMatch(/ticket médio/i);
    expect(m.summary).toMatch(/2 pedidos/);
    // Sem PII: nada de telefone/email no resumo
    expect(m.summary).not.toMatch(/@|\d{4,5}-?\d{4}/);
  });

  it("cliente sem histórico → memória vazia (não inventa)", async () => {
    db.order.findMany.mockResolvedValue([]);
    const m = await buildCustomerMemory("r1", "cust_novo");
    expect(m.summary).toBe("");
    expect(m.orderCount).toBe(0);
  });

  it("erro de DB → memória vazia, nunca lança (best-effort)", async () => {
    db.order.findMany.mockRejectedValue(new Error("db down"));
    const m = await buildCustomerMemory("r1", "cust_1");
    expect(m.summary).toBe("");
  });
});
