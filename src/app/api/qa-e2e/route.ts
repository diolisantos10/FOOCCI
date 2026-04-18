/**
 * POST /api/qa-e2e
 *
 * Internal-only endpoint. Spawns Playwright as a child process, captures
 * its JSON-reporter output, and returns a structured summary.
 *
 * - Timeout: 90 s (browser startup + 6 specs + retries)
 * - Safe async: resolves only on process 'close'
 * - No terminal required — triggered from the QA panel UI
 *
 * Security: requires a valid session with OWNER role. This endpoint
 * is expensive (90 s process spawn) and must never be open to regular staff.
 *
 * Response (success):
 *   {
 *     total: number,
 *     passed: number,
 *     failed: number,
 *     durationMs: number,
 *     failedTests: string[]
 *   }
 *
 * Response (error / timeout):
 *   { error: string, detail?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { getTenantContext } from "@/lib/tenant";

// ── Types matching Playwright's JSON reporter output ────────────

interface PlaywrightStats {
  expected:   number; // passed
  unexpected: number; // failed
  skipped:    number;
  duration:   number; // ms
}

interface PlaywrightTest {
  title:   string;
  ok:      boolean;
  results: Array<{ status: string }>;
}

interface PlaywrightSuite {
  title:  string;
  suites: PlaywrightSuite[];
  specs:  PlaywrightTest[];
}

interface PlaywrightJsonReport {
  stats:  PlaywrightStats;
  suites: PlaywrightSuite[];
  errors: unknown[];
}

// ── Helpers ─────────────────────────────────────────────────────

/** Walk the nested suite tree and collect titles of failed specs. */
function collectFailedTests(suites: PlaywrightSuite[], prefix = ""): string[] {
  const failed: string[] = [];

  for (const suite of suites) {
    const label = prefix ? `${prefix} › ${suite.title}` : suite.title;

    for (const spec of suite.specs ?? []) {
      if (!spec.ok) {
        failed.push(`${label} › ${spec.title}`);
      }
    }

    failed.push(...collectFailedTests(suite.suites ?? [], label));
  }

  return failed;
}

/** Run Playwright and resolve with its full stdout (JSON output). */
function runPlaywright(cwd: string, timeoutMs: number, baseUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Playwright timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    const child = spawn(
      "npx",
      ["playwright", "test", "--reporter=json"],
      {
        cwd,
        env: {
          ...process.env,
          BASE_URL: process.env.BASE_URL ?? baseUrl,
          // Suppress interactive prompts
          CI: "1",
        },
        // Capture stdout; let stderr flow to the server process log
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    const chunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));

    // stderr is forwarded to server logs for visibility, not captured
    const stderrLines: string[] = [];
    child.stderr.on("data", (chunk: Buffer) =>
      stderrLines.push(chunk.toString()),
    );

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to start Playwright: ${err.message}`));
    });

    child.on("close", () => {
      clearTimeout(timer);
      // Playwright exits non-zero when tests fail — that's expected.
      // We parse results from stdout regardless of exit code.
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
  });
}

// ── Route handler ────────────────────────────────────────────────

const TIMEOUT_MS = 90_000; // 90 seconds

export async function POST(req: NextRequest) {
  // Auth guard: must be authenticated with OWNER role.
  // Middleware already blocks unauthenticated requests, but we enforce role here.
  const ctx = getTenantContext(req);
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (ctx.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const cwd     = process.cwd();
    const baseUrl = new URL(req.url).origin;
    const stdout  = await runPlaywright(cwd, TIMEOUT_MS, baseUrl);

    // Playwright JSON reporter may prefix stdout with non-JSON lines
    // (list reporter noise). Find the first '{' to locate the JSON blob.
    const jsonStart = stdout.indexOf("{");
    if (jsonStart === -1) {
      return NextResponse.json(
        { error: "Playwright did not produce JSON output", detail: stdout.slice(0, 500) },
        { status: 500 },
      );
    }

    let report: PlaywrightJsonReport;
    try {
      report = JSON.parse(stdout.slice(jsonStart)) as PlaywrightJsonReport;
    } catch {
      return NextResponse.json(
        { error: "Failed to parse Playwright JSON output", detail: stdout.slice(0, 500) },
        { status: 500 },
      );
    }

    const { stats, suites } = report;
    const total      = (stats.expected ?? 0) + (stats.unexpected ?? 0) + (stats.skipped ?? 0);
    const passed     = stats.expected   ?? 0;
    const failed     = stats.unexpected ?? 0;
    const durationMs = stats.duration   ?? 0;
    const failedTests = collectFailedTests(suites ?? []);

    // Persist report to disk (non-fatal if it fails)
    try {
      const fs   = await import("fs");
      const dir  = path.join(cwd, "qa-reports");
      fs.mkdirSync(dir, { recursive: true });
      const ts   = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const summary = { total, passed, failed, durationMs, failedTests, generatedAt: new Date().toISOString() };
      fs.writeFileSync(path.join(dir, `e2e-${ts}.json`), JSON.stringify(summary, null, 2), "utf8");
      fs.writeFileSync(path.join(dir, "e2e-latest.json"), JSON.stringify(summary, null, 2), "utf8");
    } catch {
      // Non-fatal
    }

    return NextResponse.json({ total, passed, failed, durationMs, failedTests });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
