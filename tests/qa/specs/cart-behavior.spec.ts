import { test, expect } from "@playwright/test";
import { ChatSimPage } from "../fixtures/page-objects";
import { S } from "../utils/selectors";

/**
 * Spec: Cart Behavior
 *
 * Validates:
 * 1. CartBar appears only when cart is non-empty
 * 2. Adding same product twice → badge shows R$ <2×price>
 * 3. Decrement (−) reduces qty; removes item when qty reaches 0
 * 4. Remove (×) immediately removes item from cart
 */
test.describe("Cart Behavior", () => {
  test("cart badge appears after first add and reflects price", async ({ page }) => {
    const sim = new ChatSimPage(page);
    await sim.goto();

    // Pre-condition: no cart badge
    await expect(page.locator(S.cartBadge)).not.toBeVisible();

    const [firstProductId] = await sim.visibleProductIds();
    expect(firstProductId).toBeTruthy();

    await sim.addProductById(firstProductId!);

    // Cart badge must now be visible
    await sim.assertCartBadgeVisible();
    // Price text matches R$ nn.nn format
    await expect(page.locator(S.cartBadge)).toHaveText(/R\$\s*\d+,\d{2}/);
  });

  test("adding same product twice doubles the total price", async ({ page }) => {
    const sim = new ChatSimPage(page);
    await sim.goto();

    const [firstProductId] = await sim.visibleProductIds();
    expect(firstProductId).toBeTruthy();

    // Read the unit price from the card before adding
    const priceText = await page
      .locator(S.productCard(firstProductId!))
      .locator("span.text-xs.font-bold")
      .textContent();
    // priceText looks like "R$\u00a042.90"
    const unitPrice = parseFloat(priceText?.replace(/[^\d,]/g, "").replace(",", ".") ?? "0");
    expect(unitPrice).toBeGreaterThan(0);

    // Add the same product twice
    await sim.addProductById(firstProductId!);
    await sim.addProductById(firstProductId!);

    const badgeText = await page.locator(S.cartBadge).textContent();
    const badgePrice = parseFloat(
      badgeText?.replace(/[^\d,]/g, "").replace(",", ".") ?? "0",
    );

    // Badge should show 2× the unit price (within floating-point tolerance)
    expect(badgePrice).toBeCloseTo(unitPrice * 2, 1);
  });

  test("decrement (−) removes item when qty reaches 0", async ({ page }) => {
    const sim = new ChatSimPage(page);
    await sim.goto();

    const [firstProductId] = await sim.visibleProductIds();
    expect(firstProductId).toBeTruthy();

    await sim.addProductById(firstProductId!);
    await sim.assertCartBadgeVisible();

    // Click the − button on the only cart chip
    await page.getByRole("button", { name: /Remover 1/ }).click();
    await page.waitForTimeout(300);

    // Cart should now be empty — badge gone
    await expect(page.locator(S.cartBadge)).not.toBeVisible();
  });

  test("remove (×) immediately clears the item", async ({ page }) => {
    const sim = new ChatSimPage(page);
    await sim.goto();

    const [firstProductId] = await sim.visibleProductIds();
    expect(firstProductId).toBeTruthy();

    // Add twice so qty=2, then × removes entirely
    await sim.addProductById(firstProductId!);
    await sim.addProductById(firstProductId!);
    await sim.assertCartBadgeVisible();

    // Click the × button
    await page.getByRole("button", { name: /Remover [^1]/ }).click();
    await page.waitForTimeout(300);

    await expect(page.locator(S.cartBadge)).not.toBeVisible();
  });
});
