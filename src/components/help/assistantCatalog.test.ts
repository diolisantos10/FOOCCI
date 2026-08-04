/**
 * O catálogo do Assistente decide o que o lojista vê em CADA tela. A regra é
 * "primeiro prefixo que casa vence" — e ela é frágil por natureza: basta alguém
 * mover `/menu` para cima de `/menu-enhancement` para a tela de Fotos passar a
 * oferecer as dúvidas de Cardápio, em silêncio, sem erro nenhum.
 *
 * Estes testes travam a ordem e o contrato das ações rápidas.
 */

import { describe, it, expect } from "vitest";
import {
  BAR_QUICK_ACTION_IDS,
  CONTEXT_GUIDES,
  QUICK_ACTIONS,
  guideForPath,
} from "./assistantCatalog";

describe("guideForPath — a tela em que o lojista está", () => {
  it("prefixo mais específico vence o mais genérico", () => {
    expect(guideForPath("/menu-enhancement")?.label).toBe("Fotos do Cardápio");
    expect(guideForPath("/menu")?.label).toBe("Cardápio");
    expect(guideForPath("/settings/impressoras")?.label).toBe("Impressoras");
    expect(guideForPath("/settings")?.label).toBe("Configurações");
    expect(guideForPath("/settings/qualquer-coisa-nova")?.label).toBe("Configurações");
  });

  it("subrota herda o guia da tela mãe", () => {
    expect(guideForPath("/orders/abc123")?.label).toBe("Pedidos");
  });

  it("rota desconhecida não inventa guia (ausência não é informação)", () => {
    expect(guideForPath("/rota-que-nao-existe")).toBeNull();
    expect(guideForPath(null)).toBeNull();
  });

  it("todo guia específico aparece ANTES do seu prefixo genérico", () => {
    for (let i = 0; i < CONTEXT_GUIDES.length; i++) {
      for (let j = i + 1; j < CONTEXT_GUIDES.length; j++) {
        const anterior = CONTEXT_GUIDES[i]!.prefix;
        const posterior = CONTEXT_GUIDES[j]!.prefix;
        // Um prefixo posterior nunca pode ser mais específico que um anterior,
        // senão ele é inalcançável.
        expect(posterior.startsWith(anterior)).toBe(false);
      }
    }
  });
});

describe("ações rápidas", () => {
  it("os atalhos da barra existem mesmo no catálogo", () => {
    for (const id of BAR_QUICK_ACTION_IDS) {
      expect(QUICK_ACTIONS.some((a) => a.id === id)).toBe(true);
    }
  });

  it("toda ação leva a algum lugar — nenhuma é botão morto", () => {
    for (const a of QUICK_ACTIONS) {
      if (a.kind === "ask") expect(a.question.length).toBeGreaterThan(5);
      else if (a.kind === "mode") expect(["diagnostico", "avisos"]).toContain(a.mode);
    }
  });

  it("ids são únicos", () => {
    const ids = QUICK_ACTIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
