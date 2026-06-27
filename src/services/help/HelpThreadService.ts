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
          history: priorHistory,
          restaurantName: restaurant?.name ?? undefined,
        });

        const assistantMsg = await prisma.helpMessage.create({
          data: { threadId: thread.id, role: "ASSISTANT", content: ai.answer },
        });
        await prisma.helpThread.update({
          where: { id: thread.id },
          data: { lastMessageAt: new Date() },
        });
        out.push(msgDTO(assistantMsg));
      }

      return serviceOk({ threadId: thread.id, mode: thread.mode, messages: out });
    } catch (err) {
      console.error("[HelpThreadService.sendMessage]", err);
      return serviceFail("Falha ao enviar a mensagem", 500);
    }
  }

  /** Escalate to the Foocci team — last resort. Flips the thread to HUMAN. */
  static async escalate(
    restaurantId: string,
    userId: string,
  ): Promise<ServiceResult<{ thread: HelpThreadDTO; message: HelpMessageDTO }>> {
    try {
      const thread = await this.getOrCreate(restaurantId, userId);

      // Already with a human — don't double-escalate, just re-confirm.
      const updated = await prisma.helpThread.update({
        where: { id: thread.id },
        data: { status: "ESCALATED", mode: "HUMAN", lastMessageAt: new Date() },
      });
      const sys = await prisma.helpMessage.create({
        data: {
          threadId: thread.id,
          role: "SYSTEM",
          content:
            "Tudo certo — encaminhei sua conversa para a equipe Foocci. Em breve alguém responde por aqui. 💬",
        },
      });
      return serviceOk({ thread: threadDTO(updated), message: msgDTO(sys) });
    } catch (err) {
      console.error("[HelpThreadService.escalate]", err);
      return serviceFail("Falha ao encaminhar para a equipe", 500);
    }
  }
}
