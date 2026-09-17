/**
 * O MOTOR DE DIAGNÓSTICO — provado contra o cenário LITERAL do documento.
 *
 * O projeto escreve a resposta que espera: as oportunidades caem, e a causa não
 * está nelas — está uma etapa acima, no acesso ao decisor, com o número do
 * gatekeeper ao lado. O teste central deste arquivo monta exatamente esse
 * cenário e exige que o motor aponte o SDR, e não as oportunidades.
 *
 * ── O TESTE QUE IMPORTA MAIS É O SEGUNDO ────────────────────────────────────
 *
 * Achar a causa certa num cenário montado prova que o motor funciona. O que
 * prova que ele é HONESTO é o cenário onde a queda é de volume puro: ali a
 * resposta certa é "entrou menos gente no topo", e um motor que insistisse em
 * culpar a última etapa passaria no primeiro teste e mentiria no dia a dia.
 */

import { describe, it, expect } from "vitest";
import { bancoDeProva } from "./bancoDeProva";
import { janelaAnterior } from "./funilDeReceita";
import { diagnosticar, decompor, evidencia, LIMIAR_DE_QUEDA } from "./diagnostico";

const DE = new Date("2026-09-10T00:00:00Z");
const ATE = new Date("2026-09-17T00:00:00Z");
const P = { de: DE, ate: ATE };
const ANTES = janelaAnterior(P);

const dentro = new Date(DE.getTime() + 2 * 86_400_000);
const antes = new Date(ANTES.de.getTime() + 2 * 86_400_000);

let seq = 0;
function empresa(quando: Date, extra: Record<string, unknown> = {}) {
  seq += 1;
  return {
    id: `e-${seq}`,
    descobertaEm: quando,
    estagio: "QUALIFICADA",
    prioridade: null,
    scoreIcp: 60,
    fonteDaDescoberta: "planilha",
    estagioMudouEm: quando,
    ...extra,
  };
}

function evento(empresaId: string, para: string, quando: Date) {
  seq += 1;
  return {
    id: `ev-${seq}`,
    entidade: "EMPRESA",
    tipo: "MUDANCA_DE_ESTAGIO",
    paraEstagio: para,
    empresaId,
    criadoEm: quando,
  };
}

function decisor(empresaId: string, quando: Date) {
  seq += 1;
  return { id: `c-${seq}`, empresaId, ehDecisor: true, ehGatekeeper: false, criadoEm: quando };
}

function gatekeeper(empresaId: string, tipo: string, quando: Date) {
  seq += 1;
  return {
    id: `g-${seq}`,
    empresaId,
    ehDecisor: false,
    ehGatekeeper: true,
    tipoDeGatekeeper: tipo,
    criadoEm: quando,
  };
}

function oportunidade(quando: Date) {
  seq += 1;
  return { id: `o-${seq}`, criadoEm: quando, estagio: "QUALIFICACAO", fechadaEm: null };
}

/**
 * O cenário do documento.
 *
 * Topo estável nas duas janelas (50 descobertas, 40 prontas para o SDR). O que
 * muda é o MEIO: 20 empresas alcançaram o decisor antes, 6 agora. As
 * oportunidades caem junto, e é por elas que o CEO percebe.
 */
function cenarioDoDocumento() {
  const empresas: Record<string, unknown>[] = [];
  const eventos: Record<string, unknown>[] = [];
  const contatos: Record<string, unknown>[] = [];
  const oportunidades: Record<string, unknown>[] = [];

  for (const [quando, decisores, oports] of [
    [antes, 20, 10],
    [dentro, 6, 3],
  ] as const) {
    const lote = Array.from({ length: 50 }, () => empresa(quando));
    empresas.push(...lote);
    for (const e of lote.slice(0, 40)) eventos.push(evento(e.id, "PRONTA_PARA_SDR", quando));
    for (const e of lote.slice(0, decisores)) contatos.push(decisor(e.id, quando));
    for (let i = 0; i < oports; i += 1) oportunidades.push(oportunidade(quando));
  }

  // 50 gatekeepers no período, 17 deles em canal de pedidos — os 34% do texto.
  for (let i = 0; i < 50; i += 1) {
    contatos.push(
      gatekeeper(
        `e-${i}`,
        i < 17 ? (i % 2 === 0 ? "BOT_DE_PEDIDOS" : "WHATSAPP_GERAL") : "RECEPCIONISTA",
        dentro,
      ),
    );
  }

  // 30 empresas paradas antes do decisor, 12 delas de maior ICP.
  for (let i = 0; i < 30; i += 1) {
    empresas.push(
      empresa(dentro, {
        estagio: i % 3 === 0 ? "GATEKEEPER" : "PRONTA_PARA_SDR",
        prioridade: i < 12 ? "ALTA" : "MEDIA",
      }),
    );
  }

  return bancoDeProva({
    empresa: empresas,
    eventoDaJornada: eventos,
    contato: contatos,
    oportunidade: oportunidades,
  });
}

describe("decomposição da queda", () => {
  it("separa o efeito de volume do efeito de conversão, e os dois somam a queda", () => {
    const n = {
      atual: { PRONTAS_PARA_SDR: 40, DECISORES_ENCONTRADOS: 6 },
      anterior: { PRONTAS_PARA_SDR: 40, DECISORES_ENCONTRADOS: 20 },
    } as never;

    const elo = decompor("PRONTAS_PARA_SDR", "DECISORES_ENCONTRADOS", n)!;
    expect(elo.dominante).toBe("conversao");
    expect(elo.efeitoVolume).toBe(0);
    expect(elo.efeitoConversao).toBeCloseTo(6 - 20, 6);
  });

  it("recusa decompor quando a janela anterior é pequena demais", () => {
    const n = {
      atual: { PRONTAS_PARA_SDR: 3, DECISORES_ENCONTRADOS: 1 },
      anterior: { PRONTAS_PARA_SDR: 2, DECISORES_ENCONTRADOS: 2 },
    } as never;
    expect(decompor("PRONTAS_PARA_SDR", "DECISORES_ENCONTRADOS", n)).toBeNull();
  });
});

describe("evidência: sem número, não afirma", () => {
  it("devolve null quando o número não existe", () => {
    expect(evidencia("dos contatos são porteiros", null, "fracao")).toBeNull();
    expect(evidencia("dos contatos são porteiros", undefined, "fracao")).toBeNull();
    expect(evidencia("dos contatos são porteiros", Number.NaN, "fracao")).toBeNull();
    expect(evidencia("dos contatos são porteiros", Infinity, "fracao")).toBeNull();
  });

  it("monta a evidência quando o número existe", () => {
    expect(evidencia("dos contatos são porteiros", 0.34, "fracao", 50)).toEqual({
      afirmacao: "dos contatos são porteiros",
      numero: 0.34,
      unidade: "fracao",
      base: 50,
    });
  });
});

describe("o cenário do documento", () => {
  it("as oportunidades caem, e a causa apontada é o acesso ao decisor", async () => {
    const d = await diagnosticar(cenarioDoDocumento() as never, P);

    expect(d.medido).toBe(true);
    if (!d.medido) return;

    // A queda aparece nas oportunidades: 10 → 3.
    expect(d.foco).toBe("OPORTUNIDADES");
    expect(d.quedaDe).toBe(10);
    expect(d.quedaPara).toBe(3);

    // Mas a causa NÃO está nelas: está uma passagem acima.
    expect(d.causa).not.toBeNull();
    expect(d.causa!.acima).toBe("PRONTAS_PARA_SDR");
    expect(d.causa!.abaixo).toBe("DECISORES_ENCONTRADOS");
    expect(d.causa!.dominante).toBe("conversao");
    expect(d.causa!.conversao).toBeCloseTo(0.15, 6);
    expect(d.causa!.conversaoAnterior).toBeCloseTo(0.5, 6);
  });

  it("o problema e a ação vêm com os números do gatekeeper e do ICP", async () => {
    const d = await diagnosticar(cenarioDoDocumento() as never, P);
    if (!d.medido) throw new Error("o cenário precisa produzir diagnóstico");

    expect(d.problema).toContain("34%");
    expect(d.problema).toContain("canais de pedidos");
    expect(d.acaoRecomendada).toContain("12 prospects de maior ICP");
  });

  it("toda evidência carrega número — nenhuma frase solta", async () => {
    const d = await diagnosticar(cenarioDoDocumento() as never, P);
    if (!d.medido) throw new Error("o cenário precisa produzir diagnóstico");

    expect(d.evidencias.length).toBeGreaterThan(0);
    for (const e of d.evidencias) {
      expect(typeof e.numero).toBe("number");
      expect(Number.isFinite(e.numero)).toBe(true);
    }

    const fracoes = d.evidencias.filter((e) => e.unidade === "fracao");
    expect(fracoes.some((e) => Math.abs(e.numero - 0.34) < 1e-9)).toBe(true);
  });

  it("perguntar por uma etapa específica não muda a causa encontrada", async () => {
    const d = await diagnosticar(cenarioDoDocumento() as never, { ...P, foco: "OPORTUNIDADES" });
    if (!d.medido) throw new Error("o cenário precisa produzir diagnóstico");
    expect(d.causa!.abaixo).toBe("DECISORES_ENCONTRADOS");
  });
});

describe("quando a causa é volume puro, o motor sobe até o topo", () => {
  it("não culpa a última etapa por uma queda que nasceu na descoberta", async () => {
    const empresas: Record<string, unknown>[] = [];
    const eventos: Record<string, unknown>[] = [];
    const contatos: Record<string, unknown>[] = [];
    const oportunidades: Record<string, unknown>[] = [];

    // Conversões idênticas nas duas janelas (80% / 50% / 50%). Só o topo muda.
    for (const [quando, topo] of [
      [antes, 100],
      [dentro, 40],
    ] as const) {
      const lote = Array.from({ length: topo }, () => empresa(quando));
      empresas.push(...lote);
      const prontas = lote.slice(0, topo * 0.8);
      for (const e of prontas) eventos.push(evento(e.id, "PRONTA_PARA_SDR", quando));
      const comDecisor = prontas.slice(0, prontas.length / 2);
      for (const e of comDecisor) contatos.push(decisor(e.id, quando));
      for (let i = 0; i < comDecisor.length / 2; i += 1) {
        oportunidades.push(oportunidade(quando));
      }
    }

    const db = bancoDeProva({
      empresa: empresas,
      eventoDaJornada: eventos,
      contato: contatos,
      oportunidade: oportunidades,
    });

    const d = await diagnosticar(db as never, P);
    if (!d.medido) throw new Error("o cenário precisa produzir diagnóstico");

    expect(d.causa!.dominante).toBe("volume");
    expect(d.causa!.acima).toBe("EMPRESAS_ENCONTRADAS");
    expect(d.causaProvavel).toContain("Empresas encontradas");
    expect(d.acaoRecomendada).toBeTruthy();
  });
});

describe("as recusas honestas", () => {
  it("banco sem nenhuma fonte ligada não vira 'está tudo bem'", async () => {
    const d = await diagnosticar(bancoDeProva() as never, P);
    expect(d).toMatchObject({ medido: false, motivo: "semBase" });
  });

  it("operação estável não produz diagnóstico inventado", async () => {
    const empresas = [
      ...Array.from({ length: 20 }, () => empresa(antes)),
      ...Array.from({ length: 20 }, () => empresa(dentro)),
    ];
    const d = await diagnosticar(bancoDeProva({ empresa: empresas }) as never, P);
    expect(d).toMatchObject({ medido: false, motivo: "semQueda" });
    if (d.medido) return;
    expect(d.detalhe).toContain(`${Math.round(LIMIAR_DE_QUEDA * 100)}%`);
  });

  it("queda sobre base minúscula não é queda", async () => {
    const empresas = [
      ...Array.from({ length: 3 }, () => empresa(antes)),
      ...Array.from({ length: 1 }, () => empresa(dentro)),
    ];
    const d = await diagnosticar(bancoDeProva({ empresa: empresas }) as never, P);
    expect(d).toMatchObject({ medido: false, motivo: "semQueda" });
  });
});
