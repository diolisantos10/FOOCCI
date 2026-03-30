/**
 * POST /api/qa-run
 *
 * Internal-only endpoint. Runs the QA scenario suite against the pure
 * state-machine engine (no real database, no WhatsApp) and returns the
 * full run log plus the rendered markdown report.
 *
 * Body:
 *   { mode: "critical" | "full" | "single", scenarioId?: string }
 *
 * Response:
 *   { data: { log: QARunLog, markdown: string } }
 */

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

import { allScenarios } from "@/lib/qa/scenarios";
import { CRITICAL_SCENARIO_IDS } from "@/lib/qa/critical-scenarios";
import { mockMenu } from "@/lib/qa/fixtures/menu";
import { runScenarios } from "@/lib/qa/runner";
import { toJSON, toMarkdown } from "@/lib/qa/reporter";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const mode: "critical" | "full" | "single" = body.mode ?? "full";
    const scenarioId: string | undefined = body.scenarioId;

    // ── Select scenarios ──────────────────────────────────────
    let scenarios = allScenarios;
    if (mode === "critical") {
      scenarios = allScenarios.filter((s) =>
        (CRITICAL_SCENARIO_IDS as readonly string[]).includes(s.id),
      );
    } else if (mode === "single" && scenarioId) {
      scenarios = allScenarios.filter((s) => s.id === scenarioId);
    }

    if (scenarios.length === 0) {
      return NextResponse.json(
        { error: "No matching scenarios found" },
        { status: 400 },
      );
    }

    // ── Run ───────────────────────────────────────────────────
    const log = runScenarios(scenarios, mockMenu);
    const markdown = toMarkdown(log);
    const json = toJSON(log);

    // ── Persist reports ───────────────────────────────────────
    try {
      const reportsDir = path.join(process.cwd(), "qa-reports");
      fs.mkdirSync(reportsDir, { recursive: true });

      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      fs.writeFileSync(path.join(reportsDir, `run-${ts}.json`), json, "utf8");
      fs.writeFileSync(path.join(reportsDir, `run-${ts}.md`),   markdown, "utf8");
      fs.writeFileSync(path.join(reportsDir, "latest.json"),    json, "utf8");
      fs.writeFileSync(path.join(reportsDir, "latest.md"),      markdown, "utf8");
    } catch {
      // Non-fatal — report generation failure doesn't block the response
    }

    return NextResponse.json({ data: { log, markdown } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
