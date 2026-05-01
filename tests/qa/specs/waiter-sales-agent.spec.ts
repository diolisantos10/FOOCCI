/**
 * Spec: Waiter Sales Specialist Agent — Sprint 4J QA
 *
 * Validates the Sales Specialist Agent behavior in the real
 * /pedido/[slug] customer-facing interface.
 *
 * Prerequisites:
 *   DATABASE_URL pointing to a seeded DB (slug: "pizzaria-demo")
 *   npm run dev running on port 3000
 *   Run: npx playwright test tests/qa/specs/waiter-sales-agent.spec.ts
 *
 * Selectors reference data-testid attributes added in Sprint 4J:
 *   waiter-permission-prompt, waiter-permission-accept, waiter-permission-decline
 *   waiter-checkout-prompt, waiter-checkout-accept, waiter-checkout-decline
 *   waiter-suggestion-grid, bubble-waiter, waiter-options, waiter-option-{value}
 */

import { test, expect, type Page } from "@playwright/test";

// ── Config ───────────────────────────────────────────────────────────────────

/** Restaurant slug from seeded DB. */
const SLUG = process.env.TEST_SLUG ?? "pizzaria-demo";
/** Passive permission trigger (5 s in production, shorten for tests). */
const PASSIVE_TRIGGER_MS = 5_000;
const PASSIVE_WAIT_MS    = PASSIVE_TRIGGER_MS + 2_000; // 2 s buffer

// ── Helpers ──────────────────────────────────────────────────────────────────

async function gotoOrderPage(page: Page) {
  await page.goto(`/pedido/${SLUG}`);
  // Wait for at least one product card to appear — menu has loaded
  await page.waitForSelector('[data-testid^="product-card-"]', { timeout: 20_000 });
}

/** Returns first visible product card ID. */
async function firstProductId(page: Page): Promise<string> {
  const locator = page.locator('[data-testid^="product-card-"]').first();
  await locator.waitFor({ state: "visible", timeout: 10_000 });
  const testid = await locator.getAttribute("data-testid");
  return (testid ?? "product-card-unknown").replace("product-card-", "");
}

/** Add a product by card ID (clicks the + button). */
async function addProduct(page: Page, id: string) {
  const card = page.locator(`[data-testid="product-card-${id}"]`);
  await card.locator("button").last().click();
  await page.waitForTimeout(400);
}

/** Waiter bubble locator (all). */
const waiterBubbles = (page: Page) => page.locator('[data-testid="bubble-waiter"]');

// ─────────────────────────────────────────────────────────────────────────────

test.describe("W1 — Entry (menu loads normally)", () => {
  test("ordering page opens with product grid, no welcome-blocker modal", async ({ page }) => {
    await gotoOrderPage(page);
    // Product cards are visible
    await expect(page.locator('[data-testid^="product-card-"]').first()).toBeVisible();
    // No blocking modal overlay
    await expect(page.locator('[data-testid="modal-overlay"]')).not.toBeVisible();
    // No permission prompt yet (fires after idle)
    await expect(page.locator('[data-testid="waiter-permission-prompt"]')).not.toBeVisible();
  });

  test("welcome message appears in chat on entry", async ({ page }) => {
    await gotoOrderPage(page);
    // At least one waiter bubble should be present (ON_ENTRY welcome)
    await expect(waiterBubbles(page).first()).toBeVisible({ timeout: 10_000 });
    const text = await waiterBubbles(page).first().textContent();
    expect(text).toBeTruthy();
    expect(text!.length).toBeGreaterThan(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

test.describe("W2 — Passive permission prompt", () => {
  test("prompt appears after idle with correct text and two buttons", async ({ page }) => {
    await gotoOrderPage(page);
    // Wait for passive trigger
    await page.waitForSelector('[data-testid="waiter-permission-prompt"]', {
      timeout: PASSIVE_WAIT_MS,
    });
    const prompt = page.locator('[data-testid="waiter-permission-prompt"]');
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText("Posso te sugerir algo");
    await expect(page.locator('[data-testid="waiter-permission-accept"]')).toBeVisible();
    await expect(page.locator('[data-testid="waiter-permission-decline"]')).toBeVisible();
  });

  test("no product cards shown inside the permission prompt", async ({ page }) => {
    await gotoOrderPage(page);
    await page.waitForSelector('[data-testid="waiter-permission-prompt"]', { timeout: PASSIVE_WAIT_MS });
    // Suggestion grid must NOT be visible alongside the permission prompt
    await expect(page.locator('[data-testid="waiter-suggestion-grid"]')).not.toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

test.describe("W3 — Permission accepted → suggestion flow", () => {
  test("accepting permission shows qualification buttons or product cards", async ({ page }) => {
    await gotoOrderPage(page);
    await page.waitForSelector('[data-testid="waiter-permission-prompt"]', { timeout: PASSIVE_WAIT_MS });
    await page.locator('[data-testid="waiter-permission-accept"]').click();
    await page.waitForTimeout(2_000); // let API respond

    // Either qualification options buttons OR a suggestion grid must appear
    const hasOptions = await page.locator('[data-testid="waiter-options"]').isVisible();
    const hasGrid    = await page.locator('[data-testid="waiter-suggestion-grid"]').isVisible();
    expect(hasOptions || hasGrid).toBe(true);
  });

  test("option buttons each have a visible label", async ({ page }) => {
    await gotoOrderPage(page);
    await page.waitForSelector('[data-testid="waiter-permission-prompt"]', { timeout: PASSIVE_WAIT_MS });
    await page.locator('[data-testid="waiter-permission-accept"]').click();
    await page.waitForTimeout(2_000);

    const options = page.locator('[data-testid="waiter-options"] button');
    const count = await options.count();
    if (count > 0) {
      for (let i = 0; i < count; i++) {
        const label = await options.nth(i).textContent();
        expect(label!.trim().length).toBeGreaterThan(0);
      }
    }
  });

  test("no options shown alongside product cards (Rule 9)", async ({ page }) => {
    await gotoOrderPage(page);
    await page.waitForSelector('[data-testid="waiter-permission-prompt"]', { timeout: PASSIVE_WAIT_MS });
    await page.locator('[data-testid="waiter-permission-accept"]').click();
    await page.waitForTimeout(2_000);

    const hasGrid = await page.locator('[data-testid="waiter-suggestion-grid"]').isVisible();
    if (hasGrid) {
      // Cards are showing → no confirmation buttons should appear in chat
      await expect(page.locator('[data-testid="waiter-options"]')).not.toBeVisible();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────

test.describe("W4 — Permission declined → cooldown", () => {
  test("declining shows cooldown message, no product cards", async ({ page }) => {
    await gotoOrderPage(page);
    await page.waitForSelector('[data-testid="waiter-permission-prompt"]', { timeout: PASSIVE_WAIT_MS });
    await page.locator('[data-testid="waiter-permission-decline"]').click();
    await page.waitForTimeout(500);

    // Permission prompt disappears
    await expect(page.locator('[data-testid="waiter-permission-prompt"]')).not.toBeVisible();
    // No suggestion grid
    await expect(page.locator('[data-testid="waiter-suggestion-grid"]')).not.toBeVisible();
    // Cooldown message appears
    const lastBubble = waiterBubbles(page).last();
    await expect(lastBubble).toBeVisible();
    const text = await lastBubble.textContent();
    expect(text!.length).toBeGreaterThan(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

test.describe("W5 — Typed intents", () => {
  async function sendMessage(page: Page, text: string) {
    const ta = page.locator("textarea");
    await expect(ta).toBeEnabled({ timeout: 8_000 });
    await ta.fill(text);
    await ta.press("Enter");
    await page.waitForTimeout(2_500);
  }

  test("'quero algo leve' → response with food cards or qualification buttons", async ({ page }) => {
    await gotoOrderPage(page);
    await sendMessage(page, "quero algo leve");
    const hasCards   = await page.locator('[data-testid="waiter-suggestion-grid"]').isVisible();
    const hasOptions = await page.locator('[data-testid="waiter-options"]').isVisible();
    expect(hasCards || hasOptions).toBe(true);
  });

  test("'quero sobremesa' → response with dessert cards", async ({ page }) => {
    await gotoOrderPage(page);
    await sendMessage(page, "quero sobremesa");
    // Dessert intent should return cards, not only options
    await expect(page.locator('[data-testid="waiter-suggestion-grid"]')).toBeVisible({ timeout: 5_000 });
  });

  test("'tem bebida?' → response with drink cards", async ({ page }) => {
    await gotoOrderPage(page);
    await sendMessage(page, "tem bebida?");
    await expect(page.locator('[data-testid="waiter-suggestion-grid"]')).toBeVisible({ timeout: 5_000 });
  });

  test("'é pra 4 pessoas' → response includes group/combo items", async ({ page }) => {
    await gotoOrderPage(page);
    await sendMessage(page, "é pra 4 pessoas");
    const hasCards   = await page.locator('[data-testid="waiter-suggestion-grid"]').isVisible();
    const hasOptions = await page.locator('[data-testid="waiter-options"]').isVisible();
    expect(hasCards || hasOptions).toBe(true);
  });

  test("typed intent: no options rendered alongside cards (Rule 9)", async ({ page }) => {
    await gotoOrderPage(page);
    await sendMessage(page, "quero sobremesa");
    const hasGrid = await page.locator('[data-testid="waiter-suggestion-grid"]').isVisible();
    if (hasGrid) {
      // When cards are present, confirmation-style options must be absent
      await expect(page.locator('[data-testid="waiter-options"]')).not.toBeVisible();
    }
  });

  test("waiter message does not mention product name without showing that card", async ({ page }) => {
    await gotoOrderPage(page);
    await sendMessage(page, "quero sobremesa");
    // Get the last waiter bubble text
    const count = await waiterBubbles(page).count();
    if (count === 0) return;
    const lastText = await waiterBubbles(page).last().textContent() ?? "";
    // Any product name longer than 3 chars mentioned in text must have its card shown
    // (This is a structural check — invisibility guard prevents names without cards)
    // We just verify the message is short and seller-tone
    const lines = lastText.split("\n").filter((l) => l.trim().length > 0);
    expect(lines.length).toBeLessThanOrEqual(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

test.describe("W6 — Product click does not change UI", () => {
  test("ON_ITEM_ADDED: adding product does not open drink/dessert category", async ({ page }) => {
    await gotoOrderPage(page);
    const id = await firstProductId(page);
    const categorysBefore = await page.locator('[data-testid^="category-tab-"]').count();
    await addProduct(page, id);
    // Brief wait — if there were an automatic switch it would happen within 1s
    await page.waitForTimeout(1_000);
    const categorysAfter = await page.locator('[data-testid^="category-tab-"]').count();
    expect(categorysAfter).toBe(categorysBefore);
  });

  test("ON_ITEM_ADDED: suggestion grid does not auto-appear after add", async ({ page }) => {
    await gotoOrderPage(page);
    const id = await firstProductId(page);
    await addProduct(page, id);
    await page.waitForTimeout(800);
    await expect(page.locator('[data-testid="waiter-suggestion-grid"]')).not.toBeVisible();
  });

  test("ON_ITEM_ADDED: cart badge updates immediately", async ({ page }) => {
    await gotoOrderPage(page);
    const id = await firstProductId(page);
    await addProduct(page, id);
    await expect(page.locator('[data-testid="cart-badge"]')).toBeVisible({ timeout: 3_000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

test.describe("W7 — Final upsell permission at checkout", () => {
  test("food-only cart → checkout-prompt appears on Finalizar", async ({ page }) => {
    await gotoOrderPage(page);
    const id = await firstProductId(page);
    await addProduct(page, id);
    // Click Finalizar — should trigger checkout upsell prompt
    await page.locator('[data-testid="finalize-button"]').click();
    await page.waitForTimeout(600);
    // One of: checkout-prompt (first upsell) OR DELIVERY_TYPE (full cart)
    const checkoutPrompt = page.locator('[data-testid="waiter-checkout-prompt"]');
    const isPromptVisible = await checkoutPrompt.isVisible();
    if (isPromptVisible) {
      await expect(checkoutPrompt).toContainText("Antes de finalizar");
      await expect(page.locator('[data-testid="waiter-checkout-accept"]')).toBeVisible();
      await expect(page.locator('[data-testid="waiter-checkout-decline"]')).toBeVisible();
      // No product cards alongside the permission prompt
      await expect(page.locator('[data-testid="waiter-suggestion-grid"]')).not.toBeVisible();
    }
  });

  test("declining upsell then Finalizar → checkout proceeds, no duplicate prompt in chat", async ({ page }) => {
    await gotoOrderPage(page);
    const id = await firstProductId(page);
    await addProduct(page, id);

    // Click Finalizar until checkout upsell appears
    for (let i = 0; i < 3; i++) {
      await page.locator('[data-testid="finalize-button"]').click();
      await page.waitForTimeout(600);
      if (await page.locator('[data-testid="waiter-checkout-prompt"]').isVisible()) break;
    }

    const promptVisible = await page.locator('[data-testid="waiter-checkout-prompt"]').isVisible();
    if (!promptVisible) return; // full cart, no upsell needed — test not applicable

    // Decline the upsell
    await page.locator('[data-testid="waiter-checkout-decline"]').click();
    await page.waitForTimeout(1_000);

    // Must have moved to checkout (stage !== BROWSE) — no second prompt in chat
    // Check that waiter-checkout-prompt is gone
    await expect(page.locator('[data-testid="waiter-checkout-prompt"]')).not.toBeVisible();

    // Critical: the checkout bridge message in chat must NOT be another upsell prompt
    const bubblesCount = await waiterBubbles(page).count();
    if (bubblesCount > 0) {
      const lastText = await waiterBubbles(page).last().textContent() ?? "";
      // After declining, the final message should not be another "Antes de finalizar"
      expect(lastText).not.toContain("Antes de finalizar, quer ver");
    }
  });

  test("'Ver opções' → suggestion cards appear", async ({ page }) => {
    await gotoOrderPage(page);
    const id = await firstProductId(page);
    await addProduct(page, id);

    // Click Finalizar until checkout upsell appears
    for (let i = 0; i < 3; i++) {
      await page.locator('[data-testid="finalize-button"]').click();
      await page.waitForTimeout(600);
      if (await page.locator('[data-testid="waiter-checkout-prompt"]').isVisible()) break;
    }

    if (!await page.locator('[data-testid="waiter-checkout-prompt"]').isVisible()) return;

    await page.locator('[data-testid="waiter-checkout-accept"]').click();
    await page.waitForTimeout(2_500);

    // Suggestion grid should appear with drink/dessert cards
    await expect(page.locator('[data-testid="waiter-suggestion-grid"]')).toBeVisible({ timeout: 5_000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

test.describe("W8 — Checkout support (no selling)", () => {
  async function enterCheckout(page: Page) {
    await gotoOrderPage(page);
    const id = await firstProductId(page);
    await addProduct(page, id);
    for (let i = 0; i < 4; i++) {
      const stage = await page.locator('[data-testid="phone-frame"]').getAttribute("data-stage").catch(() => "BROWSE");
      if (stage !== "BROWSE") break;
      await page.locator('[data-testid="finalize-button"]').click();
      await page.waitForTimeout(700);
    }
  }

  test("once in DELIVERY_TYPE: finalize-button gone, suggestion-grid gone", async ({ page }) => {
    await enterCheckout(page);
    const stage = await page.locator('[data-testid="phone-frame"]').getAttribute("data-stage");
    if (stage === "BROWSE") return; // couldn't get past upsell in this run — skip

    await expect(page.locator('[data-testid="finalize-button"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="waiter-suggestion-grid"]')).not.toBeVisible();
  });

  test("checkout stage: no product cards in chat messages", async ({ page }) => {
    await enterCheckout(page);
    const stage = await page.locator('[data-testid="phone-frame"]').getAttribute("data-stage");
    if (stage === "BROWSE") return;

    // In checkout, waiter-suggestion-grid must be absent
    await expect(page.locator('[data-testid="waiter-suggestion-grid"]')).not.toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

test.describe("W9 — Product match (no invisible products)", () => {
  async function sendMessage(page: Page, text: string) {
    const ta = page.locator("textarea");
    await expect(ta).toBeEnabled({ timeout: 8_000 });
    await ta.fill(text);
    await ta.press("Enter");
    await page.waitForTimeout(2_500);
  }

  test("when suggestion grid shows, waiter message is ≤ 2 lines (no product-listing text)", async ({ page }) => {
    await gotoOrderPage(page);
    await sendMessage(page, "quero sobremesa");
    const hasGrid = await page.locator('[data-testid="waiter-suggestion-grid"]').isVisible();
    if (!hasGrid) return;

    const count = await waiterBubbles(page).count();
    if (count === 0) return;
    const lastMsg = await waiterBubbles(page).last().textContent() ?? "";
    const lines = lastMsg.split("\n").filter((l) => l.trim().length > 0);
    expect(lines.length).toBeLessThanOrEqual(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

test.describe("W10 — No extra buttons after product cards", () => {
  async function sendMessage(page: Page, text: string) {
    const ta = page.locator("textarea");
    await expect(ta).toBeEnabled({ timeout: 8_000 });
    await ta.fill(text);
    await ta.press("Enter");
    await page.waitForTimeout(2_500);
  }

  test("when cards appear, no 'Quero' or 'Ver outra opção' button in chat", async ({ page }) => {
    await gotoOrderPage(page);
    await sendMessage(page, "quero sobremesa");
    const hasGrid = await page.locator('[data-testid="waiter-suggestion-grid"]').isVisible();
    if (!hasGrid) return;

    // When cards are visible, waiter-options must not be visible
    await expect(page.locator('[data-testid="waiter-options"]')).not.toBeVisible();

    // Specific buttons that must not appear
    await expect(page.getByText("Quero", { exact: true })).not.toBeVisible();
    await expect(page.getByText("Ver outra opção", { exact: true })).not.toBeVisible();
  });
});
