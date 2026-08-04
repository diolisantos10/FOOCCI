/**
 * A prova de que a trava de sombra NÃO é um teste vazio.
 *
 * Em SupportActionExecutor.test.ts afirmamos "em SOMBRA o preparador não é
 * chamado". Isso só significa alguma coisa se existir um caminho em que ELE É
 * CHAMADO. Aqui, com um catálogo simulado (ação ligada) e a escada aberta, o
 * preparador roda — logo, quem está segurando em produção é a escada, não a
 * ausência de código.
 *
 * Nada aqui liga nada em produção: o catálogo real continua `enabled: false` e
 * `currentActionMode()` continua SHADOW_ONLY.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("./SupportActionCatalog", async (importOriginal) => {
  const real = await importOriginal<typeof import("./SupportActionCatalog")>();
  const ligada = { ...real.SUPPORT_ACTION_CATALOG[0]!, enabled: true };
  return {
    ...real,
    SUPPORT_ACTION_CATALOG: [ligada],
    findSupportAction: (k: string | null | undefined) => (k === ligada.key ? ligada : null),
  };
});

import { proposeSupportAction } from "./SupportActionExecutor";

describe("o caminho de execução existe — e é a escada que o segura", () => {
  it("com a escada em ALLOWLIST e a ação ligada, o preparador RODA", async () => {
    const runner = vi.fn().mockResolvedValue({ rows: [] });

    const p = await proposeSupportAction({
      actionKey: "menu_import_preview",
      restaurantId: "r1",
      conversationId: "t1",
      evidence: { coherence: "PASS", confidence: 0.9 },
      mode: "ALLOWLIST",
      runners: { menu_import_preview: runner },
      recorder: vi.fn(),
    });

    expect(runner).toHaveBeenCalledTimes(1);
    expect(p?.executed).toBe(true);
    // Mesmo executando, o passo que ESCREVE continua com o humano.
    expect(p?.humanConfirms).toContain("só o lojista dispara");
  });

  it("mesmo ligada, a MESMA chamada em SOMBRA não executa", async () => {
    const runner = vi.fn().mockResolvedValue({ rows: [] });

    const p = await proposeSupportAction({
      actionKey: "menu_import_preview",
      restaurantId: "r1",
      conversationId: "t1",
      evidence: { coherence: "PASS", confidence: 0.9 },
      mode: "SHADOW_ONLY",
      runners: { menu_import_preview: runner },
      recorder: vi.fn(),
    });

    expect(runner).not.toHaveBeenCalled();
    expect(p?.executed).toBe(false);
  });

  it("preparador que falha vira proposta honesta, não promessa", async () => {
    const runner = vi.fn().mockRejectedValue(new Error("planilha ilegível"));

    const p = await proposeSupportAction({
      actionKey: "menu_import_preview",
      restaurantId: "r1",
      conversationId: "t1",
      evidence: { coherence: "PASS", confidence: 0.9 },
      mode: "ALLOWLIST",
      runners: { menu_import_preview: runner },
      recorder: vi.fn(),
    });

    expect(p?.executed).toBe(false);
    expect(p?.reason).toContain("Falha ao preparar");
  });
});
