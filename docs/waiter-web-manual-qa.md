# Foocci Waiter Web — Manual QA Script

> **Version:** Sprint 3L
> **Architecture ref:** [waiter-web-architecture.md](./waiter-web-architecture.md)

---

## Test Environment

Fill in before starting each session.

| Field | Value |
|---|---|
| **URL** | |
| **Device** | |
| **OS version** | |
| **Browser** | |
| **Restaurant / menu** | |
| **Date / time** | |
| **Tester** | |

> Tip: test on a real mobile device (iPhone or Android). The product grid, scroll, and card layout behave differently than on desktop.

---

## How to mark results

Each step gets one mark:

| Mark | Meaning |
|---|---|
| ✅ | Passed exactly as described |
| ❌ | Failed — note what happened |
| ⚠️ | Passed with a minor deviation — note it |
| — | Step not applicable to this test environment |

Add a **Notes** row below any ❌ or ⚠️ with a short description and a screenshot filename if available.

---

## Scenario 1 — Entry

**What this tests:** Menu opens immediately. Waiter is present but not intrusive.

| # | Step | Expected | Result |
|---|---|---|---|
| 1.1 | Open the ordering page (cold load — not a refresh) | Page loads, menu is visible without any blocking screen or choice prompt | |
| 1.2 | Read the first chat message from the Waiter | Welcome message appears (e.g. "Bem-vindo! 😊…"). No product cards visible yet | |
| 1.3 | Look for an "Me sugere algo" entry button | Button does NOT exist. There is no call-to-action forcing the user to request help before seeing the menu | |
| 1.4 | Scroll the product area | All category items are visible and tappable immediately | |

**Notes:**

---

## Scenario 2 — Passive User / Permission Prompt

**What this tests:** Waiter asks permission before engaging. No selling happens without consent.

| # | Step | Expected | Result |
|---|---|---|---|
| 2.1 | Arrive on the menu page. Do not type anything. Do not tap any product | — | |
| 2.2 | Wait approximately 5 seconds without interaction | A permission prompt appears in the chat: "Posso te sugerir algo que combine com o que você está vendo? 👇" | |
| 2.3 | Confirm both buttons are visible and tappable | "Quero sugestão ✨" and "Prefiro continuar" buttons render below the message | |
| 2.4 | Confirm no product cards appeared before the prompt | Product area still shows the category grid, not a suggestion grid | |
| 2.5 | Do not tap either button yet | Prompt remains visible; Waiter does not send any further messages automatically | |

**Notes:**

---

## Scenario 3 — Decline Help

**What this tests:** Waiter respects "no". Silent cooldown is applied. No products are pushed.

| # | Step | Expected | Result |
|---|---|---|---|
| 3.1 | From Scenario 2, tap "Prefiro continuar" | A short acknowledgment appears (e.g. "Perfeito 😊 fica à vontade…"). No product cards appear | |
| 3.2 | Continue browsing: scroll, tap categories, read items | Menu behaves normally. No suggestion grid opens | |
| 3.3 | Wait another 60 seconds without typing | Permission prompt does NOT reappear within 5 minutes of the decline | |
| 3.4 | Confirm the product grid is still showing the current category | No silent category switch happened | |

**Notes:**

---

## Scenario 4 — Accept Help

**What this tests:** Permission accepted → Waiter responds with buttons or product cards. No open typing required.

| # | Step | Expected | Result |
|---|---|---|---|
| 4.1 | Reload the page to reset state. Wait for the permission prompt (Scenario 2) | Prompt appears | |
| 4.2 | Tap "Quero sugestão ✨" | Waiter sends a response. It is either: (a) a button question such as "Prefere algo mais leve ou completo?" with "Leve" and "Completo" buttons, OR (b) product cards directly | |
| 4.3 | If buttons appeared (case a), tap one — e.g. "Leve" | Product cards appear in the product area within a few seconds | |
| 4.4 | Count the product cards shown | Between 1 and 3 cards. No blank cards. No duplicate cards | |
| 4.5 | Compare the Waiter's chat message with the cards shown | Message is general ("Separei algumas opções mais leves pra você 👇"). No specific product name is mentioned that does not appear as a card | |
| 4.6 | Confirm "Quero" and "Ver outra opção" buttons appear below the chat message | Two buttons render: one to add, one to dismiss | |
| 4.7 | Tap "Ver outra opção" | Cards clear. Normal category grid returns | |

**Notes:**

---

## Scenario 5 — Typed Request

**What this tests:** Free-text message routes correctly through WaiterBrainV2. Correct category of products returned.

### 5A — Dessert request

| # | Step | Expected | Result |
|---|---|---|---|
| 5A.1 | Type: `quero uma sobremesa` and send | Waiter responds with a short message (e.g. "Para adoçar o final 🍰") | |
| 5A.2 | Observe the product area | Dessert cards appear. Non-dessert products are NOT in the grid | |
| 5A.3 | Confirm no product name is mentioned in the Waiter's text that is not visible as a card | — | |

### 5B — Drink request

| # | Step | Expected | Result |
|---|---|---|---|
| 5B.1 | Type: `quero uma bebida` and send | Waiter responds with a short message about drinks | |
| 5B.2 | Observe the product area | Drink cards appear. Food products are NOT in the grid | |

### 5C — Vague request (no cart)

| # | Step | Expected | Result |
|---|---|---|---|
| 5C.1 | Type: `me sugere algo` and send | Waiter responds with a button question (e.g. "Prefere algo mais leve ou completo?"). Two buttons appear: "Leve" and "Completo". No product cards yet | |
| 5C.2 | Tap "Completo" | Product cards appear for complete meals / main courses | |

**Notes:**

---

## Scenario 6 — Item Click

**What this tests:** Adding an item to the cart does not trigger automatic suggestions or layout changes.

| # | Step | Expected | Result |
|---|---|---|---|
| 6.1 | Tap "+" on any product in the normal category grid | The product is added to cart. Cart count badge updates | |
| 6.2 | Observe the product area immediately after the tap | Product grid does NOT change. No suggestion cards appear. No category switches | |
| 6.3 | Observe the chat area | Waiter does NOT send an automatic message after item add | |
| 6.4 | Look for any "Combina com seu pedido" block or automatic drink/dessert block | Does NOT appear | |
| 6.5 | Check that the page did not scroll or jump unexpectedly | Layout is stable | |
| 6.6 | Add a second item from a different category | Same as above: cart updates, no UI change | |

**Notes:**

---

## Scenario 7 — Product Mismatch Guard

**What this tests:** The Waiter never mentions a product in text unless it is visible as a card.

| # | Step | Expected | Result |
|---|---|---|---|
| 7.1 | Ask for something specific that exists in the menu (e.g. `quero entrada`, `quero o mais pedido`) | Waiter responds | |
| 7.2 | Read the Waiter's chat message carefully | Message is general or category-level ("Separei as melhores opções pra você 👇"). It does NOT mention a specific product name | |
| 7.3 | Check that every product implied by the message is visible as a card | If message says "entradas", cards are from the starter category | |
| 7.4 | Ask for something that does NOT exist in the menu (e.g. a specific item that was removed) | Waiter does NOT mention that product name. It either returns available alternatives or asks a clarifying question | |

**Notes:**

---

## Scenario 8 — Checkout

**What this tests:** Checkout is fully UI-driven. Waiter does not interfere. All checkout stages complete successfully.

| # | Step | Expected | Result |
|---|---|---|---|
| 8.1 | Add at least one product to the cart | Cart badge shows count | |
| 8.2 | Tap "Finalizar pedido" | If restaurant has drinks and none are in cart: a permission prompt appears asking about drinks/desserts before checkout ("Antes de finalizar, quer ver uma bebida ou sobremesa? 👇") | |
| 8.3 | Tap "Não, finalizar" on the permission prompt | Checkout begins immediately. DELIVERY_TYPE stage panel appears | |
| 8.4 | Confirm no product cards appear in the product area during checkout | Product area is replaced by a checkout context screen (desktop) or hidden (mobile). No suggestion grid | |
| 8.5 | Select delivery type (🛵 Entrega or 🏪 Retirada) | Next step appears in chat | |
| 8.6 | If delivery: enter street and number (e.g. `Rua das Flores, 123`) | Address input accepted; neighborhood prompt appears | |
| 8.7 | Enter neighborhood (e.g. `Vila Madalena`) | Address confirm panel appears showing the collected address | |
| 8.8 | Tap "Confirmar endereço" | Name prompt appears | |
| 8.9 | Enter your name (e.g. `João`) | Payment stage appears | |
| 8.10 | Select a payment method | Payment method sub-options appear (if applicable) | |
| 8.11 | Review order summary | Cart items, total, address, and payment method displayed | |
| 8.12 | Tap "Confirmar pedido 🎉" | Order is confirmed. Done screen appears | |
| 8.13 | Confirm the Waiter did not suggest any products during steps 8.5–8.12 | Zero product cards during checkout flow | |

**Notes:**

---

## Scenario 9 — Return to Browse

**What this tests:** Leaving checkout or dismissing suggestions returns the user cleanly to the menu.

| # | Step | Expected | Result |
|---|---|---|---|
| 9.1 | With suggestions visible (from Scenario 4 or 5), tap "← Voltar ao cardápio" | Suggestion grid clears. Normal category grid returns. Cart is intact | |
| 9.2 | Verify the category shown is the last one selected, or the first category | Normal browsing state. No stale suggestion cards | |
| 9.3 | Start checkout (Scenario 8 steps 8.1–8.4), then tap "← Voltar ao cardápio" | Returns to BROWSE. Cart preserved. No checkout data lost | |
| 9.4 | Tap "Finalizar pedido" again | Checkout resumes at the correct step — no need to re-enter data already provided | |

**Notes:**

---

## Scenario 10 — Desktop Verification (optional)

**What this tests:** Two-column layout works. Chat on the left, menu on the right. Both panels show correct content.

| # | Step | Expected | Result |
|---|---|---|---|
| 10.1 | Open the ordering page on a laptop or desktop (viewport ≥ 1024px) | Left panel: chat. Right panel: menu grid with categories at the bottom | |
| 10.2 | Tap "Quero sugestão" permission prompt (left panel) | Product cards appear in the RIGHT panel (replaces category grid) | |
| 10.3 | Tap "← Voltar ao cardápio" in the right panel | Right panel returns to category grid | |
| 10.4 | Add a product and go to checkout | Right panel shows "Finalizando seu pedido" with a "← Voltar ao cardápio" button | |

**Notes:**

---

## Summary Table

Fill in after all scenarios are complete.

| Scenario | Name | Result | Blocking? |
|---|---|---|---|
| 1 | Entry | | |
| 2 | Passive / Permission Prompt | | |
| 3 | Decline Help | | |
| 4 | Accept Help | | |
| 5A | Typed — Dessert | | |
| 5B | Typed — Drink | | |
| 5C | Typed — Vague / Buttons | | |
| 6 | Item Click | | |
| 7 | Product Mismatch Guard | | |
| 8 | Checkout End-to-End | | |
| 9 | Return to Browse | | |
| 10 | Desktop Layout (optional) | | |

---

## Known Limitations (not test failures)

These are documented gaps that are acceptable at this stage:

| Limitation | Notes |
|---|---|
| `ON_IDLE` (45 s inactivity suggestions) is disabled | `suggestOnIdle: false` — will not trigger during QA |
| Permission prompt fires up to 2× per session | A third idle period will not produce another prompt |
| Silent cooldown after decline is 5 minutes | After 5 min, prompt may re-appear once |
| Welcome message is 3 lines (bypasses 2-line validator) | Visual, not functional. Waiter-generated messages respect the 2-line rule |
| Dead code: `guidedMode` / `handleGuidedStep` | Never executed; harmless legacy |

---

## QA Sign-off

| Field | Value |
|---|---|
| **Overall result** | PASS / FAIL / CONDITIONAL |
| **Blocking issues found** | |
| **Non-blocking issues found** | |
| **Ready for design polish** | YES / NO / CONDITIONAL |
| **Signed by** | |
| **Date** | |

---

## If a scenario fails

1. Note the exact step number and what happened.
2. Take a screenshot and name it: `fail-scenario-N-step-M.png`
3. Check the Railway / server logs for the `[waiter]` line emitted by that turn:
   ```
   [waiter] {"event":"...","mode":"...","cards":N,"options":N}
   ```
4. Compare `mode` and `cards` count with what the UI rendered.
5. File the finding under **Blockers** in the sign-off table above.
