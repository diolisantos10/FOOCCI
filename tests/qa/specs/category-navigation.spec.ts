import { test, expect } from "@playwright/test";
import { ChatSimPage } from "../fixtures/page-objects";
import { S } from "../utils/selectors";

/**
 * Spec: Category Navigation
 *
 * Validates that clicking a category tab:
 * 1. Updates the visible product carousel to show only that category's items
 * 2. Does NOT change when in checkout mode (browse-area should be absent)
 */
test.describe("Category Navigation", () => {
  test("category tabs are visible in BROWSE and each shows unique product set", async ({
    page,
  }) => {
    const sim = new ChatSimPage(page);
    await sim.goto();

    // ── UI state: browse-area visible, checkout-area absent ──────────
    await sim.assertBrowseAreaVisible();
    await sim.assertCheckoutAreaHidden();
    await sim.assertStage("BROWSE");

    const catIds = await sim.categoryIds();
    expect(catIds.length).toBeGreaterThanOrEqual(2);

    const productSetsByCategory: Record<string, string[]> = {};

    for (const id of catIds) {
      await sim.clickCategory(id);

      // browse-area must remain visible after tab click
      await sim.assertBrowseAreaVisible();

      // The selected tab should be highlighted (bg-[#25d366] class)
      await expect(page.locator(S.categoryTab(id))).toHaveClass(/bg-\[#25d366\]/);

      const productIds = await sim.visibleProductIds();
      expect(productIds.length).toBeGreaterThan(0);
      productSetsByCategory[id] = productIds;
    }

    // Each category must show a DIFFERENT set of products
    const allSets = Object.values(productSetsByCategory);
    for (let i = 0; i < allSets.length; i++) {
      for (let j = i + 1; j < allSets.length; j++) {
        const setA = new Set(allSets[i]);
        const setB = new Set(allSets[j]!);
        const overlap = [...setA].filter((id) => setB.has(id));
        expect(overlap.length).toBe(0);
      }
    }
  });

  test("category tabs disappear when entering checkout", async ({ page }) => {
    const sim = new ChatSimPage(page);
    await sim.goto();

    // Add a product so cart is non-empty (required to finalize)
    const [firstProductId] = await sim.visibleProductIds();
    expect(firstProductId).toBeTruthy();
    await sim.addProductById(firstProductId!);

    // Finalize → enter checkout
    // May need up to 3 clicks to pass upsell sequence
    for (let attempt = 0; attempt < 4; attempt++) {
      const stage = await page.locator(S.phoneFrame).getAttribute("data-stage");
      if (stage !== "BROWSE") break;
      await sim.clickFinalize();
    }

    // ── UI state: browse-area gone, checkout-area visible ────────────
    await sim.assertBrowseAreaHidden();
    await sim.assertCheckoutAreaVisible();
    await sim.assertStage("DELIVERY_TYPE");

    // Category tabs must not be present at all
    await expect(page.locator('[data-testid^="category-tab-"]')).toHaveCount(0);
  });
});
