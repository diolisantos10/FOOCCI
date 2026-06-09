# Waiter Runtime Merge — Library → Runtime, Versioning, Quality Gate & Rollback

This runbook describes how curated Library techniques optionally feed the Waiter's
live prompt **under governance**, and how to operate versions, the Quality gate and
rollback. The default is always the **safe CURRENT runtime** — nothing in this
feature changes `/pedido`, checkout, payment, Pix, or order creation.

---

## 1. What the Waiter Runtime Merge is

It connects three things that already existed in isolation — the **Library** (deep
extraction), the **Waiter runtime** (`AIOrderService` → prompt → LLM) and **Quality
Control** — into one governed pipeline:

```
Library → técnicas extraídas → curadoria/status → técnicas ACTIVE+runtimeEnabled
       → versão do Waiter (ACTIVE, LIBRARY_ASSISTED) → bridge → prompt assembler
       → bloco no prompt do Waiter → fallback/rollback → Quality gate
```

The Waiter can operate in three modes:

| Mode | Meaning |
| --- | --- |
| **CURRENT / SAFE** | Runtime atual, sem Library no prompt. Default. |
| **LIBRARY_ASSISTED** | Runtime atual **+** técnicas ACTIVE da Library, limitadas e versionadas. |
| **TESTING / DRAFT** | Versão preparada/testável, **nunca** vista por cliente real. |

---

## 2. How the Library enters the runtime

The **only** path is `WaiterLibraryRuntimeBridge.getWaiterRuntimeKnowledge()`,
called inside `AIOrderService` (web `runWebTurn` and WhatsApp `runTurn`) right
before the system prompt is finalized. It returns a safe payload and **never
throws**. A technique reaches the prompt **only** when ALL hold:

1. an **ACTIVE** `WaiterRuntimeVersion` exists for the scope (restaurant-specific
   beats global), with `mode = LIBRARY_ASSISTED` and `libraryEnabled = true`;
2. the technique is **frozen** into that version (`WaiterRuntimeVersionTechnique`);
3. the technique is `status = ACTIVE` **and** `runtimeEnabled = true`.

Otherwise the bridge returns `enabled: false`, the prompt is **byte-for-byte
identical to today**, and the Waiter behaves exactly as before.

The techniques are rendered by `WaiterRuntimePromptAssembler` as a **separate,
labelled block** that explicitly tells the model: the techniques are *orientation*,
the **real catalog/UI is the only source of truth**, never invent product/price,
never ignore restrictions, never skip checkout.

---

## 3. EXTRACTED vs ACTIVE vs runtimeEnabled

| State | Field | Meaning |
| --- | --- | --- |
| **EXTRACTED** | `status=EXTRACTED` | Raw output of deep extraction. **Never** in the runtime. |
| **IN_REVIEW** | `status=IN_REVIEW` | Under curation. Not in the runtime. |
| **ACTIVE** | `status=ACTIVE` | Approved by a human (`approvedAt/By`). Still **not** in the runtime by itself. |
| **runtimeEnabled** | `runtimeEnabled=true` | The ACTIVE technique is allowed to be used by the runtime — but only via an ACTIVE version. |
| **REJECTED / ARCHIVED** | `status=REJECTED|ARCHIVED` | Off the runtime permanently / shelved. |

> Extraction **never** auto-enables anything. Activation and enabling are two
> deliberate, separate human actions.

---

## 4. How to create a version

UI: `/admin/agents` → Waiter → tab **Runtime Merge** → **+ Criar DRAFT**.
API: `POST /api/admin/agents/waiter/runtime/versions`
`{ name, mode: "LIBRARY_ASSISTED", libraryEnabled: true, maxTechniques?, techniqueIds? }`

A new version is always **DRAFT** and **isActive=false** — it cannot affect a
customer. Freeze techniques into it with
`POST /api/admin/agents/waiter/runtime/versions/[id] { action: "assign", techniqueIds }`.

---

## 5. How to activate a version

UI: **Ativar (gate)** on a DRAFT/TESTING row.
API: `POST .../versions/[id] { action: "activate" }`

Activation **runs the Quality gate first** (see §7). If it passes, any other
ACTIVE version in the same scope is archived (only **one** ACTIVE per scope) and
this one becomes ACTIVE. If the gate fails, the API returns **HTTP 422** and
nothing is activated.

---

## 6. How rollback works

UI: **Rollback** on the active row.
API: `POST .../versions/[id] { action: "rollback", rollbackToVersionId? }`

Rollback is **instant and gate-free** — reverting to a safe state must never be
blocked. The active version is set to `ROLLED_BACK`. If a previous version is
provided/recorded, it is reactivated (no gate, it was already vetted); otherwise
the scope falls back to **CURRENT** (no active version → safe runtime).

---

## 7. How the Quality Gate blocks P0

The gate runs the existing **Waiter auditor** (`runOne("waiter")`) under SafeMode
(read-only, dry-run). It checks the critical (P0) checks: anti-hallucination,
real cards / item-in-catalog, no forbidden denial, restrictions, checkout
guidance. Activation is allowed **only when `P0 === 0`**. If the auditor cannot
run, the gate **blocks** (never silently allows). Run it standalone with
`POST .../quality-gate` or the **Rodar Quality gate** button.

Minimal gate (documented): activation requires a fresh Waiter audit with **0 P0**.

---

## 8. How to test

```
npx prisma generate
npx prisma validate
npx tsc --noEmit
npx vitest run src/services/waiterRuntime        # bridge / version / gate / assembler / comparison
npx vitest run src/app/api/admin/agents/waiter   # admin API guard + actions
npx vitest run src/services/quality              # auditors unchanged
npx vitest run src/services/order                # /pedido unaffected
npm run build
```

You can also create a DRAFT with synthetic techniques and confirm CURRENT stays
active until you explicitly activate (and the gate passes).

---

## 9. What you must NOT do

- Do not inject an EXTRACTED technique into the runtime (must be ACTIVE +
  runtimeEnabled + in an ACTIVE version).
- Do not activate a version that fails the Quality gate.
- Do not let a technique override the real catalog/price, ignore restrictions, or
  skip checkout.
- Do not touch checkout, payment, Pix, Mercado Pago, order creation, WhatsApp
  send, Evolution, CRM/Analytics runtime, or Build OS runtime.
- Do not remove the CURRENT fallback.

---

## 10. How to go back to CURRENT

Either **Rollback** the active version (instant), or archive/deactivate it. With
no ACTIVE version in scope, the bridge returns `enabled:false` and the Waiter runs
exactly as it does today. Turning a version's `libraryEnabled` off, or switching
its `mode` to CURRENT, has the same effect.

---

## Data model (additive only)

- `AgentLibraryTechnique` gains: `runtimeEnabled`, `runtimePriority`,
  `approvedAt/By`, `rejectedAt`, `rejectionReason`, `lastUsedAt`, `usageCount`,
  `qualityScore`, `tags`; enum gains `REJECTED`.
- `WaiterRuntimeVersion` — versioned behaviour (status, mode, libraryEnabled,
  maxTechniques, policies, quality snapshot, activation/rollback audit).
- `WaiterRuntimeVersionTechnique` — freezes which techniques belong to a version.

Migration: `prisma/migrations/20260609020000_waiter_runtime_merge`.
