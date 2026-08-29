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

/**
 * "Pagou o preço de tabela em todos os meses usados" — o caso sem promoção.
 *
 * Existe como AJUDANTE DE TESTE, e não dentro da função: a função não sabe
 * montar esta lista de propósito, porque montá-la a partir de tabela é
 * exatamente o que o CEO proibiu em 29/08. Aqui é legítimo porque o teste está
 * declarando o cenário, não adivinhando o dado de um cliente real.
 */
function mensalCheioPor(meses: number, plano: PlanCode = "STARTER"): number[] {
  return Array.from({ length: meses }, () => PLAN_CYCLE_CENTS[plano].MENSAL);
}

/** Um pedido "normal": fora do arrependimento, para não cair no atalho dos 7 dias. */
function pedido(over: Partial<Parameters<typeof devolucaoNaSaida>[0]> = {}) {
  return devolucaoNaSaida({
    plano: "STARTER",
    ciclo: "ANUAL",
    pagoCents: PLAN_CYCLE_CENTS.STARTER.ANUAL,
    mensalidadesPraticadasCents: mensalCheioPor(1),
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
    expect(fora.motivo).toBe("recalculoPeloQueFoiPago");
  });

  it("não vale para quem NÃO contratou pelo site — é direito de compra à distância", () => {
    // A outra metade. Contratação assistida (link de aceite enviado pela equipe,
    // negociada pessoalmente) não é compra fora do estabelecimento.
    const r = pedido({ contratadoPeloSite: false, diasDesdeAContratacao: 2 });
    expect(r.motivo).toBe("recalculoPeloQueFoiPago");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CICLOS CURTOS — proporcional simples, sem recuperar desconto
// ═══════════════════════════════════════════════════════════════════════════

describe("mensal: o mês em curso segue até o fim, e não volta", () => {
  it("devolve zero — não há período por entregar", () => {
    const r = pedido({ ciclo: "MENSAL", pagoCents: PLAN_CYCLE_CENTS.STARTER.MENSAL, mensalidadesPraticadasCents: mensalCheioPor(1) });
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
      mensalidadesPraticadasCents: mensalCheioPor(1),
    });
    expect(r.motivo).toBe("proporcional");
    expect(r.devolverCents).toBe(32_200); // 48.300 × 2/3
    expect(r.descontoRecuperadoCents).toBe(0); // abaixo de 6 meses não se recupera desconto
  });

  it("cancelando no último mês, não volta nada", () => {
    const r = pedido({
      ciclo: "TRIMESTRAL",
      pagoCents: PLAN_CYCLE_CENTS.STARTER.TRIMESTRAL,
      mensalidadesPraticadasCents: mensalCheioPor(3),
    });
    expect(r.devolverCents).toBe(0);
  });

  it("a fração de centavo fica com o CLIENTE, nunca com a casa", () => {
    // 100 centavos ÷ 3 meses × 2 = 66,66… Devolver 66 é ficar com o centavo
    // que não é nosso. Arredonda para cima.
    const r = pedido({ ciclo: "TRIMESTRAL", pagoCents: 100, mensalidadesPraticadasCents: mensalCheioPor(1) });
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
    const r = pedido({ ciclo: "ANUAL", pagoCents: 179_000, mensalidadesPraticadasCents: mensalCheioPor(1) });
    expect(r.motivo).toBe("recalculoPeloQueFoiPago");
    expect(r.devolverCents).toBe(179_000 - 17_900); // 161.100
    // O que ele devolveu de desconto: um mês de desconto, e nada mais.
    expect(r.descontoRecuperadoCents).toBe(2_984); // ≈ 35.800 ÷ 12
  });

  it("quem cancela na VÉSPERA do fim não recebe nada — e também não deve nada", () => {
    // 12 meses de preço mensal (214.800) passam do que ele pagou (179.000). A
    // conta crua daria −35.800: é aqui que a trava do zero salva o cliente.
    const r = pedido({ ciclo: "ANUAL", pagoCents: 179_000, mensalidadesPraticadasCents: mensalCheioPor(12) });
    expect(r.devolverCents).toBe(0);
    expect(r.mesesNaoEntregues).toBe(0);
  });

  it("a devolução DIMINUI a cada mês que ele fica — é preço, não punição", () => {
    const valores = Array.from({ length: 12 }, (_, i) =>
      pedido({ ciclo: "ANUAL", pagoCents: 179_000, mensalidadesPraticadasCents: mensalCheioPor(i + 1) }).devolverCents,
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
      const r = pedido({ ciclo: "ANUAL", pagoCents: 179_000, mensalidadesPraticadasCents: mensalCheioPor(usados) });
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
  /**
   * Duas formas de preço praticado, e não uma condicional de campanha: o cliente
   * que pagou tabela em todos os meses, e o que teve o primeiro mês pela metade.
   * A função não sabe a diferença — para ela são só dois vetores de centavos.
   */
  const FORMAS: { nome: string; precos: (usados: number, plano: PlanCode) => number[] }[] = [
    { nome: "sem promoção", precos: (u, p) => mensalCheioPor(u, p) },
    {
      nome: "com o 1º mês pela metade",
      precos: (u, p) => {
        const meses = mensalCheioPor(u, p);
        meses[0] = Math.round(meses[0]! / 2);
        return meses;
      },
    },
  ];

  const todos = () => {
    const saidas = [];
    for (const plano of PLANOS) {
      for (const ciclo of CYCLE_CODES) {
        for (const forma of FORMAS) {
          for (let usados = 1; usados <= CYCLE_MONTHS[ciclo]; usados++) {
            const pago = PLAN_CYCLE_CENTS[plano][ciclo];
            saidas.push({
              plano,
              ciclo: ciclo as CycleCode,
              usados,
              pago,
              forma: forma.nome,
              r: devolucaoNaSaida({
                plano,
                ciclo,
                pagoCents: pago,
                mensalidadesPraticadasCents: forma.precos(usados, plano),
                contratadoPeloSite: false,
                diasDesdeAContratacao: 90,
              }),
            });
          }
        }
      }
    }
    return saidas;
  };

  it("varre uma quantidade plausível de casos", () => {
    // 3 planos × (1 + 3 + 12) meses × 2 formas de preço praticado = 96.
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

  it("recusa mensalidade fracionária ou negativa, dizendo qual é a errada", () => {
    expect(() =>
      pedido({ mensalidadesPraticadasCents: [17_900, 1.5] }),
    ).toThrow(/mensalidadesPraticadasCents\[1\]/);
  });

  it("⛔ sem saber o que foi cobrado por mês, RECUSA em vez de estimar", () => {
    // A trava mais importante deste arquivo depois do "nunca negativo". A regra
    // do CEO é "recalculado pelo valor que o cliente pagou"; quem não tem esse
    // valor não tem como cumpri-la. Devolver um número plausível seria inventar
    // dinheiro alheio — e é o guardrail 1 da casa (ausência de informação não é
    // informação). O erro diz o que fazer: apurar a cobrança real.
    expect(() => pedido({ mensalidadesPraticadasCents: [] })).toThrow(/não deve ser estimado/i);
    expect(() => pedido({ mensalidadesPraticadasCents: [] })).toThrow(/PlanInvoice/);
  });

  it("mês usado fora da faixa não vira devolução maluca", () => {
    // 99 meses num ciclo de 12 é dado errado, não motivo para devolver negativo.
    const demais = pedido({
      ciclo: "ANUAL",
      pagoCents: 179_000,
      mensalidadesPraticadasCents: mensalCheioPor(99),
    });
    expect(demais.mesesUsados).toBe(12);
    expect(demais.devolverCents).toBe(0);
    // E a soma do recálculo também para no ciclo: 12 meses, não 99.
    expect(demais.mesesUsadosCustaramCents).toBe(17_900 * 12);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ⭐⭐ PROMOÇÃO CONCEDIDA NÃO SE RECUPERA — a decisão do CEO de 29/08/2026
// ═══════════════════════════════════════════════════════════════════════════

describe("⭐ o cliente que teve 50% no 1º mês e cancela no 2º", () => {
  /*
    O caso central. Palavra do CEO: *"Se ganhou cinquenta por cento, esse é o
    valor da primeira mensalidade dele, inquestionável. É sempre recalculado pelo
    valor que o cliente pagou."*

    Cenário, no Essencial anual com a degustação:
      · pagou pelo ciclo ...................... R$ 1.715,42 (171.542)
      · mês 1, preço praticado ................ R$    89,50 (8.950 — metade)
      · mês 2, preço praticado ................ R$   179,00 (17.900)
      · usados custaram ....................... R$   268,50 (26.850)
      · devolver .............................. R$ 1.446,92 (144.692)
  */
  const PAGO_NO_ANUAL_COM_DEGUSTACAO = 171_542;
  const MEIO_MES = 8_950;
  const MES_CHEIO = 17_900;

  const comPromocao = () =>
    pedido({
      ciclo: "ANUAL",
      pagoCents: PAGO_NO_ANUAL_COM_DEGUSTACAO,
      mensalidadesPraticadasCents: [MEIO_MES, MES_CHEIO],
    });

  it("os meses usados custam o que ELE pagou — R$ 89,50 + R$ 179,00", () => {
    expect(comPromocao().mesesUsadosCustaramCents).toBe(26_850);
    expect(comPromocao().devolverCents).toBe(144_692);
  });

  it("⭐ a promoção NÃO é cobrada de volta — ele recebe os R$ 89,50 a mais", () => {
    // A metade que prova a decisão. Se a casa recalculasse os dois meses pelo
    // valor cheio (35.800), devolveria 135.742 — R$ 89,50 a menos. Essa
    // diferença É a promoção, e ela fica com o cliente.
    const cobrandoCheio = pedido({
      ciclo: "ANUAL",
      pagoCents: PAGO_NO_ANUAL_COM_DEGUSTACAO,
      mensalidadesPraticadasCents: [MES_CHEIO, MES_CHEIO],
    });
    expect(cobrandoCheio.devolverCents).toBe(135_742);
    expect(comPromocao().devolverCents - cobrandoCheio.devolverCents).toBe(MEIO_MES);
  });

  it("quem teve promoção nunca recebe MENOS que quem não teve, no mesmo cenário", () => {
    // A generalização, e a que pega a próxima campanha: qualquer preço praticado
    // menor só pode AUMENTAR a devolução. Se um dia alguém reintroduzir uma
    // tabela de referência no recálculo, esta ordem se inverte e o teste cai.
    for (let usados = 1; usados <= 12; usados++) {
      const praticado = mensalCheioPor(usados);
      const comDesconto = [...praticado];
      comDesconto[0] = Math.round(comDesconto[0]! / 2);
      const base = { ciclo: "ANUAL" as const, pagoCents: PAGO_NO_ANUAL_COM_DEGUSTACAO };
      const semPromo = pedido({ ...base, mensalidadesPraticadasCents: praticado });
      const comPromo = pedido({ ...base, mensalidadesPraticadasCents: comDesconto });
      expect(comPromo.devolverCents, `mês ${usados}`).toBeGreaterThanOrEqual(
        semPromo.devolverCents,
      );
    }
  });

  it("vale para QUALQUER promoção, não só a dos 50% — inclusive mês grátis", () => {
    // Cortesia total no primeiro mês: preço praticado zero. A função não sabe o
    // nome da campanha e não precisa saber — por isso a próxima não recria o bug.
    const mesGratis = pedido({
      ciclo: "ANUAL",
      pagoCents: 179_000,
      mensalidadesPraticadasCents: [0, MES_CHEIO],
    });
    expect(mesGratis.mesesUsadosCustaramCents).toBe(MES_CHEIO);
    expect(mesGratis.devolverCents).toBe(179_000 - MES_CHEIO);
  });

  it("e a promoção também não faz a devolução passar do que ele pagou", () => {
    // O limite superior continua valendo mesmo com preço praticado zero em tudo.
    const tudoDeGraca = pedido({
      ciclo: "ANUAL",
      pagoCents: 179_000,
      mensalidadesPraticadasCents: [0, 0, 0],
    });
    expect(tudoDeGraca.devolverCents).toBe(179_000);
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

  it("⭐ e promete o que a conta faz: usa o que foi pago, e a promoção é do cliente", () => {
    // O texto é a única parte disto que o cliente lê. Se a vitrine não disser
    // que a promoção fica com ele, a decisão do CEO existe no código e não
    // existe na venda.
    const texto = REGRA_DE_SAIDA.join(" ");
    expect(texto).toMatch(/pagou de verdade/i);
    expect(texto).toMatch(/promo[çc]/i);
  });

  it("são frases inteiras, não rótulos", () => {
    expect(REGRA_DE_SAIDA.length).toBeGreaterThanOrEqual(5);
    for (const f of REGRA_DE_SAIDA) expect(f.length, f).toBeGreaterThan(40);
  });
});
