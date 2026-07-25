import { describe, it, expect } from "vitest";

import { assinar, semear, totalDeCombinacoes, variar, type Eixo } from "./Variator";
import { criticar } from "./PromptCritic";
import { manualRestaurante, normalizar, registerManual, resolveManual, violacoes } from "./HouseManual";
import { forjar, montarFicha, renderizar } from "./OficinaService";
import type { Ficha, ForjarInput } from "./OficinaService";
import type { Pedido } from "./OficinaTypes";

const EIXOS: Eixo[] = [
  { nome: "angulo", opcoes: ["45°", "de cima"] },
  { nome: "luz",    opcoes: ["manhã", "fim de tarde"] },
];

const pedido: Pedido = { agentId: "social", medium: "texto", intencao: "post de dia dos pais", dominio: "restaurante" };

function fichaBoa(over: Partial<Ficha> = {}): Ficha {
  return {
    objetivo:   "levar o cliente a pedir o combo de domingo",
    publico:    "quem já pediu nos últimos 60 dias",
    tom:        "direto e caloroso, sem gíria",
    formato:    "WhatsApp, 1 linha",
    verdade:    { restaurante: "Boteco do Zé", prato: "picanha de quinta" },
    proibicoes: [...manualRestaurante.proibicoesPadrao],
    eixos:      { abertura: "fato concreto" },
    assinatura: "abertura:fato concreto",
    ...over,
  };
}

// ── Variador ────────────────────────────────────────────────────────────────

describe("Variator", () => {
  it("é determinístico: mesma semente, mesma combinação", () => {
    expect(variar(EIXOS, [], 7)).toEqual(variar(EIXOS, [], 7));
  });

  it("não repete uma combinação já usada", () => {
    const primeira = variar(EIXOS, [], 0);
    const segunda  = variar(EIXOS, [primeira.assinatura], 0);
    expect(segunda.assinatura).not.toBe(primeira.assinatura);
    expect(segunda.esgotado).toBe(false);
  });

  it("percorre todas as combinações antes de repetir qualquer uma", () => {
    const total = totalDeCombinacoes(EIXOS);
    const usadas: string[] = [];
    for (let i = 0; i < total; i++) {
      const v = variar(EIXOS, usadas, 0);
      expect(usadas).not.toContain(v.assinatura);
      usadas.push(v.assinatura);
    }
    expect(new Set(usadas).size).toBe(total);
  });

  it("avisa quando o repertório esgotou em vez de repetir escondido", () => {
    const todas = [
      "angulo:45°|luz:manhã", "angulo:de cima|luz:manhã",
      "angulo:45°|luz:fim de tarde", "angulo:de cima|luz:fim de tarde",
    ];
    const v = variar(EIXOS, todas, 0);
    expect(v.esgotado).toBe(true);
    expect(v.assinatura).not.toBe("");
  });

  it("semente negativa ou gigante não quebra o odômetro", () => {
    expect(variar(EIXOS, [], -99).esgotado).toBe(false);
    expect(variar(EIXOS, [], 10_000_000).esgotado).toBe(false);
  });

  it("assinatura é estável independente da ordem das chaves", () => {
    expect(assinar({ b: "2", a: "1" })).toBe(assinar({ a: "1", b: "2" }));
  });

  it("semeia diferente para restaurantes diferentes", () => {
    expect(semear("r1", "social", "natal")).not.toBe(semear("r2", "social", "natal"));
  });

  it("sem eixos, devolve vazio e esgotado — não finge que variou", () => {
    expect(variar([], [], 0)).toEqual({ eixos: {}, assinatura: "", esgotado: true });
  });
});

// ── Manual da casa ──────────────────────────────────────────────────────────

describe("HouseManual", () => {
  it("pega clichê com acento e caixa diferentes", () => {
    expect(normalizar("Hiper-Realista")).toBe(normalizar("hiper realista"));
    expect(violacoes("foto HIPER-REALISTA do prato", manualRestaurante)).toContain("hiper-realista");
    expect(violacoes("tábua de madeira rústica", manualRestaurante)).toHaveLength(1);
  });

  it("texto limpo não acusa violação", () => {
    expect(violacoes("foto do prato no balcão do salão", manualRestaurante)).toEqual([]);
  });

  it("domínio sem manual devolve null — não inventa um vazio", () => {
    expect(resolveManual("dominio-que-nao-existe")).toBeNull();
  });

  it("um domínio novo entra com um registerManual, sem tocar no core", () => {
    registerManual({
      dominio: "agencia", listaNegra: ["solução inovadora"], verdadeExigida: ["cliente"],
      proibicoesPadrao: ["prometer resultado garantido"], eixosPorMedium: {},
    });
    expect(resolveManual("agencia")?.dominio).toBe("agencia");
  });
});

// ── Crítico do comando ──────────────────────────────────────────────────────

describe("PromptCritic", () => {
  it("aprova ficha completa com verdade", () => {
    const nota = criticar(fichaBoa(), manualRestaurante);
    expect(nota.aprovado).toBe(true);
    expect(nota.motivos).toEqual([]);
  });

  it("reprova ficha SEM verdade — é o pecado capital", () => {
    const nota = criticar(fichaBoa({ verdade: {} }), manualRestaurante);
    expect(nota.aprovado).toBe(false);
    expect(nota.motivos.join(" ")).toMatch(/fatos do banco/i);
  });

  it("reprova quando falta o fato obrigatório do domínio", () => {
    const nota = criticar(fichaBoa({ verdade: { prato: "picanha" } }), manualRestaurante);
    expect(nota.aprovado).toBe(false);
    expect(nota.motivos.join(" ")).toMatch(/restaurante/);
  });

  it("reprova clichê da lista negra", () => {
    const nota = criticar(fichaBoa({ tom: "imperdível e hiper-realista" }), manualRestaurante);
    expect(nota.aprovado).toBe(false);
    expect(nota.motivos.join(" ")).toMatch(/lista negra/i);
  });

  it("cobra os campos vagos, um motivo por campo", () => {
    const nota = criticar(fichaBoa({ publico: "", tom: "  " }), manualRestaurante);
    expect(nota.aprovado).toBe(false);
    expect(nota.motivos.some((m) => /pra quem/i.test(m))).toBe(true);
    expect(nota.motivos.some((m) => /tom/i.test(m))).toBe(true);
  });

  it("cobra as proibições padrão que sumiram da ficha", () => {
    const nota = criticar(fichaBoa({ proibicoes: [] }), manualRestaurante);
    expect(nota.motivos.join(" ")).toMatch(/proibições padrão/i);
  });

  it("sem manual, REPROVA por construção — nunca passa por não existir", () => {
    const nota = criticar(fichaBoa(), null);
    expect(nota.aprovado).toBe(false);
    expect(nota.score).toBe(0);
  });

  it("os motivos são ordens de reescrita, não relatório", () => {
    const nota = criticar(fichaBoa({ verdade: {}, publico: "" }), manualRestaurante);
    // toda ordem começa com verbo no imperativo
    expect(nota.motivos.every((m) => /^[A-ZÀ-Ú]\w+e?\b/.test(m))).toBe(true);
  });
});

// ── O fluxo ─────────────────────────────────────────────────────────────────

describe("OficinaService", () => {
  const base: ForjarInput = {
    pedido,
    verdade: { restaurante: "Boteco do Zé", prato: "picanha de quinta" },
    rascunho: {
      publico: "quem já pediu nos últimos 60 dias",
      tom:     "direto e caloroso, sem gíria",
      formato: "WhatsApp, 1 linha",
    },
  };

  it("monta a ficha com eixo sorteado e proibições do domínio", () => {
    const { ficha } = montarFicha(base, manualRestaurante);
    expect(Object.keys(ficha.eixos).length).toBeGreaterThan(0);
    expect(ficha.proibicoes).toEqual(expect.arrayContaining(manualRestaurante.proibicoesPadrao));
    expect(ficha.assinatura).not.toBe("");
  });

  it("forja e aprova de primeira quando o pedido vem completo", async () => {
    const r = await forjar(base);
    expect(r.nota.aprovado).toBe(true);
    expect(r.voltas).toBe(0);
  });

  it("sem reescritor, reprova e NÃO entrega em silêncio (modo sombra)", async () => {
    const r = await forjar({ ...base, verdade: {} });
    expect(r.nota.aprovado).toBe(false);
    expect(r.voltas).toBe(0);
    expect(r.nota.motivos.length).toBeGreaterThan(0);
  });

  it("com reescritor, conserta e aprova na volta seguinte", async () => {
    const r = await forjar({
      ...base,
      rascunho: { ...base.rascunho, publico: "" },
      reescrever: async (ficha) => ({ ...ficha, publico: "quem já pediu nos últimos 60 dias" }),
    });
    expect(r.nota.aprovado).toBe(true);
    expect(r.voltas).toBe(1);
  });

  it("respeita o teto de voltas quando o reescritor não resolve", async () => {
    const r = await forjar({
      ...base, verdade: {}, maxVoltas: 2,
      reescrever: async (ficha) => ficha,   // reescritor teimoso
    });
    expect(r.voltas).toBe(2);
    expect(r.nota.aprovado).toBe(false);
  });

  it("o reescritor não pode furar o anti-mesmice trocando os eixos", async () => {
    const original = montarFicha(base, manualRestaurante).ficha;
    const r = await forjar({
      ...base,
      rascunho: { ...base.rascunho, tom: "" },
      reescrever: async (ficha) => ({
        ...ficha, tom: "direto e caloroso", eixos: { abertura: "EIXO PIRATA" },
      }),
    });
    expect(r.ficha.eixos).toEqual(original.eixos);
    expect(r.ficha.assinatura).toBe(original.assinatura);
  });

  it("domínio sem manual não forja nada", async () => {
    const r = await forjar({ ...base, pedido: { ...pedido, dominio: "inexistente" } });
    expect(r.nota.aprovado).toBe(false);
    expect(r.esgotado).toBe(true);
  });

  it("o prompt renderizado é rótulo e valor — sem prosa", () => {
    const { ficha } = montarFicha(base, manualRestaurante);
    const texto = renderizar(ficha);
    expect(texto).toMatch(/^OBJETIVO: /m);
    expect(texto).toMatch(/VERDADE \(fatos do banco/);
    expect(texto).toMatch(/- restaurante: Boteco do Zé/);
    expect(texto).toMatch(/NÃO FAÇA:/);
  });

  it("duas peças seguidas do mesmo pedido saem com abordagens diferentes", async () => {
    const primeira = await forjar(base);
    const segunda  = await forjar({ ...base, usadas: [primeira.ficha.assinatura] });
    expect(segunda.ficha.assinatura).not.toBe(primeira.ficha.assinatura);
  });
});
