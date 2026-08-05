/**
 * (d) A regra de preço do CEO, provada número a número.
 *
 * Duas coisas são testadas aqui porque as duas já custaram dinheiro em produto
 * de assinatura:
 *
 *  1. O VALOR ANUNCIADO É O VALOR COBRADO. A tabela publicada em /site/precos é
 *     literal neste arquivo, e a página lê daqui — se alguém mexer num dos dois
 *     lados sem o outro, este teste cai antes de o cliente ser cobrado errado.
 *  2. 50% NO PRIMEIRO MÊS, valor CHEIO a partir do segundo, em TODO ciclo. O
 *     erro clássico é aplicar o desconto na recorrência inteira — o cliente pagar
 *     metade para sempre.
 */

import { describe, it, expect } from "vitest";
import {
  PLAN_CYCLE_CENTS,
  CYCLE_MONTHS,
  CYCLE_CODES,
  SITE_PLAN_IDS,
  SITE_PLAN_TO_CODE,
  CODE_TO_SITE_PLAN,
  firstChargeCents,
  firstMonthDiscountCents,
  recurringChargeCents,
  monthlyEquivalentCents,
  normalizePlanCode,
  normalizeCycleCode,
  formatBRL,
  type PlanCode,
} from "./pricing";

const CODES: PlanCode[] = ["STARTER", "GROWTH", "PRO"];

describe("a tabela cobrada é a tabela publicada", () => {
  it("bate com os valores anunciados em /site/precos", () => {
    // Essencial 179 · 483/trimestre · 1.790/ano
    expect(PLAN_CYCLE_CENTS.STARTER).toEqual({ MENSAL: 17_900, TRIMESTRAL: 48_300, ANUAL: 179_000 });
    // Crescimento 429 · 1.158/trimestre · 4.290/ano
    expect(PLAN_CYCLE_CENTS.GROWTH).toEqual({ MENSAL: 42_900, TRIMESTRAL: 115_800, ANUAL: 429_000 });
    // Performance 899 · 2.427/trimestre · 8.990/ano
    expect(PLAN_CYCLE_CENTS.PRO).toEqual({ MENSAL: 89_900, TRIMESTRAL: 242_700, ANUAL: 899_000 });
  });

  it("o mapa plano-do-site → enum do banco existe e é reversível", () => {
    expect(SITE_PLAN_TO_CODE).toEqual({ essencial: "STARTER", crescimento: "GROWTH", performance: "PRO" });
    for (const id of SITE_PLAN_IDS) {
      expect(CODE_TO_SITE_PLAN[SITE_PLAN_TO_CODE[id]]).toBe(id);
    }
  });

  it("aceita tanto o id do site quanto o código do banco, e recusa o resto", () => {
    expect(normalizePlanCode("essencial")).toBe("STARTER");
    expect(normalizePlanCode("PRO")).toBe("PRO");
    // Nada de plano chutado: valor desconhecido vira null, e a rota devolve 400.
    expect(normalizePlanCode("enterprise")).toBeNull();
    expect(normalizePlanCode("")).toBeNull();
    expect(normalizeCycleCode("anual")).toBe("ANUAL");
    expect(normalizeCycleCode("semestral")).toBeNull();
  });
});

describe("50% no primeiro mês — e só no primeiro", () => {
  it("no ciclo MENSAL a primeira cobrança é exatamente metade e a segunda é cheia", () => {
    for (const plan of CODES) {
      const cheio = PLAN_CYCLE_CENTS[plan].MENSAL;
      expect(firstChargeCents(plan, "MENSAL")).toBe(cheio / 2);
      // A RENOVAÇÃO é o valor de tabela — o desconto não contamina o recorrente.
      expect(recurringChargeCents(plan, "MENSAL")).toBe(cheio);
    }
    // Os três números que a página anuncia como "primeiro mês".
    expect(firstChargeCents("STARTER", "MENSAL")).toBe(8_950); // R$ 89,50
    expect(firstChargeCents("GROWTH", "MENSAL")).toBe(21_450); // R$ 214,50
    expect(firstChargeCents("PRO", "MENSAL")).toBe(44_950); // R$ 449,50
  });

  it("em TODO ciclo o abatimento é meio mês daquele ciclo — nunca metade do ciclo inteiro", () => {
    for (const plan of CODES) {
      for (const cycle of CYCLE_CODES) {
        const cheio = PLAN_CYCLE_CENTS[plan][cycle];
        const umMes = cheio / CYCLE_MONTHS[cycle];
        expect(firstMonthDiscountCents(plan, cycle)).toBe(Math.round(umMes / 2));
        expect(firstChargeCents(plan, cycle)).toBe(cheio - Math.round(umMes / 2));
        // O erro que este teste existe para pegar: descontar o ciclo inteiro.
        if (cycle !== "MENSAL") expect(firstChargeCents(plan, cycle)).toBeGreaterThan(cheio / 2);
      }
    }
  });

  it("a segunda cobrança é sempre o valor cheio, em todos os planos e ciclos", () => {
    for (const plan of CODES) {
      for (const cycle of CYCLE_CODES) {
        expect(recurringChargeCents(plan, cycle)).toBe(PLAN_CYCLE_CENTS[plan][cycle]);
        // E é sempre MAIOR que a primeira: se um dia empatarem, o desconto sumiu.
        expect(recurringChargeCents(plan, cycle)).toBeGreaterThan(firstChargeCents(plan, cycle));
      }
    }
  });

  it("o desconto nunca ultrapassa o valor cobrado (nenhuma cobrança negativa ou zerada)", () => {
    for (const plan of CODES) {
      for (const cycle of CYCLE_CODES) {
        expect(firstChargeCents(plan, cycle)).toBeGreaterThan(0);
        expect(Number.isInteger(firstChargeCents(plan, cycle))).toBe(true);
      }
    }
  });
});

describe("mensalidade equivalente — exibição, nunca cobrança", () => {
  it("é o total do ciclo dividido pelos meses", () => {
    expect(monthlyEquivalentCents("STARTER", "ANUAL")).toBe(Math.round(179_000 / 12)); // R$ 149,17
    expect(monthlyEquivalentCents("GROWTH", "TRIMESTRAL")).toBe(38_600); // R$ 386,00
    expect(monthlyEquivalentCents("PRO", "MENSAL")).toBe(89_900);
  });

  it("formata em BRL com centavos — R$ 89,50 e não R$ 89", () => {
    expect(formatBRL(8_950).replace(/ /g, " ")).toBe("R$ 89,50");
  });
});
