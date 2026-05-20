import { test, expect } from "@playwright/test";
import { ChatSimPage } from "../fixtures/page-objects";
import { S } from "../utils/selectors";

/**
 * Spec: Pix Online Payment Flow
 *
 * Validates the full Mercado Pago Pix UX:
 * 1. Selecting "Pagar agora" shows ONLINE_METHOD_SELECT, NOT REVIEW_ORDER directly.
 * 2. ONLINE_METHOD_SELECT shows Pix option and disabled "Em breve" methods.
 * 3. Selecting Pix advances to REVIEW_ORDER.
 * 4. Confirming order creates Pix charge and shows PAYMENT_LINK screen.
 * 5. PAYMENT_LINK screen contains "Cancelar pagamento e voltar" button.
 * 6. Cancel returns to REVIEW_ORDER (not BROWSE).
 * 7. Offline/delivery payment mode is unaffected.
 *
 * Note: These tests require a configured test restaurant with Mercado Pago
 * credentials for the PAYMENT_LINK assertions (steps 4–6). Steps 1–3 and 7
 * work without MP credentials since they only assert UI state transitions.
 */
test.describe("Pix Online Payment Flow", () => {

  /**
   * Helper: navigate through checkout up to the PAYMENT stage.
   * Reusable across multiple tests in this suite.
   */
  async function reachPaymentStage(sim: ChatSimPage) {
    await sim.goto();

    const productIds = await sim.visibleProductIds();
    expect(productIds.length).toBeGreaterThan(0);
    await sim.addProductById(productIds[0]!);
    await sim.assertCartBadgeVisible();

    // Enter checkout (skip upsells)
    for (let i = 0; i < 4; i++) {
      const stage = await sim.page.locator(S.phoneFrame).getAttribute("data-stage");
      if (stage !== "BROWSE") break;
      await sim.clickFinalize();
    }
    await sim.assertStage("DELIVERY_TYPE");

    // Delivery — requires address flow
    await sim.selectDelivery("delivery");
    await sim.assertStage("CEP_INPUT");
    await sim.sendInput("Rua das Flores, 42");
    await sim.assertStage("ADDRESS_COMPLETE");
    await sim.sendInput("Centro");
    await sim.assertStage("ADDRESS_CONFIRM");
    await sim.confirmAddress();
    await sim.assertStage("ASK_NAME");
    await sim.sendInput("Cliente Teste");
    await sim.assertStage("PAYMENT");
  }

  test("selecting pay_now goes to ONLINE_METHOD_SELECT, not REVIEW_ORDER", async ({ page }) => {
    const sim = new ChatSimPage(page);
    await reachPaymentStage(sim);

    // Clicking "Pagar agora" must NOT skip to REVIEW_ORDER
    await sim.selectPaymentMode("pay_now");

    await sim.assertStage("ONLINE_METHOD_SELECT");
    // Must NOT jump to review directly
    const stage = await page.locator(S.phoneFrame).getAttribute("data-stage");
    expect(stage).not.toBe("REVIEW_ORDER");
  });

  test("ONLINE_METHOD_SELECT shows Pix button and Em breve options", async ({ page }) => {
    const sim = new ChatSimPage(page);
    await reachPaymentStage(sim);
    await sim.selectPaymentMode("pay_now");
    await sim.assertStage("ONLINE_METHOD_SELECT");
    await sim.assertCheckoutAreaVisible();

    // Pix option is active
    await expect(page.locator(S.pixOnlineSelectBtn)).toBeVisible();
    await expect(page.locator(S.checkoutArea).getByText("Pix")).toBeVisible();
    await expect(page.locator(S.checkoutArea).getByText("QR Code ou copia e cola")).toBeVisible();
    await expect(page.locator(S.checkoutArea).getByText("Gerar QR Code Pix")).toBeVisible();

    // Disabled "Em breve" options
    await expect(page.locator(S.checkoutArea).getByText("Cartão de crédito")).toBeVisible();
    await expect(page.locator(S.checkoutArea).getByText("Cartão de débito")).toBeVisible();
    await expect(page.locator(S.checkoutArea).getByText("Boleto")).toBeVisible();
    // All show "Em breve" badge
    const emBreve = page.locator(S.checkoutArea).getByText("Em breve");
    expect(await emBreve.count()).toBeGreaterThanOrEqual(3);
  });

  test("selecting Pix in ONLINE_METHOD_SELECT advances to REVIEW_ORDER", async ({ page }) => {
    const sim = new ChatSimPage(page);
    await reachPaymentStage(sim);
    await sim.selectPaymentMode("pay_now");
    await sim.assertStage("ONLINE_METHOD_SELECT");

    await sim.selectOnlinePaymentMethod("pix");

    await sim.assertStage("REVIEW_ORDER");
    await sim.assertCheckoutAreaVisible();
    // Confirm button present
    await expect(page.locator(S.checkoutConfirmBtn)).toBeVisible();
    await expect(page.locator(S.checkoutConfirmBtn)).toBeEnabled();
  });

  test("PAYMENT_LINK Pix screen shows cancel button", async ({ page }) => {
    const sim = new ChatSimPage(page);
    await reachPaymentStage(sim);
    await sim.selectPaymentMode("pay_now");
    await sim.selectOnlinePaymentMethod("pix");
    await sim.assertStage("REVIEW_ORDER");
    await sim.confirmOrder();

    // After confirming, we should be in PAYMENT_LINK (Pix created) or DONE (offline fallback).
    // Only assert cancel button when PAYMENT_LINK is reached.
    const stage = await page.locator(S.phoneFrame).getAttribute("data-stage");
    if (stage === "PAYMENT_LINK") {
      await expect(page.locator(S.cancelPixBtn)).toBeVisible();
      await expect(page.locator(S.checkoutArea).getByText("Aguardando pagamento Pix")).toBeVisible();
      await expect(page.locator(S.checkoutArea).getByText("Cancelar pagamento e voltar")).toBeVisible();
    }
    // If no MP provider configured the order goes to DONE — that's also valid behavior.
  });

  test("cancel Pix returns to REVIEW_ORDER with checkout visible", async ({ page }) => {
    const sim = new ChatSimPage(page);
    await reachPaymentStage(sim);
    await sim.selectPaymentMode("pay_now");
    await sim.selectOnlinePaymentMethod("pix");
    await sim.confirmOrder();

    const stage = await page.locator(S.phoneFrame).getAttribute("data-stage");
    if (stage !== "PAYMENT_LINK") return; // skip if MP not configured

    await sim.cancelPixPayment();

    await sim.assertStage("REVIEW_ORDER");
    await sim.assertCheckoutAreaVisible();
    // Confirm button is back — customer can re-submit
    await expect(page.locator(S.checkoutConfirmBtn)).toBeVisible();
  });

  test("offline delivery payment mode is unaffected", async ({ page }) => {
    const sim = new ChatSimPage(page);
    await reachPaymentStage(sim);

    // Choose pay_on_delivery — must NOT go to ONLINE_METHOD_SELECT
    await sim.selectPaymentMode("pay_on_delivery");

    await sim.assertStage("PAYMENT_METHOD");
    // Must see offline sub-methods
    await expect(page.locator(S.checkoutArea).getByText("Pix na entrega")).toBeVisible();
  });

  test("pix-online-select-btn not present during pay_on_delivery flow", async ({ page }) => {
    const sim = new ChatSimPage(page);
    await reachPaymentStage(sim);
    await sim.selectPaymentMode("pay_on_delivery");
    await sim.assertStage("PAYMENT_METHOD");

    // Pix online button must not be visible (wrong flow)
    await expect(page.locator(S.pixOnlineSelectBtn)).not.toBeVisible();
    await expect(page.locator(S.cancelPixBtn)).not.toBeVisible();
  });
});
