/**
 * O diário que sobrevive ao deploy.
 *
 * Reprova contra o código anterior: não havia tabela, não havia gravação, e o
 * diário inteiro morria a cada subida. Aqui se prova o contrato do banco —
 * gravar não derruba nada, ler propaga a falha, e nenhuma palavra de cliente
 * entra na tabela.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  prisma: { sdrDiarioTurno: { create: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() } },
}));
vi.mock("@/lib/prisma", () => db);

import { PrismaArquivoDoDiario } from "../PrismaArquivoDoDiario";
import { montarTurno } from "../DiarioDoSdr";

const arquivo = new PrismaArquivoDoDiario();

const TURNO = montarTurno({
  chave: "foocci-vendas::lead-a7k2m",
  iaRespondeu: false,
  motivoSemIA: "cortado_por_limite",
  entendido: [{ chave: "objetivo", origem: "motor" }],
  perguntasNoAr: 1,
  seguemSemResposta: 0,
  travou: false,
  cobertura: 0.3,
  podePropor: false,
  agora: new Date("2026-08-23T12:00:00Z"),
});

beforeEach(() => {
  vi.clearAllMocks();
  db.prisma.sdrDiarioTurno.create.mockResolvedValue({});
  db.prisma.sdrDiarioTurno.deleteMany.mockResolvedValue({ count: 0 });
});

describe("gravar", () => {
  it("grava o turno com o motivo da falha e as chaves preenchidas pelo motor", async () => {
    await arquivo.gravar(TURNO);
    const dados = db.prisma.sdrDiarioTurno.create.mock.calls[0]![0].data;
    expect(dados).toMatchObject({
      conversa: TURNO.conversa,
      iaRespondeu: false,
      motivoSemIA: "cortado_por_limite",
      camposPeloMotor: 1,
      chavesPeloMotor: ["objetivo"],
    });
  });

  it("nada do que o cliente escreveu vai para a tabela", async () => {
    await arquivo.gravar(TURNO);
    const serializado = JSON.stringify(db.prisma.sdrDiarioTurno.create.mock.calls[0]![0]);
    expect(serializado).not.toContain("lead-a7k2m");
    expect(serializado).not.toContain("foocci-vendas");
  });

  it("banco fora do ar NÃO derruba a entrevista — a falha vai para o log", async () => {
    db.prisma.sdrDiarioTurno.create.mockRejectedValue(new Error("connection refused"));
    await expect(arquivo.gravar(TURNO)).resolves.toBeUndefined();
  });
});

describe("ler", () => {
  it("devolve os turnos da janela, do mais antigo para o mais recente", async () => {
    db.prisma.sdrDiarioTurno.findMany.mockResolvedValue([
      {
        quando: new Date("2026-08-23T12:00:00Z"), conversa: "abc123", iaRespondeu: true,
        motivoSemIA: null, camposPelaIA: 2, camposPeloMotor: 0, chavesPeloMotor: [],
        perguntasNoAr: 2, seguemSemResposta: 0, travou: false, cobertura: 0.5, podePropor: false,
      },
    ]);
    const turnos = await arquivo.ler(new Date("2026-08-01T00:00:00Z"));
    expect(turnos).toHaveLength(1);
    expect(turnos[0]!.camposPelaIA).toBe(2);
    expect(db.prisma.sdrDiarioTurno.findMany.mock.calls[0]![0].orderBy).toEqual({ quando: "asc" });
  });

  it("falha de leitura PROPAGA — lista vazia por erro seria lida como 'não aconteceu nada'", async () => {
    db.prisma.sdrDiarioTurno.findMany.mockRejectedValue(new Error("banco fora do ar"));
    await expect(arquivo.ler(new Date())).rejects.toThrow();
  });
});
