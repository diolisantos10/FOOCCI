import { test, expect } from "@playwright/test";
import { ChatSimPage } from "../fixtures/page-objects";
import { S } from "../utils/selectors";

/**
 * Spec: Product Modal
 *
 * Validates:
 * 1. Tapping a product card opens the full-screen modal overlay
 * 2. Modal shows product name and price
 * 3. ← Voltar closes the modal without changing cart or stage
 * 4. Adding from modal closes modal and updates cart badge
 */
test.describe("Product Modal", () => {
  test("modal opens on card tap and shows product info", async ({ page }) => {
    const sim = new ChatSimPage(page);
    await sim.goto();

    // ── Pre-condition: no modal ──────────────────────────────────────
    await sim.assertModalHidden();
    await sim.assertBrowseAreaVisible();

    const [firstProductId] = await sim.visibleProductIds();
    expect(firstProductId).toBeTruthy();

    // Tap the card (not the + button)
    await page.locator(S.productCard(firstProductId!)).click();

    // ── Modal must be visible ────────────────────────────────────────
    await sim.assertModalVisible();

    // Browse area is covered but still in DOM (modal is absolute overlay)
    // Stage must not change
    await sim.assertStage("BROWSE");

    // Modal must contain the product name (visible as heading text)
    const modal = page.locator(S.modalOverlay);
    await expect(modal.locator("p.text-lg")).toBeVisible();
    // Price text starts with R$
    await expect(modal.getByText(/R\$\s*\d/)).toBeVisible();
  });

  test("← Voltar closes modal without touching cart", async ({ page }) => {
    const sim = new ChatSimPage(page);
    await sim.goto();

    const [firstProductId] = await sim.visibleProductIds();
    expect(firstProductId).toBeTruthy();

    // Open modal
    await sim.openProductModal(firstProductId!);

    // Cart badge must not be present yet
    await expect(page.locator(S.cartBadge)).not.toBeVisible();

    // Close without adding
    await sim.closeProductModal();

    // ── Modal gone, cart unchanged, browse still visible ─────────────
    await sim.assertModalHidden();
    await sim.assertBrowseAreaVisible();
    await expect(page.locator(S.cartBadge)).not.toBeVisible();
    await sim.assertStage("BROWSE");
  });

  test("adding from modal closes modal and updates cart badge", async ({ page }) => {
    const sim = new ChatSimPage(page);
    await sim.goto();

    const [firstProductId] = await sim.visibleProductIds();
    expect(firstProductId).toBeTruthy();

    // Open modal
    await sim.openProductModal(firstProductId!);
    await sim.assertModalVisible();

    // Add from modal
    await sim.addProductFromModal();

    // ── Modal closed, cart badge appears ────────────────────────────
    await sim.assertModalHidden();
    await sim.assertCartBadgeVisible();
    await sim.assertBrowseAreaVisible();
    await sim.assertStage("BROWSE");
  });
});
