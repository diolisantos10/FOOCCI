/**
 * A conta da economia — os dois casos que o site errava em produção.
 *
 * Este teste existe porque o defeito é do tipo que VOLTA: alguém escreve
 * `comissão × fatia migrada`, lê "economia" e não percebe que a mensalidade que a
 * pessoa passa a pagar ficou de fora. Ele não testa marcação — testa o número, que
 * é o que o dono do restaurante leva para a reunião com o sócio.
 */

import { describe, it, expect } from "vitest";
import { migrationSavings } from "./savings";
import { formatBRL } from "./commissionRates";
import { PLAN_CYCLE_CENTS } from "@/lib/billing/pricing";

/** A mensalidade que a calculadora da home compara — plano Crescimento. */
const CRESCIMENTO = PLAN_CYCLE_CENTS.GROWTH.MENSAL / 100; // R$ 429

describe("migrationSavings — a mensalidade É descontada", () => {
  it("R$ 20.000/mês a 23%: sobra R$ 491, não R$ 920", () => {
    const s = migrationSavings({ monthlyRevenue: 20_000, ratePercent: 23, planMonthly: CRESCIMENTO });

    expect(s.monthlyCommission).toBe(4_600);
    // O que o site mostrava antes — agora explicitamente rotulado como BRUTO.
    expect(s.grossLow).toBe(920);
    expect(s.grossHigh).toBeCloseTo(1_610, 6);

    // O que ele passa a mostrar: bruto menos a mensalidade.
    expect(s.netLow).toBe(491);
    expect(s.netHigh).toBeCloseTo(1_181, 6);
    // `toLocaleString` separa "R$" do número com espaço não-quebrável (U+00A0).
    expect(formatBRL(s.netLow).replace(/ /g, " ")).toBe("R$ 491");

    expect(s.outcome).toBe("positivo");
  });

  it("R$ 2.000/mês a 23%: é PREJUÍZO, e a tela não pode dizer que sobra R$ 92", () => {
    const s = migrationSavings({ monthlyRevenue: 2_000, ratePercent: 23, planMonthly: CRESCIMENTO });

    expect(s.grossLow).toBe(92); // o número mentiroso de antes
    expect(s.netLow).toBe(-337); // o número verdadeiro
    expect(s.netHigh).toBeCloseTo(-268, 6);
    expect(s.outcome).toBe("negativo");

    // E, sendo negativo, a tela precisa do ponto de equilíbrio para ser honesta
    // sem esconder: migrando 20%, a conta vira a partir de ~R$ 9.326/mês.
    expect(Math.round(s.breakEvenLow)).toBe(9_326);
    expect(Math.round(s.breakEvenHigh)).toBe(5_329);
    expect(Math.round(s.breakEvenFull)).toBe(1_865);
  });

  it("nunca devolve NaN nem Infinity com entrada inutilizável", () => {
    const zero = migrationSavings({ monthlyRevenue: 0, ratePercent: 0, planMonthly: CRESCIMENTO });
    for (const v of Object.values(zero)) {
      if (typeof v === "number") expect(Number.isFinite(v)).toBe(true);
    }
    expect(zero.breakEvenLow).toBe(0);

    const lixo = migrationSavings({ monthlyRevenue: NaN, ratePercent: -5, planMonthly: CRESCIMENTO });
    expect(lixo.monthlyCommission).toBe(0);
    expect(Number.isFinite(lixo.netLow)).toBe(true);
  });

  it("existe uma faixa em que só a ponta otimista paga a mensalidade", () => {
    // Entre o break-even da ponta alta (R$ 5.329) e o da ponta baixa (R$ 9.326).
    const s = migrationSavings({ monthlyRevenue: 7_000, ratePercent: 23, planMonthly: CRESCIMENTO });
    expect(s.netLow).toBeLessThan(0);
    expect(s.netHigh).toBeGreaterThan(0);
    expect(s.outcome).toBe("parcial");
  });
});

describe("o bloco 'Faz a conta' de /site/precos usa a MESMA conta", () => {
  // Os três cenários que a página desenha, com o preço real de cada plano.
  const CENARIOS = [
    { plano: "Essencial", revenue: 20_000, mensal: PLAN_CYCLE_CENTS.STARTER.MENSAL / 100, net: 741 },
    { plano: "Crescimento", revenue: 40_000, mensal: PLAN_CYCLE_CENTS.GROWTH.MENSAL / 100, net: 1_411 },
    { plano: "Performance", revenue: 150_000, mensal: PLAN_CYCLE_CENTS.PRO.MENSAL / 100, net: 6_001 },
  ];

  for (const c of CENARIOS) {
    it(`${c.plano}: ${formatBRL(c.revenue)} → ${formatBRL(c.net)} líquidos`, () => {
      const s = migrationSavings({ monthlyRevenue: c.revenue, ratePercent: 23, planMonthly: c.mensal });
      expect(s.netLow).toBeCloseTo(c.net, 6);
      // A mensalidade tem de estar descontada: bruto e líquido não podem coincidir.
      expect(s.grossLow - s.netLow).toBeCloseTo(c.mensal, 6);
      expect(s.outcome).toBe("positivo");
    });
  }
});
