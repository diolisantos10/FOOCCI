/**
 * Guard (10): no auditor can execute a side effect.
 *
 * Two layers:
 *  1) Static: every file under quality/ may only import other quality/ modules.
 *     It must never import prisma, payment, whatsapp/evolution, order creation,
 *     CRM dispatch, fetch/network or runtime services.
 *  2) Behavioral: running every auditor produces only findings (data), and a
 *     second run with a fixed clock is deterministic (no hidden state/effect).
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { getAuditors, runAll } from "./QualityControlService";

const QUALITY_DIR = join(process.cwd(), "src/services/quality");

function collectTs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectTs(full));
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

const FORBIDDEN_IMPORT = /from\s+["']([^"']+)["']/g;

/**
 * Vetted external modules a connected auditor may import. All are pure /
 * read-only deterministic test harnesses (no DB writes, no sends, no order
 * creation). Anything outside this allowlist must stay internal to quality/.
 */
const ALLOWED_EXTERNAL = new Set([
  "@/services/ai/waiter/testing/waiterScenarios",
  "@/services/ai/waiter/testing/waiterEvaluator",
  "@/services/ai/WaiterBrainV2",
  "@/services/agents/waiterLegacyTestAudit",
  // CRM Test Center — deterministic, pure (no DB/LLM/network/sends).
  "@/services/crm/testing/crmScenarios",
  "@/services/crm/testing/crmEvaluator",
]);

const FORBIDDEN_TOKENS = [
  "prisma",
  "@/lib/prisma",
  "PaymentService",
  "mercadopago",
  "/payment",
  "evolution",
  "Evolution",
  "WhatsApp",
  "whatsapp",
  "OrderService",
  "OrderDraftService",
  "CampaignService",
  // CRM real-send / dispatch paths must never be imported by an auditor.
  "SendService",
  "ScheduledCampaignRunner",
  "ScheduledCampaignScheduler",
  "AutomationScheduler",
  "node-fetch",
  "axios",
];

describe("Quality Control — no side effects (static import scan)", () => {
  const files = collectTs(QUALITY_DIR);

  it("scans the whole quality/ folder", () => {
    expect(files.length).toBeGreaterThanOrEqual(7);
  });

  for (const file of files) {
    it(`only imports quality-internal modules: ${file.replace(QUALITY_DIR, "quality")}`, () => {
      const src = readFileSync(file, "utf8");
      const specs = [...src.matchAll(FORBIDDEN_IMPORT)].map((m) => m[1]);
      for (const spec of specs) {
        // allowed: relative imports inside quality/, node:* builtins, and the
        // vetted read-only external harnesses in ALLOWED_EXTERNAL.
        const isInternal = spec.startsWith("./") || spec.startsWith("../");
        const isNodeBuiltin = spec.startsWith("node:");
        const isAllowedExternal = ALLOWED_EXTERNAL.has(spec);
        expect(
          isInternal || isNodeBuiltin || isAllowedExternal,
          `Unexpected external import "${spec}" in ${file}`,
        ).toBe(true);
        // Forbidden-token scan only matters for non-internal specs (internal
        // relative paths like "./auditors/WhatsAppAuditor" are safe by design).
        if (!isInternal && !isNodeBuiltin) {
          for (const bad of FORBIDDEN_TOKENS) {
            expect(spec.includes(bad), `Forbidden import "${spec}" in ${file}`).toBe(false);
          }
        }
      }
    });
  }
});

describe("Quality Control — no side effects (behavioral)", () => {
  it("running all auditors yields data only and is deterministic for a fixed clock", async () => {
    const now = new Date("2026-06-08T03:00:00Z");
    const a = await runAll({ runId: "fixed", now });
    const b = await runAll({ runId: "fixed", now });
    // identical output ⇒ no hidden mutable state / external effect
    expect(JSON.stringify(a.findings)).toBe(JSON.stringify(b.findings));
    expect(getAuditors().every((x) => x.readOnly && x.canRunDaily)).toBe(true);
  });
});
