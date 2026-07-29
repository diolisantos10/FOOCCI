import { describe, it, expect, vi, beforeEach } from "vitest";

const motor = vi.hoisted(() => ({ callStructuredJson: vi.fn() }));
vi.mock("../engines/OpenAIEngineAdapter", () => motor);
vi.mock("../engines/AIEngineRouter", () => ({
  selectEngine: () => ({ provider: "OPENAI", model: "gpt-4o-mini" }),
}));

import { conduzirTurno, abrirEntrevista, planoDoCliente } from "./SdrService";
import { resetMemoriaDaEntrevista, resolverMemoriaDaEntrevista, chaveDaEntrevista } from "./MemoriaDaEntrevista";
import { runSdrDiagnostic } from "./SdrDiagnostic";
import { CAMPOS_DA_FICHA } from "../oficina/Sondagem";

function iaDiz(respostas: Record<string, string>, servicos: string[] = []) {
  motor.callStructuredJson.mockResolvedValue(JSON.stringify({ respostas, servicos, semResposta: [] }));
}

beforeEach(() => {
  vi.clearAllMocks();
  resetMemoriaDaEntrevista();
  iaDiz({});
});

const AG = "agencia1";
const CLI = "padaria";

// ─────────────────────────────────────────────────────────────────────────────

describe("a entrevista lembra entre turnos", () => {
  it("o turno seguinte enxerga o anterior", async () => {
    iaDiz({ objetivo: "vender mais no almoço" });
    await conduzirTurno({ agenciaId: AG, clienteId: CLI, perguntadasAgora: ["objetivo"], resposta: "vender mais no almoço" });

    iaDiz({});
    const segundo = await conduzirTurno({ agenciaId: AG, clienteId: CLI, resposta: "" });
    expect(segundo.estado.ficha?.objetivo).toBe("vender mais no almoço");
    expect(segundo.perguntar.map((p) => p.chave)).not.toContain("objetivo");
  });

  it("grava sozinho — quem chama não precisa lembrar", async () => {
    await conduzirTurno({ agenciaId: AG, clienteId: CLI, perguntadasAgora: ["publico"], resposta: "gente do bairro" });
    const memoria = await resolverMemoriaDaEntrevista();
    const guardado = await memoria.ler(chaveDaEntrevista(AG, CLI));
    expect(guardado?.perguntadas).toContain("publico");
  });

  it("gravação que falha propaga o erro — nada de 'anotei' mentiroso", async () => {
    const { setMemoriaDaEntrevista } = await import("./MemoriaDaEntrevista");
    setMemoriaDaEntrevista({
      ler: async () => null,
      gravar: async () => { throw new Error("banco fora"); },
      apagar: async () => {},
    });
    await expect(conduzirTurno({ agenciaId: AG, clienteId: CLI, resposta: "oi" })).rejects.toThrow("banco fora");
  });

  it("abrir entrevista nova não inventa estado", async () => {
    const e = await abrirEntrevista(AG, "cliente-novo");
    expect(e.existe).toBe(false);
    expect(e.avaliacao.podePropor).toBe(false);
    expect(e.perguntar.length).toBeGreaterThan(0);
  });

  it("abrir não altera nada", async () => {
    await abrirEntrevista(AG, CLI, 3);
    const memoria = await resolverMemoriaDaEntrevista();
    expect(await memoria.ler(chaveDaEntrevista(AG, CLI))).toBeNull();
  });

  it("uma agência não enxerga a entrevista da outra", async () => {
    iaDiz({ objetivo: "segredo da agência 1" });
    await conduzirTurno({ agenciaId: "ag1", clienteId: CLI, perguntadasAgora: ["objetivo"], resposta: "segredo" });
    const outra = await abrirEntrevista("ag2", CLI);
    expect(outra.existe).toBe(false);
  });
});

describe("o ciclo fecha sozinho", () => {
  it("as chaves devolvidas são as que voltam no próximo turno", async () => {
    const primeiro = await conduzirTurno({ agenciaId: AG, clienteId: CLI, quantas: 2 });
    expect(primeiro.chavesPerguntadas).toEqual(primeiro.perguntar.map((p) => p.chave));

    const segundo = await conduzirTurno({
      agenciaId: AG, clienteId: CLI,
      perguntadasAgora: primeiro.chavesPerguntadas,
      resposta: "não sei responder isso agora",
    });
    for (const chave of primeiro.chavesPerguntadas) {
      expect(segundo.estado.perguntadas).toContain(chave);
    }
  });

  it("perguntando tudo e escolhendo serviço, a entrevista fecha", async () => {
    const essenciais = CAMPOS_DA_FICHA.filter((c) => c.essencial).map((c) => c.chave);
    iaDiz({}, ["legenda"]);
    await conduzirTurno({ agenciaId: AG, clienteId: CLI, perguntadasAgora: essenciais, resposta: "quero legenda" });

    iaDiz({ "legenda.tom": "próximo" });
    const r = await conduzirTurno({
      agenciaId: AG, clienteId: CLI,
      perguntadasAgora: ["legenda.origemDoInsumo", "legenda.tom"],
      resposta: "vocês fazem, tom próximo",
    });
    expect(r.podePropor).toBe(true);
  });
});

describe("o plano só sai pela entrevista", () => {
  it("sondagem em aberto devolve plano bloqueado com motivo", async () => {
    const { plano, texto } = await planoDoCliente({ agenciaId: AG, clienteId: CLI });
    expect(plano.liberado).toBe(false);
    expect(plano.motivo.length).toBeGreaterThan(10);
    expect(texto).toMatch(/NÃO LIBERADO/);
  });

  it("entrevista fechada produz calendário com datas", async () => {
    const essenciais = CAMPOS_DA_FICHA.filter((c) => c.essencial).map((c) => c.chave);
    const respostas: Record<string, string> = {};
    for (const c of essenciais) respostas[c] = "respondido";
    respostas.data_inicio = "2026-08-03";

    iaDiz(respostas, ["reels"]);
    await conduzirTurno({ agenciaId: AG, clienteId: CLI, perguntadasAgora: essenciais, resposta: "quero reels" });

    iaDiz({ "reels.tipo_de_reels": "o ambiente", "reels.quantidade": "8" });
    await conduzirTurno({
      agenciaId: AG, clienteId: CLI,
      perguntadasAgora: ["reels.origemDoInsumo", "reels.tipo_de_reels", "reels.quantidade"],
      resposta: "vocês produzem, mostrando o ambiente, oito por mês",
    });

    const { plano } = await planoDoCliente({ agenciaId: AG, clienteId: CLI });
    expect(plano.liberado).toBe(true);
    expect(plano.linhas).toHaveLength(8);
    expect(plano.inicio).toBe("2026-08-03");
    expect(plano.linhas.every((l) => l.quemTrazOMaterial.includes("agência produz"))).toBe(true);
  });
});

describe("o piso hermético", () => {
  it("passa com zero P0", () => {
    const d = runSdrDiagnostic();
    const falhas = d.checks.filter((c) => !c.passou);
    expect(falhas.map((f) => `${f.nome}: ${f.detalhe}`)).toEqual([]);
    expect(d.status).toBe("PASS");
    expect(d.p0).toBe(0);
  });

  it("cobre a falha original explicitamente", () => {
    const nomes = runSdrDiagnostic().checks.map((c) => c.nome).join(" | ");
    expect(nomes).toMatch(/origem de insumo/i);
    expect(nomes).toMatch(/data vaga/i);
  });
});
