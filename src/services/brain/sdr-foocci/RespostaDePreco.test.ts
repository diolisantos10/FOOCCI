/**
 * O PORTÃO DA FALA DE PREÇO DO SDR — as duas metades.
 *
 * A regressão deste bloco tem nome: **mudar o preço na fonte muda o que o SDR
 * responde.** Um teste que continuasse verde com a tabela trocada por baixo não
 * estaria provando saúde — estaria provando que existe uma cópia escondida do
 * número dentro do agente, que é exatamente o defeito que a decisão do CEO de
 * 08/08 mandou fechar.
 *
 * Por isso a prova é feita de três jeitos que se cobrem:
 *
 *   1. **Dinâmica** — a tabela é substituída em memória (`vi.doMock`) e a fala é
 *      recomposta. Se o texto não mudar, há cópia. É a metade que sabota.
 *   2. **Derivada** — cada número da fala é reconferido contra o que
 *      `@/lib/billing/pricing` diz agora. É a metade que prova que o valor certo
 *      chega inteiro até a frase.
 *   3. **Estática** — o arquivo do agente não pode conter os valores da tabela
 *      escritos como literal. Os literais proibidos são gerados a partir da
 *      própria fonte, então a busca acompanha a tabela quando ela mudar.
 *
 * A sabotagem física — editar `src/lib/billing/pricing.ts` no disco, conferir por
 * `git diff` que a edição entrou, rodar e ver reprovar — foi feita à mão antes
 * deste arquivo existir e está registrada em `docs/agents/agencia/oficina.md`.
 * Teste que passa verde porque a sabotagem nunca chegou no arquivo é o modo de
 * falha mais caro desta casa.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
  auditarFalaDePreco,
  descontoDoPrimeiroMesPercent,
  responderPreco,
} from "@/services/brain/sdr-foocci/RespostaDePreco";
import {
  PLAN_CYCLE_CENTS,
  SITE_PLAN_TO_CODE,
  firstChargeCents,
  formatBRL,
} from "@/lib/billing/pricing";
import { PLANS } from "@/lib/site/plans";

const ARQUIVO_DO_AGENTE = path.join(
  process.cwd(),
  "src/services/brain/sdr-foocci/RespostaDePreco.ts",
);

// ─────────────────────────────────────────────────────────────────────────────
//  1 · A fala responde o que o CEO mandou responder
// ─────────────────────────────────────────────────────────────────────────────

describe("o SDR responde o preço na hora", () => {
  it("traz os TRÊS planos, com nome e mensalidade", () => {
    const r = responderPreco();
    expect(r.planos).toHaveLength(3);
    for (const p of PLANS) {
      const naFala = r.planos.find((x) => x.id === p.id);
      expect(naFala, `plano ${p.id} sumiu da resposta`).toBeDefined();
      expect(r.texto).toContain(p.name);
    }
  });

  it("cada valor da fala é o valor da tabela — conferido número a número", () => {
    const r = responderPreco();
    for (const p of r.planos) {
      const esperado = PLAN_CYCLE_CENTS[SITE_PLAN_TO_CODE[p.id]].MENSAL;
      expect(p.mensalCents, `mensalidade do ${p.nome}`).toBe(esperado);
      expect(p.mensalFormatado).toBe(formatBRL(esperado));
      expect(r.texto).toContain(formatBRL(esperado));
    }
  });

  it("não puxa para reunião antes de dizer o valor", () => {
    const r = responderPreco();
    const primeiraLinha = r.texto.split("\n")[0] ?? "";
    expect(/reuni[ãa]o|agendar|call|demonstra[çc][ãa]o/i.test(primeiraLinha)).toBe(false);
    // O valor do plano de entrada aparece antes de qualquer convite.
    const entrada = formatBRL(PLAN_CYCLE_CENTS.STARTER.MENSAL);
    expect(r.texto.indexOf(entrada)).toBeGreaterThan(-1);
  });

  it("declara de onde cada número saiu", () => {
    expect(responderPreco().fonte).toContain("src/lib/billing/pricing.ts");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  2 · O desconto de 50% entra na resposta
// ─────────────────────────────────────────────────────────────────────────────

describe("o desconto do primeiro mês aparece na fala", () => {
  it("o percentual sai da função que cobra o cartão, e está no texto", () => {
    const r = responderPreco();
    expect(r.descontoPercent).toBe(descontoDoPrimeiroMesPercent());
    expect(r.texto).toContain(`${r.descontoPercent}%`);
    expect(r.texto.toLowerCase()).toContain("primeiro mês");
  });

  it("traz o valor do primeiro mês de CADA plano, não só a porcentagem", () => {
    const r = responderPreco();
    for (const p of r.planos) {
      const esperado = firstChargeCents(SITE_PLAN_TO_CODE[p.id], "MENSAL");
      expect(p.primeiroMesCents, `1º mês do ${p.nome}`).toBe(esperado);
      expect(r.texto).toContain(formatBRL(esperado));
    }
  });

  it("avisa que o desconto acaba — metade sem prazo vira cobrança inesperada", () => {
    expect(responderPreco().texto.toLowerCase()).toContain("segundo mês");
  });

  it("a própria fala do SDR passa no portão dele", () => {
    // Um portão que reprova a resposta oficial é um portão que alguém desliga.
    const auditoria = auditarFalaDePreco(responderPreco().texto);
    expect(
      auditoria.faltas,
      `O portão reprovou a fala oficial: ${JSON.stringify(auditoria.faltas)}`,
    ).toEqual([]);
    expect(auditoria.aprovado).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  3 · ⭐ A REGRESSÃO DO BLOCO — trocar a fonte troca a fala
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A tabela falsa. Valores propositalmente redondos e diferentes de tudo que
 * existe hoje, para que um vazamento da tabela real seja visível a olho nu.
 *
 * O módulo inteiro é substituído, e não só a constante: `firstChargeCents` e
 * companhia fecham sobre a tabela DENTRO do módulo real, então um mock parcial
 * devolveria a tabela falsa e o desconto verdadeiro ao mesmo tempo — uma
 * sabotagem incoerente, que não prova nada.
 */
const TABELA_FALSA = {
  STARTER: { MENSAL: 20_000, TRIMESTRAL: 54_000, ANUAL: 200_000 },
  GROWTH: { MENSAL: 50_000, TRIMESTRAL: 135_000, ANUAL: 500_000 },
  PRO: { MENSAL: 100_000, TRIMESTRAL: 270_000, ANUAL: 1_000_000 },
} as const;

const MESES_FALSOS = { MENSAL: 1, TRIMESTRAL: 3, ANUAL: 12 } as const;

function moduloDePrecoFalso() {
  type P = keyof typeof TABELA_FALSA;
  type C = keyof typeof MESES_FALSOS;
  const desconto = (p: P, c: C) => Math.round(TABELA_FALSA[p][c] / MESES_FALSOS[c] / 2);
  return {
    PLAN_CYCLE_CENTS: TABELA_FALSA,
    CYCLE_MONTHS: MESES_FALSOS,
    CYCLE_CODES: ["MENSAL", "TRIMESTRAL", "ANUAL"] as C[],
    SITE_PLAN_IDS: ["essencial", "crescimento", "performance"],
    SITE_PLAN_TO_CODE: { essencial: "STARTER", crescimento: "GROWTH", performance: "PRO" },
    CODE_TO_SITE_PLAN: { STARTER: "essencial", GROWTH: "crescimento", PRO: "performance" },
    PLAN_LABEL: { STARTER: "Essencial", GROWTH: "Crescimento", PRO: "Performance" },
    firstMonthDiscountCents: desconto,
    firstChargeCents: (p: P, c: C) => TABELA_FALSA[p][c] - desconto(p, c),
    recurringChargeCents: (p: P, c: C) => TABELA_FALSA[p][c],
    monthlyEquivalentCents: (p: P, c: C) => Math.round(TABELA_FALSA[p][c] / MESES_FALSOS[c]),
    formatBRL: (cents: number) =>
      (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
  };
}

describe("⭐ mudar o preço na FONTE muda o que o SDR responde", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/billing/pricing");
  });

  async function falaComTabelaFalsa(): Promise<string> {
    vi.doMock("@/lib/billing/pricing", () => moduloDePrecoFalso());
    const mod = await import("@/services/brain/sdr-foocci/RespostaDePreco");
    return mod.responderPreco().texto;
  }

  it("a fala passa a dizer os valores NOVOS", async () => {
    const texto = await falaComTabelaFalsa();
    const brl = (c: number) =>
      (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

    expect(texto, "o Essencial não seguiu a tabela").toContain(brl(TABELA_FALSA.STARTER.MENSAL));
    expect(texto, "o Crescimento não seguiu a tabela").toContain(brl(TABELA_FALSA.GROWTH.MENSAL));
    expect(texto, "o Performance não seguiu a tabela").toContain(brl(TABELA_FALSA.PRO.MENSAL));
  });

  it("a fala DEIXA de dizer os valores antigos — se disser, existe cópia escondida", async () => {
    const texto = await falaComTabelaFalsa();
    for (const codigo of ["STARTER", "GROWTH", "PRO"] as const) {
      const antigo = formatBRL(PLAN_CYCLE_CENTS[codigo].MENSAL);
      expect(
        texto,
        `A tabela mudou e o SDR continuou dizendo ${antigo}. ` +
          `Isso é uma cópia do preço dentro do agente — o defeito que este bloco fecha: ` +
          `no dia em que a tabela mudar, o site mostra um valor e o SDR vende outro.`,
      ).not.toContain(antigo);
    }
  });

  it("o desconto do primeiro mês acompanha a fonte, não uma constante", async () => {
    vi.doMock("@/lib/billing/pricing", () => moduloDePrecoFalso());
    const mod = await import("@/services/brain/sdr-foocci/RespostaDePreco");
    const r = mod.responderPreco();
    const brl = (c: number) =>
      (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    // Metade de um mês na tabela falsa: R$ 100,00 no plano de entrada.
    expect(r.texto).toContain(brl(TABELA_FALSA.STARTER.MENSAL / 2));
    expect(r.descontoPercent).toBe(50);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  4 · A metade estática — o arquivo não pode guardar o número
// ─────────────────────────────────────────────────────────────────────────────

function semComentarios(codigo: string): string {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * Os literais proibidos são DERIVADOS da tabela — se a tabela mudar, a busca muda
 * junto. Uma lista digitada aqui envelheceria pelo mesmo motivo que o bloco
 * inteiro existe para combater.
 */
function literaisProibidos(): string[] {
  const proibidos: string[] = [];
  for (const codigo of ["STARTER", "GROWTH", "PRO"] as const) {
    const cents = PLAN_CYCLE_CENTS[codigo].MENSAL;
    proibidos.push(String(cents));                                   // 17900
    proibidos.push(String(cents).replace(/(\d+)(\d{3})$/, "$1_$2")); // 17_900
    proibidos.push(formatBRL(cents).replace(/^R\$\s*/, ""));         // 179,00
    proibidos.push(String(Math.round(cents / 100)));                 // 179
    const primeiro = firstChargeCents(codigo, "MENSAL");
    proibidos.push(formatBRL(primeiro).replace(/^R\$\s*/, ""));      // 89,50
  }
  return [...new Set(proibidos)];
}

describe("o arquivo do agente não guarda cópia do preço", () => {
  it("nenhum valor da tabela aparece escrito como literal no código", () => {
    const codigo = semComentarios(fs.readFileSync(ARQUIVO_DO_AGENTE, "utf8"));
    const achados = literaisProibidos().filter((lit) => codigo.includes(lit));
    expect(
      achados,
      `Valor da tabela digitado dentro do agente: ${achados.join(", ")}. ` +
        `O preço tem que sair de @/lib/billing/pricing a cada chamada — ` +
        `digitado, ele envelhece calado e ninguém percebe até um cliente cobrar a diferença.`,
    ).toEqual([]);
  });

  it("o agente importa a fonte única, e não uma tabela própria", () => {
    const codigo = fs.readFileSync(ARQUIVO_DO_AGENTE, "utf8");
    expect(codigo).toContain('from "@/lib/billing/pricing"');
  });

  it("o detector de literal REPROVA um arquivo que copiou o preço", () => {
    // A metade que prova que o detector morde. Sem ela, "achados = []" pode
    // significar "não achou" ou "não procurou".
    const falso = `const PRECOS = { essencial: ${PLAN_CYCLE_CENTS.STARTER.MENSAL} };`;
    expect(literaisProibidos().some((lit) => falso.includes(lit))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  5 · O que o SDR continua não podendo fazer
// ─────────────────────────────────────────────────────────────────────────────

describe("o portão barra o que não é fato publicado", () => {
  const reprova = (texto: string) => {
    const a = auditarFalaDePreco(texto);
    expect(a.aprovado, `deveria reprovar: "${texto}"`).toBe(false);
    return a;
  };

  it("desconto que não existe na tabela", () => {
    expect(reprova("Consigo um desconto de 30% pra você.").faltas.length).toBeGreaterThan(0);
    reprova("Fecho por R$ 350,00 no Crescimento.");
    reprova("Abro uma exceção e faço por menos.");
    reprova("Tenho uma condição especial esse mês.");
    reprova("Te mando um cupom de primeira compra.");
  });

  it("valor em reais que não está na tabela", () => {
    const a = reprova("O Essencial sai por R$ 149,00 por mês.");
    expect(a.faltas.some((f) => f.trecho.includes("149"))).toBe(true);
  });

  it("prazo de implantação", () => {
    reprova("Em 3 dias você já está vendendo.");
    reprova("Fica pronto em 48 horas.");
    reprova("A gente instala em 2 dias.");
    reprova("Está no ar em 5 dias úteis.");
  });

  it("promessa de resultado ou de número", () => {
    reprova("Garanto que você vende mais.");
    reprova("Isso aumenta suas vendas em 40%.");
    reprova("Você vai faturar o dobro.");
  });

  it("fala vazia reprova — esquecer de compor nunca é 'aprovado'", () => {
    expect(auditarFalaDePreco("").aprovado).toBe(false);
    expect(auditarFalaDePreco("   ").aprovado).toBe(false);
  });

  it("toda reprovação carrega o trecho que a causou", () => {
    for (const f of reprova("Faço por R$ 99,00 e fica pronto em 2 dias.").faltas) {
      expect(f.motivo.length).toBeGreaterThan(0);
      expect(f.trecho.length).toBeGreaterThan(0);
    }
  });

  /* ── E a metade que prova que o portão NÃO reprova o legítimo ───────────── */

  it("APROVA o preço de tabela dito com todas as letras", () => {
    const mensal = formatBRL(PLAN_CYCLE_CENTS.GROWTH.MENSAL);
    const primeiro = formatBRL(firstChargeCents("GROWTH", "MENSAL"));
    const a = auditarFalaDePreco(
      `O Crescimento é ${mensal} por mês. No primeiro mês fica ${primeiro}.`,
    );
    expect(a.faltas, JSON.stringify(a.faltas)).toEqual([]);
  });

  it("APROVA o desconto publicado do primeiro mês", () => {
    const a = auditarFalaDePreco(
      `São ${descontoDoPrimeiroMesPercent()}% de desconto no primeiro mês, em qualquer plano.`,
    );
    expect(a.faltas, JSON.stringify(a.faltas)).toEqual([]);
  });

  it("APROVA o valor do ciclo anual, que tem separador de milhar", () => {
    // O regex de dinheiro do SnapshotCoherenceVerifier lê "R$ 4.290,00" como
    // R$ 4,29 e acusaria este valor legítimo. O daqui não.
    const anual = formatBRL(PLAN_CYCLE_CENTS.GROWTH.ANUAL);
    expect(anual).toContain(".");
    const a = auditarFalaDePreco(`No anual são ${anual} de uma vez.`);
    expect(a.faltas, JSON.stringify(a.faltas)).toEqual([]);
  });

  it("APROVA convidar o humano, que é o caminho certo do que ele não decide", () => {
    const a = auditarFalaDePreco(
      "Sobre prazo de implantação eu prefiro te passar para alguém do time responder direito.",
    );
    expect(a.faltas, JSON.stringify(a.faltas)).toEqual([]);
  });
});
