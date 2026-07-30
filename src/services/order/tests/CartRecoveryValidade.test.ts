/**
 * O carrinho abandonado ganhou prazo de validade.
 *
 * A busca tinha piso (2 minutos parado) e nenhum teto. Um rascunho aberto três
 * semanas atrás, com recoveryAttempts=0, continuava candidato para sempre — e
 * uma hora o Foocci mandava "percebi que seu pedido não foi finalizado 😊"
 * sobre um carrinho do mês passado. A pessoa já jantou, provavelmente já pediu
 * de novo, e recebe cobrança de um pedido que não lembra.
 *
 * O teste olha o FILTRO que vai ao banco, porque é lá que o defeito morava:
 * a ausência do `gte` era invisível em qualquer inspeção do resultado.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  orderDraft: { findMany: vi.fn(), count: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/evolution/EvolutionClient", () => ({ EvolutionApiError: class extends Error {} }));

import { OrderDraftRecoverySendService } from "../OrderDraftRecoverySendService";

const HORA = 60 * 60 * 1000;

beforeEach(() => {
  vi.clearAllMocks();
  db.orderDraft.findMany.mockResolvedValue([]);   // sem candidato → retorna cedo
  db.orderDraft.count.mockResolvedValue(0);
});

function filtroDaBusca() {
  return db.orderDraft.findMany.mock.calls[0]?.[0]?.where as {
    updatedAt: { lt: Date; gte: Date };
    status: string;
    recoveryAttempts: number;
  };
}

describe("o prazo de validade do carrinho", () => {
  it("a busca passou a ter teto, não só piso", async () => {
    await OrderDraftRecoverySendService.sendCartRecoveryMessages({ dryRun: true });

    const w = filtroDaBusca();
    expect(w.updatedAt.lt,  "o piso de inatividade continua").toBeInstanceOf(Date);
    expect(w.updatedAt.gte, "o teto de validade é o conserto — sem ele, carrinho de mês passado volta").toBeInstanceOf(Date);
  });

  it("o teto padrão é de horas, não de dias — comida não espera", async () => {
    const antes = Date.now();
    await OrderDraftRecoverySendService.sendCartRecoveryMessages({ dryRun: true });

    const idadeMax = antes - filtroDaBusca().updatedAt.gte.getTime();
    expect(idadeMax).toBeGreaterThanOrEqual(5.9 * HORA);
    expect(idadeMax).toBeLessThanOrEqual(6.1 * HORA);
  });

  it("o teto é sempre mais antigo que o piso — a janela nunca se inverte", async () => {
    await OrderDraftRecoverySendService.sendCartRecoveryMessages({ dryRun: true });

    const w = filtroDaBusca();
    expect(w.updatedAt.gte.getTime()).toBeLessThan(w.updatedAt.lt.getTime());
  });

  it("dá para apertar ou afrouxar o prazo por chamada", async () => {
    const antes = Date.now();
    await OrderDraftRecoverySendService.sendCartRecoveryMessages({ dryRun: true, maxAgeHours: 2 });

    const idadeMax = antes - filtroDaBusca().updatedAt.gte.getTime();
    expect(idadeMax).toBeGreaterThanOrEqual(1.9 * HORA);
    expect(idadeMax).toBeLessThanOrEqual(2.1 * HORA);
  });

  it("o resto das travas continua de pé — o prazo não afrouxou nada", async () => {
    await OrderDraftRecoverySendService.sendCartRecoveryMessages({ dryRun: true });

    const w = filtroDaBusca();
    expect(w.status).toBe("OPEN");
    expect(w.recoveryAttempts).toBe(0);
  });
});

describe("os vencidos aparecem, em vez de simplesmente sumir", () => {
  it("o resultado conta quantos venceram e qual foi o prazo aplicado", async () => {
    db.orderDraft.count.mockResolvedValue(37);

    const r = await OrderDraftRecoverySendService.sendCartRecoveryMessages({ dryRun: true });

    expect(r.skippedTooOld).toBe(37);
    expect(r.maxAgeHours).toBe(6);
  });

  it("a contagem de vencidos usa o mesmo prazo da busca", async () => {
    await OrderDraftRecoverySendService.sendCartRecoveryMessages({ dryRun: true, maxAgeHours: 3 });

    const wBusca = filtroDaBusca();
    const wConta = db.orderDraft.count.mock.calls[0]?.[0]?.where as { updatedAt: { lt: Date } };
    // o que a busca inclui (>= corte) e o que a contagem soma (< corte) são
    // complementares: nenhum rascunho fica fora dos dois nem entra nos dois.
    expect(wConta.updatedAt.lt.getTime()).toBe(wBusca.updatedAt.gte.getTime());
  });
});
