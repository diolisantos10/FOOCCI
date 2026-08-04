/**
 * LiveMonitor — pure snapshot builder. Must never expose PII and must always
 * report the no-send / no-charge safety invariants.
 */

import { describe, it, expect } from "vitest";
import { buildMonitorSnapshot, type MonitorInputs } from "../liveMonitor";
import type { ConversationOutcome } from "../conversationReview";

const inputs = (over: Partial<MonitorInputs>): MonitorInputs => ({
  restaurantSlug: "sushi-cazza", periodHours: 24, outcomes: [], ordersGenerated: 0,
  revenue: 0, handoffs: 0, pendingLearnings: 0, ...over,
});

const O = (...o: ConversationOutcome[]) => o;

describe("buildMonitorSnapshot", () => {
  it("calcula conversão conversa→pedido", () => {
    const s = buildMonitorSnapshot(inputs({
      outcomes: O("VENDA_CONCLUIDA", "VENDA_CONCLUIDA", "CLIENTE_ABANDONOU", "OK_SEM_ACAO"),
      ordersGenerated: 2,
    }));
    expect(s.conversations).toBe(4);
    expect(s.ordersGenerated).toBe(2);
    expect(s.conversationToOrderRate).toBe(0.5);
  });

  it("conta abandonos (abandono + oportunidade perdida)", () => {
    const s = buildMonitorSnapshot(inputs({
      outcomes: O("CLIENTE_ABANDONOU", "OPORTUNIDADE_DE_VENDA_PERDIDA", "VENDA_CONCLUIDA"),
    }));
    expect(s.abandonos).toBe(2);
  });

  it("agrupa erros por categoria e expõe top 5", () => {
    const s = buildMonitorSnapshot(inputs({
      outcomes: O("ERRO_DE_PAGAMENTO", "ERRO_DE_PAGAMENTO", "ERRO_DE_ENDERECO", "LOOP"),
    }));
    const pay = s.errorsByCategory.find((e) => e.category === "ERRO_DE_PAGAMENTO");
    expect(pay?.count).toBe(2);
    expect(s.topErrors.length).toBeLessThanOrEqual(5);
    expect(s.topErrors[0].category).toBe("ERRO_DE_PAGAMENTO"); // mais frequente primeiro
  });

  it("(13) snapshot não expõe PII — só números e rótulos de negócio", () => {
    const s = buildMonitorSnapshot(inputs({
      outcomes: O("ERRO_DE_PAGAMENTO", "VENDA_CONCLUIDA"), revenue: 199.9, ordersGenerated: 1,
    }));
    const blob = JSON.stringify(s);
    expect(blob).not.toMatch(/\d{8,}/);          // no long digit runs (phones/CPF)
    expect(blob).not.toMatch(/https?:\/\//);     // no raw links
    expect(blob).not.toMatch(/rua |avenida /i);  // no addresses
  });

  it("(14) snapshot sempre reporta invariantes de segurança (não envia / não cobra)", () => {
    const s = buildMonitorSnapshot(inputs({}));
    expect(s.safety).toEqual({ noWhatsAppSend: true, noRealOrder: true, noRealPix: true, noMessageSent: true });
  });

  it("conversão é 0 quando não há conversas", () => {
    const s = buildMonitorSnapshot(inputs({}));
    expect(s.conversationToOrderRate).toBe(0);
  });
});
