/**
 * GET /api/admin/support/metrics
 * Admin-only. Help-assistant usage metrics for the last 30 days:
 *   - total lojista questions
 *   - most-asked questions (naive normalization, grouped)
 *   - "gaps": questions whose assistant reply admitted it had no answer
 * Feeds the manual backlog — gaps become new guide chapters.
 */

import { NextRequest } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

const GAP_MARKERS = [
  "não tenho essa informação",
  "falar com a food",
  "não consegui acessar o assistente",
];

function normalize(q: string): string {
  return q
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function GET(req: NextRequest) {
  try {
    if (!checkAdminRequest(req)) return unauthorized();

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const messages = await prisma.helpMessage.findMany({
      where: { createdAt: { gte: since }, role: { in: ["USER", "ASSISTANT"] } },
      orderBy: [{ threadId: "asc" }, { createdAt: "asc" }],
      take: 4000,
      select: { threadId: true, role: true, content: true },
    });

    interface Bucket { example: string; count: number; gapCount: number }
    const buckets = new Map<string, Bucket>();
    let totalQuestions = 0;

    for (let i = 0; i < messages.length; i++) {
      const m = messages[i]!;
      if (m.role !== "USER") continue;
      totalQuestions++;

      const key = normalize(m.content).slice(0, 120);
      if (!key) continue;
      const bucket = buckets.get(key) ?? { example: m.content.slice(0, 160), count: 0, gapCount: 0 };
      bucket.count++;

      // The assistant reply (if any) is the next ASSISTANT message in the same thread.
      const next = messages[i + 1];
      if (next && next.threadId === m.threadId && next.role === "ASSISTANT") {
        const reply = next.content.toLowerCase();
        if (GAP_MARKERS.some((g) => reply.includes(g))) bucket.gapCount++;
      }
      buckets.set(key, bucket);
    }

    const all = [...buckets.values()];
    const topQuestions = all
      .sort((a, b) => b.count - a.count)
      .slice(0, 20)
      .map((b) => ({ question: b.example, count: b.count }));
    const gaps = all
      .filter((b) => b.gapCount > 0)
      .sort((a, b) => b.gapCount - a.gapCount)
      .slice(0, 20)
      .map((b) => ({ question: b.example, count: b.gapCount }));

    return ok({
      since: since.toISOString(),
      totalQuestions,
      uniqueQuestions: buckets.size,
      gapTotal: gaps.reduce((s, g) => s + g.count, 0),
      topQuestions,
      gaps,
    });
  } catch (err) {
    console.error("[GET /api/admin/support/metrics]", err);
    return serverError();
  }
}
