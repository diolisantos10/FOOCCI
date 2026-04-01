import { Page, expect } from "@playwright/test";
import { S, getStage } from "../utils/selectors";

/**
 * ChatSimPage — typed helper methods for interacting with the chat-sim simulator.
 * Each method encapsulates a single user action and waits for the app to settle.
 */
export class ChatSimPage {
  constructor(readonly page: Page) {}

  // ── Navigation ──────────────────────────────────────────────

  async goto() {
    await this.page.goto("/chat-sim");
    // Wait for categories to load (menu fetched from API)
    await this.page.waitForSelector(S.browseArea, { timeout: 20_000 });
  }

  // ── Idle wait helper ────────────────────────────────────────
  /**
   * Wait until the textarea is enabled, which means ui !== "thinking".
   * Use before every button click that can trigger an async AI call.
   */
  private async waitForIdle() {
    await expect(this.page.locator("textarea")).toBeEnabled({ timeout: 10_000 });
  }

  // ── Menu helpers ─────────────────────────────────────────────

  /** Returns all category tab locators currently in the DOM. */
  categoryTabs() {
    return this.page.locator('[data-testid^="category-tab-"]');
  }

  /** Returns the id of all visible category tabs. */
  async categoryIds(): Promise<string[]> {
    const tabs = this.categoryTabs();
    const count = await tabs.count();
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const testid = await tabs.nth(i).getAttribute("data-testid");
      if (testid) ids.push(testid.replace("category-tab-", ""));
    }
    return ids;
  }

  /** Returns ids of all product cards currently visible in browse-area. */
  async visibleProductIds(): Promise<string[]> {
    const cards = this.page.locator('[data-testid^="product-card-"]');
    const count = await cards.count();
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const testid = await cards.nth(i).getAttribute("data-testid");
      if (testid) ids.push(testid.replace("product-card-", ""));
    }
    return ids;
  }

  /** Click a category tab by its id. */
  async clickCategory(id: string) {
    await this.page.locator(S.categoryTab(id)).click();
    // Wait for product carousel to re-render
    await this.page.waitForTimeout(200);
  }

  /** Open a product modal by product id. */
  async openProductModal(productId: string) {
    await this.page.locator(S.productCard(productId)).click();
    await expect(this.page.locator(S.modalOverlay)).toBeVisible();
  }

  /** Close the product modal via the back button. */
  async closeProductModal() {
    await this.page.locator(S.modalOverlay).getByText("← Voltar").click();
    await expect(this.page.locator(S.modalOverlay)).not.toBeVisible();
  }

  /** Add a product via its card's + button (no modal). */
  async addProductById(productId: string) {
    await this.waitForIdle();
    const card = this.page.locator(S.productCard(productId));
    // The + button is the last button inside the card
    await card.locator("button").last().click();
    await this.page.waitForTimeout(300);
  }

  /** Add a product from the currently open modal. */
  async addProductFromModal() {
    await this.page.locator(S.modalOverlay).getByText("+ Adicionar ao pedido").click();
    // Modal closes automatically after add
    await expect(this.page.locator(S.modalOverlay)).not.toBeVisible();
  }

  // ── Checkout flow helpers ────────────────────────────────────

  /** Click the Finalizar pedido button. */
  async clickFinalize() {
    await this.waitForIdle();
    await this.page.locator(S.finalizeButton).click();
    await this.page.waitForTimeout(400);
  }

  /** Select delivery method (DELIVERY_TYPE stage). */
  async selectDelivery(type: "delivery" | "pickup") {
    await this.waitForIdle();
    const label = type === "delivery" ? "🛵 Entrega" : "🏪 Retirada";
    await this.page.locator(S.checkoutArea).getByText(label).click();
    await this.page.waitForTimeout(300);
  }

  /** Type into the text input and submit. */
  async sendInput(text: string) {
    const textarea = this.page.locator("textarea");
    // Wait for the textarea to be enabled (ui !== "thinking") before submitting.
    // A fixed 300ms wait is not reliable: if a previous action triggered an async
    // AI call, handleSubmit silently returns when ui === "thinking", dropping the input.
    await expect(textarea).toBeEnabled({ timeout: 10_000 });
    await textarea.fill(text);
    await textarea.press("Enter");
    await this.page.waitForTimeout(300);
  }

  /** Click Confirmar endereço (ADDRESS_CONFIRM stage). */
  async confirmAddress() {
    await this.waitForIdle();
    await this.page.locator(S.addressConfirmButton).click();
    await this.page.waitForTimeout(300);
  }

  /** Select payment mode (PAYMENT stage). */
  async selectPaymentMode(mode: "pay_now" | "pay_on_delivery" | "pay_on_pickup") {
    await this.waitForIdle();
    const labels = {
      pay_now: "💳 Pagar agora (link)",
      pay_on_delivery: "🛵 Pagar na entrega",
      pay_on_pickup: "🏪 Pagar na retirada",
    };
    await this.page.locator(S.checkoutArea).getByText(labels[mode]).click();
    await this.page.waitForTimeout(300);
  }

  /** Select payment sub-method (PAYMENT_METHOD stage). */
  async selectPaymentMethodSub(method: "pix_in_person" | "card_machine" | "cash") {
    await this.waitForIdle();
    const labels = {
      pix_in_person: "📱 Pix",
      card_machine: "💳 Cartão",
      cash: "💵 Dinheiro",
    };
    await this.page.locator(S.checkoutArea).getByText(labels[method]).click();
    await this.page.waitForTimeout(300);
  }

  /** @deprecated Use selectPaymentMode + selectPaymentMethodSub instead */
  async selectPayment(method: "pix" | "cartao" | "dinheiro") {
    const modeMap = {
      pix: "pay_on_delivery" as const,
      cartao: "pay_on_delivery" as const,
      dinheiro: "pay_on_delivery" as const,
    };
    const subMap = {
      pix: "pix_in_person" as const,
      cartao: "card_machine" as const,
      dinheiro: "cash" as const,
    };
    await this.selectPaymentMode(modeMap[method]);
    await this.assertStage("PAYMENT_METHOD");
    await this.selectPaymentMethodSub(subMap[method]);
  }

  /** Click Confirmar pedido (REVIEW_ORDER stage). */
  async confirmOrder() {
    await this.waitForIdle();
    await this.page.locator(S.checkoutConfirmBtn).click();
    await this.page.waitForTimeout(300);
  }

  // ── Assertions helpers ───────────────────────────────────────

  async assertStage(expected: string) {
    await expect(async () => {
      expect(await getStage(this.page)).toBe(expected);
    }).toPass({ timeout: 5_000 });
  }

  async assertBrowseAreaVisible() {
    await expect(this.page.locator(S.browseArea)).toBeVisible();
  }

  async assertBrowseAreaHidden() {
    await expect(this.page.locator(S.browseArea)).not.toBeVisible();
  }

  async assertCheckoutAreaVisible() {
    await expect(this.page.locator(S.checkoutArea)).toBeVisible();
  }

  async assertCheckoutAreaHidden() {
    await expect(this.page.locator(S.checkoutArea)).not.toBeVisible();
  }

  async assertModalVisible() {
    await expect(this.page.locator(S.modalOverlay)).toBeVisible();
  }

  async assertModalHidden() {
    await expect(this.page.locator(S.modalOverlay)).not.toBeVisible();
  }

  async assertCartBadgeText(expected: string) {
    await expect(this.page.locator(S.cartBadge)).toHaveText(expected);
  }

  async assertCartBadgeVisible() {
    await expect(this.page.locator(S.cartBadge)).toBeVisible();
  }

  async assertStageDoneVisible() {
    await expect(this.page.locator(S.stageDone)).toBeVisible();
  }
}
