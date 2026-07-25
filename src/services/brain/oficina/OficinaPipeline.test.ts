import { describe, it, expect, beforeEach, vi } from "vitest";

import { criticarResultado } from "./OutputCritic";
import { manualRestaurante } from "./HouseManual";
import { snapshotParaVerdade, buscarVerdade } from "./TruthSource";
import { rodarEsteira } from "./OficinaPipeline";
import { runOficinaDiagnostic } from "./OficinaDiagnostic";
import {
  chaveDeMemoria,
  getAssinaturaMemory,
  resetAssinaturaMemory,
  setAssinaturaMemory,
} from "./AssinaturaMemory";
import { registerKnowledgeAdapter } from "../knowledge/KnowledgeAdapterRegistry";
import type { Ficha, Pedido } from "./OficinaTypes";

const pedido: Pedido = { agentId: "crm", medium: "texto", intencao: "recuperar quem sumiu", dominio: "restaurante" };

function ficha(over: Partial<Ficha> = {}): Ficha {
  return {
    objetivo:   "trazer de volta quem parou de pedir",
    publico:    "quem pediu 3+ vezes e sumiu há 45 dias",
    tom:        "direto e caloroso, sem gíria",
    formato:    "WhatsApp, 1 linha",
    verdade:    { products: "picanha de quinta", restaurante: "Boteco do Zé", preco: "R$ 79,90" },
    proibicoes: [...manualRestaurante.proibicoesPadrao],
    eixos:      { abertura: "fato concreto" },
    assinatura: "abertura:fato concreto",
    ...over,
  };
}

beforeEach(() => resetAssinaturaMemory());

// ── Juiz do resultado ───────────────────────────────────────────────────────

describe("OutputCritic", () => {
  it("aprova peça ancorada num fato da verdade", () => {
    const nota = criticarResultado("A picanha de quinta do Boteco do Zé saiu agora. Guardo uma?", ficha(), manualRestaurante);
    expect(nota.aprovado).toBe(true);
  });

  it("barra preço inventado — o erro mais caro de todos", () => {
    const nota = criticarResultado("Picanha do Boteco do Zé por R$ 49,90 hoje!", ficha(), manualRestaurante);
    expect(nota.aprovado).toBe(false);
    expect(nota.motivos.join(" ")).toMatch(/49/);
  });

  it("aceita o preço que ESTÁ na verdade", () => {
    const nota = criticarResultado("Picanha do Boteco do Zé por R$ 79,90.", ficha(), manualRestaurante);
    expect(nota.aprovado).toBe(true);
  });

  it("barra peça genérica que não citou nada da verdade", () => {
    const nota = criticarResultado("Sentimos sua falta! Volte a pedir com a gente.", ficha(), manualRestaurante);
    expect(nota.aprovado).toBe(false);
    expect(nota.graves).toBeGreaterThan(0);
  });

  it("barra clichê da lista negra", () => {
    const nota = criticarResultado("Picanha do Boteco do Zé — imperdível!", ficha(), manualRestaurante);
    expect(nota.aprovado).toBe(false);
  });

  it("não confunde número do próprio briefing com invenção", () => {
    const nota = criticarResultado(
      "Boteco do Zé: sua picanha de quinta está pronta.",
      ficha({ formato: "story 9:16, 1 linha", eixos: { formato: "9:16" } }),
      manualRestaurante,
    );
    expect(nota.aprovado).toBe(true);
  });

  it("cobra o tamanho combinado, mas sem reprovar sozinho", () => {
    const nota = criticarResultado("Boteco do Zé\npicanha de quinta\nsaindo agora", ficha(), manualRestaurante);
    expect(nota.motivos.join(" ")).toMatch(/linha/i);
    expect(nota.graves).toBe(0);
  });

  it("saída vazia reprova", () => {
    expect(criticarResultado("   ", ficha(), manualRestaurante).aprovado).toBe(false);
  });

  it("sem manual, reprova por construção", () => {
    expect(criticarResultado("qualquer coisa", ficha(), null).aprovado).toBe(false);
  });
});

// ── Verdade ─────────────────────────────────────────────────────────────────

describe("TruthSource", () => {
  it("achata o snapshot em fatos legíveis", () => {
    const v = snapshotParaVerdade({
      products: [{ nome: "Picanha" }, { nome: "Burger" }],
      hours: { seg: "18h-23h", ter: "18h-23h" },
    });
    expect(v.products).toBe("Picanha, Burger");
    expect(String(v.hours)).toContain("seg: 18h-23h");
  });

  it("cliente e pedido viram CONTAGEM — PII nunca entra na ficha", () => {
    const v = snapshotParaVerdade({
      customers: [{ nome: "João Silva" }, { nome: "Maria" }],
      orders: [{ id: 1 }],
      conversations: [{ texto: "meu telefone é 9999" }],
    });
    expect(v.customers_total).toBe(2);
    expect(v.orders_total).toBe(1);
    expect(JSON.stringify(v)).not.toMatch(/João|Maria|9999/);
  });

  it("corta a lista longa e diz quantos sobraram", () => {
    const muitos = Array.from({ length: 12 }, (_, i) => ({ nome: `Item ${i}` }));
    expect(String(snapshotParaVerdade({ products: muitos }).products)).toMatch(/\+4 outros/);
  });

  it("negócio sem base registrada devolve verdade vazia, não inventada", async () => {
    const r = await buscarVerdade("TIPO_INEXISTENTE", "x1");
    expect(r.verdade).toEqual({});
    expect(r.faltando[0]).toMatch(/Nenhuma base de conhecimento/);
  });

  it("adapter que explode não derruba a esteira", async () => {
    registerKnowledgeAdapter({
      businessType: "TIPO_QUE_QUEBRA",
      getSnapshot: async () => { throw new Error("db down"); },
    });
    const r = await buscarVerdade("TIPO_QUE_QUEBRA", "x1");
    expect(r.verdade).toEqual({});
    expect(r.faltando[0]).toMatch(/Falha ao ler a verdade/);
  });
});

// ── Memória de assinaturas ──────────────────────────────────────────────────

describe("AssinaturaMemory", () => {
  it("guarda e devolve da mais nova pra mais velha", async () => {
    const m = getAssinaturaMemory();
    await m.registrar("k", "a");
    await m.registrar("k", "b");
    expect(await m.recentes("k", 10)).toEqual(["b", "a"]);
  });

  it("não duplica a mesma assinatura", async () => {
    const m = getAssinaturaMemory();
    await m.registrar("k", "a");
    await m.registrar("k", "a");
    expect(await m.recentes("k", 10)).toEqual(["a"]);
  });

  it("separa por negócio, agente e assunto", () => {
    expect(chaveDeMemoria("r1", "crm", "natal")).not.toBe(chaveDeMemoria("r2", "crm", "natal"));
    expect(chaveDeMemoria("r1", "crm", "natal")).not.toBe(chaveDeMemoria("r1", "social", "natal"));
  });

  it("aceita uma porta persistente sem mexer em caller", async () => {
    const falsa = { recentes: vi.fn(async () => ["x"]), registrar: vi.fn(async () => {}) };
    setAssinaturaMemory(falsa);
    expect(await getAssinaturaMemory().recentes("k", 1)).toEqual(["x"]);
    expect(falsa.recentes).toHaveBeenCalled();
  });
});

// ── A esteira ───────────────────────────────────────────────────────────────

describe("OficinaPipeline", () => {
  const BASE = {
    pedido,
    businessType: "TIPO_TESTE",
    businessId: "rest-1",
    rascunho: {
      publico: "quem pediu 3+ vezes e sumiu há 45 dias",
      tom:     "direto e caloroso, sem gíria",
      formato: "WhatsApp, 1 linha",
    },
  };

  beforeEach(() => {
    registerKnowledgeAdapter({
      businessType: "TIPO_TESTE",
      getSnapshot: async () => ({
        businessId: "rest-1",
        businessType: "TIPO_TESTE",
        truthSources: { products: [{ nome: "picanha de quinta" }] },
        missingContext: [],
        safetyNotes: [],
        completenessScore: 0.8,
      }),
    });
  });

  it("busca a verdade sozinha e forja o comando", async () => {
    const r = await rodarEsteira(BASE);
    expect(r.ficha.verdade.products).toBe("picanha de quinta");
    expect(r.notaComando.aprovado).toBe(true);
    expect(r.comando).toMatch(/VERDADE \(fatos do banco/);
  });

  it("modo sombra NUNCA libera, mesmo aprovando tudo", async () => {
    const r = await rodarEsteira({ ...BASE, produzir: async () => "picanha de quinta saindo agora, guardo uma?" });
    expect(r.notaResultado?.aprovado).toBe(true);
    expect(r.liberado).toBe(false);
    expect(r.motivoFinal).toMatch(/sombra/i);
  });

  it("em produção libera quando os dois juízes aprovam", async () => {
    const r = await rodarEsteira({
      ...BASE, modo: "producao",
      produzir: async () => "picanha de quinta saindo agora, guardo uma?",
    });
    expect(r.liberado).toBe(true);
  });

  it("resultado reprovado não libera nem em produção", async () => {
    const r = await rodarEsteira({
      ...BASE, modo: "producao",
      produzir: async () => "Sentimos sua falta! Volte sempre.",
    });
    expect(r.liberado).toBe(false);
    expect(r.motivoFinal).toMatch(/Resultado reprovado/);
  });

  it("comando reprovado nem chega a gastar o produtor", async () => {
    const produzir = vi.fn(async () => "não deveria rodar");
    const r = await rodarEsteira({
      ...BASE, businessType: "TIPO_SEM_BASE", produzir,
    });
    expect(produzir).not.toHaveBeenCalled();
    expect(r.motivoFinal).toMatch(/Comando reprovado/);
  });

  it("produtor que explode vira motivo claro, não exceção", async () => {
    const r = await rodarEsteira({ ...BASE, produzir: async () => { throw new Error("IA fora do ar"); } });
    expect(r.liberado).toBe(false);
    expect(r.motivoFinal).toMatch(/Produção falhou: IA fora do ar/);
  });

  it("duas execuções seguidas não repetem a abordagem", async () => {
    const produzir = async () => "picanha de quinta saindo agora";
    const a = await rodarEsteira({ ...BASE, produzir });
    const b = await rodarEsteira({ ...BASE, produzir });
    expect(b.ficha.assinatura).not.toBe(a.ficha.assinatura);
  });

  it("execução que morreu no meio NÃO queima a combinação", async () => {
    const a = await rodarEsteira({ ...BASE, produzir: async () => { throw new Error("caiu"); } });
    const b = await rodarEsteira({ ...BASE, produzir: async () => "picanha de quinta agora" });
    expect(b.ficha.assinatura).toBe(a.ficha.assinatura);
  });

  it("o reescritor não consegue inventar verdade pra passar no crítico", async () => {
    const r = await rodarEsteira({
      ...BASE,
      rascunho: { ...BASE.rascunho, tom: "" },
      reescrever: async (f) => ({
        ...f,
        tom: "direto e caloroso",
        verdade: { ...f.verdade, preco: "R$ 9,90 INVENTADO" },
      }),
    });
    expect(JSON.stringify(r.ficha.verdade)).not.toMatch(/INVENTADO/);
    expect(r.ficha.verdade.products).toBe("picanha de quinta");
  });

  it("repassa o que o negócio ainda não configurou", async () => {
    registerKnowledgeAdapter({
      businessType: "TIPO_INCOMPLETO",
      getSnapshot: async () => ({
        businessId: "r", businessType: "TIPO_INCOMPLETO",
        truthSources: { products: [{ nome: "x" }] },
        missingContext: ["horário de funcionamento"], safetyNotes: [], completenessScore: 0.3,
      }),
    });
    const r = await rodarEsteira({ ...BASE, businessType: "TIPO_INCOMPLETO" });
    expect(r.faltando).toContain("horário de funcionamento");
    expect(r.completude).toBe(0.3);
  });
});

// ── O piso de segurança ─────────────────────────────────────────────────────

describe("OficinaDiagnostic", () => {
  it("passa com P0 = 0", () => {
    const diag = runOficinaDiagnostic();
    const falhas = diag.checks.filter((c) => !c.passou).map((c) => `${c.nome} (${c.detalhe})`);
    expect(falhas).toEqual([]);
    expect(diag.p0).toBe(0);
    expect(diag.status).toBe("PASS");
  });

  it("cobre as travas inegociáveis como P0", () => {
    const p0s = runOficinaDiagnostic().checks.filter((c) => c.p0).map((c) => c.nome);
    expect(p0s).toEqual(expect.arrayContaining([
      "ficha sem verdade é reprovada",
      "preço que não está na verdade é barrado",
      "peça genérica é barrada",
      "variador não repete antes de esgotar",
    ]));
  });
});
