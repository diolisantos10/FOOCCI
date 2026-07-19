/**
 * Payment provider abstraction — the seam that makes the checkout "transparente"
 * and multi-operadora.
 *
 * Pix and card are DIFFERENT flows, so they have different provider shapes:
 *
 *   PixProvider  — charge model. Server creates a charge and gets back a
 *                  copy-paste/QR; the customer pays in their bank app; a
 *                  webhook/poll confirms. (Mercado Pago.)
 *
 *   CardProvider — checkout model. Server creates a checkout; the client
 *                  mounts the operator's card widget (card data never touches
 *                  our server — PCI-safe); the server then verifies the final
 *                  status. (SumUp.)
 *
 * The customer never sees which operator processed the charge — the
 * PaymentRouter picks one per method behind the scenes.
 */

export type PaymentMethodKind = "pix" | "card";

// ── Pix (charge model) ─────────────────────────────────────────────────────────

export interface PixChargeInput {
  orderId: string;
  amount: number;              // BRL
  description: string;
  notificationUrl?: string;
  expiresInMinutes?: number;
  payerEmail?: string;
}

export interface PixChargeResult {
  providerName: string;
  providerPaymentId: string;
  pixCopyPaste: string;
  pixQrCodeBase64: string;     // base64 PNG — rendered inline, never persisted
  expiresAt: string;           // ISO-8601
  status: string;
}

export interface PixProvider {
  readonly name: string;
  createPixCharge(input: PixChargeInput): Promise<PixChargeResult>;
}

// ── Card (checkout model) ──────────────────────────────────────────────────────

export interface CardCheckoutInput {
  orderId: string;
  amount: number;              // BRL
  description: string;
  payerEmail?: string;
  installments?: number;       // 1 = à vista (widget still lets the customer pick)
}

/** Non-secret values handed to the client so it can mount the card widget. */
export interface CardCheckoutClientParams {
  currency: string;            // "BRL"
  amount: string;              // formatted for the widget button, e.g. "90.50"
  merchantCode?: string;       // SumUp merchant identifier (not a secret)
  locale?: string;             // "pt-BR"
  maxInstallments?: number;    // parcelas allowed (BR)
}

export interface CardCheckoutInit {
  providerName: string;
  checkoutId: string;          // operator-side checkout id the widget mounts
  clientParams: CardCheckoutClientParams;
}

/** Normalized final status across card operators. */
export type CardCheckoutStatus = "paid" | "pending" | "failed" | "unknown";

export interface CardCheckoutResult {
  providerName: string;
  checkoutId: string;
  status: CardCheckoutStatus;
  statusDetail?: string;       // raw operator detail, for logs/support
  last4?: string;
  brand?: string;
  installments?: number;
  amount?: number;
}

export interface CardProvider {
  readonly name: string;
  /** Create the operator-side checkout the client widget will complete. */
  createCardCheckout(input: CardCheckoutInput): Promise<CardCheckoutInit>;
  /** Verify the final status server-side — never trust the client's "success". */
  getCardCheckoutStatus(checkoutId: string): Promise<CardCheckoutResult>;
}
