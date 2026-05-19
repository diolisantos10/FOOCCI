import { NextRequest, NextResponse } from "next/server";
import { AutomationSchedulerService } from "@/services/crm/AutomationSchedulerService";
import { prisma } from "@/lib/prisma";

function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({})) as {
      restaurantId?: string;
      dryRun?: boolean;
    };
    const dryRun = body.dryRun === true;

    if (body.restaurantId) {
      const result = await AutomationSchedulerService.runEnabledAutomations(
        body.restaurantId,
        dryRun
      );
      return NextResponse.json({ ok: true, dryRun, result });
    }

    // Run for every restaurant that has at least one enabled automation
    const restaurantIds = await prisma.cRMAutomation
      .findMany({
        where: { isEnabled: true },
        select: { restaurantId: true },
        distinct: ["restaurantId"],
      })
      .then((rows) => rows.map((r) => r.restaurantId));

    const results = await Promise.all(
      restaurantIds.map((id) =>
        AutomationSchedulerService.runEnabledAutomations(id, dryRun).catch((err) => ({
          restaurantId: id,
          error: err instanceof Error ? err.message : "Erro desconhecido",
        }))
      )
    );

    const totalSent = results.reduce(
      (sum, r) => sum + ("totalSent" in r ? r.totalSent : 0),
      0
    );

    return NextResponse.json({ ok: true, dryRun, restaurantsProcessed: restaurantIds.length, totalSent, results });
  } catch (err) {
    console.error("[cron/execute-crm-automations]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
