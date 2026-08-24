/**
 * O turno da entrevista chega ao diário — e só depois de ter sido gravado.
 *
 * Reprova contra o código antigo: `conduzirTurno` não anotava nada em lugar
 * nenhum, e a única prova de que a IA falhou morria no `catch`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const motor = vi.hoisted(() => ({ callStructuredJson: vi.fn() }));
vi.mock("../../engines/OpenAIEngineAdapter", () => motor);
vi.mock("../../engines/AIEngineRouter", () => ({
  selectEngine: () => ({ provider: "OPENAI", model: "gpt-4o-mini" }),
}));

import { conduzirTurno } from "../SdrService";
import { lerDiario, limparDiario, impressaoDaConversa } from "../DiarioDoSdr";
import { chaveDaEntrevista, resetMemoriaDaEntrevista } from "../MemoriaDaEntrevista";

beforeEach(() => {
  vi.clearAllMocks();
  limparDiario();
  resetMemoriaDaEntrevista();
});

it("a falha da IA vira uma linha do diário, com o motivo", async () => {
  motor.callStructuredJson.mockRejectedValue(new Error("Request timed out"));

  await conduzirTurno({
    agenciaId: "foocci-vendas",
    clienteId: "lead-a7k2m",
    perguntadasAgora: ["objetivo"],
    resposta: "quero encher a casa na terça",
  });

  const d = await lerDiario();
  expect(d.contagens.turnos).toBe(1);
  expect(d.contagens.porMotivo.timeout).toBe(1);
  expect(d.contagens.camposPeloMotor).toBe(1);
  expect(d.turnos[0]!.conversa).toBe(impressaoDaConversa(chaveDaEntrevista("foocci-vendas", "lead-a7k2m")));
});

it("o turno com IA aparece como turno com IA", async () => {
  motor.callStructuredJson.mockResolvedValue(
    JSON.stringify({ respostas: { publico: "familia do bairro" }, servicos: [], semResposta: [] }),
  );
  await conduzirTurno({
    agenciaId: "foocci-vendas", clienteId: "lead-b2", perguntadasAgora: ["publico"], resposta: "familia do bairro",
  });
  const d = await lerDiario();
  expect(d.contagens.turnosComIA).toBe(1);
  expect(d.contagens.camposPelaIA).toBe(1);
});

it("se a gravação da entrevista falhar, o turno NÃO entra no diário", async () => {
  const { setMemoriaDaEntrevista } = await import("../MemoriaDaEntrevista");
  setMemoriaDaEntrevista({
    ler: async () => null,
    gravar: async () => { throw new Error("banco fora do ar"); },
    apagar: async () => {},
  });
  motor.callStructuredJson.mockResolvedValue(JSON.stringify({ respostas: {}, servicos: [], semResposta: [] }));

  await expect(
    conduzirTurno({ agenciaId: "a", clienteId: "c", perguntadasAgora: ["publico"], resposta: "oi" }),
  ).rejects.toThrow();
  expect((await lerDiario()).contagens.turnos).toBe(0);
});
