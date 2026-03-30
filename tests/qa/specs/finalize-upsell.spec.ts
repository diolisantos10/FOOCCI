import { test, expect } from "@playwright/test";
import { ChatSimPage } from "../fixtures/page-objects";
import { S } from "../utils/selectors";

/**
 * Spec: Finalize + Upsell Sequence
 *
 * Validates:
 * 1. First Finalizar with no drink in cart → stays in BROWSE, switches to drink category
 * 2. Second Finalizar (after accepting drink) → dessert upsell or DELIVERY_TYPE
 * 3. After full upsell sequence → reaches DELIVERY_TYPE, checkout-area visible
 * 4. browse-area and finalize-button are absent once in checkout
 */
test.describe("Finalize + Upsell", () => {
  test("first finalize triggers drink upsell — app stays in BROWSE", async ({ page }) => {
    const sim = new ChatSimPage(page);
    await sim.goto();

    // Add a main-course item (first category, assumed not a drink)
    const catIds = await sim.categoryIds();
    expect(catIds.length).toBeGreaterThanOrEqual(1);
    await sim.clickCategory(catIds[0]!);
    const productIds = await sim.visibleProductIds();
    await sim.addProductById(productIds[0]!);

    await sim.assertStage("BROWSE");
    await sim.assertBrowseAreaVisible();

    // Click Finalizar
    await sim.clickFinalize();

    // If a drink category exists and cart has no drink → app stays BROWSE (upsell)
    const stage = await page.locator(S.phoneFrame).getAttribute("data-stage");
    expect(stage).toBe("BROWSE");

    // browse-area still visible (product carousel now shows drink/dessert category)
    await sim.assertBrowseAreaVisible();
    await sim.assertCheckoutAreaHidden();

    // finalize-button still present (user can click again to refuse upsell)
    await expect(page.locator(S.finalizeButton)).toBeVisible();
  });

  test("completing upsell sequence enters DELIVERY_TYPE", async ({ page }) => {
    const sim = new ChatSimPage(page);
    await sim.goto();

    // Add a product
    const productIds = await sim.visibleProductIds();
    await sim.addProductById(productIds[0]!);

    // Keep clicking Finalizar until we leave BROWSE (max 3 upsell steps)
    for (let i = 0; i < 4; i++) {
      const stage = await page.locator(S.phoneFrame).getAttribute("data-stage");
      if (stage !== "BROWSE") break;
      await sim.clickFinalize();
    }

    // ── UI state: DELIVERY_TYPE ──────────────────────────────────────
    await sim.assertStage("DELIVERY_TYPE");

    // browse-area gone, finalize-button gone
    await sim.assertBrowseAreaHidden();
    await expect(page.locator(S.finalizeButton)).not.toBeVisible();
    await expect(page.locator('[data-testid^="category-tab-"]')).toHaveCount(0);

    // checkout-area visible with delivery choice buttons
    await sim.assertCheckoutAreaVisible();
    await expect(page.locator(S.checkoutArea).getByText("🛵 Entrega")).toBeVisible();
    await expect(page.locator(S.checkoutArea).getByText("🏪 Retirada")).toBeVisible();
  });

  test("back to browse from checkout restores browse UI", async ({ page }) => {
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

    // Click ← Voltar ao cardápio
    await page.getByText("← Voltar ao cardápio").click();
    await page.waitForTimeout(300);

    // ── UI state: BROWSE restored ────────────────────────────────────
    await sim.assertStage("BROWSE");
    await sim.assertBrowseAreaVisible();
    await sim.assertCheckoutAreaHidden();
    await expect(page.locator(S.finalizeButton)).toBeVisible();
    await expect(page.locator('[data-testid^="category-tab-"]').first()).toBeVisible();
  });
});
