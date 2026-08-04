/**
 * HelpThreadService — owns the lojista-facing help conversation.
 *
 * One active (non-resolved) thread per restaurant powers the widget. While the
 * thread is in AI mode every user message is answered by the manual-grounded
 * assistant; once escalated to HUMAN mode, messages queue for the Foocci team
 * (answered from the admin support inbox) and the AI stays quiet.
 */

import { prisma } from "@/lib/prisma";
import { serviceOk, serviceFail, type ServiceResult } from "@/types";
import type { HelpMessage, HelpThread } from "@prisma/client";
import { SupportTicketService } from "@/services/support/SupportTicketService";
import type { SupportActionProposal } from "@/services/support/actions/SupportActionExecutor";
import { answerHelpQuestion } from "./helpAssistant";

export interface HelpMessageDTO {
  id: string;
  role: HelpMessage["role"];
  content: string;
  authorName: string | null;
  createdAt: string;
}

export interface HelpThreadDTO {
  id: string;
  status: HelpThread["status"];
  mode: HelpThread["mode"];
  createdAt: string;
  lastMessageAt: string;
}

export interface ThreadWithMessages {
  thread: HelpThreadDTO;
  messages: HelpMessageDTO[];
}

function msgDTO(m: HelpMessage): HelpMessageDTO {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    authorName: m.authorName,
    createdAt: m.createdAt.toISOString(),
  };
}

function threadDTO(t: HelpThread): HelpThreadDTO {
  return {
    id: t.id,
    status: t.status,
    mode: t.mode,
    createdAt: t.createdAt.toISOString(),
    lastMessageAt: t.lastMessageAt.toISOString(),
  };
}

export class HelpThreadService {
  /** Most recent non-resolved thread for the restaurant, or a fresh one. */
  private static async getOrCreate(
    restaurantId: string,
    userId: string,
  ): Promise<HelpThread> {
    const existing = await prisma.helpThread.findFirst({
      where: { restaurantId, status: { not: "RESOLVED" } },
      orderBy: { lastMessageAt: "desc" },
    });
    if (existing) return existing;
    return prisma.helpThread.create({
      data: { restaurantId, userId, status: "OPEN", mode: "AI" },
    });
  }

  static async loadActiveThread(
    restaurantId: string,
    userId: string,
  ): Promise<ServiceResult<ThreadWithMessages>> {
    try {
      const thread = await this.getOrCreate(restaurantId, userId);
      const messages = await prisma.helpMessage.findMany({
        where: { threadId: thread.id },
        orderBy: { createdAt: "asc" },
      });
      return serviceOk({
        thread: threadDTO(thread),
        messages: messages.map(msgDTO),
      });
    } catch (err) {
      console.error("[HelpThreadService.loadActiveThread]", err);
      return serviceFail("Falha ao carregar a conversa de ajuda", 500);
    }
  }

  static async sendMessage(
    restaurantId: string,
    userId: string,
    content: string,
  ): Promise<
    ServiceResult<{
      threadId: string;
      mode: HelpThread["mode"];
      messages: HelpMessageDTO[];
      /**
       * Veredito do turno, para a UI. `shouldEscalate` é o próprio agente
       * dizendo que não resolve sozinho — a interface então OFERECE o chamado
       * em vez de esconder a escalada num link de rodapé. Não é persistido:
       * vale para o turno que acabou de acontecer.
       */
      assistant: { shouldEscalate: boolean; coherence: string } | null;
      /**
       * Ação que o agente PROPÔS neste turno (ex.: subir o cardápio). É uma
       * OFERTA com botão — nunca algo já feito: `executed` é false enquanto a
       * escada estiver em sombra, e quem confirma é sempre o lojista.
       */
      proposedAction: SupportActionProposal | null;
    }>
  > {
    try {
      const thread = await this.getOrCreate(restaurantId, userId);

      const userMsg = await prisma.helpMessage.create({
        data: { threadId: thread.id, role: "USER", content },
      });
      await prisma.helpThread.update({
        where: { id: thread.id },
        data: { lastMessageAt: new Date() },
      });

      const out: HelpMessageDTO[] = [msgDTO(userMsg)];
      let assistant: { shouldEscalate: boolean; coherence: string } | null = null;
      let proposedAction: SupportActionProposal | null = null;

      // The AI only answers while the thread is in AI mode.
      if (thread.mode === "AI") {
        const recent = await prisma.helpMessage.findMany({
          where: {
            threadId: thread.id,
            role: { in: ["USER", "ASSISTANT"] },
            id: { not: userMsg.id },
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        });
        const priorHistory = recent
          .reverse()
          .map((m) => ({
            role: m.role === "ASSISTANT" ? ("assistant" as const) : ("user" as const),
            content: m.content,
          }));

        const restaurant = await prisma.restaurant.findUnique({
          where: { id: restaurantId },
          select: { name: true },
        });

        const ai = await answerHelpQuestion({
          question: content,
          restaurantId,
          history: priorHistory,
          restaurantName: restaurant?.name ?? undefined,
          conversationId: thread.id,
        });

        const assistantMsg = await prisma.helpMessage.create({
          data: { threadId: thread.id, role: "ASSISTANT", content: ai.answer },
        });
        await prisma.helpThread.update({
          where: { id: thread.id },
          data: { lastMessageAt: new Date() },
        });
        out.push(msgDTO(assistantMsg));
        assistant = { shouldEscalate: ai.shouldEscalate, coherence: ai.coherence };
        proposedAction = ai.proposedAction;
      }

      return serviceOk({ threadId: thread.id, mode: thread.mode, messages: out, assistant, proposedAction });
    } catch (err) {
      console.error("[HelpThreadService.sendMessage]", err);
      return serviceFail("Falha ao enviar a mensagem", 500);
    }
  }

  /**
   * Escalate to the Foocci team — last resort. Abre um CHAMADO numerado, avisa o
   * time por e-mail e vira a conversa para HUMAN.
   *
   * Antes de 04/08/2026 isto só mudava o status: ninguém era notificado e o time
   * descobria olhando o inbox. Agora o chamado é o cofre (persistido primeiro) e
   * o e-mail é o alerta (best-effort). Se o e-mail falhar, o chamado continua de
   * pé com o motivo registrado em `notifyError` — a escalada NUNCA se perde.
   */
  static async escalate(
    restaurantId: string,
    userId: string,
    reason?: string,
  ): Promise<
    ServiceResult<{
      thread: HelpThreadDTO;
      message: HelpMessageDTO;
      ticket: { code: string; notified: boolean } | null;
    }>
  > {
    try {
      const thread = await this.getOrCreate(restaurantId, userId);

      // Already with a human — don't double-escalate, just re-confirm.
      const updated = await prisma.helpThread.update({
        where: { id: thread.id },
        data: { status: "ESCALATED", mode: "HUMAN", lastMessageAt: new Date() },
      });

      // Evidência do chamado: a conversa real, não um "abriram um chamado".
      const [history, restaurant] = await Promise.all([
        prisma.helpMessage.findMany({
          where: { threadId: thread.id },
          orderBy: { createdAt: "asc" },
          take: 40,
        }),
        prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true } }),
      ]);
      const lastQuestion =
        [...history].reverse().find((m) => m.role === "USER")?.content ?? "Pedido de ajuda humana";

      // O chamado é o cofre. Se ele falhar, a escalada não pode fingir sucesso —
      // mas a conversa JÁ está com humano, então avisamos e seguimos.
      let ticket: { code: string; notified: boolean } | null = null;
      try {
        const opened = await SupportTicketService.open({
          restaurantId,
          restaurantName: restaurant?.name ?? null,
          userId,
          threadId: thread.id,
          subject: lastQuestion.slice(0, 200),
          reason: reason?.trim() || "O lojista pediu para falar com a equipe Foocci.",
          transcript: history.map((m) => ({ role: m.role, content: m.content })),
        });
        ticket = { code: opened.code, notified: opened.notified };
        if (opened.notifyError) {
          console.error("[HelpThreadService.escalate] aviso não enviado:", opened.notifyError);
        }
      } catch (err) {
        console.error("[HelpThreadService.escalate] falha ao abrir chamado:", err);
      }

      const sys = await prisma.helpMessage.create({
        data: {
          threadId: thread.id,
          role: "SYSTEM",
          content: ticket
            ? `Tudo certo — abri o chamado ${ticket.code} e encaminhei sua conversa para a equipe Foocci. Em breve alguém responde por aqui. 💬`
            : "Tudo certo — encaminhei sua conversa para a equipe Foocci. Em breve alguém responde por aqui. 💬",
        },
      });
      return serviceOk({ thread: threadDTO(updated), message: msgDTO(sys), ticket });
    } catch (err) {
      console.error("[HelpThreadService.escalate]", err);
      return serviceFail("Falha ao encaminhar para a equipe", 500);
    }
  }

  /** Close the current thread and start a fresh AI conversation (back to start). */
  static async resetThread(
    restaurantId: string,
    userId: string,
  ): Promise<ServiceResult<ThreadWithMessages>> {
    try {
      await prisma.helpThread.updateMany({
        where: { restaurantId, status: { not: "RESOLVED" } },
        data: { status: "RESOLVED" },
      });
      const thread = await prisma.helpThread.create({
        data: { restaurantId, userId, status: "OPEN", mode: "AI" },
      });
      return serviceOk({ thread: threadDTO(thread), messages: [] });
    } catch (err) {
      console.error("[HelpThreadService.resetThread]", err);
      return serviceFail("Falha ao iniciar nova conversa", 500);
    }
  }
}
