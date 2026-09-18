/**
 * ⭐ O PANFLETO SAI DO PRIMEIRO CONTATO — antes e depois, com números.
 *
 * O pool do primeiro contato é montado com SEIS modelos liberados: os três
 * aprovados do estágio 1 e três outros, entre eles o panfleto. O teste mostra o
 * ANTES (sorteio sobre os seis, o panfleto sai) e o DEPOIS (sorteio fechado nos
 * três, o panfleto nunca sai) — mil sorteios cada, e não uma amostra de sorte.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { escolherAleatorio } from "./modelosLiberados";
import {
  escolherModeloDoPrimeiroContato,
  ehPrimeiroContatoFrio,
  MODELOS_DO_PRIMEIRO_CONTATO,
  MODELO_SEM_VARIAVEL,
} from "./modelosDoPrimeiroContato";

const PANFLETO = {
  nome: "foocci_apresentacao_completa",
  idioma: "pt_BR",
  variaveis: 1,
  corpo:
    "Olá {{1}}! 👋\n🏆 Da descoberta à fidelização\n🔄 CRM que transforma clientes em fãs fiéis\n" +
    "💰 Mais margem, mais controle\n📱 Venda mais sem depender de aplicativo\n" +
    "✅ Cardápio próprio\n✅ Zero comissão\n✅ Seus clientes na sua mão\nPosso te mostrar como funciona?",
  nomesParametros: [] as string[],
};

const LIBERADOS = [
  { nome: "foocci_contato_inicial_01", idioma: "pt_BR", variaveis: 1, corpo: "Olá! Tudo bem? Este contato é do {{1}}, certo?", nomesParametros: [] as string[] },
  { nome: "foocci_contato_inicial_02", idioma: "pt_BR", variaveis: 1, corpo: "Olá! Tudo bem? Falo com o {{1}} por aqui?", nomesParametros: [] as string[] },
  { nome: "foocci_contato_inicial_03", idioma: "pt_BR", variaveis: 0, corpo: "Olá! Tudo bem?", nomesParametros: [] as string[] },
  PANFLETO,
  { nome: "foocci_proposta_comercial", idioma: "pt_BR", variaveis: 2, corpo: "Oi {{1}}, sobre a proposta do {{2}}…", nomesParametros: [] as string[] },
  { nome: "foocci_retorno_demo", idioma: "pt_BR", variaveis: 1, corpo: "Oi {{1}}, conseguiu ver a demonstração?", nomesParametros: [] as string[] },
];

// O leitor de modelos exige o número comercial no ambiente; sem ele devolve
// vazio e o teste mediria o caminho de dry-run em vez do pool real.
beforeAll(() => {
  process.env.FOOCCI_SALES_PHONE_NUMBER_ID = "numero-de-teste";
});

/** O banco falso devolve os seis liberados — o pool de ANTES, inteiro. */
const db = {
  $queryRaw: async () => LIBERADOS,
} as never;

const SORTEIOS = 1000;
const passos = Array.from({ length: SORTEIOS }, (_, i) => i / SORTEIOS);

describe("ANTES: o sorteio corria sobre TODOS os modelos liberados", () => {
  it("o panfleto saía — e saía em quase um sexto dos disparos", () => {
    const saidas = passos.map((r) => escolherAleatorio(LIBERADOS, () => r)?.nome);
    const quantosPanfleto = saidas.filter((n) => n === PANFLETO.nome).length;
    console.info(`[antes] panfleto sorteado em ${quantosPanfleto}/${SORTEIOS} disparos`);
    expect(quantosPanfleto).toBeGreaterThan(0);
  });
});

describe("DEPOIS: o primeiro contato só sorteia os três aprovados", () => {
  it("o panfleto NUNCA sai — mil sorteios, zero ocorrências", async () => {
    const saidas: string[] = [];
    for (const r of passos) {
      const e = await escolherModeloDoPrimeiroContato(db, { podePreencherAVariavel: true }, () => r);
      expect(e.ok).toBe(true);
      if (e.ok) saidas.push(e.modelo.nome);
    }
    const quantosPanfleto = saidas.filter((n) => n === PANFLETO.nome).length;
    const distintos = [...new Set(saidas)].sort();
    console.info(`[depois] panfleto sorteado em ${quantosPanfleto}/${SORTEIOS} | modelos que saíram: ${distintos.join(", ")}`);
    expect(quantosPanfleto).toBe(0);
    for (const nome of distintos) {
      expect(MODELOS_DO_PRIMEIRO_CONTATO as readonly string[]).toContain(nome);
    }
  });

  it("COM dado para a variável → os que usam {{1}} (_01 e _02)", async () => {
    const saidas: string[] = [];
    for (const r of passos) {
      const e = await escolherModeloDoPrimeiroContato(db, { podePreencherAVariavel: true }, () => r);
      if (e.ok) saidas.push(e.modelo.nome);
    }
    expect([...new Set(saidas)].sort()).toEqual([
      "foocci_contato_inicial_01",
      "foocci_contato_inicial_02",
    ]);
  });

  it("SEM dado para a variável → o único sem variável (_03), sempre", async () => {
    for (const r of [0, 0.3, 0.7, 0.99]) {
      const e = await escolherModeloDoPrimeiroContato(db, { podePreencherAVariavel: false }, () => r);
      expect(e.ok).toBe(true);
      if (e.ok) {
        expect(e.modelo.nome).toBe(MODELO_SEM_VARIAVEL);
        expect(e.modelo.variaveis).toBe(0);
      }
    }
  });

  it("⛔ FAIL-CLOSED: sem nenhum dos três liberados, NÃO cai para outro modelo", async () => {
    const soOutros = { $queryRaw: async () => [PANFLETO] } as never;
    const e = await escolherModeloDoPrimeiroContato(soOutros, { podePreencherAVariavel: true });
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.motivo).toBe("nenhumModeloDoPrimeiroContatoLiberado");
  });

  it("⛔ sem dado para a variável e sem o _03 liberado: recusa, e não inventa o nome", async () => {
    const semOSemVariavel = {
      $queryRaw: async () => LIBERADOS.filter((m) => m.nome !== MODELO_SEM_VARIAVEL),
    } as never;
    const e = await escolherModeloDoPrimeiroContato(semOSemVariavel, { podePreencherAVariavel: false });
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.motivo).toBe("semDadoParaAVariavel");
  });
});

describe("os dois estágios são caminhos distintos — e a origem é quem separa (D-0E1)", () => {
  it("só o número que NÓS fomos buscar recebe o texto do ESTÁGIO 1", () => {
    for (const fonte of ["LISTA_PROSPECCAO", "IMPORTACAO"]) {
      expect(ehPrimeiroContatoFrio(fonte), fonte).toBe(true);
    }
  });

  it("⛔ quem deixou o próprio contato NÃO recebe o texto frio", () => {
    // Ordem do CEO, 18/09/2026: formulário, campanha, Instagram e Facebook já
    // são LEADS — eles levantaram a mão. Mandar "este contato é do {{1}}, certo?"
    // a essa pessoa é tratar como estranho quem pediu para ser chamado.
    for (const fonte of [
      "FORMULARIO_DEMONSTRACAO",
      "AGENDAMENTO",
      "WHATSAPP_DIRETO",
      "INSTAGRAM",
      "FACEBOOK",
      "CAMPANHA_PAGA",
      "MANUAL",
      "OUTRO",
    ]) {
      expect(ehPrimeiroContatoFrio(fonte), fonte).toBe(false);
    }
  });

  it("conversa aberta com o decisor capturado (INDICACAO) → ESTÁGIO 2", () => {
    expect(ehPrimeiroContatoFrio("INDICACAO")).toBe(false);
  });

  it("⛔ origem desconhecida não é frio: a lista é de INCLUSÃO", () => {
    for (const fonte of [null, undefined, "", "   ", "FONTE_QUE_NAO_EXISTE"]) {
      expect(ehPrimeiroContatoFrio(fonte), String(fonte)).toBe(false);
    }
  });
});
