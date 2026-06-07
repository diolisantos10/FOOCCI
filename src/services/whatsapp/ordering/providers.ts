/**
 * Delivery + payment provider interfaces — W0/W1 placeholders.
 *
 * These interfaces define the contract for future implementations.
 * Do NOT call Mercado Pago from here. Do NOT generate real Pix.
 * Do NOT call any delivery routing API yet.
 *
 * The StubPaymentProvider and StubDeliveryProvider exist for dry-run
 * simulation and tests only.
 */

import type { WaDeliveryQuote } from "./types";

// ── Delivery ──────────────────────────────────────────────────────────────────

export interface DeliveryQuoteInput {
  restaurantId: string;
  address:      string;
  subtotal:     number;
}

export interface DeliveryQuoteProvider {
  quoteAddress(input: DeliveryQuoteInput): Promise<WaDeliveryQuote>;
  validateDeliveryArea(restaurantId: string, address: string): Promise<boolean>;
}

/** Stub for dry-run — never calls a real routing service. */
export class StubDeliveryProvider implements DeliveryQuoteProvider {
  async quoteAddress(_input: DeliveryQuoteInput): Promise<WaDeliveryQuote> {
    // W0/W1: delivery fee calculation deferred to future implementation.
    // Will reuse src/lib/delivery-fee-resolver.ts when wired.
    return { fee: 0, status: "unknown", reason: "dry_run_stub" };
  }

  async validateDeliveryArea(_restaurantId: string, _address: string): Promise<boolean> {
    return false; // conservative: always false until real implementation
  }
}

// ── Payment ───────────────────────────────────────────────────────────────────

export interface PixPaymentInput {
  restaurantId:  string;
  orderId:       string;
  amount:        number;
  customerName:  string;
  customerPhone: string;
}

export interface PixPaymentResult {
  paymentId:  string;
  qrCode:     string;
  qrCodeText: string;
  expiresAt:  Date;
  status:     "pending";
}

export type PixPaymentStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface PaymentProvider {
  createPixPayment(input: PixPaymentInput): Promise<PixPaymentResult>;
  getPaymentStatus(paymentId: string): Promise<PixPaymentStatus>;
}

/**
 * Stub for dry-run — NEVER calls Mercado Pago or any real payment API.
 *
 * Safety: a real order is ONLY confirmed when the Mercado Pago webhook
 * fires with status=approved and updates the Order in the DB. Calling
 * createPixPayment alone is NOT enough. This stub enforces that design by
 * always returning status="pending" and a fake payload.
 */
export class StubPaymentProvider implements PaymentProvider {
  async createPixPayment(input: PixPaymentInput): Promise<PixPaymentResult> {
    // Proof: this class never imports or calls src/lib/mercadopago.ts
    return {
      paymentId:  `dry_run_${input.orderId}`,
      qrCode:     "data:image/png;base64,STUB",
      qrCodeText: "00020101021226580014br.gov.bcb.pix.stub",
      expiresAt:  new Date(Date.now() + 30 * 60_000),
      status:     "pending",
    };
  }

  async getPaymentStatus(_paymentId: string): Promise<PixPaymentStatus> {
    // A pending Pix stub never auto-approves — order confirmation only
    // comes from the real MP webhook (POST /api/payments/mercadopago/webhook).
    return "pending";
  }
}
