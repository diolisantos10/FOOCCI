/**
 * Payment provider abstraction — the seam that makes the checkout "transparente"
 * and multi-operadora.
 *
 * Every acquirer/PSP (Mercado Pago today; others later) implements PaymentProvider.
 * The customer never sees which one processed the charge — the PaymentRouter picks
 * a provider per method (card → operator A, Pix → operator B) behind the scenes.
 *
 * Card charges take an opaque token that is created CLIENT-SIDE by the provider's
 * SDK. Raw card numbers never reach our servers (PCI SAQ A-EP).
 */

export type PaymentMethodKind = "pix" | "card";

// ── Pix ────────────────────────────────────────────────────────────────────────

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

// ── Card (transparent) ─────────────────────────────────────────────────────────

export interface CardChargeInput {
  orderId: string;
  amount: number;              // BRL
  description: string;
  cardToken: string;           // tokenized client-side — raw PAN/CVV never reach us
  installments: number;        // 1 = à vista
  paymentMethodId?: string;    // brand id from the SDK (visa/master/…)
  issuerId?: string;
  payerEmail?: string;
  notificationUrl?: string;
}

/** Normalized outcome across providers, so callers don't special-case each PSP. */
export type CardChargeStatus =
  | "approved"
  | "pending"     // in_process / awaiting review
  | "rejected"
  | "cancelled"
  | "unknown";

export interface CardChargeResult {
  providerName: string;
  providerPaymentId: string;
  status: CardChargeStatus;
  statusDetail?: string;       // raw provider detail, for logs/support
  last4?: string;
  brand?: string;
  installments: number;
}

// ── Provider ─────────────────────────────────────────────────────────────────

export interface PaymentProvider {
  readonly name: string;
  supports(kind: PaymentMethodKind): boolean;
  /** Throws if the provider does not support Pix — gate with supports() first. */
  createPixCharge(input: PixChargeInput): Promise<PixChargeResult>;
  /** Throws if the provider does not support card — gate with supports() first. */
  createCardCharge(input: CardChargeInput): Promise<CardChargeResult>;
}
