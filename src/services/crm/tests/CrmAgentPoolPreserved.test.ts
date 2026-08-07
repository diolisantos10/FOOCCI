/**
 * Portão do balde do AGENTE dentro do pool de frases.
 *
 * O defeito que este arquivo trava: o painel do lojista só conhece `selected` e
 * `custom`, e manda o pool INTEIRO a cada clique (`CRMClient.tsx` → savePool). A
 * gravação substituía o objeto, então ligar/desligar UMA frase apagava em
 * silêncio o balde `agent` — o repertório que o agente criou e mandou aprovar na
 * Meta. Sem repertório, o bandit não tem entre o que escolher e o agente em WIDE
 * não entrega nada.
 *
 * As duas metades:
 *  • METADE 1 (prova) — patch do lojista sem a chave `agent` PRESERVA o balde.
 *  • METADE 2 (sabotagem) — patch que traz `agent` EXPLICITAMENTE manda nele
 *    (é o caminho do próprio agente), e preservar não é rodar: frase de agente
 *    continua estacionada sem `includeAgent`.
 */

import { describe, it, expect, vi } from "vitest";

// Catálogo vazio p/ isolar os baldes custom/agent.
vi.mock("@/services/crm/readyMadeCampaigns", () => ({ getReadyMadeMessageVariants: () => [] }));

import {
  mergeMessagePoolPatch,
  parseMessagePool,
  resolveActivePhrases,
} from "@/services/crm/crmMessagePool";

const configComAgente = {
  mode: "RECURRING",
  messagePool: {
    selected: ["k-catalogo-1"],
    custom: [{ id: "o1", text: "Frase do lojista", on: true }],
    agent:  [
      { id: "a1", text: "Frase do agente 1", on: true },
      { id: "a2", text: "Frase do agente 2", on: true },
    ],
  },
};

describe("mergeMessagePoolPatch — o clique do lojista não apaga o repertório do agente", () => {
  // ── METADE 1 — a prova ──────────────────────────────────────────────────────

  it("patch do painel (só selected+custom) PRESERVA as frases do agente", () => {
    // Exatamente o corpo que CRMClient.savePool envia.
    const patch = {
      selected: ["k-catalogo-1", "k-catalogo-2"],
      custom:   [{ id: "o1", text: "Frase do lojista", on: false }],
    };
    const merged = mergeMessagePoolPatch(configComAgente, patch)!;

    expect(merged.agent).toHaveLength(2);
    expect(merged.agent?.map((a) => a.text)).toEqual(["Frase do agente 1", "Frase do agente 2"]);
    // E o que o lojista mandou vale.
    expect(merged.selected).toEqual(["k-catalogo-1", "k-catalogo-2"]);
    expect(merged.custom?.[0]?.on).toBe(false);
  });

  it("lojista esvaziando os DOIS baldes dele não zera o pool — o do agente sobrevive", () => {
    const merged = mergeMessagePoolPatch(configComAgente, { selected: [], custom: [] });

    expect(merged).not.toBeNull();
    expect(merged!.agent).toHaveLength(2);
    expect(merged!.selected ?? []).toHaveLength(0);
    expect(merged!.custom ?? []).toHaveLength(0);
  });

  it("o resultado sobrevive à ida e volta pelo JSON do banco (undefined some, agent não)", () => {
    const merged = mergeMessagePoolPatch(configComAgente, { selected: [], custom: [] });
    const gravado = JSON.parse(JSON.stringify({ messagePool: merged }));

    expect(parseMessagePool(gravado)?.agent).toHaveLength(2);
  });

  // ── METADE 2 — a sabotagem: onde o balde PODE mudar, e o que preservar não é ─

  it("patch que traz `agent` EXPLÍCITO manda nele — é o caminho do próprio agente", () => {
    const merged = mergeMessagePoolPatch(configComAgente, {
      selected: [],
      custom:   [],
      agent:    [{ id: "a9", text: "Frase nova do agente", on: true }],
    })!;

    expect(merged.agent).toHaveLength(1);
    expect(merged.agent?.[0]?.text).toBe("Frase nova do agente");
  });

  it("`agent: []` explícito esvazia — o botão de pânico precisa poder limpar", () => {
    const merged = mergeMessagePoolPatch(configComAgente, {
      selected: ["k-catalogo-1"], custom: [], agent: [],
    })!;

    expect(merged.agent ?? []).toHaveLength(0);
    expect(merged.selected).toEqual(["k-catalogo-1"]);
  });

  it("pool vazio dos dois lados continua devolvendo null (limpeza real)", () => {
    expect(mergeMessagePoolPatch({ messagePool: {} }, { selected: [], custom: [] })).toBeNull();
    expect(mergeMessagePoolPatch(null, { selected: [], custom: [] })).toBeNull();
  });

  it("PRESERVAR NÃO É RODAR: sem includeAgent a frase preservada segue estacionada", () => {
    const merged = mergeMessagePoolPatch(configComAgente, { selected: [], custom: [] })!;
    const campanha = { templateId: null, message: "Mensagem base da campanha" };

    const semAgente = resolveActivePhrases(campanha, merged, { includeAgent: false });
    expect(semAgente.map((p) => p.source)).toEqual(["fallback"]);

    const comAgente = resolveActivePhrases(campanha, merged, { includeAgent: true });
    expect(comAgente).toHaveLength(2);
    expect(comAgente.every((p) => p.source === "agent")).toBe(true);
  });
});
