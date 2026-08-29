/**
 * A CONTA DA DEVOLUÇÃO — em centavos inteiros, e sem nunca deixar o cliente devendo.
 *
 * ── O que estes testes protegem ─────────────────────────────────────────────
 *
 * A regra do CEO (29/08/2026) tem três partes que, escritas em prosa, parecem
 * óbvias e, em código, são justamente onde nasce o defeito:
 *
 *   1. **O mês em curso não volta** — o serviço está sendo prestado.
 *   2. **O que foi pago e não foi entregue volta** — proporcional abaixo de 6
 *      meses; recalculado pelo preço mensal de 6 meses para cima.
 *   3. **O resultado nunca é negativo, e o teto da recuperação é o desconto
 *      concedido.** Sem trava, a conta do ciclo longo fica negativa a partir do
 *      décimo primeiro mês do anual — e uma devolução negativa é uma COBRANÇA:
 *      o cliente sairia devendo por ter cancelado, que é exatamente a multa que
 *      não se quis criar.
 *
 * ── AS DUAS METADES, SEMPRE ─────────────────────────────────────────────────
 *
 * Cada regra aparece recusando o que não presta E deixando passar o que presta.
 * Um arquivo só com "nunca é negativo" ficaria verde contra uma função que
 * devolvesse zero sempre — e devolver zero sempre é indistinguível de reter tudo,
 * com o agravante de parecer prudente.
 *
 * ⛔ Nada aqui move dinheiro. `devolucaoNaSaida` é função pura: sem banco, sem
 * gateway, sem credencial. Quem executa estorno é o CEO, e isso é pendência
 * declarada — ver o cabeçalho de `saidaDoPlano.ts` e o de `cancelamento.ts`.
 */

import { describe, it, expect } from "vitest";
import {
  DIAS_DE_ARREPENDIMENTO,
  MESES_DE_CICLO_LONGO,
  cicloLongo,
  descontoDoCicloCents,
  devolucaoNaSaida,
  REGRA_DE_SAIDA,
} from "./saidaDoPlano";
import {
  CYCLE_CODES,
  CYCLE_MONTHS,
  PLAN_CYCLE_CENTS,
  type CycleCode,
  type PlanCode,
} from "./pricing";

const PLANOS: PlanCode[] = ["STARTER", "GROWTH", "PRO"];

/** Um pedido "normal": fora do arrependimento, para não cair no atalho dos 7 dias. */
function pedido(over: Partial<Parameters<typeof devolucaoNaSaida>[0]> = {}) {
  return devolucaoNaSaida({
    plano: "STARTER",
    ciclo: "ANUAL",
    pagoCents: PLAN_CYCLE_CENTS.STARTER.ANUAL,
    mesesUsados: 1,
    contratadoPeloSite: false,
    diasDesdeAContratacao: 60,
    ...over,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// O DESCONTO DE CADA CICLO — o teto da recuperação, lido da tabela de preços
// ═══════════════════════════════════════════════════════════════════════════

describe("o desconto embutido em cada ciclo", () => {
  it("no mensal não há desconto de ciclo — não há compromisso a recompensar", () => {
    for (const plano of PLANOS) expect(descontoDoCicloCents(plano, "MENSAL")).toBe(0);
  });

  it("o trimestral desconta ~10% e o anual, dois meses — como a tabela anuncia", () => {
    // A metade que PASSA, e a que ancora todo o resto: se estes números saírem
    // da tabela errada, o teto da recuperação sai errado junto.
    expect(descontoDoCicloCents("STARTER", "TRIMESTRAL")).toBe(5_400);
    expect(descontoDoCicloCents("GROWTH", "TRIMESTRAL")).toBe(12_900);
    expect(descontoDoCicloCents("PRO", "TRIMESTRAL")).toBe(27_000);

    // Anual = 2 mensalidades de desconto ("paga 10, usa 12").
    for (const plano of PLANOS) {
      expect(descontoDoCicloCents(plano, "ANUAL")).toBe(PLAN_CYCLE_CENTS[plano].MENSAL * 2);
    }
  });

  it("⚠️ hoje o único ciclo de 6 meses ou mais é o anual — não existe semestral", () => {
    // Achado declarado, não detalhe: o enum `BillingCycle` do banco conhece
    // MENSAL, TRIMESTRAL e ANUAL. A regra dos 6 meses está escrita para o dia em
    // que o semestral existir; hoje ela tem UM objeto. Se alguém criar o
    // semestral, este teste muda junto — de propósito.
    expect(MESES_DE_CICLO_LONGO).toBe(6);
    expect(CYCLE_CODES.filter(cicloLongo)).toEqual(["ANUAL"]);
    expect(CYCLE_MONTHS.TRIMESTRAL).toBeLessThan(MESES_DE_CICLO_LONGO);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// OS 7 DIAS — acima de tudo, inclusive da conta do plano longo
// ═══════════════════════════════════════════════════════════════════════════

describe("⭐ arrependimento de 7 dias (quem contratou pelo site)", () => {
  it("devolve TUDO, integralmente, mesmo no plano anual", () => {
    const r = pedido({ contratadoPeloSite: true, diasDesdeAContratacao: 3 });
    expect(r.motivo).toBe("arrependimento");
    expect(r.devolverCents).toBe(PLAN_CYCLE_CENTS.STARTER.ANUAL);
    expect(r.descontoRecuperadoCents).toBe(0);
  });

  it("vale até o sétimo dia — e no oitavo já é a conta normal", () => {
    const dentro = pedido({ contratadoPeloSite: true, diasDesdeAContratacao: DIAS_DE_ARREPENDIMENTO });
    const fora = pedido({ contratadoPeloSite: true, diasDesdeAContratacao: DIAS_DE_ARREPENDIMENTO + 1 });
    expect(dentro.motivo).toBe("arrependimento");
    expect(fora.motivo).toBe("recalculoPeloMensal");
  });

  it("não vale para quem NÃO contratou pelo site — é direito de compra à distância", () => {
    // A outra metade. Contratação assistida (link de aceite enviado pela equipe,
    // negociada pessoalmente) não é compra fora do estabelecimento.
    const r = pedido({ contratadoPeloSite: false, diasDesdeAContratacao: 2 });
    expect(r.motivo).toBe("recalculoPeloMensal");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CICLOS CURTOS — proporcional simples, sem recuperar desconto
// ═══════════════════════════════════════════════════════════════════════════

describe("mensal: o mês em curso segue até o fim, e não volta", () => {
  it("devolve zero — não há período por entregar", () => {
    const r = pedido({ ciclo: "MENSAL", pagoCents: PLAN_CYCLE_CENTS.STARTER.MENSAL, mesesUsados: 1 });
    expect(r.motivo).toBe("proporcional");
    expect(r.devolverCents).toBe(0);
    expect(r.mesesNaoEntregues).toBe(0);
  });
});

describe("trimestral: proporcional do que não foi entregue", () => {
  it("cancelando no 1º mês, voltam os outros dois", () => {
    const r = pedido({
      ciclo: "TRIMESTRAL",
      pagoCents: PLAN_CYCLE_CENTS.STARTER.TRIMESTRAL, // 48.300
      mesesUsados: 1,
    });
    expect(r.motivo).toBe("proporcional");
    expect(r.devolverCents).toBe(32_200); // 48.300 × 2/3
    expect(r.descontoRecuperadoCents).toBe(0); // abaixo de 6 meses não se recupera desconto
  });

  it("cancelando no último mês, não volta nada", () => {
    const r = pedido({
      ciclo: "TRIMESTRAL",
      pagoCents: PLAN_CYCLE_CENTS.STARTER.TRIMESTRAL,
      mesesUsados: 3,
    });
    expect(r.devolverCents).toBe(0);
  });

  it("a fração de centavo fica com o CLIENTE, nunca com a casa", () => {
    // 100 centavos ÷ 3 meses × 2 = 66,66… Devolver 66 é ficar com o centavo
    // que não é nosso. Arredonda para cima.
    const r = pedido({ ciclo: "TRIMESTRAL", pagoCents: 100, mesesUsados: 1 });
    expect(r.devolverCents).toBe(67);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ⭐ CICLO LONGO — recalcula o usado pelo preço mensal, e nunca fica negativo
// ═══════════════════════════════════════════════════════════════════════════

describe("⭐ anual: os dois extremos", () => {
  it("quem cancela no PRIMEIRO mês recebe o ano menos uma mensalidade cheia", () => {
    // Anual STARTER: pagou 179.000 por 12 meses. Usou 1 mês, que a esta altura
    // custa o preço de quem não se comprometeu: 17.900.
    const r = pedido({ ciclo: "ANUAL", pagoCents: 179_000, mesesUsados: 1 });
    expect(r.motivo).toBe("recalculoPeloMensal");
    expect(r.devolverCents).toBe(179_000 - 17_900); // 161.100
    // O que ele devolveu de desconto: um mês de desconto, e nada mais.
    expect(r.descontoRecuperadoCents).toBe(2_984); // ≈ 35.800 ÷ 12
  });

  it("quem cancela na VÉSPERA do fim não recebe nada — e também não deve nada", () => {
    // 12 meses de preço mensal (214.800) passam do que ele pagou (179.000). A
    // conta crua daria −35.800: é aqui que a trava do zero salva o cliente.
    const r = pedido({ ciclo: "ANUAL", pagoCents: 179_000, mesesUsados: 12 });
    expect(r.devolverCents).toBe(0);
    expect(r.mesesNaoEntregues).toBe(0);
  });

  it("a devolução DIMINUI a cada mês que ele fica — é preço, não punição", () => {
    const valores = Array.from({ length: 12 }, (_, i) =>
      pedido({ ciclo: "ANUAL", pagoCents: 179_000, mesesUsados: i + 1 }).devolverCents,
    );
    for (let i = 1; i < valores.length; i++) {
      expect(valores[i], `mês ${i + 1}`).toBeLessThanOrEqual(valores[i - 1]);
    }
    expect(valores[0]).toBeGreaterThan(0); // e não é zero desde o começo
  });

  it("o desconto recuperado cresce com a permanência e para no teto", () => {
    // Enquanto a conta não bate no zero, o recuperado é exatamente o desconto
    // usufruído: um doze avos por mês usado. Depois disso ele PARA de crescer,
    // porque a devolução já é zero e não há mais o que recuperar.
    const desconto = descontoDoCicloCents("STARTER", "ANUAL");
    for (let usados = 1; usados <= 12; usados++) {
      const r = pedido({ ciclo: "ANUAL", pagoCents: 179_000, mesesUsados: usados });
      expect(r.descontoRecuperadoCents, `mês ${usados}`).toBeLessThanOrEqual(desconto);
      // Nunca mais que o desconto USUFRUÍDO até ali (+1 centavo de arredondamento).
      expect(r.descontoRecuperadoCents, `mês ${usados}`).toBeLessThanOrEqual(
        Math.ceil((desconto * usados) / 12) + 1,
      );
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ⛔ AS TRAVAS, EM TODOS OS PLANOS, CICLOS E MESES
// ═══════════════════════════════════════════════════════════════════════════

describe("⛔ as travas que valem mais que o texto", () => {
  const todos = () => {
    const saidas = [];
    for (const plano of PLANOS) {
      for (const ciclo of CYCLE_CODES) {
        for (const degustacao of [false, true]) {
          for (let usados = 1; usados <= CYCLE_MONTHS[ciclo]; usados++) {
            const pago = PLAN_CYCLE_CENTS[plano][ciclo];
            saidas.push({
              plano,
              ciclo: ciclo as CycleCode,
              usados,
              pago,
              r: devolucaoNaSaida({
                plano,
                ciclo,
                pagoCents: pago,
                mesesUsados: usados,
                contratadoPeloSite: false,
                diasDesdeAContratacao: 90,
                teveDegustacaoDoPrimeiroMes: degustacao,
              }),
            });
          }
        }
      }
    }
    return saidas;
  };

  it("varre uma quantidade plausível de casos", () => {
    // 3 planos × (1 + 3 + 12) meses × 2 (com e sem degustação) = 96.
    expect(todos()).toHaveLength(96);
  });

  it("a devolução NUNCA é negativa — ninguém sai devendo por cancelar", () => {
    for (const c of todos()) {
      expect(c.r.devolverCents, `${c.plano}/${c.ciclo}, mês ${c.usados}`).toBeGreaterThanOrEqual(0);
    }
  });

  it("a devolução nunca passa do que a pessoa pagou", () => {
    for (const c of todos()) {
      expect(c.r.devolverCents, `${c.plano}/${c.ciclo}, mês ${c.usados}`).toBeLessThanOrEqual(c.pago);
    }
  });

  it("⭐ a recuperação nunca passa do desconto concedido — o teto do CEO", () => {
    for (const c of todos()) {
      expect(
        c.r.descontoRecuperadoCents,
        `${c.plano}/${c.ciclo}, mês ${c.usados}: recuperou mais desconto do que concedeu`,
      ).toBeLessThanOrEqual(descontoDoCicloCents(c.plano, c.ciclo));
    }
  });

  it("tudo é centavo INTEIRO — nenhuma fração escapa para o dinheiro", () => {
    for (const c of todos()) {
      expect(Number.isInteger(c.r.devolverCents), `${c.plano}/${c.ciclo}`).toBe(true);
      expect(Number.isInteger(c.r.descontoRecuperadoCents), `${c.plano}/${c.ciclo}`).toBe(true);
    }
  });

  it("⛔ recusa valor fracionário na entrada em vez de arredondar em silêncio", () => {
    expect(() => pedido({ pagoCents: 179_000.5 })).toThrow(/centavos/i);
    expect(() => pedido({ pagoCents: -1 })).toThrow(/centavos/i);
  });

  it("mês usado fora da faixa não vira devolução maluca", () => {
    // 99 meses num ciclo de 12 é dado errado, não motivo para devolver negativo.
    const demais = pedido({ ciclo: "ANUAL", pagoCents: 179_000, mesesUsados: 99 });
    expect(demais.mesesUsados).toBe(12);
    expect(demais.devolverCents).toBe(0);
    // Zero mês usado também não existe: o primeiro mês começa no dia 1.
    const demenos = pedido({ ciclo: "ANUAL", pagoCents: 179_000, mesesUsados: 0 });
    expect(demenos.mesesUsados).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A DEGUSTAÇÃO DO PRIMEIRO MÊS NÃO PODE VIRAR COBRANÇA NA SAÍDA
// ═══════════════════════════════════════════════════════════════════════════

describe("quem teve os 50% do primeiro mês", () => {
  it("tem o mês 1 recalculado pela metade — como teria no plano mensal", () => {
    // A regra do CEO recalcula o usado pelo preço "de quem não se comprometeu".
    // Quem assina o MENSAL também ganha metade do primeiro mês. Cobrar o mês 1
    // cheio de quem sai seria cobrar dele MAIS do que o cliente mensal pagou.
    const com = pedido({ ciclo: "ANUAL", pagoCents: 171_542, mesesUsados: 1, teveDegustacaoDoPrimeiroMes: true });
    const sem = pedido({ ciclo: "ANUAL", pagoCents: 171_542, mesesUsados: 1 });
    expect(com.devolverCents - sem.devolverCents).toBe(8_950); // metade de R$ 179,00
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// O TEXTO PUBLICADO É A MESMA REGRA QUE A CONTA EXECUTA
// ═══════════════════════════════════════════════════════════════════════════

describe("a regra publicada na vitrine bate com a conta", () => {
  it("fala dos 6 meses, dos 7 dias e do 'nunca negativa'", () => {
    const texto = REGRA_DE_SAIDA.join(" ");
    expect(texto).toContain(`${MESES_DE_CICLO_LONGO} meses`);
    expect(texto).toContain(`${DIAS_DE_ARREPENDIMENTO} dias`);
    expect(texto).toMatch(/nunca fica negativa/i);
  });

  it("são frases inteiras, não rótulos", () => {
    expect(REGRA_DE_SAIDA.length).toBeGreaterThanOrEqual(5);
    for (const f of REGRA_DE_SAIDA) expect(f.length, f).toBeGreaterThan(40);
  });
});
