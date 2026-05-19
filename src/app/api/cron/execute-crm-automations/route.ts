import { NextRequest, NextResponse } from "next/server";
import { AutomationSchedulerService } from "@/services/crm/AutomationSchedulerService";
import { prisma } from "@/lib/prisma";

function checkCronAuth(req: NextRequest): { ok: true } | { ok: false; status: 401 | 503; error: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/execute-crm-automations] CRON_SECRET env var is not configured — automations will not run");
    return { ok: false, status: 503, error: "CRON_SECRET is not configured" };
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true };
}

export async function POST(req: NextRequest) {
  const auth = checkCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
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
