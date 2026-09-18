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
} from "./leadFormularioTemplates";
import { corpoComExemplos, modeloPodeSair } from "./estagio2Templates";
import { avaliarPelaRubrica } from "@/services/salaDeVendas/supervisora/rubrica";

const LIBERADOS = [
  { nome: "foocci_contato_inicial_01", idioma: "pt_BR", variaveis: 1, corpo: "Olá! Tudo bem? Este contato é do {{1}}, certo?", nomesParametros: [] as string[] },
  { nome: "foocci_contato_inicial_02", idioma: "pt_BR", variaveis: 1, corpo: "Olá! Tudo bem? Falo com o {{1}} por aqui?", nomesParametros: [] as string[] },
  { nome: "foocci_contato_inicial_03", idioma: "pt_BR", variaveis: 0, corpo: "Olá! Tudo bem?", nomesParametros: [] as string[] },
  { nome: "foocci_lead_formulario_01", idioma: "pt_BR", variaveis: 3, corpo: LEAD_FORMULARIO_TEMPLATES[0]!.body, nomesParametros: [] as string[] },
  { nome: "foocci_lead_formulario_02", idioma: "pt_BR", variaveis: 2, corpo: LEAD_FORMULARIO_TEMPLATES[1]!.body, nomesParametros: [] as string[] },
];

beforeAll(() => {
  process.env.FOOCCI_SALES_PHONE_NUMBER_ID = "numero-de-teste";
});

const db = { $queryRaw: async () => LIBERADOS } as never;
const SORTEIOS = 500;
const passos = Array.from({ length: SORTEIOS }, (_, i) => i / SORTEIOS);

describe("⛔ a trava: o texto frio e o texto morno não se cruzam", () => {
  it("lead de campanha NUNCA recebe um contato_inicial — nos dois casos de dado", async () => {
    for (const podeCitarORestaurante of [true, false]) {
      for (const r of passos) {
        const e = await escolherModeloDoLeadDeFormulario(db, { podeCitarORestaurante }, () => r);
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

  it("sem o nome do restaurante, só o modelo sem restaurante sai", async () => {
    const e = await escolherModeloDoLeadDeFormulario(db, { podeCitarORestaurante: false }, () => 0.9);
    expect(e.ok && e.modelo.nome).toBe("foocci_lead_formulario_02");
  });

  it("⛔ fail-closed: sem modelo de formulário liberado, NÃO cai para o frio", async () => {
    const soFrios = { $queryRaw: async () => LIBERADOS.slice(0, 3) } as never;
    const e = await escolherModeloDoLeadDeFormulario(soFrios, { podeCitarORestaurante: true });
    expect(e.ok).toBe(false);
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
  it("sai VERDE na rubrica da Supervisora", () => {
    for (const m of LEAD_FORMULARIO_TEMPLATES) {
      const parecer = avaliarPelaRubrica(corpoComExemplos(m));
      expect(parecer.veredito, `${m.name}: ${parecer.detalhe}`).toBe("VERDE");
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

  it("a variante sem restaurante sai para o lead que só tem nome — o do Lead Ads", () => {
    const soNomeEAgente = { "SiteLead.nome": "Marcos", "AgenteEscolhido.nome": "Ana" };
    expect(modeloPodeSair(LEAD_FORMULARIO_TEMPLATES[0]!, soNomeEAgente)).toBe(false);
    expect(modeloPodeSair(LEAD_FORMULARIO_TEMPLATES[1]!, soNomeEAgente)).toBe(true);
  });

  it("MARKETING, e a escolha está justificada por escrito", () => {
    expect(CATEGORIA_DO_LEAD_DE_FORMULARIO).toBe("MARKETING");
    for (const m of LEAD_FORMULARIO_TEMPLATES) {
      expect(m.category).toBe("MARKETING");
      expect(m.porQueACategoria.length, m.name).toBeGreaterThan(10);
    }
  });
});
