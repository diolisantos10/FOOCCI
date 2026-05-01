# Foocci Waiter Web — Final Handoff

> **Version:** Sprint 4L (freeze)
> **Status:** Ready for Pilot QA
> **Sprints covered:** 4A – 4K
> **Architecture ref:** [waiter-web-architecture.md](./waiter-web-architecture.md)
> **QA script:** [waiter-web-manual-qa.md](./waiter-web-manual-qa.md)

---

## What was built (Sprints 4A–4K)

The Sales Specialist Agent is a pure, stateless decision engine embedded inside WaiterBrainV2. It replaces all heuristic "upsell selectors" from pre-4A with a fully scored, intent-aware, restaurant-agnostic system.

| Sprint | What shipped |
|---|---|
| 4A | Sales Specialist Core — `analyzeSalesContext`, `analyzeCart`, `analyzeMenu`, `analyzeMenuProfile`, `chooseSalesStrategy`, `analyzeSalesSituation` |
| 4B | Connected core to real web events — `handleUserMessage` routes through Sales Intelligence; all 9 old selectors replaced |
| 4C | Smart Product Selection Engine — `scoreProductForIntent`, `rankProducts`, `MIN_SCORE_THRESHOLD = 10`, -15 penalty for already-suggested IDs |
| 4D | Commercial Response Builder — `buildCommercialResponse`, `INTENT_COPY` map, `validateWaiterResponse` Rule 9 (cards → options = []) |
| 4E | Session Memory — `WaiterMemory`, `createWaiterMemory`, `memoryPatch` pattern, permission cooldown, promptCount cap |
| 4F | Final Upsell at Checkout — `handleCheckoutStarted` checks catalog availability before prompting; `see_final_suggestions` path routes by cart gap |
| 4G | Config Placeholder — `WaiterSalesConfig`, `DEFAULT_WAITER_CONFIG`, `COOLDOWN_BY_LEVEL`, `SUBTLE_COPY` / `AGGRESSIVE_COPY`, `getCopy()` |
| 4H | Observability — `waiterLog()` gated on `WAITER_DEBUG=true`; logs decision, product selection, validation diffs, no-op reasons |
| 4I | Test suite — 79 specialist tests + 204 core tests = **283 passing unit tests** |
| 4J | QA + bug fix — `ON_CHECKOUT_STARTED` double-prompt fixed; `data-testid` attributes added to waiter UI elements; Playwright spec written |
| 4K | No additional bugs reported |

---

## Architecture (frozen)

### Ownership boundaries

```
┌─────────────────────────────────────────────────────────────────┐
│  UI / PedidoClient.tsx                                          │
│  ─────────────────────────────────────────────────────          │
│  • Renders menu, cart, checkout                                 │
│  • Works without the Waiter (fully functional standalone)       │
│  • Owns: stage machine, cart state, delivery/payment flow       │
│  • Passive permission prompt (client-side, 5s idle timer)       │
│  • Checkout upsell gate (drink → dessert permission prompts)    │
│                                                                 │
│           fires events ↓          receives output ↑            │
│                                                                 │
│  API /api/pedido/[slug]  →  AIOrderService.runWebTurn()         │
│                               └─ WaiterBrainV2.decide()         │
│                                                                 │
│  Waiter / WaiterBrainV2.ts                                      │
│  ─────────────────────────────────────────────────────          │
│  • Pure function: decide(V2Input) → V2Output                    │
│  • Owns: sales intelligence, product ranking, copy generation   │
│  • Reads: catalog, cartItemIds, message, event                  │
│  • Returns: message, options, cards, mode                       │
│  • Never controls checkout, never writes to cart                │
│                                                                 │
│  Menu (Prisma / DB)                                             │
│  ─────────────────────────────────────────────────────          │
│  • Source of truth for product IDs, names, prices, categories   │
│  • Waiter reads catalog on every turn; never caches locally     │
└─────────────────────────────────────────────────────────────────┘
```

### Event flow

| UI Event | WaiterBrainV2 handler | What returns |
|---|---|---|
| `ON_ENTRY` | `handleEntry` | Welcome message, mode BROWSE |
| `ON_MENU_MODE` | `handleMenuMode` | Passive acknowledgement |
| `ON_ITEM_ADDED` | `handleItemAdded` | Short ack, **cards=[], options=[]** |
| `ON_CART_UPDATED` | `handleCartUpdated` | Drink/upgrade suggestion cards |
| `ON_IDLE` | `handleIdle` | Permission prompt (gated by config) |
| `ON_USER_MESSAGE` | `handleUserMessage` | Intent-routed cards or qualification buttons |
| `ON_CHECKOUT_STARTED` | `handleCheckoutStarted` | Checkout bridge message, mode CHECKOUT_SUPPORT |
| `AFTER_CHECKOUT` | `handleAfterCheckout` | AI directive for post-order support only |
| `ON_PERMISSION_ACCEPT` | `handlePermissionAccepted` | Qualification buttons or recommendation cards |
| `ON_PERMISSION_DECLINED` | `handlePermissionDeclined` | Silent acknowledgement |

---

## Response contract (frozen)

Every `decide()` call returns exactly:

```typescript
{
  message:     string;           // ≤ 2 non-empty lines; never lists product names
  options:     WaiterOption[];   // [] when cards.length > 0 (Rule 9)
  cards:       string[];         // valid catalog IDs only; [] when mode = CHECKOUT_SUPPORT
  mode:        WaiterMode;       // "BROWSE" | "SUGGESTION" | "INTERVENTION" | "CHECKOUT_SUPPORT"
  requiresAI:  boolean;          // true → caller runs OpenAI pipeline
  aiDirective: string;           // injected into system prompt for AI events
  memoryPatch: Partial<WaiterMemory>; // client merges: memory = { ...memory, ...memoryPatch }
}
```

**`WaiterOption`:** `{ label: string; value: string }` — `label` is shown to user, `value` is sent to API.

---

## Hard rules (must not be broken)

These are enforced by `validateWaiterResponse()` and protected by unit tests. Any handler that violates them is silently repaired before the response leaves the engine.

| # | Rule | Enforcement |
|---|---|---|
| 1 | Mode must be one of four valid values | Invalid → `SAFE_FALLBACK` |
| 2 | `cards[]` contains only IDs present in the current catalog | Ghost IDs removed; duplicates removed |
| 3 | `message` is at most 2 non-empty lines | Truncated |
| 4 | No product name in `message` unless that product's ID is in `cards[]` | Name stripped from text |
| 5 | Any choice question must carry `options[]` (only when no cards) | Buttons auto-attached from `QUESTION_BUTTON_PATTERNS` |
| 6 | Bare weak phrases (`ok`, `beleza`, `ótimo`) are not valid responses | Replaced with seller-tone copy |
| 7 | `ON_ITEM_ADDED` forces `cards=[], options=[]` | Always |
| 8 | `CHECKOUT_SUPPORT` mode forces `cards=[]` and strips selling options | Always |
| 9 | `cards.length > 0` forces `options=[]` | Always — no confirmation buttons alongside product cards |

---

## Key design decisions (do not reverse casually)

### Cards-only product presentation
Products are **always** shown via `cards[]` UI cards, never listed in text. Rule 4 + Rule 9 enforce this. If you add a handler that names a product in `message` without including its ID in `cards[]`, Rule 4 will strip the name.

### Pure stateless decide()
`WaiterBrainV2.decide()` has no side effects and no database calls. All catalog data flows in via `V2Input.catalog`. All memory is owned by the client and passed in via `V2Input.memory`. This makes the engine fully testable.

### memoryPatch pattern
`decide()` returns `memoryPatch: Partial<WaiterMemory>`. The client applies it as:
```typescript
memory = { ...memory, ...memoryPatch };
```
Never store memory server-side. If you need cross-session memory, that is a different (future) system.

### ON_CHECKOUT_STARTED synthetic memory
`AIOrderService` passes `{ finalUpsellPromptShown: true }` for `ON_CHECKOUT_STARTED`. This is intentional — the client fires this event only after its own upsell permission gates are resolved, so WaiterBrainV2 must not re-show the prompt. Do not remove this.

### Permission gate in the client
The passive permission prompt (`aiPermState === "pending"`) and checkout permission prompt (`aiPermState === "checkout-prompt"`) are **client-side state**, not WaiterBrainV2 state. WaiterBrainV2's `handleIdle()` is gated by `SALES_BEHAVIOR.suggestOnIdle = false` and is not currently called. The client's permission logic is separate and runs independently.

---

## Component map

### `src/services/ai/WaiterBrainV2.ts`

| Export | Purpose |
|---|---|
| `decide(V2Input): V2Output` | Main entry point — call this for every event |
| `validateWaiterResponse(output, catalog, event)` | 9-rule quality gate — runs inside `decide()`, also exported for direct testing |
| `analyzeSalesContext(input)` | Intent + opportunity classifier |
| `analyzeCart(cartItemIds, catalog)` | Cart composition analysis |
| `analyzeMenu(menuItems)` | Full menu semantic bucketing |
| `analyzeMenuProfile(menuItems)` | Cuisine signals + menu shape |
| `analyzeSalesSituation(input)` | Combined intent + menu + cart + strategy |
| `scoreProductForIntent(item, intent, ctx)` | Numeric score for one product against one intent |
| `rankProducts(catalog, intent, cartItemIds, limit, alreadySuggested?)` | Top-N product IDs for an intent |
| `buildCommercialResponse(params, config?)` | Seller-tone message + cards builder |
| `buildWaiterResponse(strategy, products)` | Legacy strategy-based response builder (used by older handlers) |
| `analyzeMenuItem(item, benchmarks)` | Tag a single menu item |
| `createWaiterMemory()` | Blank `WaiterMemory` for a new session |
| `DEFAULT_WAITER_CONFIG` | Default config (medium/balanced/traditional) |
| **Types** | `V2Input`, `V2Output`, `V2Event`, `V2CatalogItem`, `WaiterMemory`, `WaiterSalesConfig`, `CustomerIntent`, `SalesOpportunity`, `ScoreContext`, `TaggedItem`, `PriceBenchmarks`, `CartAnalysis`, `MenuProfile`, `MenuAnalysis` |

### `src/services/ai/AIOrderService.ts`

Calls `WaiterBrainV2.decide()` on every turn. Non-AI events return immediately without an OpenAI call. AI events (when `v2.requiresAI = true`) continue to the full GPT pipeline.

### `src/app/pedido/[slug]/PedidoClient.tsx`

Client-side host. Owns the passive permission state machine (`aiPermState`), the idle timer, the checkout upsell gate, and the `suggestedProducts` grid. Sends events to `/api/pedido/[slug]` and renders the Waiter output.

### `src/app/api/pedido/[slug]/route.ts`

Public REST API. Fetches the flat catalog from DB, calls `AIOrderService.runWebTurn()`, returns `{ reply, cards, mode, options }`.

---

## Test suite (283 tests, all passing)

```
src/services/ai/tests/WaiterBrainV2.sales-core.test.ts     204 tests
src/services/ai/tests/WaiterBrainV2.sales-specialist.test.ts 79 tests
─────────────────────────────────────────────────────────────────────
Total                                                        283 tests
```

Run: `npx vitest run`

### E2E Playwright spec
`tests/qa/specs/waiter-sales-agent.spec.ts` — 10 test groups, 25 scenarios.
Requires: `DATABASE_URL` pointing to seeded DB (slug: `pizzaria-demo`) + dev server running.
Run: `npx playwright test tests/qa/specs/waiter-sales-agent.spec.ts`

---

## Debug observability

Enable with `WAITER_DEBUG=true` (never set in production).

Log types emitted to server `console.log`:

| Type | When |
|---|---|
| `waiter_decision` | Every `decide()` call — event, mode, intent, cards, options, cartSummary, configUsed |
| `waiter_product_selection` | Every `rankProducts()` call — selected IDs + rejected IDs with reasons |
| `waiter_validation_fix` | When `validateWaiterResponse` modifies the output — before/after diff + rule that fired |
| `waiter_noop` | When response is silent — reason (cooldown_active, prompt_count_exceeded, etc.) |

---

## QA status

### Sprint 4J code-inspection QA

| Scenario | Result |
|---|---|
| W1 Entry | PASS |
| W2 Passive permission prompt | PASS |
| W3 Permission accepted | PASS |
| W4 Permission declined | PASS |
| W5 Typed intents (leve, sobremesa, bebida, grupo) | PASS |
| W6 Product click — no UI invasion | PASS |
| W7 Final upsell at checkout | **FAIL → FIXED** in Sprint 4K |
| W8 Checkout support — no selling | PASS |
| W9 No invisible products | PASS |
| W10 No extra buttons after cards | PASS |

### Bug fixed (Sprint 4K)

**`checkout_interference` — ON_CHECKOUT_STARTED double-prompt**

- Root cause: `AIOrderService` called `WaiterBrainV2.decide()` with no `memory` for `ON_CHECKOUT_STARTED`. Without memory, `finalUpsellPromptShown` was null → WaiterBrainV2 re-triggered the checkout upsell even though the client had already shown it.
- Fix: Synthetic memory `{ finalUpsellPromptShown: true }` passed for `ON_CHECKOUT_STARTED`. Client fires this event only after its own upsell gates are resolved.
- File: `src/services/ai/AIOrderService.ts`

### Remaining testing requirement

Full E2E Playwright run against a live server is still needed. The spec is written and ready (`tests/qa/specs/waiter-sales-agent.spec.ts`). It requires `DATABASE_URL` + seeded restaurant.

---

## What is frozen

These must not change without a deliberate sprint decision:

- `validateWaiterResponse()` rules 1–9
- `decide()` return shape (`message`, `options`, `cards`, `mode`, `requiresAI`, `aiDirective`, `memoryPatch`)
- `V2Event` type values
- `WaiterMode` values (`BROWSE`, `SUGGESTION`, `INTERVENTION`, `CHECKOUT_SUPPORT`)
- `MIN_SCORE_THRESHOLD = 10`
- `createWaiterMemory()` field list
- The synthetic memory for `ON_CHECKOUT_STARTED` in AIOrderService
- `DEFAULT_WAITER_CONFIG` defaults

---

## What must not be changed casually

- **Do not add product names to `message` without `cards[]`** — Rule 4 will strip them, producing confusing truncated text.
- **Do not add `options[]` when `cards[]` is non-empty** — Rule 9 will strip them, and the UI would show dead buttons.
- **Do not move checkout logic into WaiterBrainV2** — checkout is owned by the UI state machine. WaiterBrainV2 must remain a pure read-only advisor.
- **Do not make `decide()` async or add DB calls** — the pure synchronous design is what keeps it fast, testable, and cost-free for non-AI events.
- **Do not remove the `WAITER_DEBUG` gate** — even if `console.log` looks harmless, verbose structured logging in production inflates log storage and adds latency.

---

## Out of current scope (future work)

The following are **explicitly not part of the frozen Waiter Web architecture**. They require separate planning and a new sprint series.

| Future area | Why it's out of scope |
|---|---|
| **CRM agent** | Different product — persistent customer profiles, cross-order memory |
| **WhatsApp agent** | Different channel — message threading, async, phone number resolution |
| **Agents settings panel** | `WaiterSalesConfig` exists as a placeholder; no UI to configure it yet |
| **Long-term memory** | `WaiterMemory` is session-only by design; cross-session memory needs a DB schema |
| **Marketplace integrations** | No multi-vendor or iFood-style aggregation in current scope |
| **Payment provider expansion** | Cart and payment are UI-owned; not a Waiter concern |
| **A/B testing framework** | `upsellStyle` in config can vary per restaurant; automation not built |
| **Analytics / BI dashboard** | Debug logs exist; structured analytics pipeline not built |

---

## Final recommendation

**READY FOR FINAL QA**

All five blocking criteria from the QA spec pass:

1. No product mismatch — Rule 4 + 283 unit tests
2. No open questions without buttons — QUESTION_BUTTON_PATTERNS + Rule 5
3. Product click does not change UI — Rule 7 always enforced
4. No checkout interference — double-prompt bug fixed (Sprint 4K)
5. No invisible product suggestions — Rule 4 always enforced

Next step: run the Playwright E2E spec against a live staging environment with a real restaurant menu. If all 25 scenarios pass, the system is ready for a controlled pilot with real customers.
