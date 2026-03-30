import { test, expect } from "@playwright/test";
import { ChatSimPage } from "../fixtures/page-objects";
import { S } from "../utils/selectors";

/**
 * Spec: Full Checkout Flow
 *
 * Validates the complete happy path:
 * add item → finalize (skip upsells) → delivery → address → name → payment → confirm → DONE
 *
 * At each stage transition, both data-stage and visible UI are asserted.
 */
test.describe("Checkout Flow", () => {
  test("full delivery checkout reaches DONE screen", async ({ page }) => {
    const sim = new ChatSimPage(page);
    await sim.goto();

    // ── 1. Add a product ─────────────────────────────────────────────
    const productIds = await sim.visibleProductIds();
    expect(productIds.length).toBeGreaterThan(0);
    await sim.addProductById(productIds[0]!);
    await sim.assertCartBadgeVisible();

    // ── 2. Enter checkout (skip all upsells) ─────────────────────────
    for (let i = 0; i < 4; i++) {
      const stage = await page.locator(S.phoneFrame).getAttribute("data-stage");
      if (stage !== "BROWSE") break;
      await sim.clickFinalize();
    }

    await sim.assertStage("DELIVERY_TYPE");
    await sim.assertCheckoutAreaVisible();
    await sim.assertBrowseAreaHidden();

    // ── 3. Choose delivery ───────────────────────────────────────────
    await sim.selectDelivery("delivery");

    await sim.assertStage("ADDRESS_INPUT");
    await sim.assertCheckoutAreaHidden(); // ADDRESS_INPUT returns null from CheckoutBar
    await sim.assertBrowseAreaHidden();

    // ── 4. Enter street address ──────────────────────────────────────
    await sim.sendInput("Rua das Flores, 42");

    await sim.assertStage("ADDRESS_DETAILS");
    await sim.assertBrowseAreaHidden();

    // ── 5. Enter neighborhood ────────────────────────────────────────
    await sim.sendInput("Centro, Apto 10");

    await sim.assertStage("ADDRESS_CONFIRM");
    await sim.assertCheckoutAreaVisible();

    // Confirm button should be enabled (all fields filled)
    await expect(page.locator(S.addressConfirmButton)).toBeEnabled();
    await expect(page.locator(S.addressError)).not.toBeVisible();

    // ── 6. Confirm address ───────────────────────────────────────────
    await sim.confirmAddress();

    await sim.assertStage("ASK_NAME");
    await sim.assertCheckoutAreaHidden(); // ASK_NAME returns null from CheckoutBar
    await sim.assertBrowseAreaHidden();

    // ── 7. Enter name ────────────────────────────────────────────────
    await sim.sendInput("João Testador");

    await sim.assertStage("PAYMENT");
    await sim.assertCheckoutAreaVisible();

    await expect(page.locator(S.checkoutArea).getByText("📱 Pix")).toBeVisible();

    // ── 8. Select payment ────────────────────────────────────────────
    await sim.selectPayment("pix");

    await sim.assertStage("REVIEW_ORDER");
    await sim.assertCheckoutAreaVisible();

    // Review screen shows confirm button
    await expect(page.locator(S.checkoutConfirmBtn)).toBeVisible();
    await expect(page.locator(S.checkoutConfirmBtn)).toBeEnabled();

    // ── 9. Confirm order ─────────────────────────────────────────────
    await sim.confirmOrder();

    await sim.assertStage("DONE");

    // ── 10. Done screen UI ───────────────────────────────────────────
    await sim.assertStageDoneVisible();
    await sim.assertBrowseAreaHidden();
    await sim.assertCheckoutAreaHidden();
    await expect(page.locator(S.finalizeButton)).not.toBeVisible();
    // Text input should be gone
    await expect(page.locator("textarea")).not.toBeVisible();
  });

  test("pickup flow skips address stages", async ({ page }) => {
    const sim = new ChatSimPage(page);
    await sim.goto();

    const productIds = await sim.visibleProductIds();
    await sim.addProductById(productIds[0]!);

    // Enter checkout
    for (let i = 0; i < 4; i++) {
      const stage = await page.locator(S.phoneFrame).getAttribute("data-stage");
      if (stage !== "BROWSE") break;
      await sim.clickFinalize();
    }
    await sim.assertStage("DELIVERY_TYPE");

    // Choose pickup
    await sim.selectDelivery("pickup");

    // Pickup skips all address stages — goes directly to ASK_NAME
    await sim.assertStage("ASK_NAME");
    await sim.assertBrowseAreaHidden();
    // No address or confirm buttons
    await expect(page.locator(S.addressConfirmButton)).not.toBeVisible();
  });
});
