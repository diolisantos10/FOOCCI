/**
 * Centralized data-testid selector constants for chat-sim Playwright tests.
 * All selectors use [data-testid] attributes added to page.tsx.
 */

export const S = {
  // ── Phone frame ──────────────────────────────────────────────
  /** Root phone frame. Has `data-stage` attribute reflecting current Stage. */
  phoneFrame: '[data-testid="phone-frame"]',

  // ── Browse mode ──────────────────────────────────────────────
  /** Product carousel area — only present when stage=BROWSE and a category is selected */
  browseArea: '[data-testid="browse-area"]',
  /** Category tab button — use categoryTab(id) helper */
  categoryTab: (id: string) => `[data-testid="category-tab-${id}"]`,
  /** Product card — use productCard(id) helper */
  productCard: (id: string) => `[data-testid="product-card-${id}"]`,
  /** Finalizar pedido button */
  finalizeButton: '[data-testid="finalize-button"]',

  // ── Checkout mode ────────────────────────────────────────────
  /** Checkout widget area — only present when stage is a checkout stage */
  checkoutArea: '[data-testid="checkout-area"]',
  /** Address confirm button (stage=ADDRESS_CONFIRM) */
  addressConfirmButton: '[data-testid="address-confirm-button"]',
  /** Address validation error text (stage=ADDRESS_CONFIRM, missing fields) */
  addressError: '[data-testid="address-error"]',
  /** Final confirm order button (stage=REVIEW_ORDER) */
  checkoutConfirmBtn: '[data-testid="checkout-confirm-btn"]',

  // ── Modal ────────────────────────────────────────────────────
  /** Full-screen product modal overlay */
  modalOverlay: '[data-testid="modal-overlay"]',

  // ── Cart ─────────────────────────────────────────────────────
  /** Cart total price badge (only present when cart is non-empty) */
  cartBadge: '[data-testid="cart-badge"]',

  // ── Done state ───────────────────────────────────────────────
  /** DONE stage celebration banner */
  stageDone: '[data-testid="stage-done"]',

  // ── Online payment ───────────────────────────────────────────
  /** Pix option button in ONLINE_METHOD_SELECT stage */
  pixOnlineSelectBtn: '[data-testid="pix-online-select-btn"]',
  /** Cancel Pix and return button in PAYMENT_LINK stage */
  cancelPixBtn: '[data-testid="cancel-pix-btn"]',
} as const;

/** Read the current stage from the phone frame's data-stage attribute. */
export async function getStage(page: import("@playwright/test").Page): Promise<string> {
  return (await page.locator(S.phoneFrame).getAttribute("data-stage")) ?? "";
}
