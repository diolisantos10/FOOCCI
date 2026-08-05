/**
 * SupportInboxService — the Foocci team's side of the help channel.
 *
 * Admin-only (not tenant-scoped): lists help threads escalated by lojistas
 * across all restaurants, exposes a thread transcript, and lets the team reply
 * (as SUPPORT) or resolve. Replying keeps the thread in HUMAN mode so the AI
 * stays out of the way until it's resolved.
 */

import { prisma } from "@/lib/prisma";
import { serviceOk, serviceFail, type ServiceResult } from "@/types";
import type { HelpThreadStatus } from "@prisma/client";
import { HelpAttachmentService, type AttachmentDTO } from "./HelpAttachmentService";

export type SupportListFilter = "ESCALATED" | "RESOLVED" | "ALL";

export interface SupportThreadSummary {
  id: string;
  restaurantName: string;
  status: string;
  mode: string;
  lastMessageAt: string;
  preview: string;
  messageCount: number;
}

export interface SupportThreadMessage {
  id: string;
  role: string;
  content: string;
  authorName: string | null;
  createdAt: string;
  /**
   * O print/PDF que o lojista mandou. A URL aqui é a de ADMIN — a rota do
   * lojista (/api/help/attachments/[id]) confere o tenant da sessão e a área
   * /admin não tem tenant nenhum: ela responderia 404 para o time.
   */
  attachments: AttachmentDTO[];
}

export interface SupportThreadDetail {
  id: string;
  restaurantName: string;
  status: string;
  mode: string;
  createdAt: string;
  lastMessageAt: string;
  messages: SupportThreadMessage[];
}

export class SupportInboxService {
  static async list(
    filter: SupportListFilter = "ESCALATED",
  ): Promise<ServiceResult<SupportThreadSummary[]>> {
    try {
      const where =
        filter === "ALL" ? {} : { status: filter as HelpThreadStatus };

      const threads = await prisma.helpThread.findMany({
        where,
        orderBy: { lastMessageAt: "desc" },
        take: 100,
        include: {
          restaurant: { select: { name: true } },
          messages: { orderBy: { createdAt: "desc" }, take: 1 },
          _count: { select: { messages: true } },
        },
      });

      return serviceOk(
        threads.map((t) => ({
          id: t.id,
          restaurantName: t.restaurant?.name ?? "—",
          status: t.status,
          mode: t.mode,
          lastMessageAt: t.lastMessageAt.toISOString(),
          preview: t.messages[0]?.content.slice(0, 120) ?? "",
          messageCount: t._count.messages,
        })),
      );
    } catch (err) {
      console.error("[SupportInboxService.list]", err);
      return serviceFail("Falha ao listar conversas", 500);
    }
  }

  static async get(id: string): Promise<ServiceResult<SupportThreadDetail>> {
    try {
      const t = await prisma.helpThread.findUnique({
        where: { id },
        include: {
          restaurant: { select: { name: true } },
          messages: { orderBy: { createdAt: "asc" } },
        },
      });
      if (!t) return serviceFail("Conversa não encontrada", 404);

      const byMessage = await HelpAttachmentService.byMessages(t.messages.map((m) => m.id));

      return serviceOk({
        id: t.id,
        restaurantName: t.restaurant?.name ?? "—",
        status: t.status,
        mode: t.mode,
        createdAt: t.createdAt.toISOString(),
        lastMessageAt: t.lastMessageAt.toISOString(),
        messages: t.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          authorName: m.authorName,
          createdAt: m.createdAt.toISOString(),
          attachments: (byMessage.get(m.id) ?? []).map((a) => ({
            ...a,
            url: `/api/admin/support/attachments/${a.id}`,
          })),
        })),
      });
    } catch (err) {
      console.error("[SupportInboxService.get]", err);
      return serviceFail("Falha ao carregar a conversa", 500);
    }
  }

  static async reply(
    id: string,
    content: string,
    authorName?: string,
  ): Promise<ServiceResult<{ id: string }>> {
    try {
      const t = await prisma.helpThread.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!t) return serviceFail("Conversa não encontrada", 404);

      const msg = await prisma.helpMessage.create({
        data: {
          threadId: id,
          role: "SUPPORT",
          content,
          authorName: authorName?.trim() || "Equipe Foocci",
        },
      });
      await prisma.helpThread.update({
        where: { id },
        data: { lastMessageAt: new Date(), status: "ESCALATED", mode: "HUMAN" },
      });
      return serviceOk({ id: msg.id });
    } catch (err) {
      console.error("[SupportInboxService.reply]", err);
      return serviceFail("Falha ao responder", 500);
    }
  }

  static async resolve(id: string): Promise<ServiceResult<{ id: string }>> {
    try {
      const t = await prisma.helpThread.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!t) return serviceFail("Conversa não encontrada", 404);

      await prisma.helpThread.update({
        where: { id },
        data: { status: "RESOLVED" },
      });
      return serviceOk({ id });
    } catch (err) {
      console.error("[SupportInboxService.resolve]", err);
      return serviceFail("Falha ao resolver", 500);
    }
  }
}
