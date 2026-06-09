import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const WORKFLOW = resolve(process.cwd(), ".github/workflows/waiter-simulation-run.yml");

describe("(P12-auto.1/3) Waiter simulation workflow is scheduled + gated", () => {
  const yaml = readFileSync(WORKFLOW, "utf8");

  it("has both workflow_dispatch and a daily schedule", () => {
    expect(yaml).toMatch(/workflow_dispatch/);
    expect(yaml).toMatch(/schedule:/);
    expect(yaml).toMatch(/cron:\s*"45 6 \* \* \*"/);
  });

  it("fails the job on non-2xx, non-PASS, runtimeTouched=true OR p0Count>0", () => {
    expect(yaml).toMatch(/runtimeTouched='\$RUNTIME' \(expected false\)/);
    expect(yaml).toMatch(/p0Count='\$P0' \(expected 0\)/);
    expect(yaml).toMatch(/POST.*\/api\/cron\/agents\/waiter\/simulation\/run/);
  });

  it("injects CRON_SECRET via env (never inline) and uses FOOCCI_BASE_URL", () => {
    expect(yaml).toMatch(/CRON_SECRET:\s*\$\{\{ secrets\.CRON_SECRET \}\}/);
    expect(yaml).toMatch(/secrets\.FOOCCI_BASE_URL/);
  });
});
