/**
 * ⭐ A TRAVA QUE IMPORTA: lead de campanha NUNCA recebe texto frio, e número
 * frio NUNCA recebe o texto morno.
 *
 * Não é teste de string: é sorteio repetido sobre um pool que contém os DOIS
 * jogos de texto liberados ao mesmo tempo — a situação em que a troca poderia
 * vazar de um lado para o outro.
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  escolherModeloDoPrimeiroContato,
  escolherModeloDoLeadDeFormulario,
  ehPrimeiroContatoFrio,
  ehLeadDeFormulario,
  MODELOS_DO_PRIMEIRO_CONTATO,
  FONTES_DO_LEAD_DE_FORMULARIO,
  FONTES_DO_NUMERO_FRIO,
} from "@/services/foocci-sdr/modelosDoPrimeiroContato";
import {
  LEAD_FORMULARIO_TEMPLATES,
  MODELOS_DO_LEAD_DE_FORMULARIO,
  CATEGORIA_DO_LEAD_DE_FORMULARIO,
  MODELO_DE_FORMULARIO_QUE_PERGUNTA_O_RESTAURANTE,
} from "./leadFormularioTemplates";
import { corpoComExemplos, modeloPodeSair } from "./estagio2Templates";
import { avaliarPelaRubrica } from "@/services/salaDeVendas/supervisora/rubrica";

const LIBERADOS = [
  { nome: "foocci_contato_inicial_01", idioma: "pt_BR", variaveis: 1, corpo: "Olá! Tudo bem? Este contato é do {{1}}, certo?", nomesParametros: [] as string[] },
  { nome: "foocci_contato_inicial_02", idioma: "pt_BR", variaveis: 1, corpo: "Olá! Tudo bem? Falo com o {{1}} por aqui?", nomesParametros: [] as string[] },
  { nome: "foocci_contato_inicial_03", idioma: "pt_BR", variaveis: 0, corpo: "Olá! Tudo bem?", nomesParametros: [] as string[] },
  ...LEAD_FORMULARIO_TEMPLATES.map((m) => ({ nome: m.name, idioma: "pt_BR", variaveis: 1, corpo: m.body, nomesParametros: [] as string[] })),
];

beforeAll(() => {
  process.env.FOOCCI_SALES_PHONE_NUMBER_ID = "numero-de-teste";
});

const db = { $queryRaw: async () => LIBERADOS } as never;
const SORTEIOS = 500;
const passos = Array.from({ length: SORTEIOS }, (_, i) => i / SORTEIOS);

describe("⛔ a trava: o texto frio e o texto morno não se cruzam", () => {
  it("lead de campanha NUNCA recebe um contato_inicial — nos dois casos de dado", async () => {
    for (const jaSabeORestaurante of [true, false]) {
      for (const r of passos) {
        const e = await escolherModeloDoLeadDeFormulario(db, { jaSabeORestaurante }, () => r);
        expect(e.ok).toBe(true);
        const nome = e.ok ? e.modelo.nome : "";
        expect(MODELOS_DO_LEAD_DE_FORMULARIO).toContain(nome);
        expect(MODELOS_DO_PRIMEIRO_CONTATO as readonly string[]).not.toContain(nome);
      }
    }
  });

  it("número frio NUNCA recebe um lead_formulario", async () => {
    for (const podePreencherAVariavel of [true, false]) {
      for (const r of passos) {
        const e = await escolherModeloDoPrimeiroContato(db, { podePreencherAVariavel }, () => r);
        expect(e.ok).toBe(true);
        const nome = e.ok ? e.modelo.nome : "";
        expect(MODELOS_DO_PRIMEIRO_CONTATO as readonly string[]).toContain(nome);
        expect(MODELOS_DO_LEAD_DE_FORMULARIO).not.toContain(nome);
      }
    }
  });

  it("sem o nome do restaurante, sai o modelo que PERGUNTA o nome do restaurante", async () => {
    for (const r of passos) {
      const e = await escolherModeloDoLeadDeFormulario(db, { jaSabeORestaurante: false }, () => r);
      expect(e.ok && e.modelo.nome).toBe(MODELO_DE_FORMULARIO_QUE_PERGUNTA_O_RESTAURANTE);
    }
  });

  it("com o nome do restaurante, o que pergunta o nome NUNCA sai", async () => {
    for (const r of passos) {
      const e = await escolherModeloDoLeadDeFormulario(db, { jaSabeORestaurante: true }, () => r);
      expect(e.ok && e.modelo.nome).not.toBe(MODELO_DE_FORMULARIO_QUE_PERGUNTA_O_RESTAURANTE);
    }
  });

  it("⛔ sem modelo de formulário, só aceita a reserva neutra — nunca os textos frios que presumem estranho", async () => {
    const soFrios = { $queryRaw: async () => LIBERADOS.slice(0, 3) } as never;
    const e = await escolherModeloDoLeadDeFormulario(soFrios, { jaSabeORestaurante: true });
    expect(e.ok).toBe(true);
    expect(e.ok && e.modelo.nome).toBe("foocci_contato_inicial_03");
    expect(e.ok && e.motivo).toBe("reservaNeutra");
  });
});

describe("as fontes", () => {
  it("formulário/campanha é morno, e nenhuma delas é fria", () => {
    for (const f of FONTES_DO_LEAD_DE_FORMULARIO) {
      expect(ehLeadDeFormulario(f), f).toBe(true);
      expect(ehPrimeiroContatoFrio(f), f).toBe(false);
    }
    for (const f of FONTES_DO_NUMERO_FRIO) {
      expect(ehPrimeiroContatoFrio(f), f).toBe(true);
      expect(ehLeadDeFormulario(f), f).toBe(false);
    }
  });

  it("INDICACAO e origem desconhecida não entram em nenhuma das duas", () => {
    for (const f of ["INDICACAO", "", null, undefined, "SEI_LA"]) {
      expect(ehLeadDeFormulario(f), String(f)).toBe(false);
      expect(ehPrimeiroContatoFrio(f), String(f)).toBe(false);
    }
  });
});

describe("o texto", () => {
  /**
   * ⚠️ O VEREDITO É REGISTRO, NÃO PORTÃO — e de propósito.
   *
   * Os três textos são do CEO, aprovados por ele palavra por palavra. A rubrica
   * é a régua da FALA LIVRE da Supervisora; ela não bloqueia template aprovado.
   * O que este teste garante é que nenhum deles tem defeito GRAVE (panfleto,
   * lista de benefícios, urgência inventada, promessa) — esses seriam caso de
   * voltar ao CEO. O achado LEVE fica ANOTADO aqui, com o nome, para a decisão
   * continuar sendo dele e não morrer num log.
   */
  it("nenhum defeito GRAVE ou CRÍTICO — e o que for LEVE fica anotado", () => {
    for (const m of LEAD_FORMULARIO_TEMPLATES) {
      const parecer = avaliarPelaRubrica(corpoComExemplos(m));
      console.info(`[rubrica] ${m.name}: ${parecer.veredito} — ${parecer.detalhe}`);
      for (const a of parecer.achados) {
        expect(a.severidade, `${m.name}: ${a.codigo} — ${a.explicacao}`).toBe("LEVE");
      }
    }
  });

  it("não carrega preço, número nem promessa", () => {
    for (const m of LEAD_FORMULARIO_TEMPLATES) {
      const semVariaveis = m.body.replace(/\{\{\d+\}\}/g, "");
      expect(semVariaveis, m.name).not.toMatch(/\d/);
      expect(semVariaveis.toLowerCase(), m.name).not.toMatch(/r\$|garant|resultado/);
    }
  });

  it("as variáveis são sequenciais desde 1 e todas têm fonte real", () => {
    for (const m of LEAD_FORMULARIO_TEMPLATES) {
      const posicoes = m.variaveis.map((v) => v.posicao).sort((a, b) => a - b);
      expect(posicoes, m.name).toEqual(posicoes.map((_, i) => i + 1));
      const usadas = [...m.body.matchAll(/\{\{(\d+)\}\}/g)].map((x) => Number(x[1]));
      expect([...new Set(usadas)].sort((a, b) => a - b), m.name).toEqual(posicoes);
      for (const v of m.variaveis) expect(v.exemplo.trim().length, `${m.name} {{${v.posicao}}}`).toBeGreaterThan(0);
    }
  });

  it("⛔ nenhum usa o nome do restaurante — só {{1}}, o nome da pessoa, que o Lead Ads garante", () => {
    const soONomeDaPessoa = { "SiteLead.nome": "Marcos" };
    for (const m of LEAD_FORMULARIO_TEMPLATES) {
      expect(m.variaveis.map((v) => v.fonte), m.name).toEqual(["SiteLead.nome"]);
      expect(modeloPodeSair(m, soONomeDaPessoa), m.name).toBe(true);
    }
  });

  it("MARKETING, e a escolha está justificada por escrito", () => {
    expect(CATEGORIA_DO_LEAD_DE_FORMULARIO).toBe("MARKETING");
    for (const m of LEAD_FORMULARIO_TEMPLATES) {
      expect(m.category).toBe("MARKETING");
      expect(m.porQueACategoria.length, m.name).toBeGreaterThan(10);
    }
  });
});
