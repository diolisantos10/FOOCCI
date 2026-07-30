/**
 * PrintJobLease — a comanda não some mais entre o poll e o papel.
 *
 * Cada teste aqui é um jeito real de o restaurante ficar sem imprimir. O que
 * estes casos protegem é o único sintoma que importa: o papel sai.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  printJob: {
    findMany:   vi.fn(),
    updateMany: vi.fn(),
    update:     vi.fn(),
    count:      vi.fn(),
  },
  $transaction: vi.fn(async (ops: unknown[]) => ops),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import {
  backoffMs,
  emprestarJobs,
  lerFila,
  LEASE_MS,
  MAX_ATTEMPTS,
  proximoEstado,
  registrarAck,
  reenfileirarMortos,
  resgatarJobsVencidos,
} from "./PrintJobLease";

const AGORA = new Date("2026-07-30T09:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  db.printJob.findMany.mockResolvedValue([]);
  db.printJob.updateMany.mockResolvedValue({ count: 0 });
  db.printJob.update.mockResolvedValue({});
  db.printJob.count.mockResolvedValue(0);
});

describe("o limbo do CLAIMED — a causa de não imprimir", () => {
  it("job entregue e sem ack volta para a fila quando o prazo vence", async () => {
    db.printJob.findMany.mockResolvedValueOnce([{ id: "j1", attempts: 1 }]);

    const resgatados = await resgatarJobsVencidos("rest_1", AGORA);

    expect(resgatados).toBe(1);
    // só busca o que passou do prazo — job recém-entregue continua com o Carteiro
    const filtro = db.printJob.findMany.mock.calls[0]?.[0]?.where;
    expect(filtro.status).toBe("CLAIMED");
    expect(filtro.claimedAt.lt.getTime()).toBe(AGORA.getTime() - LEASE_MS);
    expect(db.printJob.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PENDING" }) }),
    );
  });

  it("job sem ack que já esgotou as tentativas vira DEAD, não volta para sempre", async () => {
    db.printJob.findMany.mockResolvedValueOnce([{ id: "j1", attempts: MAX_ATTEMPTS }]);

    await resgatarJobsVencidos("rest_1", AGORA);

    expect(db.printJob.update).not.toHaveBeenCalled();
    expect(db.printJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "DEAD" }) }),
    );
  });

  it("sem job vencido não escreve nada", async () => {
    expect(await resgatarJobsVencidos("rest_1", AGORA)).toBe(0);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe("o empréstimo", () => {
  it("conta a tentativa na SAÍDA — Carteiro que engole em silêncio também gasta", async () => {
    db.printJob.findMany.mockResolvedValueOnce([{ id: "j1" }]).mockResolvedValueOnce([{ id: "j1" }]);
    db.printJob.updateMany.mockResolvedValueOnce({ count: 1 });

    await emprestarJobs("rest_1", 20, AGORA);

    expect(db.printJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "PENDING" }), // trava de corrida
        data:  expect.objectContaining({ status: "CLAIMED", attempts: { increment: 1 } }),
      }),
    );
  });

  it("não serve job que ainda está no respiro", async () => {
    await emprestarJobs("rest_1", 20, AGORA);
    const filtro = db.printJob.findMany.mock.calls[0]?.[0]?.where;
    expect(filtro.OR).toEqual([{ nextAttemptAt: null }, { nextAttemptAt: { lte: AGORA } }]);
  });

  it("se outro poll ganhou a corrida, devolve lista vazia em vez de papel em dobro", async () => {
    db.printJob.findMany.mockResolvedValueOnce([{ id: "j1" }]);
    db.printJob.updateMany.mockResolvedValueOnce({ count: 0 });

    expect(await emprestarJobs("rest_1", 20, AGORA)).toEqual([]);
  });
});

describe("o ack", () => {
  it("sucesso encerra o job", async () => {
    expect(await registrarAck({ id: "j1", attempts: 1 }, true, null, AGORA)).toBe("PRINTED");
    expect(db.printJob.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PRINTED", error: null }) }),
    );
  });

  it("falha transitória volta para a fila com respiro — não mata a comanda", async () => {
    const destino = await registrarAck({ id: "j1", attempts: 1 }, false, "sem papel", AGORA);

    expect(destino).toBe("PENDING");
    const data = db.printJob.update.mock.calls[0]?.[0]?.data;
    expect(data.status).toBe("PENDING");
    expect(data.error).toBe("sem papel");
    expect(data.nextAttemptAt.getTime()).toBe(AGORA.getTime() + backoffMs(1));
  });

  it("depois de esgotar as tentativas vira DEAD, para alguém olhar", async () => {
    const destino = await registrarAck({ id: "j1", attempts: MAX_ATTEMPTS }, false, "offline", AGORA);

    expect(destino).toBe("DEAD");
    expect(db.printJob.update.mock.calls[0]?.[0]?.data.nextAttemptAt).toBeNull();
  });
});

describe("o respiro", () => {
  it("cresce a cada tentativa, para não queimar as cinco em vinte segundos", () => {
    const escada = [1, 2, 3, 4, 5].map(backoffMs);
    expect([...escada].sort((a, b) => a - b)).toEqual(escada);
    expect(escada[0]).toBeGreaterThanOrEqual(10_000);
  });

  it("a última tentativa cai no maior respiro e não estoura a escada", () => {
    expect(backoffMs(99)).toBe(backoffMs(MAX_ATTEMPTS));
  });

  it("proximoEstado só mata quando esgotou", () => {
    expect(proximoEstado(MAX_ATTEMPTS - 1)).toBe("PENDING");
    expect(proximoEstado(MAX_ATTEMPTS)).toBe("DEAD");
  });
});

describe("a tela deixa de ser cega", () => {
  it("a fila devolve contagem e o que precisa de gente", async () => {
    db.printJob.count.mockResolvedValueOnce(3).mockResolvedValueOnce(1).mockResolvedValueOnce(42);
    db.printJob.findMany.mockResolvedValueOnce([
      { id: "j9", title: "Pedido #12", printerName: "Cz1", error: "offline", createdAt: AGORA },
    ]);

    const fila = await lerFila("rest_1", AGORA);

    expect(fila).toMatchObject({ naFila: 3, comOCarteiro: 1, impressas24h: 42 });
    expect(fila.travadas).toHaveLength(1);
    expect(fila.travadas[0]?.error).toBe("offline");
  });

  it("o tentar de novo zera o contador das travadas", async () => {
    db.printJob.updateMany.mockResolvedValueOnce({ count: 2 });

    expect(await reenfileirarMortos("rest_1")).toBe(2);
    expect(db.printJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "DEAD" }),
        data:  expect.objectContaining({ status: "PENDING", attempts: 0, error: null }),
      }),
    );
  });
});
