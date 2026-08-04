/**
 * Provas do executor — o lado que age, fora do Brain.
 *
 *  (b) o agente só escolhe chave da ALLOWLIST: chave inventada não vira proposta;
 *  (d) em SOMBRA nada é executado DE VERDADE — e o teste não é vazio, porque o
 *      mesmo runner É chamado quando a escada está aberta;
 *      a etapa que ESCREVE (confirm) não tem runner em nenhum degrau.
 */

import { describe, it, expect, vi } from "vitest";
import { proposeSupportAction } from "./SupportActionExecutor";
import {
  SUPPORT_ACTION_CATALOG,
  currentActionMode,
  listProposableActions,
} from "./SupportActionCatalog";

const evidence = { coherence: "PASS", confidence: 0.9 };
const base = { restaurantId: "r1", conversationId: "t1", evidence, recorder: vi.fn() };

describe("(d) em SOMBRA nada é executado", () => {
  it("a escada nasce e permanece em SHADOW_ONLY", () => {
    expect(currentActionMode()).toBe("SHADOW_ONLY");
    expect(SUPPORT_ACTION_CATALOG.every((a) => !a.enabled)).toBe(true);
  });

  it("propõe subir o cardápio, mas NÃO chama o preparador", async () => {
    const runner = vi.fn().mockResolvedValue({ rows: [] });

    const p = await proposeSupportAction({
      ...base,
      actionKey: "menu_import_preview",
      runners: { menu_import_preview: runner },
    });

    expect(runner).not.toHaveBeenCalled();
    expect(p?.executed).toBe(false);
    expect(p?.mode).toBe("SHADOW_ONLY");
    expect(p?.reason).toContain("SOMBRA");
  });

  it("subir o degrau NÃO basta: sem a ação ligada, o preparador continua parado", async () => {
    const runner = vi.fn().mockResolvedValue({ rows: [] });
    // São DUAS chaves independentes (degrau da escada + ação habilitada). Que o
    // caminho de execução existe de verdade está provado em
    // SupportActionLadder.test.ts — sem essa prova, este teste seria vazio.
    const p = await proposeSupportAction({
      ...base,
      actionKey: "menu_import_preview",
      mode: "ALLOWLIST",
      runners: { menu_import_preview: runner },
    });

    expect(runner).not.toHaveBeenCalled();
    expect(p?.executed).toBe(false);
    expect(p?.reason).toContain("não está habilitada");
  });

  it("a proposta sempre diz em voz alta o que o HUMANO vai apertar", async () => {
    const p = await proposeSupportAction({ ...base, actionKey: "menu_import_preview" });

    expect(p?.cta.href).toBe("/menu/upload");
    expect(p?.cta.label).toBe("Confirmar importação");
    expect(p?.humanConfirms).toContain("só o lojista dispara");
    expect(p?.offer).not.toMatch(/\b(subi|importei|criei|publiquei)\b/i);
  });

  it("registra a evidência da proposta (sem ela, 'estava pronto' é achismo)", async () => {
    const recorder = vi.fn();
    await proposeSupportAction({ ...base, recorder, actionKey: "menu_import_preview" });

    expect(recorder).toHaveBeenCalledTimes(1);
    const rec = recorder.mock.calls[0]![0];
    expect(rec.agentId).toBe("suporte-tecnico");
    expect(rec.intent).toBe("ACAO_PROPOSTA:menu_import_preview");
    expect(rec.reasoningMode).toBe("ACTION_PROPOSAL"); // não polui a taxa LLM do free-form
    expect(rec.wouldReply).toContain("PROPÔS");
  });

  it("evidência que falha não derruba o atendimento", async () => {
    const recorder = vi.fn().mockRejectedValue(new Error("banco fora"));
    const p = await proposeSupportAction({ ...base, recorder, actionKey: "menu_import_preview" });
    expect(p?.key).toBe("menu_import_preview");
  });
});

describe("(b) só chave da allowlist — nunca comando livre", () => {
  it.each([
    "rm -rf /",
    "DELETE FROM MenuItem",
    "menu_import_confirm",
    "menu_import_preview ",
    "MENU_IMPORT_PREVIEW",
    "",
  ])("chave %j não vira proposta", async (key) => {
    const p = await proposeSupportAction({ ...base, actionKey: key });
    expect(p).toBeNull();
  });

  it("a etapa que ESCREVE não existe como ação proponível — em nenhum degrau", () => {
    const keys = SUPPORT_ACTION_CATALOG.map((a) => a.key);
    expect(keys).not.toContain("menu_import_confirm");
    for (const a of SUPPORT_ACTION_CATALOG) {
      expect(a.prepareStep.mutates).toBe(false);
      expect(a.humanConfirmStep.endpoint).toContain("/confirm");
    }
  });

  it("o Brain recebe só chave/rótulo/descrição — nunca o endpoint", () => {
    const exposed = listProposableActions();
    expect(exposed).toHaveLength(SUPPORT_ACTION_CATALOG.length);
    expect(JSON.stringify(exposed)).not.toContain("/api/");
  });
});
