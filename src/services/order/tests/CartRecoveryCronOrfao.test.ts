/**
 * A bomba armada do `mark-abandoned-drafts`.
 *
 * `POST /api/cron/mark-abandoned-drafts` existe, está documentado como "Fase 2
 * da recuperação de carrinho abandonado" e **ninguém o chama**: em 05/08/2026 a
 * única ocorrência da string no repositório inteiro é o próprio arquivo da
 * rota. Nem workflow, nem agendador do Railway, nem `instrumentation.ts`.
 *
 * A leitura natural de quem encontra isso é "faltou ligar" — e ligar seria o
 * erro. Este teste existe para transformar essa armadilha em vermelho no CI, e
 * o motivo é aritmético:
 *
 *   · o motor de ENVIO só olha rascunho com `status: "OPEN"`;
 *   · o marcador vira `OPEN → ABANDONED` depois de 60 minutos parados;
 *   · a janela cobrável do envio vai de 2 minutos a 6 horas.
 *
 * Ligar o marcador com o padrão de 60 min encolheria a janela útil de 6 h para
 * 1 h e mandaria o resto do estoque para um estado que o motor não enxerga —
 * exatamente o oposto do que quem ligasse estaria tentando fazer.
 *
 * Isto NÃO diz que a Fase 2 é errada; diz que ela não pode ser ligada sozinha.
 * Quem for ligar precisa, no mesmo bloco, ensinar o motor a ler ABANDONED.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  orderDraft:           { findMany: vi.fn(), count: vi.fn(), update: vi.fn() },
  restaurantCRMProfile: { findMany: vi.fn() },
  campaign:             { findMany: vi.fn() },
  metaWhatsAppConfig:   { findMany: vi.fn() },
  order:                { findMany: vi.fn(), findFirst: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { OrderDraftRecoverySendService } from "../OrderDraftRecoverySendService";
import { OrderDraftAbandonmentService } from "../OrderDraftAbandonmentService";

beforeEach(() => {
  vi.clearAllMocks();
  db.orderDraft.findMany.mockResolvedValue([]);
  db.orderDraft.count.mockResolvedValue(0);
});

describe("os dois lados olham estados diferentes — e isso é a armadilha", () => {
  it("o motor de envio só enxerga rascunho OPEN", async () => {
    await OrderDraftRecoverySendService.sendCartRecoveryMessages({ dryRun: true });

    const w = db.orderDraft.findMany.mock.calls[0][0].where as { status: string };
    expect(w.status, "se um dia aceitar ABANDONED, revise o teste do cron órfão").toBe("OPEN");
  });

  it("o marcador TIRA o rascunho do estado que o motor enxerga", async () => {
    db.orderDraft.findMany.mockResolvedValue([
      { id: "d1", restaurantId: "r1", customerId: "c1", updatedAt: new Date(Date.now() - 2 * 3_600_000) },
    ]);
    db.order.findMany.mockResolvedValue([]);
    db.order.findFirst.mockResolvedValue(null);
    db.orderDraft.update.mockResolvedValue({});

    await OrderDraftAbandonmentService.markAbandonedDrafts({});

    const data = db.orderDraft.update.mock.calls[0][0].data as { status: string };
    expect(data.status).toBe("ABANDONED");
  });

  it("o corte do marcador (60 min) cai DENTRO da janela cobrável (2 min … 6 h)", async () => {
    // É esta sobreposição que faz o dano: ligar o marcador não adia a cobrança,
    // ele apaga a maior parte da janela em que a cobrança ainda faria sentido.
    db.orderDraft.findMany.mockResolvedValue([]);
    await OrderDraftAbandonmentService.markAbandonedDrafts({ dryRun: true });
    const corteMarcador = (db.orderDraft.findMany.mock.calls[0][0].where as { updatedAt: { lt: Date } })
      .updatedAt.lt.getTime();

    vi.clearAllMocks();
    db.orderDraft.findMany.mockResolvedValue([]);
    db.orderDraft.count.mockResolvedValue(0);
    await OrderDraftRecoverySendService.sendCartRecoveryMessages({ dryRun: true });
    const janela = (db.orderDraft.findMany.mock.calls[0][0].where as { updatedAt: { lt: Date; gte: Date } }).updatedAt;

    expect(corteMarcador).toBeLessThan(janela.lt.getTime());   // mais antigo que o piso
    expect(corteMarcador).toBeGreaterThan(janela.gte.getTime()); // mais novo que a validade
  });
});
