/**
 * SumUpProvider — credit card via SumUp Online Payments (checkout model).
 *
 *   createCardCheckout    → server creates a SumUp checkout, returns the id +
 *                           non-secret params the client widget needs.
 *   getCardCheckoutStatus → server verifies the final status (PAID/FAILED).
 *
 * Card data never touches our server — the SumUp Card widget collects it in a
 * SumUp iframe (3DS built in).
 */

import { createSumUpCheckout, getSumUpCheckout, type SumUpCredentials } from "@/lib/sumup";
import type {
  CardProvider,
  CardCheckoutInput,
  CardCheckoutInit,
  CardCheckoutResult,
  CardCheckoutStatus,
} from "./types";

/** Maps SumUp's checkout status to our normalized CardCheckoutStatus. */
function normalizeStatus(sumupStatus: string): CardCheckoutStatus {
  switch (sumupStatus.toUpperCase()) {
    case "PAID":      return "paid";
    case "PENDING":   return "pending";
    case "FAILED":
    case "EXPIRED":
    case "CANCELLED": return "failed";
    default:          return "unknown";
  }
}

export interface SumUpProviderOptions {
  maxInstallments?: number;   // parcelas allowed (BR)
  returnUrl?: string;         // optional webhook/return URL
}

export class SumUpProvider implements CardProvider {
  readonly name = "sumup";

  constructor(
    private readonly creds: SumUpCredentials,
    private readonly opts: SumUpProviderOptions = {}
  ) {}

  async createCardCheckout(input: CardCheckoutInput): Promise<CardCheckoutInit> {
    const co = await createSumUpCheckout(this.creds, {
      orderId:     input.orderId,
      amount:      input.amount,
      description: input.description,
      returnUrl:   this.opts.returnUrl,
    });
    return {
      providerName: this.name,
      checkoutId:   co.id,
      clientParams: {
        currency:        co.currency ?? "BRL",
        amount:          (Math.round(input.amount * 100) / 100).toFixed(2),
        merchantCode:    this.creds.merchantCode,
        locale:          "pt-BR",
        maxInstallments: this.opts.maxInstallments,
      },
    };
  }

  async getCardCheckoutStatus(checkoutId: string): Promise<CardCheckoutResult> {
    const co = await getSumUpCheckout(this.creds, checkoutId);
    return {
      providerName: this.name,
      checkoutId:   co.id || checkoutId,
      status:       normalizeStatus(co.status),
      statusDetail: co.status,
      last4:        co.last4,
      brand:        co.brand,
      installments: co.installments,
      amount:       co.amount,
    };
  }
}
