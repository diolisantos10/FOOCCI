/**
 * POST /api/cron/crm/weekly-plan
 *
 * Weekly Strategist cron. Once a week, generates a CRM plan for every restaurant
 * that has a real customer base. COPILOT restaurants get a plan awaiting approval;
 * AUTOPILOT restaurants get eligible items auto-approved & executed (turned into
 * recurring campaigns) inside their guardrails.
 *
 * Auth: Authorization: Bearer {CRON_SECRET}
 *
 * Params (query or JSON body):
 *   restaurantId=<id>  — scope to one restaurant
 *   force=true         — discard an existing plan for the week and recompute
 */

import { NextRequest, NextResponse } from "next/server";
import { CrmWeeklyPlannerService } from "@/services/crm/weeklyPlan/CrmWeeklyPlannerService";

function checkCronAuth(req: NextRequest): { ok: true } | { ok: false; status: 401 | 503; error: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/crm/weekly-plan] CRON_SECRET env var is not configured — weekly plan will not run");
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
    const url = req.nextUrl;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const restaurantId =
      (url.searchParams.get("restaurantId") ?? (body.restaurantId as string | undefined)) || undefined;
    const force = url.searchParams.get("force") === "true" || body.force === true;

    if (restaurantId) {
      const result = await CrmWeeklyPlannerService.generateForRestaurant(restaurantId, { force, notify: true });
      return NextResponse.json({ ok: true, scope: "single", ...result });
    }

    const summary = await CrmWeeklyPlannerService.generateForAllRestaurants({ force, notify: true });
    return NextResponse.json({ ok: true, scope: "all", ...summary });
  } catch (err) {
    console.error("[cron/crm/weekly-plan]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
