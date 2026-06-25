/**
 * Thermal ticket text — format fidelity.
 *   Kitchen: resumido, NO prices, accents stripped, only the given items.
 *   Cashier: full header (CNPJ/address), values, totals, payment.
 */

import { describe, it, expect } from "vitest";
import { renderKitchenTicketText, renderCashierTicketText, ascii, TICKET_WIDTH, type TicketOrder, type TicketItem } from "./ticketText";

const baseOrder: TicketOrder = {
  id: "ord_1", orderNumber: 131, type: "DELIVERY",
  subtotal: 158.7, deliveryFee: 5, discount: 0, total: 163.7,
  notes: "Não enviar descartáveis para este pedido",
  createdAt: new Date("2026-06-24T21:38:00Z"),   // 18:38 in America/Sao_Paulo
  estimatedAt: new Date("2026-06-24T22:13:00Z"), // 19:13 in America/Sao_Paulo
  customerName: "Fabíola Aguiar",
  customerPhone: "(11) 98888-7777",
  address: { street: "R. Deocasta Aguilera", number: "215", complement: "Casa", neighborhood: "Jardim Medina", city: "Poá" },
  payment: { method: "ONLINE", amount: 163.7, status: "PAID" },
};

const items: TicketItem[] = [
  { name: "Frango Empanado", price: 52.9, quantity: 3, notes: null, addonsJson: JSON.stringify([{ name: "Molho shoyo" }]) },
];

describe("ascii", () => {
  it("strips accents and cedilla", () => {
    expect(ascii("São Judas — Descrição ção")).toBe("Sao Judas - Descricao cao");
  });
});

describe("kitchen ticket", () => {
  const txt = renderKitchenTicketText({ order: baseOrder, items, restaurantName: "Sushi Cazza", stationName: "Cozinha 1", timezone: "America/Sao_Paulo" });

  it("has the header, order number and station", () => {
    expect(txt).toContain("ENTREGA");
    expect(txt).toContain("Pedido: #131");
    expect(txt).toContain("FABIOLA AGUIAR");
    expect(txt).toContain("Bairro: Jardim Medina");
    expect(txt).toContain(">> COZINHA 1");
  });

  it("lists items with addon, but NO prices", () => {
    expect(txt).toContain("FRANGO EMPANADO");
    expect(txt).toContain(">> Molho shoyo");
    expect(txt).toMatch(/Itens nesta estacao:\s+3/);
    expect(txt).not.toContain("158,70");
    expect(txt).not.toContain("R$");
    expect(txt).not.toContain("Valor");
    expect(txt).not.toContain("TOTAL");
  });

  it("shows the order note and strips accents", () => {
    expect(txt).toContain("** Nao enviar descartaveis para este pedido **");
    expect(txt).not.toMatch(/[ãáéçõ]/);
  });

  it("never exceeds the paper width", () => {
    for (const line of txt.split("\n")) expect(line.length).toBeLessThanOrEqual(TICKET_WIDTH);
  });
});

describe("cashier ticket", () => {
  const store = { cnpj: "41.560.472/0001-86", lines: ["Avenida Nove de Julho, 1408", "Poá - Vila das Acácias"] };
  const txt = renderCashierTicketText({ order: baseOrder, items, restaurantName: "Sushi Cazza", store, timezone: "America/Sao_Paulo" });

  it("has the fiscal header", () => {
    expect(txt).toContain("SUSHI CAZZA");
    expect(txt).toContain("CNPJ: 41.560.472/0001-86");
    expect(txt).toContain("Avenida Nove de Julho, 1408");
    expect(txt).toContain("Poa - Vila das Acacias");
  });

  it("has customer, address and obs", () => {
    expect(txt).toContain("Pedido: #131");
    expect(txt).toContain("FABIOLA AGUIAR"); // customer name uppercased, accents stripped
    expect(txt).toContain("Telefone: (11) 98888-7777");
    expect(txt).toContain("R. Deocasta Aguilera, 215, Casa");
    expect(txt).toContain("Poa - Jardim Medina");
    expect(txt).toContain("Obs: Pago Online");
    expect(txt).toContain("Entrega para as: 19:13");
  });

  it("has values, totals and payment", () => {
    expect(txt).toContain("Valor");
    expect(txt).toMatch(/FRANGO EMPANADO\s+158,70/);
    expect(txt).toMatch(/Total itens\(=\)\s+158,70/);
    expect(txt).toMatch(/Taxa de entrega\(\+\)\s+5,00/);
    expect(txt).toMatch(/TOTAL\(=\)\s+163,70/);
    expect(txt).toContain("Forma de pagamento");
    expect(txt).toMatch(/Pago Online\s+163,70/);
  });

  it("never exceeds the paper width", () => {
    for (const line of txt.split("\n")) expect(line.length).toBeLessThanOrEqual(TICKET_WIDTH);
  });
});
