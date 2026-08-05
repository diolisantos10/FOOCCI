/**
 * Prova de que escalar deixou de ser um status silencioso.
 *
 * Antes de 04/08/2026, `escalate` só mudava mode:HUMAN e postava uma mensagem —
 * ninguém era notificado e o time descobria olhando o inbox. Estes testes travam
 * o novo comportamento: chamado numerado + notificação, e o chamado sobrevive
 * quando a notificação (ou o serviço inteiro) falha.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  helpThread: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  helpMessage: { findMany: vi.fn(), create: vi.fn() },
  restaurant: { findUnique: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const ticket = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock("@/services/support/SupportTicketService", () => ({
  SupportTicketService: { open: ticket.open },
}));

vi.mock("./helpAssistant", () => ({ answerHelpQuestion: vi.fn() }));

import { HelpThreadService } from "./HelpThreadService";

const THREAD = {
  id: "t1",
  restaurantId: "r1",
  userId: "u1",
  status: "OPEN",
  mode: "AI",
  createdAt: new Date("2026-08-04T10:00:00Z"),
  lastMessageAt: new Date("2026-08-04T10:00:00Z"),
};

const HISTORY = [
  { id: "m1", threadId: "t1", role: "USER", content: "a impressora imprime tudo cortado", authorName: null, createdAt: new Date("2026-08-04T10:01:00Z") },
  { id: "m2", threadId: "t1", role: "ASSISTANT", content: "Confere a largura do papel em Configurações.", authorName: null, createdAt: new Date("2026-08-04T10:02:00Z") },
  { id: "m3", threadId: "t1", role: "USER", content: "já conferi, continua cortado", authorName: null, createdAt: new Date("2026-08-04T10:03:00Z") },
];

beforeEach(() => {
  vi.clearAllMocks();
  db.helpThread.findFirst.mockResolvedValue(THREAD);
  db.helpThread.update.mockResolvedValue({ ...THREAD, status: "ESCALATED", mode: "HUMAN" });
  db.helpMessage.findMany.mockResolvedValue(HISTORY);
  db.restaurant.findUnique.mockResolvedValue({ name: "Pizzaria do Zé" });
  db.helpMessage.create.mockImplementation(async ({ data }: { data: { content: string } }) => ({
    id: "sys1", threadId: "t1", role: "SYSTEM", content: data.content, authorName: null, createdAt: new Date(),
  }));
  ticket.open.mockResolvedValue({ id: "tk1", number: 42, code: "CHM-0042", notified: true, notifyError: null });
});

describe("(c) escalate abre chamado e notifica", () => {
  it("abre o chamado com a evidência da conversa e devolve o código", async () => {
    const r = await HelpThreadService.escalate("r1", "u1", "o runbook não resolveu");

    expect(r.ok).toBe(true);
    expect(ticket.open).toHaveBeenCalledTimes(1);

    const arg = ticket.open.mock.calls[0]![0];
    expect(arg.restaurantId).toBe("r1");
    expect(arg.restaurantName).toBe("Pizzaria do Zé");
    expect(arg.threadId).toBe("t1");
    // O assunto é a ÚLTIMA pergunta do lojista, não a primeira.
    expect(arg.subject).toBe("já conferi, continua cortado");
    expect(arg.reason).toBe("o runbook não resolveu");
    expect(arg.transcript).toHaveLength(3);

    if (r.ok) {
      expect(r.data.ticket).toEqual({ code: "CHM-0042", notified: true });
      expect(r.data.message.content).toContain("CHM-0042");
    }
  });

  it("sem motivo declarado, registra que foi pedido do lojista — nunca fica em branco", async () => {
    await HelpThreadService.escalate("r1", "u1");
    expect(ticket.open.mock.calls[0]![0].reason).toContain("pediu para falar com a equipe");
  });

  it("vira a conversa para HUMAN (a IA sai do caminho)", async () => {
    await HelpThreadService.escalate("r1", "u1");
    expect(db.helpThread.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "ESCALATED", mode: "HUMAN" }) }),
    );
  });
});

describe("(d) a escalada não se perde quando a notificação falha", () => {
  it("e-mail falhou mas o chamado existe: o lojista ainda recebe o número", async () => {
    ticket.open.mockResolvedValue({
      id: "tk1", number: 42, code: "CHM-0042", notified: false, notifyError: "Resend 500",
    });

    const r = await HelpThreadService.escalate("r1", "u1");

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.ticket).toEqual({ code: "CHM-0042", notified: false });
      expect(r.data.message.content).toContain("CHM-0042");
    }
  });

  it("chamado explodiu de vez: a conversa AINDA vai para humano — não some", async () => {
    ticket.open.mockRejectedValue(new Error("banco fora do ar"));

    const r = await HelpThreadService.escalate("r1", "u1");

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.thread.mode).toBe("HUMAN");
      expect(r.data.ticket).toBeNull();
      // Sem número, a mensagem não inventa um: só confirma o encaminhamento.
      expect(r.data.message.content).not.toContain("CHM-");
    }
  });
});
