import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  oficinaAssinatura: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { PrismaAssinaturaMemory } from "./PrismaAssinaturaMemory";
import { resolverMemoria, resetAssinaturaMemory, setAssinaturaMemory } from "./AssinaturaMemory";

beforeEach(() => {
  vi.clearAllMocks();
  db.oficinaAssinatura.findMany.mockResolvedValue([]);
  db.oficinaAssinatura.upsert.mockResolvedValue({});
  db.oficinaAssinatura.deleteMany.mockResolvedValue({ count: 0 });
  resetAssinaturaMemory();
});

describe("PrismaAssinaturaMemory", () => {
  const memoria = new PrismaAssinaturaMemory();

  it("lê as mais recentes da chave, da mais nova pra mais velha", async () => {
    db.oficinaAssinatura.findMany.mockResolvedValue([{ assinatura: "b" }, { assinatura: "a" }]);
    expect(await memoria.recentes("k", 10)).toEqual(["b", "a"]);
    expect(db.oficinaAssinatura.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { chave: "k" }, orderBy: { createdAt: "desc" }, take: 10 }),
    );
  });

  it("banco fora do ar NÃO derruba a esteira — devolve janela vazia", async () => {
    db.oficinaAssinatura.findMany.mockRejectedValue(new Error("db down"));
    expect(await memoria.recentes("k", 10)).toEqual([]);
  });

  it("gravar a mesma combinação renova a data em vez de duplicar", async () => {
    await memoria.registrar("k", "angulo:45°");
    expect(db.oficinaAssinatura.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { oficina_assinatura_unica: { chave: "k", assinatura: "angulo:45°" } },
        create: { chave: "k", assinatura: "angulo:45°" },
      }),
    );
  });

  it("falha de gravação é engolida — a peça sai mesmo assim", async () => {
    db.oficinaAssinatura.upsert.mockRejectedValue(new Error("db down"));
    await expect(memoria.registrar("k", "x")).resolves.toBeUndefined();
  });

  it("limite mínimo de leitura é 1, mesmo se pedirem 0", async () => {
    await memoria.recentes("k", 0);
    expect(db.oficinaAssinatura.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 1 }));
  });
});

describe("resolverMemoria", () => {
  it("em teste usa a memória de processo — não arrasta banco", async () => {
    const m = await resolverMemoria();
    await m.registrar("k", "a");
    expect(await m.recentes("k", 5)).toEqual(["a"]);
    expect(db.oficinaAssinatura.upsert).not.toHaveBeenCalled();
  });

  it("override explícito ganha de tudo", async () => {
    const falsa = { recentes: vi.fn(async () => ["z"]), registrar: vi.fn(async () => {}) };
    setAssinaturaMemory(falsa);
    expect(await (await resolverMemoria()).recentes("k", 1)).toEqual(["z"]);
  });
});
