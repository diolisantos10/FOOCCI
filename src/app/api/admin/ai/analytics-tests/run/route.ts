/**
 * POST /api/admin/ai/analytics-tests/run
 *
 * Runs the deterministic Analytics test suite (W5). No OpenAI calls. No DB
 * writes. No WhatsApp messages. No campaigns. No mutation of restaurant data.
 * Pure, fixture-based evaluation of Analytics logic: diagnosis, anomaly alerts,
 * retention/cohort, operational efficiency, conversational analyst routing, and
 * dashboard cockpit alerts/actions/health.
 *
 * Auth: x-admin-secret header OR foocci-admin-token cookie.
 *
 * Body:
 *   slug             — required; restaurant slug (used for the report header / context)
 *   mode             — "quick" | "group" | "full" (default "full")
 *   scenarioGroup?   — optional AnalyticsScenarioGroupId; only used in "group" mode
 *   includeLiveData? — optional boolean; off by default (suite is fixture-based)
 *
 * Response:
 *   { ok: true,  report, generatedAt, warnings }
 *   { ok: false, error }
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { AnalyticsTestRunnerService, type AnalyticsTestMode } from "@/services/analytics/testing/AnalyticsTestRunnerService";
import { getAnalyticsScenarioGroups, type AnalyticsScenarioGroupId } from "@/services/analytics/testing/analyticsScenarios";

const VALID_MODES: AnalyticsTestMode[] = ["quick", "group", "full"];

export async function POST(req: NextRequest) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ ok: false, error: "Endpoint disabled — ADMIN_SECRET not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let slug: string;
  let mode: AnalyticsTestMode = "full";
  let scenarioGroup: AnalyticsScenarioGroupId | undefined;
  let includeLiveData = false;

  try {
    const body = await req.json() as {
      slug?: unknown; mode?: unknown; scenarioGroup?: unknown; includeLiveData?: unknown;
    };
    if (typeof body.slug !== "string" || !body.slug.trim()) {
      return NextResponse.json({ ok: false, error: "slug is required" }, { status: 400 });
    }
    slug = body.slug.trim();

    if (typeof body.mode === "string" && VALID_MODES.includes(body.mode as AnalyticsTestMode)) {
      mode = body.mode as AnalyticsTestMode;
    }

    if (typeof body.scenarioGroup === "string") {
      const valid = getAnalyticsScenarioGroups().some((g) => g.id === body.scenarioGroup);
      if (valid) scenarioGroup = body.scenarioGroup as AnalyticsScenarioGroupId;
    }

    if (body.includeLiveData === true) includeLiveData = true;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  // Resolve restaurant by slug (read-only — for the report header/context only).
  const restaurant = await prisma.restaurant.findUnique({
    where:  { slug },
    select: { id: true, name: true, slug: true },
  });
  if (!restaurant) {
    return NextResponse.json({ ok: false, error: `Restaurant not found: ${slug}` }, { status: 404 });
  }

  const warnings: string[] = [];
  if (includeLiveData) {
    // Live-data sampling is not wired in this build — the suite is fully
    // deterministic and fixture-based. We never read or mutate live analytics here.
    warnings.push("includeLiveData ignorado: a suíte de Analytics é determinística (apenas fixtures). Nenhum dado real é lido ou alterado.");
  }

  const report = AnalyticsTestRunnerService.run({
    restaurantId:    restaurant.id,
    restaurantName:  restaurant.name,
    slug:            restaurant.slug,
    mode,
    scenarioGroup,
    includeLiveData: false, // forced off — deterministic only
  });

  return NextResponse.json({
    ok: true,
    report,
    generatedAt: new Date().toISOString(),
    warnings,
  });
}
