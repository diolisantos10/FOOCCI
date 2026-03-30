/**
 * FOOCCI Internal QA — CLI Entrypoint
 *
 * Usage:
 *   npm run qa                      Run all scenarios
 *   npm run qa -- --scenario <id>   Run a single scenario by id
 *   npm run qa -- --list            List all scenario ids
 *   npm run qa -- --help            Show usage
 *
 * Output:
 *   qa-reports/run-<timestamp>.json   Full structured log
 *   qa-reports/run-<timestamp>.md     Human-readable report
 *   qa-reports/latest.json            Copy of most recent JSON
 *   qa-reports/latest.md              Copy of most recent markdown
 */

import * as fs   from "fs";
import * as path from "path";

// All QA lib imports use relative paths (no @/* aliases) so ts-node works.
import { allScenarios }    from "../lib/qa/scenarios/index";
import { mockMenu }        from "../lib/qa/fixtures/menu";
import { runScenarios }    from "../lib/qa/runner";
import { toJSON, toMarkdown } from "../lib/qa/reporter";
import type { QAScenario } from "../lib/qa/types";

// ─── CLI arg parsing ──────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
FOOCCI Internal QA Runner

Usage:
  npm run qa                        Run all scenarios
  npm run qa -- --scenario <id>     Run one scenario
  npm run qa -- --list              List scenario ids
  npm run qa -- --help              Show this help

Output files written to: ./qa-reports/
  `);
  process.exit(0);
}

if (args.includes("--list")) {
  console.log("\nAvailable scenarios:\n");
  allScenarios.forEach((s) => {
    console.log(`  ${s.id.padEnd(25)} ${s.name}`);
  });
  console.log();
  process.exit(0);
}

// ── Scenario selection ─────────────────────────────────────────
let scenarios: QAScenario[] = allScenarios;

const scenarioIdx = args.indexOf("--scenario");
if (scenarioIdx !== -1) {
  const id = args[scenarioIdx + 1];
  if (!id) {
    console.error("Error: --scenario requires an id argument.");
    process.exit(1);
  }
  const found = allScenarios.find((s) => s.id === id);
  if (!found) {
    console.error(`Error: scenario "${id}" not found.`);
    console.error(`Run \`npm run qa -- --list\` to see available ids.`);
    process.exit(1);
  }
  scenarios = [found];
}

// ─── Output directory ─────────────────────────────────────────

const REPORTS_DIR = path.join(process.cwd(), "qa-reports");
fs.mkdirSync(REPORTS_DIR, { recursive: true });

// ─── Run ──────────────────────────────────────────────────────

const SEV_COLOR: Record<string, string> = {
  critical: "\x1b[31m",  // red
  high:     "\x1b[33m",  // yellow
  medium:   "\x1b[36m",  // cyan
  low:      "\x1b[37m",  // white
};
const RESET = "\x1b[0m";
const BOLD  = "\x1b[1m";
const GREEN = "\x1b[32m";
const RED   = "\x1b[31m";

function colorSev(sev: string): string {
  return `${SEV_COLOR[sev] ?? ""}${sev.toUpperCase()}${RESET}`;
}

console.log(`\n${BOLD}FOOCCI Internal QA${RESET}`);
console.log(`Running ${scenarios.length} scenario(s)...\n`);

const log = runScenarios(scenarios, mockMenu);

// ─── Console output ───────────────────────────────────────────

for (const result of log.scenarios) {
  const icon =
    result.outcome === "pass"  ? `${GREEN}✅${RESET}` :
    result.outcome === "error" ? `${RED}❌${RESET}` :
                                  `\x1b[33m⚠️${RESET}`;

  const dur = `${result.durationMs}ms`;
  console.log(`  ${icon} ${result.scenarioName.padEnd(40)} ${dur}`);

  for (const f of result.failures) {
    const prefix = `     ${SEV_COLOR[f.severity] ?? ""}[${f.severity.toUpperCase()}]${RESET}`;
    console.log(`${prefix} ${f.description}`);
    console.log(`          → ${f.detail}`);
  }
}

// ─── Summary ──────────────────────────────────────────────────

const { summary } = log;
console.log(`\n${"─".repeat(55)}`);
console.log(`${BOLD}Summary${RESET}`);
console.log(`  Total:    ${summary.total}`);
console.log(`  ${GREEN}Passed:${RESET}   ${summary.passed}`);
console.log(`  ${summary.failed > 0 ? "\x1b[33m" : ""}Failed:${RESET}   ${summary.failed}`);
console.log(`  ${summary.errored > 0 ? RED : ""}Errored:${RESET}  ${summary.errored}`);
if (summary.critical > 0)
  console.log(`  ${RED}Critical: ${summary.critical}${RESET}`);
if (summary.high > 0)
  console.log(`  ${"\x1b[33m"}High:${RESET}     ${summary.high}`);

const recColor =
  summary.recommendation === "READY" ? GREEN :
  summary.recommendation === "NOT_READY" ? RED : "\x1b[33m";

console.log(
  `\n  ${BOLD}Recommendation:${RESET} ${recColor}${summary.recommendation}${RESET}\n`,
);

// ─── Write report files ───────────────────────────────────────

const ts = log.runId.replace("run-", "");
const jsonPath = path.join(REPORTS_DIR, `${log.runId}.json`);
const mdPath   = path.join(REPORTS_DIR, `${log.runId}.md`);
const latestJson = path.join(REPORTS_DIR, "latest.json");
const latestMd   = path.join(REPORTS_DIR, "latest.md");

const jsonContent = toJSON(log);
const mdContent   = toMarkdown(log);

fs.writeFileSync(jsonPath, jsonContent, "utf8");
fs.writeFileSync(mdPath,   mdContent,  "utf8");
fs.writeFileSync(latestJson, jsonContent, "utf8");
fs.writeFileSync(latestMd,   mdContent,  "utf8");

console.log(`Reports written to:`);
console.log(`  ${jsonPath}`);
console.log(`  ${mdPath}`);
console.log(`  (also: qa-reports/latest.json, qa-reports/latest.md)\n`);

// Exit with non-zero code if any scenario failed/errored
const exitCode =
  summary.critical > 0 || summary.errored > 0 ? 2 :
  summary.failed > 0 ? 1 : 0;

process.exit(exitCode);
