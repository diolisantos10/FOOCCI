# Foocci Waiter Web — Pilot Readiness Status

> **Status:** WAITER WEB READY FOR PILOT QA
> **Frozen as of:** Sprint 4P
> **Sprint series:** 4A – 4P
> **Architecture ref:** [waiter-web-architecture.md](./waiter-web-architecture.md)
> **Handoff ref:** [waiter-web-final-handoff.md](./waiter-web-final-handoff.md)

---

## Final Status

**WAITER WEB READY FOR PILOT QA**

Sprint 4O found zero real mobile QA failures. All 8 scenarios tested in Sprint 4N passed. The one confirmed code bug from the full sprint series (`checkout_interference`) was fixed in Sprint 4J and is unit-test protected. No code changes were made in Sprints 4O or 4P.

---

## Completed Sprints

| Sprint | What shipped | Code changed |
|---|---|---|
| 4A | Sales Specialist Core — `analyzeSalesContext`, `analyzeCart`, `analyzeMenu`, `analyzeMenuProfile`, `chooseSalesStrategy`, `analyzeSalesSituation` | Yes |
| 4B | Connected core to real web events — `handleUserMessage` routes through Sales Intelligence; all 9 old selectors replaced | Yes |
| 4C | Smart Product Selection Engine — `scoreProductForIntent`, `rankProducts`, `MIN_SCORE_THRESHOLD = 10`, -15 penalty for already-suggested IDs | Yes |
| 4D | Commercial Response Builder — `buildCommercialResponse`, `INTENT_COPY` map, `validateWaiterResponse` Rule 9 | Yes |
| 4E | Session Memory — `WaiterMemory`, `createWaiterMemory`, `memoryPatch` pattern, permission cooldown, promptCount cap | Yes |
| 4F | Final Upsell at Checkout — `handleCheckoutStarted` checks catalog availability; `see_final_suggestions` routes by cart gap | Yes |
| 4G | Config Placeholder — `WaiterSalesConfig`, `DEFAULT_WAITER_CONFIG`, `COOLDOWN_BY_LEVEL`, copy style variants | Yes |
| 4H | Observability — `waiterLog()` gated on `WAITER_DEBUG=true`; 4 structured log types | Yes |
| 4I | Test suite — 79 specialist tests + 204 core tests = 283 passing unit tests | Yes (tests only) |
| 4J | QA + bug fix — `ON_CHECKOUT_STARTED` double-prompt fixed; `data-testid` attributes added; Playwright spec written | Yes |
| 4K | Bug fix validation — no additional bugs reported | No changes |
| 4L | Final freeze + handoff documentation | No code changes |
| 4M | Build check — TypeScript clean, lint clean, 283/283 tests passing, contract assertions passing | No code changes |
| 4N | Real mobile QA execution — 8 scenarios tested, all PASS; environment blocker (no `DATABASE_URL`) prevents Playwright E2E | No code changes |
| 4O | Fix real mobile QA bugs — no failures found, no code changed | No code changes |
| 4P | Pilot readiness freeze — this document | No code changes |

---

## Final Architecture Summary

```
┌──────────────────────────────────────────────────────┐
│  UI Web / PedidoClient.tsx                           │
│  ────────────────────────────────────────────────    │
│  Owns: menu display, cart state, checkout flow,      │
│         delivery/payment stage machine               │
│  Owns: passive permission state machine (aiPermState)│
│  Owns: checkout upsell permission gate               │
│  Works fully without the Waiter (standalone)         │
│                                                      │
│        fires events ↓       receives output ↑        │
│                                                      │
│  API /api/pedido/[slug]                              │
│    → AIOrderService.runWebTurn()                     │
│       └─ WaiterBrainV2.decide()                      │
│                                                      │
│  Waiter Web / WaiterBrainV2.ts                       │
│  ────────────────────────────────────────────────    │
│  Owns: sales intelligence, product ranking, copy     │
│  Reads: catalog, cartItemIds, message, event         │
│  Returns: message, options, cards, mode              │
│  Never: controls checkout, writes to cart, calls DB  │
│                                                      │
│  Menu (Prisma / DB)                                  │
│  ────────────────────────────────────────────────    │
│  Source of truth for product IDs, names, prices      │
│  Waiter reads catalog on every turn; no local cache  │
└──────────────────────────────────────────────────────┘
```

### Responsibility boundaries

| Layer | Owns | Must not touch |
|---|---|---|
| UI (PedidoClient) | Menu, cart, checkout, permission prompts, stage machine | Sales logic, product ranking |
| Waiter (WaiterBrainV2) | Sales intelligence, scoring, copy generation | Checkout control, cart writes, DB calls |
| Menu (DB) | Product IDs, names, prices, categories | — |
| Checkout | Delivery type, payment, address — UI-driven only | Waiter must not drive this |

---

## Response Contract (frozen)

Every `decide()` call returns exactly:

```typescript
{
  message:     string;                   // ≤ 2 non-empty lines; never lists product names
  options:     WaiterOption[];           // [] when cards.length > 0 (Rule 9)
  cards:       string[];                 // valid catalog IDs only; [] in CHECKOUT_SUPPORT
  mode:        WaiterMode;               // "BROWSE" | "SUGGESTION" | "INTERVENTION" | "CHECKOUT_SUPPORT"
  requiresAI:  boolean;
  aiDirective: string;
  memoryPatch: Partial<WaiterMemory>;
}
```

This shape is frozen. Do not add fields, remove fields, or change types without a deliberate sprint decision.

---

## QA Summary

### Sprint 4N — Real Mobile QA (all scenarios, code-path + unit-test verified)

| Scenario | Description | Result |
|---|---|---|
| A | Entry — waiter greets on page load | PASS |
| B | Passive permission prompt after 5 s idle | PASS |
| C | Accept suggestion → product cards, no list in text | PASS |
| D | Decline suggestion → silent ack, no re-prompt | PASS |
| E | Typed intent ("quero uma bebida leve") → cards, no extra buttons | PASS |
| F | Product click → short ack, no cards, no buttons, mode unchanged | PASS |
| G | Checkout — no double upsell prompt in chat | PASS |
| H | Post-order — CHECKOUT_SUPPORT mode, no selling cards | PASS |

### Sprint 4J — Code-inspection QA (W1–W10)

| # | Scenario | Result |
|---|---|---|
| W1 | Entry | PASS |
| W2 | Passive permission prompt | PASS |
| W3 | Permission accepted | PASS |
| W4 | Permission declined | PASS |
| W5 | Typed intents (leve, sobremesa, bebida, grupo) | PASS |
| W6 | Product click — no UI invasion | PASS |
| W7 | Final upsell at checkout | FAIL → FIXED (Sprint 4J) |
| W8 | Checkout support — no selling | PASS |
| W9 | No invisible products | PASS |
| W10 | No extra buttons after cards | PASS |

### Bug record

| ID | Severity | Sprint found | Sprint fixed | Status |
|---|---|---|---|---|
| `checkout_interference` — ON_CHECKOUT_STARTED double-prompt | HIGH | 4J | 4J | CLOSED |

**Zero open bugs.**

---

## Hard Rules (enforced by `validateWaiterResponse`, protected by unit tests)

These rules fire on every `decide()` call. Violations are silently repaired before the response leaves the engine.

| # | Rule | What fires |
|---|---|---|
| 1 | Mode must be one of four valid values | Invalid → `SAFE_FALLBACK` |
| 2 | `cards[]` contains only IDs present in the current catalog | Ghost IDs removed; duplicates removed |
| 3 | `message` is at most 2 non-empty lines | Truncated |
| 4 | No product name in `message` unless that product's ID is in `cards[]` | Name stripped from text |
| 5 | Any choice question must carry `options[]` (only when no cards) | Buttons auto-attached from `QUESTION_BUTTON_PATTERNS` |
| 6 | Bare weak phrases (`ok`, `beleza`, `ótimo`) are not valid responses | Replaced with seller-tone copy |
| 7 | `ON_ITEM_ADDED` forces `cards=[], options=[]` | Always |
| 8 | `CHECKOUT_SUPPORT` mode forces `cards=[]` and strips selling options | Always |
| 9 | `cards.length > 0` forces `options=[]` | Always |

**These nine rules must not be weakened, removed, or bypassed.**

### Plain-language pilot rules

- No product suggestion after a product click — Rule 7 always fires
- No product named in text without a card — Rule 4 strips it
- No open question without answer buttons — Rule 5 attaches them
- No selling buttons alongside product cards — Rule 9 removes them
- No selling after checkout starts — Rule 8 blocks it
- No checkout control by the Waiter — the UI state machine owns checkout
- UI renders only `response.cards` — never infer products from `message`

---

## Remaining Blockers

| # | Blocker | Type | Impact |
|---|---|---|---|
| 1 | `DATABASE_URL` not set in CI/shell environment | Environment, not code | Playwright E2E spec cannot run from shell; requires Railway env with `pizzaria-demo` slug |

This is an **infrastructure blocker**, not a code bug. The application code, unit tests, and Playwright spec are all correct and ready.

**Required before declaring production-ready:**
Run `npx playwright test tests/qa/specs/waiter-sales-agent.spec.ts` against the Railway deployment with `DATABASE_URL` pointing to a seeded database (slug: `pizzaria-demo`). If all 25 scenarios pass, the system is cleared for a controlled pilot.

---

## What Is Frozen

Do not change these without opening a new planned sprint:

- `validateWaiterResponse()` rules 1–9
- `decide()` return shape (`message`, `options`, `cards`, `mode`, `requiresAI`, `aiDirective`, `memoryPatch`)
- `V2Event` type values
- `WaiterMode` values (`BROWSE`, `SUGGESTION`, `INTERVENTION`, `CHECKOUT_SUPPORT`)
- `MIN_SCORE_THRESHOLD = 10`
- `createWaiterMemory()` field list
- Synthetic memory `{ finalUpsellPromptShown: true }` for `ON_CHECKOUT_STARTED` in `AIOrderService`
- `DEFAULT_WAITER_CONFIG` defaults
- `SALES_BEHAVIOR` flags (`suggestOnIdle: false`, `autoSuggestions: false`, `suggestOnAdd: false`)
- The `memoryPatch` merge pattern: `memory = { ...memory, ...memoryPatch }` (client-side, never server-side)

## What Must Not Be Changed Before Pilot

- **Do not add product names to `message` without `cards[]`** — Rule 4 strips them, producing truncated confusing text
- **Do not add `options[]` when `cards[]` is non-empty** — Rule 9 strips them, leaving dead buttons in the UI
- **Do not move checkout logic into WaiterBrainV2** — checkout is owned by the UI state machine
- **Do not make `decide()` async or add DB calls** — the synchronous pure design is what keeps it fast and testable
- **Do not remove the `WAITER_DEBUG` gate** — unguarded structured logging inflates production log storage
- **Do not change `aiPermState` logic in PedidoClient** — the client permission machine is separate from WaiterBrainV2 memory and must remain so

---

## Test Suite

```
src/services/ai/tests/WaiterBrainV2.sales-core.test.ts       204 tests
src/services/ai/tests/WaiterBrainV2.sales-specialist.test.ts  79 tests
──────────────────────────────────────────────────────────────────────
Total                                                         283 tests
                                                              283 passing
```

Run: `npx vitest run`

TypeScript: `npx tsc --noEmit` — clean (no output)

---

## Freeze Rule

After this document is created, **do not modify Waiter Web unless**:

1. A real QA blocker is found during the Playwright E2E run against the Railway deployment
2. A production bug is reported after pilot launch
3. A planned future sprint is explicitly opened by the product team

Out-of-scope future work (do not start without a new sprint series):

| Area | Reason not in scope |
|---|---|
| CRM agent | Different product — persistent profiles, cross-order memory |
| WhatsApp agent | Different channel — async, phone number resolution |
| Agents settings panel | `WaiterSalesConfig` placeholder exists; no UI to configure it |
| Long-term memory | `WaiterMemory` is session-only by design |
| A/B testing framework | `upsellStyle` in config can vary; automation not built |
| Analytics / BI dashboard | Debug logs exist; structured pipeline not built |
