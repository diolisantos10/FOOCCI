import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

export interface AutomationStatRow {
  trigger: string;
  lastRunAt: string | null;
  lastSent: number;
  lastFailed: number;
  campaignId: string | null;
}

const TRIGGERS = ["REACTIVATION", "BIRTHDAY", "POST_ORDER"] as const;

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    // Find the most recent automation-triggered campaign per trigger type
    const campaigns = await prisma.campaign.findMany({
      where: {
        restaurantId: ctx.restaurantId,
        templateId: { in: TRIGGERS.map((t) => `auto:${t}`) },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, templateId: true, sentAt: true, totalSent: true, totalFailed: true, createdAt: true },
    });

    // Keep only the most recent per trigger
    const latestByTrigger = new Map<string, typeof campaigns[number]>();
    for (const c of campaigns) {
      const trigger = c.templateId?.replace("auto:", "") ?? "";
      if (!latestByTrigger.has(trigger)) latestByTrigger.set(trigger, c);
    }

    const stats: AutomationStatRow[] = TRIGGERS.map((trigger) => {
      const c = latestByTrigger.get(trigger);
      return {
        trigger,
        lastRunAt: c?.sentAt?.toISOString() ?? c?.createdAt?.toISOString() ?? null,
        lastSent: c?.totalSent ?? 0,
        lastFailed: c?.totalFailed ?? 0,
        campaignId: c?.id ?? null,
      };
    });

    return ok(stats);
  } catch (err) {
    console.error("[GET /api/crm/automations/stats]", err);
    return serverError();
  }
}
