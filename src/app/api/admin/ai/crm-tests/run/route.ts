/**
 * POST /api/admin/ai/crm-tests/run
 *
 * Runs the deterministic CRM Agent test suite. No OpenAI calls. No DB writes.
 * No WhatsApp messages. No campaigns. No CampaignExecution records. Pure,
 * fixture-based evaluation of CRM logic (safety, segmentation, intelligence,
 * action center, message-variation draft safety, attribution, review request).
 *
 * Auth: x-admin-secret header OR foocci-admin-token cookie.
 *
 * Body:
 *   slug            — required; restaurant slug (used for the report header / context)
 *   mode            — "quick" | "group" | "full" (default "full")
 *   scenarioGroup?  — optional CrmScenarioGroupId; only used in "group" mode
 *   useLiveLLM?     — optional boolean; off by default (core suite is deterministic)
 *
 * Response:
 *   { ok: true,  report, generatedAt, warnings }
 *   { ok: false, error }
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import type { CrmTestMode } from "@/services/crm/testing/CrmTestRunnerService";
import type { CrmScenarioGroupId } from "@/services/crm/testing/crmScenarios";

const VALID_MODES: CrmTestMode[] = ["quick", "group", "full"];

export async function POST(req: NextRequest) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ ok: false, error: "Endpoint disabled — ADMIN_SECRET not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Loaded lazily: these CRM services sit in a heavy module graph with a circular
  // import that trips Next's build-time page-data collection (TDZ: "Cannot access
  // 'a' before initialization"). A dynamic import defers eval to request time and
  // keeps the build green without touching the CRM feature. (Admin-only route.)
  const { CrmTestRunnerService } = await import("@/services/crm/testing/CrmTestRunnerService");
  const { getCrmScenarioGroups } = await import("@/services/crm/testing/crmScenarios");

  let slug: string;
  let mode: CrmTestMode = "full";
  let scenarioGroup: CrmScenarioGroupId | undefined;
  let useLiveLLM = false;

  try {
    const body = await req.json() as {
      slug?: unknown; mode?: unknown; scenarioGroup?: unknown; useLiveLLM?: unknown;
    };
    if (typeof body.slug !== "string" || !body.slug.trim()) {
      return NextResponse.json({ ok: false, error: "slug is required" }, { status: 400 });
    }
    slug = body.slug.trim();

    if (typeof body.mode === "string" && VALID_MODES.includes(body.mode as CrmTestMode)) {
      mode = body.mode as CrmTestMode;
    }

    if (typeof body.scenarioGroup === "string") {
      const valid = getCrmScenarioGroups().some((g) => g.id === body.scenarioGroup);
      if (valid) scenarioGroup = body.scenarioGroup as CrmScenarioGroupId;
    }

    if (body.useLiveLLM === true) useLiveLLM = true;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  // Resolve restaurant by slug (read-only — for the report header/context).
  const restaurant = await prisma.restaurant.findUnique({
    where:  { slug },
    select: { id: true, name: true, slug: true },
  });
  if (!restaurant) {
    return NextResponse.json({ ok: false, error: `Restaurant not found: ${slug}` }, { status: 404 });
  }

  const warnings: string[] = [];
  if (useLiveLLM) {
    // LLM draft sanity mode is not wired in this build — the core suite is fully
    // deterministic. We never call OpenAI from the test runner.
    warnings.push("useLiveLLM ignorado: a suíte CRM é determinística (sem chamadas LLM). Nenhuma mensagem é enviada.");
  }

  const report = CrmTestRunnerService.run({
    restaurantId:   restaurant.id,
    restaurantName: restaurant.name,
    slug:           restaurant.slug,
    mode,
    scenarioGroup,
    useLiveLLM:     false, // forced off — deterministic only
    dryRun:         true,
  });

  return NextResponse.json({
    ok: true,
    report,
    generatedAt: new Date().toISOString(),
    warnings,
  });
}
