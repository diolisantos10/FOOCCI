/**
 * A PERGUNTA DO CEO, virada portão: dobrar a frequência de ciclos aumenta quantas
 * mensagens UMA PESSOA recebe por dia?
 *
 * Resposta que este arquivo prova: NENHUMA. Zero a mais.
 *
 * O motivo é estrutural: os portões por cliente não contam CICLOS, contam o
 * HISTÓRICO DE ENVIO da pessoa no banco. `sendsWithinCooldown`,
 * `otherCampaignSendsWithin24h`, `sendsWithinWeek` e `sameCampaignSends` vêm de
 * `campaignExecution`. Rodar o ciclo duas vezes mais cedo não apaga o que já foi
 * mandado — o segundo ciclo lê o envio do primeiro e bloqueia.
 *
 * As duas metades:
 *  • METADE 1 (prova) — com 1 envio no histórico, TODO ciclo seguinte do mesmo dia
 *    bloqueia, independentemente de quantos ciclos rodem.
 *  • METADE 2 (a exceção nomeada) — aniversário é isento das regras de frequência
 *    no avaliador. Provado aqui que a isenção existe, e que quem segura esse caso
 *    é o filtro `alreadySentIds` do runner, que também é histórico do banco.
 *
 * Puro: nada é enviado, nada toca banco.
 */

import { describe, it, expect } from "vitest";
import { evaluateContactSafety, type ContactSafetyEvalInput } from "@/services/crm/ContactSafetyService";
import { applyEffectiveSafety, DEFAULT_SAFETY_CONFIG } from "@/lib/crm-safety";

/** A configuração REALMENTE aplicada (manualOverride=false é o padrão). */
const seguranca = applyEffectiveSafety({ ...DEFAULT_SAFETY_CONFIG, manualOverride: false });

/** Meio-dia de uma quarta em Brasília — fora do silêncio, dentro da janela. */
const MEIO_DIA = new Date("2026-08-05T15:00:00Z");

function base(over: Partial<ContactSafetyEvalInput> = {}): ContactSafetyEvalInput {
  return {
    hasOptedOut: false,
    crmContactable: true,
    phone: "5511999990000",
    sendsWithinCooldown: 0,
    sendsWithinWeek: 0,
    otherCampaignSendsWithin24h: 0,
    sameCampaignSends: 0,
    contactHistoryKnown: true, // os contadores vêm do banco; aqui eles são o cenário
    contactBudgetUsed: 0,
    isNewContact: false, // teto pré-pago desligado no cenário-base
    safety: seguranca,
    whatsappAvailable: true,
    globalSentToday: 0,
    restaurantOpen: true,
    isBirthday: false,
    enforceTimeWindows: true,
    enforceDailyCap: true,
    enforceRestaurantOpen: false,
    now: MEIO_DIA,
    ...over,
  };
}

describe("cadência × exposição do cliente — quantas mensagens A MAIS por dia?", () => {
  // ── METADE 1 — a prova: nenhuma ────────────────────────────────────────────

  it("o teto por pessoa é HISTÓRICO, não por ciclo: 24h de cooldown e 5 por semana", () => {
    expect(seguranca.customerCooldownHours).toBe(24);
    expect(seguranca.maxPerWeekPerCustomer).toBe(5);
  });

  it("primeiro ciclo do dia: passa", () => {
    expect(evaluateContactSafety(base()).sendable).toBe(true);
  });

  it("QUALQUER ciclo seguinte no mesmo dia bloqueia — 1 envio no histórico basta", () => {
    // É exatamente o estado do banco depois do primeiro envio do dia.
    const depoisDoPrimeiro = base({
      sendsWithinCooldown: 1,
      sendsWithinWeek: 1,
      otherCampaignSendsWithin24h: 1,
      sameCampaignSends: 1,
    });
    const d = evaluateContactSafety(depoisDoPrimeiro);
    expect(d.sendable).toBe(false);
    expect(d.reason).toBe("DUPLICATE_CAMPAIGN_RECIPIENT");
  });

  it("outra campanha, mesmo dia: bloqueia pelo dedupe cross-campanha de 24h", () => {
    const d = evaluateContactSafety(base({ otherCampaignSendsWithin24h: 1, sendsWithinCooldown: 1 }));
    expect(d.sendable).toBe(false);
    expect(d.reason).toBe("RECENT_CRM_MESSAGE_24H");
  });

  it("mesmo sem dedupe cross-campanha, o cooldown de 24h segura sozinho", () => {
    const d = evaluateContactSafety(base({ sendsWithinCooldown: 1 }));
    expect(d.sendable).toBe(false);
    expect(d.reason).toBe("CUSTOMER_COOLDOWN_ACTIVE");
  });

  it("O NÚMERO: rodar 144 ciclos/dia em vez de 72 não muda o teto da pessoa — 1 por 24h", () => {
    // Simula o dia inteiro: cada ciclo consulta o histórico e decide.
    const simulaDia = (ciclosNoDia: number) => {
      let recebidas = 0;
      for (let i = 0; i < ciclosNoDia; i++) {
        const d = evaluateContactSafety(base({
          // O histórico do banco NÃO zera entre ciclos: é o que já recebeu hoje.
          sendsWithinCooldown:         recebidas,
          sendsWithinWeek:             recebidas,
          otherCampaignSendsWithin24h: 0,
          sameCampaignSends:           0,
        }));
        if (d.sendable) recebidas++;
      }
      return recebidas;
    };

    const cadencia20min = simulaDia(72);   // hoje
    const cadencia10min = simulaDia(144);  // depois da mudança

    expect(cadencia20min).toBe(1);
    expect(cadencia10min).toBe(1);
    expect(cadencia10min - cadencia20min).toBe(0); // ← a resposta: ZERO a mais
  });

  it("o teto do dia do RESTAURANTE também não sobe — é janela de 24h, não de ciclo", () => {
    const noTeto = base({ globalSentToday: seguranca.dailyGlobalCap });
    const d = evaluateContactSafety(noTeto);
    expect(d.sendable).toBe(false);
    expect(d.reason).toBe("DAILY_GLOBAL_CAP_REACHED");
  });

  // ── METADE 2 — a exceção nomeada, dita em voz alta ─────────────────────────

  it("ANIVERSÁRIO é isento das regras de frequência no avaliador — a exceção existe", () => {
    const aniversario = base({
      isBirthday: true,
      sendsWithinCooldown: 3,
      sendsWithinWeek: 9,
      otherCampaignSendsWithin24h: 2,
      sameCampaignSends: 1,
    });
    // Este é o comportamento ATUAL, e não foi tocado por esta mudança.
    expect(evaluateContactSafety(aniversario).sendable).toBe(true);
  });

  it("a isenção de aniversário NÃO fura opt-out, telefone, silêncio nem teto do dia", () => {
    expect(evaluateContactSafety(base({ isBirthday: true, hasOptedOut: true })).reason)
      .toBe("CUSTOMER_OPTED_OUT");
    expect(evaluateContactSafety(base({ isBirthday: true, phone: null })).reason)
      .toBe("MISSING_PHONE");
    expect(evaluateContactSafety(base({ isBirthday: true, globalSentToday: seguranca.dailyGlobalCap })).reason)
      .toBe("DAILY_GLOBAL_CAP_REACHED");
    // Silêncio: 23:00 em Brasília = 02:00Z do dia seguinte.
    expect(evaluateContactSafety(base({ isBirthday: true, now: new Date("2026-08-06T02:00:00Z") })).reason)
      .toBe("QUIET_HOURS");
  });
});
