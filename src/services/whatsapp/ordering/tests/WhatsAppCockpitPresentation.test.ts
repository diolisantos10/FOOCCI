/**
 * Cockpit UX — o simulador substitui o teste manual no celular.
 * Prova que: a "próxima ação" não exige aparelho, cada cenário expõe transcript
 * e comanda, as ações são traduzidas para linguagem humana, o checklist visual
 * é derivado do relatório real e as safety flags continuam visíveis.
 */

import { describe, it, expect, beforeAll, vi } from "vitest";

const db = vi.hoisted(() => ({
  restaurant: { findFirst: vi.fn(), findUnique: vi.fn() },
  whatsAppTextOrderingConfig: { findUnique: vi.fn() },
  paymentSettings: { findUnique: vi.fn() },
  menuItem: { count: vi.fn() },
  customer: { findFirst: vi.fn() },
  order: { findFirst: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { runTextOrderSimulator, type SimReport } from "../WhatsAppTextOrderSimulatorService";
import {
  translateAction,
  buildCockpitChecklist,
  SIMULATOR_NEXT_ACTION,
  OPERATOR_DECISIONS,
} from "../cockpitPresentation";
import { runReadinessDiagnostic } from "../readinessDiagnostic";

let report: SimReport;
const byId = (id: string) => report.scenarios.find(s => s.scenarioId === id)!;

beforeAll(async () => {
  report = await runTextOrderSimulator("REPLY_ONLY");
});

describe("(1) Próximas ações não exigem celular", () => {
  it("readiness aponta o simulador, não o aparelho", async () => {
    delete process.env.WHATSAPP_TEXT_ORDERING_ENABLED;
    delete process.env.WHATSAPP_TEXT_ORDERING_PAUSED;
    db.restaurant.findFirst.mockResolvedValue({ id: "r1", name: "Sushi Cazza" });
    db.whatsAppTextOrderingConfig.findUnique.mockResolvedValue({
      restaurantId: "r1", enabled: true, mode: "ALLOWLIST_REPLY_ONLY", scope: "PHONE_ALLOWLIST",
      allowlistedPhones: ["+5511999990000"], paused: false, notes: null, updatedAt: new Date(),
    });
    db.paymentSettings.findUnique.mockResolvedValue({ acceptPix: true, acceptCash: true, acceptCard: true });
    db.menuItem.count.mockResolvedValue(100);

    const r = await runReadinessDiagnostic({ restaurantSlug: "sushi-cazza" });
    expect(r.replyOnlyReady).toBe(true);
    const actions = r.requiredNextActions.join(" | ");
    expect(actions).not.toContain("validar REPLY_ONLY no aparelho");
    expect(actions.toLowerCase()).toContain("simulador");
    expect(actions.toLowerCase()).toContain("opcional");
  });

  it("o texto fixo do cockpit deixa o celular como opcional", () => {
    expect(SIMULATOR_NEXT_ACTION.toLowerCase()).toContain("opcional");
    expect(SIMULATOR_NEXT_ACTION.toLowerCase()).toContain("transcript");
    expect(SIMULATOR_NEXT_ACTION.toLowerCase()).not.toContain("obrigatório no celular");
  });
});

describe("(2/3) Cada cenário expõe transcript e comanda", () => {
  it("transcript completo com cliente e agente", () => {
    for (const s of report.scenarios.filter(x => x.kind === "FLOW")) {
      expect(s.transcript.some(t => t.actor === "CUSTOMER")).toBe(true);
      expect(s.transcript.some(t => t.actor === "AGENT")).toBe(true);
    }
  });

  it("comanda montada + resumo operacional (itens/pagamento/endereço)", () => {
    const cash = byId("sim-cash-delivery");
    expect(cash.orderDraft).not.toBeNull();
    expect(cash.summary.itemsFound.length).toBeGreaterThan(0);
    expect(cash.summary.paymentMethod).toBe("CASH");
    expect(cash.summary.deliveryType).toBe("DELIVERY");
    expect(cash.summary.addressUsed).toContain("Rua das Flores");

    const ambiguous = byId("sim-ambiguous");
    expect(ambiguous.summary.itemsAmbiguous.length).toBeGreaterThan(0);
  });
});

describe("(4) Ações traduzidas para linguagem humana", () => {
  it("WOULD_CREATE_ORDER e WOULD_GENERATE_PIX viram frases operacionais", () => {
    expect(translateAction("WOULD_CREATE_ORDER")).toContain("confirmação final");
    expect(translateAction("WOULD_CREATE_ORDER")).toContain("seguro no simulador");
    expect(translateAction("WOULD_GENERATE_PIX")).toContain("não gerou Pix de verdade");
    expect(translateAction("QUOTE_DELIVERY")).toContain("taxa de entrega");
    expect(translateAction("ACAO_DESCONHECIDA")).toContain("sem efeito real");
  });
});

describe("(5) Checklist visual derivado do relatório", () => {
  it("8 itens, todos provados com config segura", () => {
    const checklist = buildCockpitChecklist(report, { scope: "PHONE_ALLOWLIST", riskLevel: "LOW" });
    expect(checklist).toHaveLength(8);
    const labels = checklist.map(c => c.label).join(" | ");
    expect(labels).toContain("0. menu");
    expect(labels).toContain("Nenhum produto inventado");
    expect(labels).toContain("Pagamento veio do Fute");
    expect(labels).toContain("Pix só após confirmação");
    expect(labels).toContain("Pedido só após confirmação");
    expect(labels).toContain("Handoff");
    expect(labels).toContain("allowlist");
    expect(labels).toContain("RESTAURANT_WIDE bloqueado");
    for (const item of checklist) {
      expect(item.passed).toBe(true);
    }
  });

  it("sem config, o item de allowlist fica pendente (null), nunca inventado", () => {
    const checklist = buildCockpitChecklist(report);
    const allowlistItem = checklist.find(c => c.label.includes("allowlist"))!;
    expect(allowlistItem.passed).toBeNull();
  });

  it("scope RESTAURANT_WIDE vivo reprova os itens de exposição", () => {
    const checklist = buildCockpitChecklist(report, { scope: "RESTAURANT_WIDE", riskLevel: "HIGH" });
    expect(checklist.find(c => c.label.includes("allowlist"))!.passed).toBe(false);
    expect(checklist.find(c => c.label.includes("RESTAURANT_WIDE"))!.passed).toBe(false);
  });
});

describe("(6) Safety flags continuam visíveis", () => {
  it("agregado e por cenário", () => {
    expect(report.safety).toEqual({ noWhatsAppSend: true, noRealOrder: true, noRealPix: true, runtimeTouched: false });
    for (const s of report.scenarios) {
      expect(s.safety.noWhatsAppSend).toBe(true);
      expect(s.safety.runtimeTouched).toBe(false);
    }
  });

  it("as três decisões do operador existem (UI state, sem ação real)", () => {
    expect(OPERATOR_DECISIONS).toEqual([
      "Aprovado para FULL_TEST controlado",
      "Precisa ajuste de mensagem",
      "Bloqueado",
    ]);
  });
});
