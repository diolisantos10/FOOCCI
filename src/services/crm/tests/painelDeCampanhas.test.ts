/**
 * O PAINEL COMPLETO — nenhuma campanha do catálogo pode ficar invisível.
 *
 * Medido em 24/09/2026 na tela de um restaurante: o catálogo tinha 16 campanhas
 * e o painel mostrava 11. "Cliente frio" e "Cliente morno" não apareciam em
 * lugar nenhum, porque o painel listava só campanhas já instanciadas no banco.
 *
 * Estes testes reprovam as duas versões erradas deste código:
 *   - a que deixa uma campanha do catálogo sumir da tela;
 *   - a que pinta a campanha de frio como ativa, ou a soma às ativas.
 */

import { describe, it, expect } from "vitest";
import { READY_MADE_CAMPAIGNS } from "@/services/crm/readyMadeCampaigns";
import {
  montarPainelDeCampanhas,
  contarAtivas,
  disponiveisNaoAtivadas,
  motivoDePausaDeliberada,
  temPausaDeliberada,
  catalogoComoEstadosDesligados,
  ROTULO_DO_ESTADO,
} from "@/services/crm/painelDeCampanhas";

describe("toda campanha do catálogo aparece no painel", () => {
  it("painel vazio (restaurante novo) já mostra as 16 do catálogo", () => {
    const painel = montarPainelDeCampanhas([]);
    expect(painel).toHaveLength(READY_MADE_CAMPAIGNS.length);
    expect(painel).toHaveLength(16);
  });

  it("nenhum id do catálogo falta — nem com instâncias parciais", () => {
    const parcial = [
      { id: "aniversariantes",    active: true,  campaignId: "c1", status: "ACTIVE" },
      { id: "pedido-avaliacao",   active: true,  campaignId: "c2", status: "ACTIVE" },
      { id: "carrinho-abandonado", active: true, campaignId: null, status: null },
    ];
    const ids = montarPainelDeCampanhas(parcial).map((l) => l.id);
    for (const rm of READY_MADE_CAMPAIGNS) {
      expect(ids, `campanha ${rm.id} sumiu da tela`).toContain(rm.id);
    }
  });

  it("'Cliente frio' e 'Cliente morno' aparecem mesmo sem nunca terem sido ligadas", () => {
    const painel = montarPainelDeCampanhas([]);
    const frio  = painel.find((l) => l.id === "recuperar-frios");
    const morno = painel.find((l) => l.id === "reativar-mornos");
    expect(frio).toBeDefined();
    expect(morno).toBeDefined();
    expect(frio!.nome).toBe("Cliente frio");
    expect(morno!.nome).toBe("Cliente morno");
  });

  it("a campanha nunca ligada é dita DISPONÍVEL, com o estado escrito na tela", () => {
    const painel = montarPainelDeCampanhas([]);
    const frio = painel.find((l) => l.id === "recuperar-frios")!;
    expect(frio.estado).toBe("DISPONIVEL");
    expect(frio.rotulo).toBe(ROTULO_DO_ESTADO.DISPONIVEL);
    expect(frio.rotulo).toMatch(/não ativada/i);
  });

  it("o painel preserva a ordem do catálogo", () => {
    expect(montarPainelDeCampanhas([]).map((l) => l.id))
      .toEqual(READY_MADE_CAMPAIGNS.map((c) => c.id));
  });
});

describe("mostrar não é ligar — disponível nunca vira ativa", () => {
  it("campanha disponível não é pintada como ativa", () => {
    for (const l of montarPainelDeCampanhas([])) {
      expect(l.estado, `${l.id} apareceu como ativa sem ter sido ligada`).not.toBe("ATIVA");
      expect(l.contaComoAtiva).toBe(false);
    }
  });

  it("a contagem de ativas conta só o que está rodando — disponíveis não somam", () => {
    const painel = montarPainelDeCampanhas([
      { id: "aniversariantes",  active: true,  campaignId: "c1", status: "ACTIVE" },
      { id: "pedido-avaliacao", active: true,  campaignId: "c2", status: "ACTIVE" },
      { id: "recuperar-frios",  active: false, campaignId: "c3", status: "PAUSED" },
    ]);
    expect(painel).toHaveLength(16);
    expect(contarAtivas(painel)).toBe(2);           // ⛔ nunca 3, nunca 16
    expect(disponiveisNaoAtivadas(painel)).toHaveLength(13);
    // Mostrar as 16 não pode inflar o número de cima.
    expect(contarAtivas(painel)).toBeLessThan(painel.length);
  });

  it("campanha de frio instanciada e PAUSADA aparece pausada, e não conta como ativa", () => {
    const painel = montarPainelDeCampanhas([
      { id: "recuperar-frios", active: false, campaignId: "c9", status: "PAUSED" },
    ]);
    const frio = painel.find((l) => l.id === "recuperar-frios")!;
    expect(frio.estado).toBe("PAUSADA");
    expect(frio.contaComoAtiva).toBe(false);
    expect(contarAtivas(painel)).toBe(0);
  });

  it("frio só é ATIVA quando o dono já ligou de fato", () => {
    const painel = montarPainelDeCampanhas([
      { id: "recuperar-frios", active: true, campaignId: "c9", status: "ACTIVE" },
    ]);
    const frio = painel.find((l) => l.id === "recuperar-frios")!;
    expect(frio.estado).toBe("ATIVA");
    expect(contarAtivas(painel)).toBe(1);
  });
});

describe("a trava do frio é dita na tela, não só no código", () => {
  it("a campanha de frio carrega o motivo da pausa enquanto não está ativa", () => {
    for (const inst of [[], [{ id: "recuperar-frios", active: false, campaignId: "c1", status: "PAUSED" }]]) {
      const frio = montarPainelDeCampanhas(inst).find((l) => l.id === "recuperar-frios")!;
      expect(frio.motivoDaPausa, "a tela não explica por que o frio está pausado").toBeTruthy();
      expect(frio.motivoDaPausa!.length).toBeGreaterThan(40);
    }
  });

  it("o motivo existe como doutrina consultável", () => {
    expect(temPausaDeliberada("recuperar-frios")).toBe(true);
    expect(motivoDePausaDeliberada("recuperar-frios")).toMatch(/pausada de propósito/i);
    expect(motivoDePausaDeliberada("aniversariantes")).toBeNull();
  });

  it("montar o painel não liga nada: nenhuma linha sai ativa de um painel vazio", () => {
    expect(contarAtivas(montarPainelDeCampanhas([]))).toBe(0);
  });
});

describe("o catálogo não some quando a consulta falha", () => {
  it("a rede de segurança entrega as 16 campanhas sem tocar no banco", () => {
    const estados = catalogoComoEstadosDesligados();
    expect(estados).toHaveLength(READY_MADE_CAMPAIGNS.length);
    expect(estados.map((e) => e.id)).toEqual(READY_MADE_CAMPAIGNS.map((c) => c.id));
    expect(estados.find((e) => e.id === "recuperar-frios")).toBeDefined();
  });

  it("sem prova do banco, NADA aparece ligado — nem o carrinho, nem o frio", () => {
    for (const e of catalogoComoEstadosDesligados()) {
      expect(e.active, `${e.id} apareceu ligada sem prova`).toBe(false);
      expect(e.campaignId).toBeNull();
    }
  });

  it("o painel montado a partir dela não conta nenhuma ativa", () => {
    const painel = montarPainelDeCampanhas(catalogoComoEstadosDesligados());
    expect(painel).toHaveLength(16);
    expect(contarAtivas(painel)).toBe(0);
    expect(disponiveisNaoAtivadas(painel)).toHaveLength(16);
  });
});
