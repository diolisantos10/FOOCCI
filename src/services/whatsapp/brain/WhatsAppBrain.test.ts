import { describe, it, expect } from "vitest";
import { reasonWhatsAppMessage } from "./WhatsAppBrainReasoningAdapter";
import { evaluateAiReturn } from "./WhatsAppAiReturnPolicy";
import { runWhatsAppBrainDiagnostic } from "./WhatsAppBrainDiagnostic";

const base = {
  restaurantId: "r1", conversationId: "c1", phone: "+5511999999999",
  currentConversationStatus: "OPEN", isRestaurantOpen: true, source: "WHATSAPP" as const,
};
const reason = (messageText: string, isRestaurantOpen = true) =>
  reasonWhatsAppMessage({ ...base, messageText, isRestaurantOpen });

describe("WhatsAppBrainReasoningAdapter", () => {
  it("(1) classifica Alelo como PAYMENT_BENEFIT_QUESTION e (2) não recomenda prato", () => {
    const r = reason("Aceita Alelo Refeição?");
    expect(r.primaryIntent).toBe("PAYMENT_BENEFIT_QUESTION");
    expect(["ANSWER_BASIC_INFO", "HANDOFF_TO_HUMAN"]).toContain(r.recommendedAction);
    expect(/recomend|mais pedidos|prato/i.test(r.safeReplyStrategy)).toBe(false);
    expect(r.missingContext.join(" ")).toMatch(/Alelo|refei/i);
    expect(r.runtimeTouched).toBe(false);
  });

  it("pagamento genérico (cartão) também não vira indecisão nem prato", () => {
    const r = reason("vocês aceitam cartão?");
    expect(r.primaryIntent).toBe("PAYMENT_QUESTION");
    expect(/recomend|prato|indecis/i.test(r.safeReplyStrategy)).toBe(false);
  });

  it("(3) pedido gera SEND_ORDER_LINK", () => {
    const r = reason("Quero fazer um pedido");
    expect(r.primaryIntent).toBe("START_ORDER");
    expect(r.recommendedAction).toBe("SEND_ORDER_LINK");
    expect(r.shouldSendOrderLink).toBe(true);
  });

  it("(4) atendente gera HANDOFF", () => {
    const r = reason("Quero falar com atendente");
    expect(r.primaryIntent).toBe("ASK_ATTENDANT");
    expect(r.recommendedAction).toBe("HANDOFF_TO_HUMAN");
    expect(r.shouldHandoff).toBe(true);
    expect(r.handoffReason).toBe("CUSTOMER_REQUEST");
  });

  it("(5) fora de horário gera estratégia segura (sem prometer atendente imediato)", () => {
    const r = reason("Quero falar com atendente", false);
    expect(r.recommendedAction).toBe("ANSWER_BASIC_INFO");
    expect(r.shouldHandoff).toBe(false);
    expect(r.safetyNotes.join(" ")).toMatch(/horário/i);
  });

  it("reclamação vira HANDOFF com razão COMPLAINT", () => {
    const r = reason("Deu problema no meu pedido");
    expect(r.primaryIntent).toBe("COMPLAINT");
    expect(r.recommendedAction).toBe("HANDOFF_TO_HUMAN");
    expect(r.handoffReason).toBe("COMPLAINT");
  });

  it("(6/7/8) runtimeTouched=false; sem envio nem pedido na superfície do adapter", () => {
    const r = reason("oi");
    expect(r.runtimeTouched).toBe(false);
    // adapter é puro — não há nada que envie/crie pedido (só decisão)
    expect(Object.keys(r)).not.toContain("sent");
  });
});

describe("WhatsAppAiReturnPolicy", () => {
  const now = new Date("2026-06-10T18:00:00Z");
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);

  it("(9) aiLocked bloqueia", () => {
    const d = evaluateAiReturn({ status: "HUMAN", aiLocked: true, conversationType: "CUSTOMER", lastHumanActivityAt: hoursAgo(48), now });
    expect(d.shouldReturnToAi).toBe(false);
    expect(d.reason).toBe("LOCKED");
  });

  it("(10) 12h de inatividade libera", () => {
    const d = evaluateAiReturn({ status: "HUMAN", aiLocked: false, conversationType: "CUSTOMER", lastHumanActivityAt: hoursAgo(13), now });
    expect(d.shouldReturnToAi).toBe(true);
    expect(d.reason).toBe("INACTIVITY_12H");
  });

  it("(11) novo dia operacional libera (sem 12h)", () => {
    // humano ativo ontem 23:00 BRT (= 2026-06-10T02:00Z), agora 2026-06-10T05:00Z (02:00 BRT mesmo dia? ) usa data anterior
    const d = evaluateAiReturn({
      status: "HUMAN", aiLocked: false, conversationType: "CUSTOMER",
      lastHumanActivityAt: new Date("2026-06-09T20:00:00Z"), // 17:00 BRT dia 09
      now: new Date("2026-06-10T06:00:00Z"), // 03:00 BRT dia 10 → novo dia, ~10h depois (<12h)
    });
    expect(d.shouldReturnToAi).toBe(true);
    expect(d.reason).toBe("NEW_DAY");
  });

  it("(12) handoff crítico (COMPLAINT) bloqueia mesmo após 12h", () => {
    const d = evaluateAiReturn({ status: "HUMAN", aiLocked: false, conversationType: "CUSTOMER", lastHumanActivityAt: hoursAgo(48), lastHandoffReason: "COMPLAINT", now });
    expect(d.shouldReturnToAi).toBe(false);
    expect(d.reason).toBe("CRITICAL_HANDOFF");
  });

  it("conversa não-humana → NOT_HUMAN; humano recente → bloqueia; non-customer → LOCKED", () => {
    expect(evaluateAiReturn({ status: "OPEN", aiLocked: false, conversationType: "CUSTOMER", lastHumanActivityAt: hoursAgo(48), now }).reason).toBe("NOT_HUMAN");
    expect(evaluateAiReturn({ status: "HUMAN", aiLocked: false, conversationType: "CUSTOMER", lastHumanActivityAt: hoursAgo(2), now }).reason).toBe("RECENT_HUMAN_ACTIVITY");
    expect(evaluateAiReturn({ status: "HUMAN", aiLocked: false, conversationType: "INTERNAL", lastHumanActivityAt: hoursAgo(48), now }).reason).toBe("LOCKED");
  });

  it("runtimeTouched=false sempre", () => {
    expect(evaluateAiReturn({ status: "HUMAN", aiLocked: true, conversationType: "CUSTOMER", lastHumanActivityAt: null }).runtimeTouched).toBe(false);
  });
});

describe("WhatsAppBrainDiagnostic", () => {
  it("(13) diagnóstico sintético PASS, P0=0, no-send/no-order/no-pix", () => {
    const r = runWhatsAppBrainDiagnostic();
    expect(r.status).toBe("PASS");
    expect(r.passed).toBe(r.total);
    expect(r.p0).toBe(0);
    expect(r.noSend && r.noWhatsAppSend && r.noOrder && r.noPix).toBe(true);
    expect(r.runtimeTouched).toBe(false);
  });
});
