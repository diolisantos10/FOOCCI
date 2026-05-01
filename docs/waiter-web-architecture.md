# Foocci Waiter Web — Architecture Reference

> **Version:** Sprint 3J (finalized)
> **Status:** Production

---

## Overview

Foocci Web is a digital ordering experience composed of two independent systems that work together:

- **The UI** is the ordering machine. It owns the menu display, cart, and checkout. It works without the Waiter.
- **The Waiter** is the sales intelligence layer. It reads the menu, observes the customer, and returns suggestions. It never controls the UI.

The menu is the Waiter's primary input. The checkout belongs exclusively to the UI. The customer is always in control.

---

## Core Principles

| Principle | What it means |
|---|---|
| **Foocci is not a chatbot** | The Waiter responds to UI events, not to a conversation thread. It does not lead the session. |
| **The UI works without the Waiter** | Menu, cart, and checkout function independently. The Waiter is additive, never structural. |
| **The Waiter works inside the UI** | The Waiter's output (message, options, cards) is rendered by the UI. The Waiter has no UI of its own. |
| **The Waiter does not control checkout** | Once `Finalizar Pedido` is tapped, checkout is entirely owned by the UI state machine. |
| **The menu is the Waiter input** | All product selection is derived from the live catalog. The Waiter never invents items or prices. |
| **The Waiter sells through cards** | Products are shown as tappable UI cards. Product names are never listed in chat text. |
| **The customer remains in control** | Suggestions require explicit permission (passive browsing) or explicit request (typed message). |
| **Questions must use buttons** | Any question that requires a choice must carry `options[]`. The customer should never need to type a choice. |
| **Cards must match messages** | If the Waiter mentions or implies a product, that product ID must appear in `cards[]`. |

---

## System Pieces

### A) UI / Digital Menu — `PedidoClient.tsx`

The UI is the primary surface. It owns:

- Menu display (categories, product grid, product modal)
- Category navigation and tab state
- Cart state (add, remove, increment, decrement)
- Passive permission prompt (asks before engaging)
- Checkout flow: delivery/pickup → address → name → payment → review → confirm
- Checkout UI panels (rendered deterministically — no AI involved)
- Cart bar and cart drawer
- Promotion banners

The UI renders the Waiter's output but does not depend on it. If the Waiter returns an empty response, the menu remains fully functional.

---

### B) WaiterBrainV2 — `src/services/ai/WaiterBrainV2.ts`

The Waiter is a pure, deterministic function:

```
decide(V2Input) → V2Output
```

It is responsible for:

- Interpreting customer intent from free-text messages (`analyzeSalesContext`)
- Profiling the menu catalog to understand what the restaurant sells (`analyzeMenuProfile`)
- Analyzing cart state to detect what is missing (`analyzeCart`)
- Choosing a sales strategy based on intent × menu × cart (`chooseSalesStrategy`)
- Building a normalized response with the correct product IDs (`buildWaiterResponse`)
- Validating every response before it leaves `decide()` (`validateWaiterResponse`)

The Waiter has no database access, no session state, and no side effects. Every call is stateless.

---

### C) Menu Catalog — `V2CatalogItem[]`

The catalog is the Waiter's source of truth. It is fetched once per request from the database and passed into `decide()` as a flat array.

Each item carries:

```typescript
{
  id:           string;   // primary key — used in cards[]
  name:         string;
  categoryName: string;   // used for drink/dessert/main classification
  price:        number;
  sortOrder?:   number;   // lower = shown first
  description?: string | null;
}
```

The Waiter never returns a product ID that is not present in this catalog. The `validateWaiterResponse` guard (rule 2) enforces this by filtering ghost IDs before the response leaves the system.

---

### D) Checkout — `PedidoClient.tsx` stage machine

Checkout is a client-side state machine with these stages:

```
BROWSE → DELIVERY_TYPE → ADDRESS_INPUT → ADDRESS_DETAILS →
ADDRESS_CONFIRM → ASK_NAME → PAYMENT → PAYMENT_METHOD →
REVIEW_ORDER → DONE
```

Every stage transition is deterministic. All prompts at checkout stages are hardcoded constants — the AI is never called. The Waiter returns `mode: CHECKOUT_SUPPORT` when checkout is active, which blocks all product cards and strips selling options.

---

## Response Contract

Every Waiter response — for every event, from every handler — conforms to this shape:

```typescript
{
  message:  string;                                          // ≤ 2 lines of text
  options:  Array<{ label: string; value: string }>;        // quick-reply buttons
  cards:    string[];                                        // product IDs to render
  mode:     "BROWSE" | "SUGGESTION" | "INTERVENTION" | "CHECKOUT_SUPPORT";
}
```

### Field definitions

| Field | Description |
|---|---|
| `message` | Short text shown in the chat bubble. Maximum 2 non-empty lines. Never lists product names (those belong in `cards`). Empty string is valid when the Waiter has nothing to say. |
| `options` | Tappable quick-reply buttons. When `message` contains a choice question, `options` must be non-empty. The customer should never need to type a structural reply. |
| `cards` | Ordered list of product IDs from the catalog. The UI resolves these IDs to full `MenuItem` objects and renders them as product cards. Never contains duplicate or ghost IDs. |
| `mode` | Controls how the UI renders the product area and how assertively it presents the response. See Modes section. |

The contract also carries two internal fields used only by the API pipeline:

| Field | Description |
|---|---|
| `requiresAI` | When `true`, the API routes the turn through the OpenAI pipeline before returning to the client. |
| `aiDirective` | Injected into the system prompt when `requiresAI` is `true`. Scopes the AI's behavior for this specific turn. |

---

## Official Modes

### `BROWSE`
The default state. The menu is the primary surface. The Waiter is observing but not actively selling. Product cards are not shown unless explicitly requested. Used for entry, idle, item-added, and menu-mode events.

### `SUGGESTION`
The customer requested help (typed a message, clicked a qualification button, or accepted a passive suggestion). The Waiter returns product cards relevant to the request. Cards replace the current category grid in the product area. The customer can dismiss them with "← Voltar ao cardápio".

### `INTERVENTION`
The customer accepted a proactive permission prompt ("Quero sugestão ✨"). The Waiter may return a focused suggestion grid with a stronger call to action. Used when the customer explicitly invites engagement.

### `CHECKOUT_SUPPORT`
Checkout is active. The Waiter may answer logistics questions but must not suggest products. `cards` is always `[]` in this mode. Selling options are stripped by `validateWaiterResponse` rule 8 before the response reaches the client.

---

## Event Flow

```
Customer action
    ↓
UI emits event + payload
    ↓
POST /api/pedido/[slug] { event, catalog, cart, message, ... }
    ↓
WaiterBrainV2.decide(V2Input)
    ↓
validateWaiterResponse(raw, catalog, event)
    ↓
V2Output { message, options, cards, mode }
    ↓  (if requiresAI: true → OpenAI pipeline runs first)
API returns { reply, cards, options, mode }
    ↓
UI renders:
  • chat bubble    ← message
  • quick buttons  ← options
  • product area   ← cards (resolved to MenuItem[])
  • behavior flag  ← mode
```

### Events

| Event | Trigger | Waiter behavior |
|---|---|---|
| `ON_ENTRY` | Customer opens the ordering page | Welcome message, `cards: []`, `mode: BROWSE` |
| `ON_USER_MESSAGE` | Customer sends a free-text message | Intent classification → deterministic card selection or AI pipeline |
| `ON_ITEM_ADDED` | Customer adds an item to cart | Short acknowledgment, `cards: []`, `options: []` — no selling |
| `ON_CART_UPDATED` | Cart reaches 2+ items | Offer missing drink or upgrade; `mode: SUGGESTION` if cards found |
| `ON_IDLE` | Customer inactive for 45 s | Top-seller cards (`suggestOnIdle` currently disabled) |
| `ON_PERMISSION_ACCEPT` | Customer clicks "Quero sugestão ✨" | Intervention-mode AI call with focused suggestion directive |
| `ON_PERMISSION_DECLINED` | Customer clicks "Prefiro continuar" | Silent mode for 5 minutes; no further prompts |
| `ON_CHECKOUT_STARTED` | Customer taps "Finalizar Pedido" | Bridge message, `mode: CHECKOUT_SUPPORT`, `cards: []` |
| `AFTER_CHECKOUT` | Order confirmed or checkout stages active | Logistics-only directive; product suggestions blocked |

> **Note on ON_PERMISSION_DECLINED**: This event is handled entirely within the UI (`handlePermissionDecline`) — it sets `aiPermState: "silent"` and pushes a local acknowledgment. No API call is made.

---

## validateWaiterResponse — Guard Rules

Every response passes through `validateWaiterResponse` before leaving `decide()`. Rules are applied in order:

| # | Rule | Action |
|---|---|---|
| 1 | Mode must be a known `WaiterMode` value | Return `SAFE_FALLBACK` if invalid |
| 2 | Deduplicate `cards[]`; remove IDs not in catalog | Filter in place |
| 3 | Truncate `message` to max 2 non-empty lines | Slice |
| 4 | Product name in `message` without matching card ID | Strip the name from the message text |
| 5 | Choice question in `message` with no `options[]` | Attach matching buttons automatically |
| 6 | Bare weak phrase (`"ok"`, `"legal"`, `"beleza"`) | Replace with seller-tone equivalent |
| 7 | Event is `ON_ITEM_ADDED` | Force `cards: []`, `options: []` |
| 8 | Mode is `CHECKOUT_SUPPORT` | Force `cards: []`; strip selling options |

If the guard throws, `SAFE_FALLBACK` is returned:
```
"Perfeito 😊 fico por aqui se precisar de ajuda."
```

---

## Hard Rules

These invariants must never be violated by any change to the codebase:

1. **No invisible products** — A product name that appears in `message` must have its ID in `cards[]`. The validator enforces this; the UI never renders a product that the Waiter did not explicitly include.

2. **No open questions without buttons** — Any `message` containing a choice question must include `options[]`. The customer should never need to type a structural answer ("leve", "completo", "sim", "não").

3. **No product cards after item click** — `ON_ITEM_ADDED` always returns `cards: []` and `options: []`. The UI never interrupts an item-add with a suggestion grid.

4. **No checkout control by AI** — The AI has no access to checkout stage transitions. All checkout messages are hardcoded constants in `CHECKOUT_ENTRY_PROMPT`. The AI may only answer logistics questions post-checkout via the `AFTER_CHECKOUT` event.

5. **No text-match fallback** — The UI never infers product suggestions from chat text. The only source of product IDs is `response.cards`.

6. **No competing recommendation engines** — There is one path for product selection: `WaiterBrainV2.decide()`. No client-side catalog scanning, no `guidedMode` product injection, no parallel suggestion engine.

7. **No random product fallback** — If no suitable products are found, the Waiter asks a clarifying question with buttons (`noCardsFound()`) or stays quiet. It never returns random items.

8. **No duplicate suggestion systems** — `suggestedProducts` state is populated exclusively from `response.cards`. Previous suggestions are cleared when a new response arrives with `cards: []`.

---

## Manual QA Checklist

Use this checklist to verify the Waiter Web flow in a real browser session:

- [ ] **Entry** — Page loads, welcome message appears in chat, product grid shows first category. No "Me sugere algo" button visible.
- [ ] **Passive permission prompt** — After ~5 s of idle browsing, a prompt appears: "Posso te sugerir algo…" with "Quero sugestão ✨" and "Prefiro continuar" buttons.
- [ ] **Permission accepted** — Clicking "Quero sugestão ✨" sends `ON_USER_MESSAGE` → response is either qualification buttons (Leve/Completo) or product cards. No suggestion grid appears without WaiterBrainV2 response.
- [ ] **Permission declined** — Clicking "Prefiro continuar" dismisses the prompt. No new prompt appears for at least 5 minutes.
- [ ] **Typed request** — Typing "quero sobremesa" returns dessert cards in the product area. Chat bubble appears above the cards.
- [ ] **Cards match message** — If the chat message references a category ("sobremesas"), the cards shown are from that category. No mismatch between text and grid.
- [ ] **Product click** — Clicking "+" on any product updates the cart badge. No suggestion grid opens. No category tab changes. No new chat message from the Waiter.
- [ ] **New response clears old cards** — After seeing product cards, typing a clarifying message that returns no cards (e.g. "não sei") dismisses the card grid. Old cards do not persist.
- [ ] **Questions show buttons** — Any Waiter message ending with a choice ("Prefere algo mais leve ou completo?") has visible tap buttons below it. The customer does not need to type.
- [ ] **Checkout has no product suggestions** — After tapping "Finalizar Pedido" and proceeding to the DELIVERY_TYPE panel, no product cards appear in any part of the UI.
- [ ] **Checkout is unbroken** — Delivery/pickup → address → name → payment → payment method → review → "Confirmar pedido" completes the full flow deterministically.
- [ ] **Back to browse** — Clicking "← Voltar ao cardápio" from any checkout stage returns to the menu. No stale suggestions are visible; the Waiter sends a brief acknowledgment.

---

## File Map

```
src/
  app/
    pedido/[slug]/
      PedidoClient.tsx          — UI, cart, checkout, permission prompts, event emitter
      page.tsx                  — Server component; fetches restaurant + catalog props
    api/
      pedido/[slug]/
        route.ts                — POST handler; routes events to AIOrderService
  services/
    ai/
      WaiterBrainV2.ts          — Decision engine (decide, validate, strategy, helpers)
      AIOrderService.ts         — Orchestrator; calls WaiterBrainV2 then OpenAI if needed
      ConversationGuardrails.ts — isDessertCategory, isMainCategory helpers
      tests/
        WaiterBrainV2.sales-core.test.ts  — 67 unit tests (vitest)
docs/
  waiter-web-architecture.md    — this file
  ui-architecture-audit.md      — pre-sprint UI audit
```

---

## Design Boundaries (what the Waiter is not allowed to do)

| Not allowed | Reason |
|---|---|
| Set the checkout stage | Checkout is owned by the UI state machine |
| Add items to cart directly | The customer adds items; the Waiter only suggests |
| Say "adicionei" or "confirmei" | False agency — the Waiter suggests; it cannot act |
| Ask for personal data | The UI collects name, address, and phone |
| Call `confirm_order` | The Waiter has no authority over order confirmation |
| List products in message text | Products belong in `cards[]`, never in prose |
| Repeat a product already suggested | `validateWaiterResponse` and `ConversationGuardrails` prevent this |
| Suggest items outside the catalog | Card IDs are validated against the live catalog before response |
