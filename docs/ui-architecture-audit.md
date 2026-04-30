# FOOCCI — UI ARCHITECTURE AUDIT

---

## 1. FULL UI FLOW MAP

```
entryPhase: "identifying"
  └─ PhoneEntryCard shown (phone lookup)
      → onIdentified(name): entryPhase = "browsing"
      → onSkip():           entryPhase = "choosing"

entryPhase: "choosing"
  └─ Choice screen: "Quero um atendimento" / "Ver cardápio"
      → either choice: entryPhase = "browsing"

entryPhase: "browsing"
  └─ Main ordering UI (stage machine begins)

─────── STAGE MACHINE ────────────────────────────────────────────────────────

BROWSE  ←──────────────────────────────────────────────────────────── (handleBackToBrowse)
  │  [customer adds items, browses, chats]
  │
  ↓ handleFinalizeClick()
  │
  ├─ cart empty → inline message "Adicione pelo menos um item" (no stage change)
  │
  ├─ !hasDrink && !offeredDrink → stays BROWSE, emits AI upsell "drink"
  │
  ├─ drinkResolved && !hasDessert && !offeredDessert → stays BROWSE, emits AI upsell "dessert"
  │
  └─ all upsells resolved → computeResumeStage() picks entry point:

DELIVERY_TYPE  (buttons: Entrega / Retirada)
  ├─ "delivery"  → ADDRESS_INPUT (text input)
  └─ "pickup"    → ASK_NAME (if no name) or PAYMENT (if name known)

ADDRESS_INPUT  (text field → handleAddressInput)
  └─ valid → ADDRESS_DETAILS

ADDRESS_DETAILS  (text field → handleAddressDetails)
  └─ valid → ADDRESS_CONFIRM

ADDRESS_CONFIRM  (confirm button / edit button)
  ├─ confirm → ASK_NAME (if no name) or PAYMENT (if name known)
  └─ edit    → ADDRESS_INPUT (clears address)

ASK_NAME  (text field → handleNameInput)
  └─ valid name → PAYMENT

PAYMENT  (buttons: pay_now / pay_on_delivery / pay_on_pickup)
  ├─ pay_now         → REVIEW_ORDER
  └─ pay_on_delivery/pickup → PAYMENT_METHOD

PAYMENT_METHOD  (buttons: card_machine / pix_in_person / cash)
  └─ any → REVIEW_ORDER

REVIEW_ORDER  (confirm button → handleFinalConfirm)
  ├─ pay_now → POST /api/pedido/{slug}/finalize → PAYMENT_LINK (paymentUrl present)
  └─ others  → POST /api/pedido/{slug}/finalize → DONE

PAYMENT_LINK  (external payment link shown)
  └─ (no stage transition — user follows external link)

DONE  (order confirmed screen)
  └─ (chat still active; typed text → sendText with stage="DONE")
```

---

## 2. EVENT MAP (Real Events Only)

| Event | Trigger | Code Location | Notes |
|---|---|---|---|
| `ON_ENTRY` | entryPhase → "browsing" (once, via useEffect) | line 1238–1244 | Not silent — user bubble shows "Olá!" |
| `ON_ITEM_ADDED` | handleItemAdd(), newItemCount < 2 | line 1259–1263 | Passes lastAddedId. User bubble shows "Adicionar {name}" |
| `ON_CART_UPDATED` | handleItemAdd(), newItemCount ≥ 2 | line 1259–1263 | Passes lastAddedId. User bubble shows "Adicionar {name}" |
| `ON_USER_MESSAGE` (default) | handleSubmit() free text | line 1575 | Default event when no option passed |
| `ON_USER_MESSAGE` (default) | handleBackToBrowse() | line 1559 | Text = "Ver cardápio" — should be ON_MENU_MODE |
| `ON_USER_MESSAGE` (default) | handleFinalizeClick() drink upsell | line 1371 | Text = "Quero finalizar o pedido", upsellOffered="drink" |
| `ON_USER_MESSAGE` (default) | handleFinalizeClick() dessert upsell | line 1381 | Text = "Quero finalizar o pedido", upsellOffered="dessert" |
| `ON_USER_MESSAGE` (default) | handleVariantAdd() | line 1278 | No event option — same gap as handleItemAdd |

**Events defined in WaiterBrainV2 that are NEVER emitted:**
- `ON_MENU_MODE` — no trigger exists anywhere in the component
- `ON_IDLE` — no idle timer exists anywhere in the component
- `ON_CHECKOUT_STARTED` — handleFinalizeClick() never emits it
- `AFTER_CHECKOUT` — handleFinalConfirm() never emits it; post-DONE text hits ON_USER_MESSAGE

---

## 3. CURRENT AI BEHAVIOR

**AI is called:** Only via `sendText()`. All checkout stage transitions use `pushAssistantMessage()` — zero AI calls.

**AI is NOT called for:**
- Every `setStage()` in checkout (DELIVERY_TYPE onward)
- `handleDeliveryMethod()`, `handleAddressInput()`, `handleAddressDetails()`, `handleAddressConfirm()`, `handleNameInput()`, `handlePaymentMode()`, `handlePaymentMethodSub()`, `handleFinalConfirm()`
- Cart removal/quantity changes (no handler visible for these)

**Category intros** (`sendCategoryIntro`) make a **direct fetch()** call to the API — not via `sendText()`. They do not include an `event` field in the request body. In `route.ts`, the missing `event` field defaults to `"ON_USER_MESSAGE"` via destructuring default. They also do not read `cards` from the response — cards are silently discarded.

**V2 Short-circuit path works correctly:** When a non-AI event fires (ON_ENTRY, ON_ITEM_ADDED, ON_CART_UPDATED), `AIOrderService.runWebTurn()` calls `WaiterBrainV2.decide()` first. If `requiresAI === false`, it returns immediately — no OpenAI call, zero cost.

**Card rendering:** The `Bubble` component reads `msg.cards` (an array of product IDs), looks each up in `categories` flattened items, and renders a horizontal scrollable card strip. If `content.trim() === ""` and cards are present, no text bubble is shown (card-only response).

---

## 4. ISSUES FOUND

**Issue 1 — `handleVariantAdd` bypasses V2 event routing**
`handleVariantAdd()` calls `sendText()` without an event option, defaulting to `ON_USER_MESSAGE`. A variant addition (e.g., "Pizza Média — Frango") should emit `ON_ITEM_ADDED` or `ON_CART_UPDATED` exactly like `handleItemAdd()`. Currently, variant adds trigger the full AI pipeline with a "user message about food" directive instead of getting a complementary food/drink card.

**Issue 2 — `ON_MENU_MODE` is a dead event**
`WaiterBrainV2.handleMenuMode()` returns `"Perfeito 👌\nFica à vontade..."` but no code in the component ever emits `ON_MENU_MODE`. `handleBackToBrowse()` sends `"Ver cardápio"` as `ON_USER_MESSAGE` instead. The `WaiterBrainV2` handler is unreachable.

**Issue 3 — `ON_IDLE` is a dead event**
`WaiterBrainV2.handleIdle()` returns top-seller cards but no idle timer exists in the component. There is no `setTimeout`, no `useEffect` watching inactivity, no last-interaction timestamp. The best-seller card logic exists but can never fire.

**Issue 4 — `ON_CHECKOUT_STARTED` is a dead event**
`handleFinalizeClick()` never emits this event. After resolving upsells, it calls `setStage(resumeStage)` and `pushAssistantMessage(entryMsg)` — deterministic, no AI. The WaiterBrainV2 handler returns `"Perfeito 😊\nVamos finalizar rapidinho 👇"` but is unreachable.

**Issue 5 — `AFTER_CHECKOUT` is a dead event**
After `handleFinalConfirm()` succeeds, stage becomes `DONE` or `PAYMENT_LINK`. If the customer types a question (e.g., "Quando chega?"), `handleSubmit()` falls through to `default: sendText(text, cart, stage, activeUpsell)` — which sends `ON_USER_MESSAGE` with `stage="DONE"`. The AI gets no directive restricting it to logistics-only answers. The `AFTER_CHECKOUT` handler exists in WaiterBrainV2 but is never triggered.

**Issue 6 — `sendCategoryIntro` bypasses V2 entirely**
`sendCategoryIntro()` is a separate async function with its own `fetch()` call. It:
- Does not include `event` in the request body (API defaults to `ON_USER_MESSAGE`)
- Does not read `cards` from the response (discards them)
- Does not use the V2 directive system at all
- Keeps its own local `newHistory` state instead of updating component `history`

Cards from category intros are silently dropped. If WaiterBrainV2 adds a `suggest_upsell` call inside the AI path for this trigger, the card IDs will never reach the UI.

**Issue 7 — Upsell trigger path uses wrong event**
`handleFinalizeClick()` upsell arms call `sendText("Quero finalizar o pedido", cart, "BROWSE", "drink")` with no event. This sends `ON_USER_MESSAGE`, meaning WaiterBrainV2 receives a customer text message and applies the user-message directive. The AI path works by coincidence (upsellOffered is in the payload), but it is semantically misrouted — it will use the ON_USER_MESSAGE qualification logic instead of a dedicated upsell directive.

**Issue 8 — Text input remains active during checkout button stages**
During `PAYMENT` and `REVIEW_ORDER` stages, the text input is still mounted and functional. Any typed message falls through `handleSubmit()`'s `default` branch: `sendText(text, cart, stage="PAYMENT", activeUpsell)`. The AI receives `stage="PAYMENT"` with `ON_USER_MESSAGE` — there is no directive telling it to stay in checkout context. The AI could potentially confuse the customer with unrelated suggestions while they're in the payment flow.

---

## 5. CORRECT AI INTEGRATION POINTS

| Location | Correct Event | Current State |
|---|---|---|
| `useEffect` on entryPhase="browsing" | `ON_ENTRY` | ✅ Correct |
| `handleItemAdd()` — 1st item | `ON_ITEM_ADDED` with `lastAddedId` | ✅ Correct |
| `handleItemAdd()` — 2nd+ item | `ON_CART_UPDATED` with `lastAddedId` | ✅ Correct |
| `handleVariantAdd()` — 1st item total | `ON_ITEM_ADDED` with `lastAddedId: item.id` | ❌ Wrong (ON_USER_MESSAGE) |
| `handleVariantAdd()` — 2nd+ item total | `ON_CART_UPDATED` with `lastAddedId: item.id` | ❌ Wrong (ON_USER_MESSAGE) |
| `handleBackToBrowse()` | `ON_MENU_MODE` (silent, no user bubble) | ❌ Wrong (ON_USER_MESSAGE) |
| `handleSubmit()` when stage=DONE/PAYMENT_LINK | `AFTER_CHECKOUT` | ❌ Missing (ON_USER_MESSAGE) |
| Idle timer (does not exist yet) | `ON_IDLE` | ❌ Missing entirely |
| `sendCategoryIntro()` | Should use `sendText()` and read `cards` | ❌ Separate fetch, no cards |
| `handleFinalizeClick()` upsell arms | Acceptable as ON_USER_MESSAGE (upsellOffered in payload controls AI behavior) | ⚠️ Works by coincidence |

---

## 6. FORBIDDEN ZONES

These must NEVER receive AI control under any circumstance:

1. **`setStage()`** — stage machine is exclusively UI-driven; AI has no setter access
2. **`handleDeliveryMethod()`** — delivery/pickup choice is a button; AI cannot choose
3. **`handleAddressInput()` / `handleAddressDetails()` / `handleAddressConfirm()`** — address parsing is deterministic; AI is bypassed
4. **`handleNameInput()`** — name validation is deterministic; AI is bypassed
5. **`handlePaymentMode()` / `handlePaymentMethodSub()`** — payment choice is a button; AI cannot choose
6. **`handleFinalConfirm()`** — order confirmation is an explicit customer button; AI must never trigger finalize
7. **`pushAssistantMessage()` in checkout stages** — these are hardcoded strings; AI output must not appear in checkout flow
8. **`/api/pedido/{slug}/finalize`** — the finalize endpoint; AI has no path to call it
9. **Personal data collection** — name, address, phone, payment method are all UI-collected; the BASE_DIRECTIVE enforces this on the AI side

---

## 7. SUMMARY TABLE

| Component | Responsibility | AI Zone |
|---|---|---|
| `entryPhase` state machine | Phone ID → choice → browse | No — UI only |
| `stage` state machine (BROWSE only) | Menu browsing, item selection | **Yes** — AI drives conversation here |
| `stage` state machine (DELIVERY_TYPE → DONE) | Checkout data collection | No — fully deterministic, `pushAssistantMessage` only |
| `handleItemAdd` / `handleVariantAdd` | Cart mutations | Triggers AI events, never receives AI output |
| `handleFinalizeClick` upsell arms | Drink/dessert gate | Triggers AI with upsellOffered context |
| `sendCategoryIntro` | Category presentation | Currently bypasses V2; should be unified into `sendText` |
| `handleSubmit` default branch | Free-text chat | **Yes** — full ON_USER_MESSAGE AI path |
| `handleFinalConfirm` | Order confirmation | No — direct API call, no AI |
