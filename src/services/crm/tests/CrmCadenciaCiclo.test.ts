/**
 * Portão da CADÊNCIA de ciclos do CRM — e do MOTIVO de o número ser 9, não 10.
 *
 * O defeito: o agendador interno tica a cada 10 min
 * (`ScheduledCampaignScheduler.TICK_INTERVAL_MS`) e o portão de espaçamento usa
 * `<` ESTRITO (`CRMWhatsAppBudgetPlanner.isCycleIntervalActive`). O ciclo do
 * minuto T grava a última execução em T+δ, onde δ é o tempo de mandar o lote.
 * O tick de T+10min então vê `600s − δ < 600s` e PULA a casa inteira. Cadência
 * real: 20 min. Metade dos ciclos morria em silêncio.
 *
 * As duas metades:
 *  • METADE 1 (prova do motivo) — com `10` o tick pula para qualquer δ > 0;
 *    com `9` ele passa. É o caso concreto que explica o número.
 *  • METADE 2 (o 9 não é frouxidão) — 9 continua sendo um portão de verdade:
 *    bloqueia quem tenta rodar antes da hora, e `0` (desligado) é outra coisa.
 *
 * ESTE ARQUIVO EXISTE PARA IMPEDIR QUE ALGUÉM "ARRUME" O 9 DE VOLTA PARA 10.
 * Nada é enviado: a função é pura, sem banco e sem rede.
 */

import { describe, it, expect } from "vitest";
import { isCycleIntervalActive } from "@/services/crm/CRMWhatsAppBudgetPlanner";
import { DEFAULT_BUDGET_CONFIG, applyEffectiveSafety, DEFAULT_SAFETY_CONFIG } from "@/lib/crm-safety";

/** O mesmo intervalo do agendador interno (ScheduledCampaignScheduler). */
const TICK_INTERVAL_MIN = 10;

const T0 = new Date("2026-08-07T12:00:00Z");
/** Momento do tick seguinte: exatamente um intervalo depois. */
const TICK_SEGUINTE = new Date(T0.getTime() + TICK_INTERVAL_MIN * 60_000);

describe("cadência de ciclos — por que 9 e não 10", () => {
  // ── METADE 1 — o defeito, reproduzido ──────────────────────────────────────

  it.each([1, 5, 30, 59])(
    "com 10, o ciclo gravando a execução %i s DEPOIS do tick faz o próximo tick PULAR",
    (deltaSeg) => {
      const ultimaExecucao = new Date(T0.getTime() + deltaSeg * 1_000);
      // `true` = intervalo ainda ativo = a casa inteira é pulada.
      expect(isCycleIntervalActive(ultimaExecucao, 10, TICK_SEGUINTE)).toBe(true);
    },
  );

  it.each([1, 5, 30, 59])(
    "com 9, o MESMO caso passa — é a folga de 1 min que o lote consome",
    (deltaSeg) => {
      const ultimaExecucao = new Date(T0.getTime() + deltaSeg * 1_000);
      expect(isCycleIntervalActive(ultimaExecucao, 9, TICK_SEGUINTE)).toBe(false);
    },
  );

  it("com 10 a cadência real é 20 min: só o tick de T+20 passa", () => {
    const ultimaExecucao = new Date(T0.getTime() + 5_000); // lote levou 5 s
    const tickT10 = new Date(T0.getTime() + 10 * 60_000);
    const tickT20 = new Date(T0.getTime() + 20 * 60_000);

    expect(isCycleIntervalActive(ultimaExecucao, 10, tickT10)).toBe(true);  // pulou
    expect(isCycleIntervalActive(ultimaExecucao, 10, tickT20)).toBe(false); // só agora
  });

  it("o valor configurado é 9 no default E no efetivo — mudar só um não muda produção", () => {
    expect(DEFAULT_BUDGET_CONFIG.minMinutesBetweenCycles).toBe(9);
    // applyEffectiveSafety é o que vale quando manualOverride é false (o padrão).
    const efetivo = applyEffectiveSafety({ ...DEFAULT_SAFETY_CONFIG, manualOverride: false });
    expect(efetivo.crmWhatsAppSafety.minMinutesBetweenCycles).toBe(9);
  });

  it("9 sobrevive ao tick de 10 min com um lote de até 59 s — a margem é essa", () => {
    const efetivo = applyEffectiveSafety({ ...DEFAULT_SAFETY_CONFIG, manualOverride: false });
    const minutos = efetivo.crmWhatsAppSafety.minMinutesBetweenCycles;
    const margemSeg = (TICK_INTERVAL_MIN - minutos) * 60;
    expect(margemSeg).toBe(60);
  });

  // ── METADE 2 — 9 continua sendo portão, não é "desligado" ───────────────────

  it("9 BLOQUEIA quem tenta rodar antes da hora — não virou passe livre", () => {
    const agoraMesmo = new Date(TICK_SEGUINTE.getTime() - 60_000); // 1 min atrás
    expect(isCycleIntervalActive(agoraMesmo, 9, TICK_SEGUINTE)).toBe(true);

    const oitoMin = new Date(TICK_SEGUINTE.getTime() - 8 * 60_000);
    expect(isCycleIntervalActive(oitoMin, 9, TICK_SEGUINTE)).toBe(true);
  });

  it("a fronteira do 9 é exata: 8m59s bloqueia, 9m00s libera", () => {
    const antes = new Date(TICK_SEGUINTE.getTime() - (8 * 60 + 59) * 1_000);
    const exato = new Date(TICK_SEGUINTE.getTime() - 9 * 60 * 1_000);
    expect(isCycleIntervalActive(antes, 9, TICK_SEGUINTE)).toBe(true);
    expect(isCycleIntervalActive(exato, 9, TICK_SEGUINTE)).toBe(false);
  });

  it("0 é DESLIGADO e é outra coisa — 9 nunca pode virar 0 por descuido", () => {
    expect(isCycleIntervalActive(TICK_SEGUINTE, 0, TICK_SEGUINTE)).toBe(false);
    expect(DEFAULT_BUDGET_CONFIG.minMinutesBetweenCycles).toBeGreaterThan(0);
  });
});
