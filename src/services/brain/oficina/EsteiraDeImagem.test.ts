import { describe, it, expect, beforeEach, vi } from "vitest";

import { rodarEsteiraDeImagem, renderizarComandoDeImagem } from "./EsteiraDeImagem";
import { resetAssinaturaMemory } from "./AssinaturaMemory";
import { registerKnowledgeAdapter } from "../knowledge/KnowledgeAdapterRegistry";
import { manualRestaurante } from "./HouseManual";
import type { Ficha } from "./OficinaTypes";

const AGORA = new Date("2026-07-25T12:00:00Z");
const TIPO = "TIPO_IMAGEM";

const autorizacao = {
  por: "Zé (dono)",
  em: "2026-07-24T10:00:00Z",
  escopo: "gerar imagem ilustrativa do Burger do Chef",
};

const BASE = {
  pedido: { agentId: "social", intencao: "post do burger", dominio: "restaurante" },
  businessType: TIPO,
  businessId: "rest-1",
  categoria: "prato" as const,
  escopoPedido: "Burger do Chef",
  rascunho: { publico: "seguidores do Instagram", tom: "apetitoso e honesto" },
  agora: AGORA,
};

beforeEach(() => {
  resetAssinaturaMemory();
  registerKnowledgeAdapter({
    businessType: TIPO,
    getSnapshot: async () => ({
      businessId: "rest-1",
      businessType: TIPO,
      truthSources: { products: [{ nome: "Burger do Chef" }] },
      missingContext: [],
      safetyNotes: [],
      completenessScore: 0.8,
    }),
  });
});

describe("EsteiraDeImagem — a política vem primeiro", () => {
  it("bloqueado NÃO gera, NÃO realça e NÃO gasta nada", async () => {
    const gerar = vi.fn(async () => "url");
    const realcar = vi.fn(async () => "url");
    const r = await rodarEsteiraDeImagem({ ...BASE, gerar, realcar });

    expect(r.decisao.caminho).toBe("bloqueado");
    expect(gerar).not.toHaveBeenCalled();
    expect(realcar).not.toHaveBeenCalled();
    expect(r.ficha).toBeUndefined();
    expect(r.comando).toBeUndefined();
  });

  it("bloqueado devolve a saída pro lojista dentro do motivo", async () => {
    const r = await rodarEsteiraDeImagem(BASE);
    expect(r.motivoFinal).toMatch(/envie uma foto do prato/i);
  });

  it("tendo foto, vai pro realce e o gerador nunca é chamado", async () => {
    const gerar = vi.fn(async () => "gerada");
    const r = await rodarEsteiraDeImagem({
      ...BASE, midiaUrl: "https://foocci/midia/burger.jpg",
      realcar: async () => "realcada", gerar,
    });

    expect(r.decisao.caminho).toBe("realce");
    expect(r.resultado).toBe("realcada");
    expect(gerar).not.toHaveBeenCalled();
  });

  it("foto vazia ou só espaço não conta como insumo", async () => {
    const r = await rodarEsteiraDeImagem({ ...BASE, midiaUrl: "   " });
    expect(r.decisao.caminho).toBe("bloqueado");
  });

  it("sem foto + autorização do lojista libera a geração", async () => {
    const r = await rodarEsteiraDeImagem({
      ...BASE, autorizacao, gerar: async () => "gerada",
    });
    expect(r.decisao.caminho).toBe("geracao");
    expect(r.resultado).toBe("gerada");
  });

  it("pessoa é bloqueada mesmo com autorização", async () => {
    const gerar = vi.fn(async () => "url");
    const r = await rodarEsteiraDeImagem({
      ...BASE, categoria: "pessoa", escopoPedido: "cliente sorrindo",
      autorizacao: { ...autorizacao, escopo: "cliente sorrindo" }, gerar,
    });
    expect(r.decisao.caminho).toBe("bloqueado");
    expect(gerar).not.toHaveBeenCalled();
  });
});

describe("EsteiraDeImagem — nada de imagem sai sem gente", () => {
  it("imagem GERADA sempre exige aprovação humana", async () => {
    const r = await rodarEsteiraDeImagem({ ...BASE, autorizacao, gerar: async () => "gerada" });
    expect(r.precisaAprovacaoHumana).toBe(true);
    expect(r.motivoFinal).toMatch(/aval de gente/i);
  });

  it("foto REALÇADA também exige aprovação humana", async () => {
    const r = await rodarEsteiraDeImagem({
      ...BASE, midiaUrl: "https://foocci/midia/burger.jpg", realcar: async () => "realcada",
    });
    expect(r.precisaAprovacaoHumana).toBe(true);
  });

  it("imagem gerada de prato carrega o selo de ilustrativa", async () => {
    const r = await rodarEsteiraDeImagem({ ...BASE, autorizacao, gerar: async () => "gerada" });
    expect(r.selo).toBe("Imagem ilustrativa");
  });

  it("grafismo é gerado sem selo — não retrata nada real", async () => {
    const r = await rodarEsteiraDeImagem({
      ...BASE, categoria: "grafismo", escopoPedido: "fundo de dia dos pais",
      gerar: async () => "arte",
    });
    expect(r.decisao.caminho).toBe("geracao");
    expect(r.selo).toBeUndefined();
  });
});

describe("EsteiraDeImagem — falhas e memória", () => {
  it("gerador que explode vira motivo claro, não exceção", async () => {
    const r = await rodarEsteiraDeImagem({
      ...BASE, autorizacao, gerar: async () => { throw new Error("IA fora do ar"); },
    });
    expect(r.motivoFinal).toMatch(/Geração falhou: IA fora do ar/);
    expect(r.precisaAprovacaoHumana).toBe(false);
  });

  it("realçador que explode vira motivo claro", async () => {
    const r = await rodarEsteiraDeImagem({
      ...BASE, midiaUrl: "u", realcar: async () => { throw new Error("provider caiu"); },
    });
    expect(r.motivoFinal).toMatch(/Realce falhou: provider caiu/);
  });

  it("duas gerações seguidas não repetem a mesma câmera", async () => {
    const gerar = async () => "img";
    const a = await rodarEsteiraDeImagem({ ...BASE, autorizacao, gerar });
    const b = await rodarEsteiraDeImagem({ ...BASE, autorizacao, gerar });
    expect(b.ficha?.assinatura).not.toBe(a.ficha?.assinatura);
  });

  it("execução que falhou NÃO queima a combinação de câmera", async () => {
    const a = await rodarEsteiraDeImagem({
      ...BASE, autorizacao, gerar: async () => { throw new Error("caiu"); },
    });
    const b = await rodarEsteiraDeImagem({ ...BASE, autorizacao, gerar: async () => "ok" });
    expect(b.ficha?.assinatura).toBe(a.ficha?.assinatura);
  });

  it("domínio sem manual não forja nada", async () => {
    const gerar = vi.fn(async () => "url");
    const r = await rodarEsteiraDeImagem({
      ...BASE, pedido: { ...BASE.pedido, dominio: "inexistente" }, autorizacao, gerar,
    });
    expect(r.motivoFinal).toMatch(/Sem manual da casa/);
    expect(gerar).not.toHaveBeenCalled();
  });
});

describe("renderizarComandoDeImagem", () => {
  const ficha: Ficha = {
    objetivo: "Burger do Chef no balcão",
    publico: "seguidores",
    tom: "apetitoso e honesto",
    formato: "4:5 feed",
    verdade: { products: "Burger do Chef" },
    proibicoes: [...(manualRestaurante.proibicoesPorMedium?.imagem ?? [])],
    eixos: { angulo: "45°", luz: "janela de manhã", lente: "50 mm" },
    assinatura: "angulo:45°|lente:50 mm|luz:janela de manhã",
  };

  it("usa a gramática de câmera, não o briefing de redação", () => {
    const c = renderizarComandoDeImagem(ficha, false);
    expect(c).toMatch(/^ASSUNTO: /m);
    expect(c).toMatch(/CÂMERA:/);
    expect(c).toMatch(/- luz: janela de manhã/);
    expect(c).toMatch(/- lente: 50 mm/);
  });

  it("ancora na verdade e manda retratar só o que existe", () => {
    expect(renderizarComandoDeImagem(ficha, false)).toMatch(/retrate só isto/i);
  });

  it("pede imperfeição real — é o que tira a cara de IA", () => {
    expect(renderizarComandoDeImagem(ficha, false)).toMatch(/imperfeição natural/i);
  });

  it("leva as proibições da regra de ouro pro comando", () => {
    expect(renderizarComandoDeImagem(ficha, false)).toMatch(/como foto real/);
  });

  it("exigindo selo, o comando diz isso explicitamente", () => {
    expect(renderizarComandoDeImagem(ficha, true)).toMatch(/SELO OBRIGATÓRIO/);
    expect(renderizarComandoDeImagem(ficha, false)).not.toMatch(/SELO OBRIGATÓRIO/);
  });
});
