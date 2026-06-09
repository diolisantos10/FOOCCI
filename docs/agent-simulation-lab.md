# Agent Simulation Lab

The Simulation Lab is a safe, living environment where **artificial customers**
interact with a Foocci agent in **dry-run** mode, the conversation is evaluated,
and **opportunities** (problems / missed sales / friction) are raised for a human
to approve. The first agent is the **Waiter**, but the core is reusable for
WhatsApp, CRM, Analytics and future marketing agents.

> Central rule: the Lab can **test, diagnose and suggest** — it must **never**
> change production by itself.

---

## 1. What it is

- Generates varied artificial-customer scenarios (seeded, no LLM in v1).
- Runs each scenario against the **real deterministic engine** of the agent.
- Evaluates the response (PASS / WARNING / FAIL + P0/P1/P2/INFO).
- Records runs, scenarios and **opportunities** for human review.
- 100% dry-run: no order, no Pix, no Mercado Pago, no WhatsApp, no Evolution, no
  CRM dispatch, no runtime mutation, no real customer.

---

## 2. Quality Auditor vs Simulation Lab

| | Quality Auditor | Simulation Lab |
| --- | --- | --- |
| Purpose | Validate **deterministic rules** | Simulate **live human behaviour** |
| Output | P0/P1/P2 findings | Scenarios + **opportunities** |
| Cadence | Daily cron, fixed checks | On-demand / manual, varied scenarios |
| Action | Pass/fail gate | Learnings a human approves |

They are complementary. The Lab does **not** replace the Auditor and does **not**
run inside the Quality cron (deterministic and exploratory stay separated).

---

## 3. How a simulation runs

1. `generateScenarios({ seed, count, scenarioTypes })` — seeded templates produce
   varied personas/phrasings (e.g. "indecisive today" ≠ "indecisive tomorrow").
2. `runScenario(scenario)` — **SERVICE driver**: calls `WaiterBrainV2.decide()`
   over a synthetic catalog (no LLM, no side effects).
3. `evaluateScenario(...)` — deterministic checks (no hallucination, real cards,
   no menu dump, CTA, respects refusal, vegan-safe, payment/checkout guidance…).
4. `buildOpportunities(...)` — turns FAIL/WARNING into reviewable opportunities.
5. `runSimulation()` aggregates; `SimulationStore` persists run → scenarios →
   opportunities. Transcripts are **sanitized** (phone/email/secret stripped).

Drivers: `SERVICE` (implemented), `API`, `UI_STUB`, `PLAYWRIGHT` (backlog —
real-browser UI driving the live `/pedido`).

---

## 4. Safety / dry-run

`SIMULATION_SAFE_MODE` is frozen and asserted before every run:

```ts
{ simulationMode: true, dryRun: true, allowSideEffects: false,
  allowPayments: false, allowMessaging: false, allowOrderCreation: false }
```

Any unsafe flag throws and blocks the run. Every result carries
`runtimeTouched: false`.

---

## 5. What an opportunity is

A reviewable finding: `type` (BUG, MISSED_SALE, UX_FRICTION, PROMPT_GAP,
POLICY_GAP, LIBRARY_OPPORTUNITY, TRAINING_OPPORTUNITY), `severity`, `title`,
`summary`, `evidence`, `recommendation`, `expectedImpact`, and a `status` that
starts at **PENDING_REVIEW**.

---

## 6. How a human approves

In `/admin/agents/waiter` → tab **Simulador**, each opportunity can be marked
`APPROVED`, `REJECTED` or `BACKLOGGED`
(`PATCH /api/admin/agents/waiter/simulation/opportunities/[id]`). The Lab never
acts on an opportunity automatically — Diego decides.

---

## 7. APIs

- `POST /api/admin/agents/waiter/simulation/run` — run + persist (admin).
- `GET  /api/admin/agents/waiter/simulation` — history (admin).
- `GET  /api/admin/agents/waiter/simulation/[runId]` — detail (admin).
- `PATCH /api/admin/agents/waiter/simulation/opportunities/[id]` — review (admin).
- `POST /api/cron/agents/waiter/simulation/run` — cron-safe (CRON_SECRET), used by
  the manual workflow `.github/workflows/waiter-simulation-run.yml`
  (`workflow_dispatch`; a daily schedule is documented but disabled in v1).

---

## 8. How it replicates to other agents

Implement `AgentSimulationAdapter` for the new agent:
`generateScenarios`, `runScenario` (safe driver), `evaluateScenario`,
`buildOpportunities`. The generic `runSimulation()` + `SimulationStore` +
`agent_simulation_*` tables (keyed by `agentSlug`) are already reusable.

---

## 9. Data model (additive migration `20260609030000_agent_simulation_lab`)

- `AgentSimulationRun` — one run (counts, seed, status, driver, mode).
- `AgentSimulationScenario` — per-scenario verdict + sanitized transcript.
- `AgentSimulationOpportunity` — reviewable finding (PENDING_REVIEW by default).

---

## 10. Automatic daily run

`waiter-simulation-run.yml` runs on `workflow_dispatch` **and** a daily schedule
(`cron: "45 6 * * *"` ≈ 03:45 BRT) — a "daily automatic lab", not 24/7 spam. The
cron route records `mode=CRON`; the endpoint derives a **daily seed** (varies by
date) so scenarios differ each day. The job **fails** if HTTP is non-2xx,
`status≠PASS`, `runtimeTouched=true`, or `p0Count>0`. The Simulador tab shows the
last MANUAL and last CRON run separately.

## 11. Real conversation examples (inspiration, sanitized)

Real conversations can be turned into reusable **examples** that bias scenario
generation toward real patterns — without ever copying literal wording or PII:

1. `extractExamples({ restaurantId?, limit, days })` reads `Conversation`/`Message`
   **read-only**, sanitizes every turn (`simulationSanitizer`: phone, email,
   address, CPF, CNPJ, name, order number, tokens), classifies intent +
   scenarioType, and stores an `AgentSimulationExample` as **PENDING_REVIEW**.
2. A human **approves/rejects/backlogs** each example
   (`PATCH …/simulation/examples/[id]`). Only **APPROVED** examples feed the
   generator (`isApprovedForSimulation=true`).
3. The generator receives approved examples as `ExampleSeed` (only intent +
   scenarioType — **never raw text**) and biases which scenario types appear;
   phrasing always comes from templates, so it produces **variations, not copies**.

Raw transcripts are **never** stored — only the sanitized form. The admin UI shows
stats + sanitized summaries, never raw conversations.

APIs: `POST …/simulation/examples/extract`, `GET …/simulation/examples`,
`PATCH …/simulation/examples/[id]`. (Extraction is admin-triggered only — no
automatic extraction cron in this version.)

Data: `AgentSimulationExample` (migration `20260609040000_simulation_example_library`).

## 12. Next steps

- `PLAYWRIGHT`/`UI_STUB` driver to exercise the **real UI** of `/pedido`.
- Optional **AI Scenario Generator** (same `generateScenarios` contract) +
  paraphrase-based variations seeded from approved examples.
- Trend metrics; cross-link with Quality; replicate the adapter for
  WhatsApp / CRM / Analytics. A guarded extraction cron once volume justifies it.
