/**
 * FOOCCI QA — Reporter
 *
 * Converts a QARunLog into:
 *   A) A JSON string (full structured log)
 *   B) A Markdown string (human-readable summary)
 */

import type { QARunLog, QAScenarioResult, QAFailure } from "./types";

// ─── JSON ─────────────────────────────────────────────────────

export function toJSON(log: QARunLog): string {
  return JSON.stringify(log, null, 2);
}

// ─── Markdown ─────────────────────────────────────────────────

const OUTCOME_ICON: Record<QAScenarioResult["outcome"], string> = {
  pass: "✅",
  fail: "⚠️",
  error: "❌",
};

const SEV_ICON: Record<string, string> = {
  critical: "🔴",
  high:     "🟠",
  medium:   "🟡",
  low:      "⚪",
};

const RECOMMENDATION_LABEL: Record<string, string> = {
  READY:                      "✅ READY — all scenarios passed",
  NOT_READY:                  "❌ NOT READY — critical failures must be resolved",
  READY_FOR_CONTROLLED_PILOT: "⚠️ READY FOR CONTROLLED PILOT — review failures before full rollout",
};

function fmtMs(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
}

function failureBlock(failure: QAFailure, idx: number): string {
  const icon = SEV_ICON[failure.severity] ?? "⚪";
  const lines: string[] = [
    `### ${icon} [${failure.severity.toUpperCase()}] ${failure.description}`,
    `**Source:** ${failure.source}${failure.actionSeq !== undefined ? ` · action seq ${failure.actionSeq}` : ""}`,
    `**Detail:** ${failure.detail}`,
    "",
  ];
  return lines.join("\n");
}

export function toMarkdown(log: QARunLog): string {
  const { summary, scenarios } = log;
  const lines: string[] = [];

  // ── Header ─────────────────────────────────────────────────
  lines.push(`# FOOCCI QA Report`);
  lines.push(``);
  lines.push(`**Run ID:** \`${log.runId}\``);
  lines.push(`**Timestamp:** ${log.timestamp}`);
  lines.push(`**Duration:** ${fmtMs(log.totalDurationMs)}`);
  lines.push(``);

  // ── Summary table ───────────────────────────────────────────
  lines.push(`## Summary`);
  lines.push(``);
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total scenarios | **${summary.total}** |`);
  lines.push(`| ✅ Passed | **${summary.passed}** |`);
  lines.push(`| ⚠️ Failed | **${summary.failed}** |`);
  lines.push(`| ❌ Errored | **${summary.errored}** |`);
  lines.push(`| 🔴 Critical failures | **${summary.critical}** |`);
  lines.push(`| 🟠 High failures | **${summary.high}** |`);
  lines.push(`| 🟡 Medium | **${summary.medium}** |`);
  lines.push(`| ⚪ Low / UX | **${summary.low}** |`);
  lines.push(``);

  // ── Recommendation ──────────────────────────────────────────
  lines.push(`## Recommendation`);
  lines.push(``);
  lines.push(`> ${RECOMMENDATION_LABEL[summary.recommendation] ?? summary.recommendation}`);
  lines.push(``);

  // ── Failures section ────────────────────────────────────────
  const allFailures = scenarios.flatMap((s) =>
    s.failures.map((f) => ({ scenario: s.scenarioName, ...f })),
  );
  if (allFailures.length > 0) {
    lines.push(`---`);
    lines.push(``);
    lines.push(`## Failures`);
    lines.push(``);
    allFailures.forEach((f, i) => {
      lines.push(`**Scenario:** ${f.scenario}`);
      lines.push(failureBlock(f, i));
    });
  }

  // ── All scenarios table ─────────────────────────────────────
  lines.push(`---`);
  lines.push(``);
  lines.push(`## Scenario Results`);
  lines.push(``);
  lines.push(`| # | Scenario | Persona | Outcome | Duration | Failures |`);
  lines.push(`|---|----------|---------|---------|----------|----------|`);
  scenarios.forEach((s, i) => {
    const icon = OUTCOME_ICON[s.outcome];
    const failCount = s.failures.length;
    const failStr = failCount > 0 ? `${failCount} failure${failCount > 1 ? "s" : ""}` : "—";
    lines.push(
      `| ${i + 1} | ${s.scenarioName} | ${s.persona} | ${icon} ${s.outcome} | ${fmtMs(s.durationMs)} | ${failStr} |`,
    );
  });
  lines.push(``);

  // ── Per-scenario detail (only for failed/errored) ───────────
  const nonPassing = scenarios.filter((s) => s.outcome !== "pass");
  if (nonPassing.length > 0) {
    lines.push(`---`);
    lines.push(``);
    lines.push(`## Failure Detail`);
    lines.push(``);
    for (const s of nonPassing) {
      lines.push(`### ${OUTCOME_ICON[s.outcome]} ${s.scenarioName}`);
      lines.push(``);
      lines.push(`**Persona:** ${s.persona}  `);
      lines.push(`**Actions taken:** ${s.actions.length}  `);
      lines.push(`**Final stage:** \`${s.actions[s.actions.length - 1]?.stateAfter.stage ?? "unknown"}\``);
      lines.push(``);

      // Action log (condensed — only show errors/assertions)
      const notable = s.actions.filter((a) => a.assertionError ?? a.error);
      if (notable.length > 0) {
        lines.push(`**Notable actions:**`);
        lines.push(``);
        lines.push(`| Seq | Action | Issue |`);
        lines.push(`|-----|--------|-------|`);
        for (const a of notable) {
          const issue = a.assertionError ?? a.error ?? "";
          lines.push(
            `| ${a.seq} | \`${a.action.type}\` | ${issue} |`,
          );
        }
        lines.push(``);
      }

      // Checkpoint results
      const failedCps = s.checkpointResults.filter((c) => !c.passed);
      if (failedCps.length > 0) {
        lines.push(`**Failed checkpoints:**`);
        lines.push(``);
        for (const cp of failedCps) {
          const icon = SEV_ICON[cp.severity] ?? "⚪";
          lines.push(`- ${icon} \`${cp.checkpointId}\` — ${cp.description}`);
          if (cp.detail) lines.push(`  > ${cp.detail}`);
        }
        lines.push(``);
      }
    }
  }

  lines.push(`---`);
  lines.push(`*Generated by FOOCCI Internal QA Engine*`);

  return lines.join("\n");
}
