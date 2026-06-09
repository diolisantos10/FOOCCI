# Waiter Department — Operational Status (closure)

Closure/audit snapshot of the Waiter Department before moving on to the CRM.
The Waiter runtime that serves real customers (`/pedido`) is **unchanged**; every
module below is additive, governed, and default-safe.

**Status final: ✅ APROVADO OPERACIONALMENTE.**

---

## 1. Overview

The Waiter Department is a complete, governed loop around the real Waiter:

```
Quality Control  →  Agent Library (deep)  →  Runtime Merge (bridge+versioning)
        ↑                                              ↓
   Simulation Lab  ←  Conversation Examples  ←  governed prompt (default CURRENT)
```

Everything can **test, diagnose and suggest**; nothing changes production by
itself. The live runtime stays on **CURRENT/SAFE** (no Library in the prompt)
until a human explicitly activates a version.

---

## 2. Completed modules

| # | Module | State | Production proof |
| --- | --- | --- | --- |
| 1 | **Quality Control** (`/admin/quality`, 4 auditors, daily cron, history, drill-down, regression, internal alerts) | ✅ | P0 = 0; `quality-audit-cron.yml` |
| 2 | **Agent Library Deep Extraction** (upload, deep extraction, chunking, processor, diagnostic) | ✅ | Deep diagnostic PASS — techniquesCreated=5, sourceCleanedUp=true, runtimeTouched=false |
| 3 | **Waiter Runtime Merge** (Library→runtime bridge, versioning, Quality gate, rollback) | ✅ | Merge diagnostic PASS — activated→bridge enabled→rollback→CURRENT, runtimeTouched=false |
| 4 | **Waiter Simulation Lab** (generic core + Waiter adapter, daily schedule, opportunities, persistence) | ✅ | Run PASS — 12 scenarios, p0Count=0, runtimeTouched=false, 5 opportunities |
| 5 | **Conversation Example Library + Examples Diagnostic** (sanitized real-conversation examples, human approval, generator influence) | ✅ | Examples diagnostic PASS — sanitizationPassed=true, inspiredScenarios=6, literalLeak=false, piiLeak=false, cleanup=true, p0Count=0 |

Additive migrations (all applied in production, proven by the diagnostics):
`20260608000000_quality_audit_history`, `20260609010000_agent_library_deep_extraction`,
`20260609020000_waiter_runtime_merge`, `20260609030000_agent_simulation_lab`,
`20260609040000_simulation_example_library`.

---

## 3. Main endpoints

**Quality** — `POST /api/admin/quality/run`, `GET /api/admin/quality/history`.

**Agent Library** — `…/api/admin/agents/library/*` (sources, upload, techniques,
extract); cron `POST /api/cron/agent-library/process`,
`POST /api/cron/agent-library/deep-diagnostic`.

**Runtime Merge** (admin) — `…/agents/waiter/runtime/versions`,
`…/runtime/versions/[id]` (assign·testing·activate·rollback),
`…/runtime/techniques`, `…/runtime/techniques/[id]`, `…/runtime/quality-gate`,
`…/runtime/knowledge`; cron `POST /api/cron/waiter-runtime/merge-diagnostic`.

**Simulation Lab** (admin) — `…/agents/waiter/simulation/run`,
`…/simulation` (history), `…/simulation/[runId]`,
`…/simulation/opportunities/[id]`; **examples**
`…/simulation/examples/extract`, `…/simulation/examples`,
`…/simulation/examples/[id]`; cron `POST /api/cron/agents/waiter/simulation/run`,
`POST /api/cron/agents/waiter/simulation/examples-diagnostic`.

All admin routes require `ADMIN_SECRET`; all cron routes require
`Authorization: Bearer CRON_SECRET` (POST-only, never public).

---

## 4. Main workflows

| Workflow | Trigger | Purpose |
| --- | --- | --- |
| `quality-audit-cron.yml` | schedule | Daily Quality audit |
| `agent-library-process.yml` | schedule (*/5) | Deep-extraction chunk processor |
| `agent-library-deep-diagnostic.yml` | manual | Deep-extraction end-to-end proof |
| `agent-library-auto-extraction-test.yml` | manual | Auto-extraction smoke |
| `waiter-runtime-merge-diagnostic.yml` | manual | Library→runtime cycle proof |
| `waiter-simulation-run.yml` | manual **+ daily** (`45 6 * * *`) | Daily simulation lab |
| `waiter-simulation-examples-diagnostic.yml` | manual | Sanitized-examples pipeline proof |

---

## 5. How to validate each module

- **Quality**: `vitest run src/services/quality`; UI `/admin/quality` → Run.
  Programmatic: `runOne("waiter")` / `runAll()` → `countsBySeverity.P0 === 0`.
- **Library Deep**: dispatch `agent-library-deep-diagnostic.yml` → PASS,
  techniquesCreated>0, sourceCleanedUp=true, runtimeTouched=false.
- **Runtime Merge**: dispatch `waiter-runtime-merge-diagnostic.yml` → PASS,
  activated→bridge enabled→rollback→CURRENT, runtimeTouched=false.
- **Simulation Lab**: dispatch `waiter-simulation-run.yml` → status PASS,
  p0Count=0, runtimeTouched=false; `vitest run src/services/simulation`.
- **Examples**: dispatch `waiter-simulation-examples-diagnostic.yml` → PASS,
  sanitizationPassed=true, inspiredScenarios≥1, literalLeak=false, piiLeak=false,
  cleanup=true.

Local gates: `prisma validate` · `tsc --noEmit` · `vitest run` (387 green) ·
`npm run build`.

---

## 6. Operational status

| Property | Value |
| --- | --- |
| Quality P0 | **0** |
| All diagnostics | **PASS** in production |
| runtimeTouched | **false** everywhere |
| Live Waiter mode | **CURRENT/SAFE** (no Library in prompt) |
| Active LIBRARY_ASSISTED version (real restaurant) | **none** |
| checkout / payment / Pix | **untouched** |

---

## 7. Pending (non-blocking, P2)

- **Visual checkpoint** of the Waiter Room tabs (Runtime Merge / Simulador /
  Exemplos reais) — requires Diego's admin browser session; all logic is proven
  by workflows + tests.
- Human review of Simulation Lab opportunities and of any extracted real examples
  (the approval queue exists; it just needs a human pass).

---

## 8. Next steps

- Controlled **LIBRARY_ASSISTED pilot** on one restaurant (e.g. Sushi Cazza):
  create a DRAFT version → assign curated techniques → Quality gate → activate →
  observe → keep rollback ready.
- Start the **CRM Department** (the Simulation Lab core + diagnostics pattern are
  reusable via a new `AgentSimulationAdapter`).

---

## 9. Checklist before a real pilot

- [ ] Quality run with **0 P0** on the target restaurant.
- [ ] Curated techniques are `ACTIVE` + `runtimeEnabled` (never raw EXTRACTED).
- [ ] DRAFT version created, techniques frozen, **Quality gate passed**.
- [ ] Rollback rehearsed (instant return to CURRENT).
- [ ] Simulation Lab run reviewed; opportunities triaged.
- [ ] Explicit human decision to activate (no auto-activation).

---

## 10. Rollback

`POST …/runtime/versions/[id] { action: "rollback" }` — **instant, gate-free**.
Reactivates the previous version if recorded, else the scope falls back to
**CURRENT** (no active version → safe runtime). Turning a version's
`libraryEnabled` off, or switching `mode` to CURRENT, has the same effect.

---

## 11. Known risks

- The "Deploy to Railway" GitHub Action is opaque; Railway's **native** deploy is
  what actually ships (confirmed by every diagnostic returning 200 with applied
  migrations).
- Sanitizer is regex-based (strong, over-masks rather than leaks); a bare CPF with
  no punctuation may be masked as `[numero]` — data is removed, label is generic.
- Intent classification for examples is keyword-based (good for v1; an AI
  classifier is a future improvement).

---

## 12. What is NOT enabled for a real restaurant

- **No** active `LIBRARY_ASSISTED` Waiter version in production (default CURRENT).
- **No** Library technique is injected into a real customer prompt.
- **No** automatic activation, **no** automatic opportunity/example approval.
- **No** real order, Pix, WhatsApp, Mercado Pago or Evolution call from any
  Department module — all diagnostics run synthetic + dry-run with cleanup.
