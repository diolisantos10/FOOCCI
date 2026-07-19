/**
 * MercadoPagoProvider — Pix + transparent card via the Mercado Pago Payments API.
 *
 * Wraps the low-level lib/mercadopago helpers behind the shared PaymentProvider
 * interface so the router can treat MP like any other operadora.
 */

import { createPixPayment, createCardPayment } from "@/lib/mercadopago";
import type {
  PaymentProvider,
  PaymentMethodKind,
  PixChargeInput,
  PixChargeResult,
  CardChargeInput,
  CardChargeResult,
  CardChargeStatus,
} from "./types";

/** Maps MP's raw payment status to our normalized CardChargeStatus. */
function normalizeStatus(mpStatus: string): CardChargeStatus {
  switch (mpStatus) {
    case "approved":   return "approved";
    case "authorized": return "approved";
    case "in_process":
    case "pending":    return "pending";
    case "rejected":   return "rejected";
    case "cancelled":
    case "refunded":
    case "charged_back": return "cancelled";
    default: return "unknown";
  }
}

export class MercadoPagoProvider implements PaymentProvider {
  readonly name = "mercadopago";

  constructor(private readonly accessToken: string) {}

  supports(kind: PaymentMethodKind): boolean {
    return kind === "pix" || kind === "card";
  }

  async createPixCharge(input: PixChargeInput): Promise<PixChargeResult> {
    const r = await createPixPayment(this.accessToken, {
      orderId:          input.orderId,
      amount:           input.amount,
      description:      input.description,
      notificationUrl:  input.notificationUrl,
      expiresInMinutes: input.expiresInMinutes,
    });
    return {
      providerName:      this.name,
      providerPaymentId: r.paymentId,
      pixCopyPaste:      r.pixCopyPaste,
      pixQrCodeBase64:   r.pixQrCodeBase64,
      expiresAt:         r.expiresAt,
      status:            r.status,
    };
  }

  async createCardCharge(input: CardChargeInput): Promise<CardChargeResult> {
    const r = await createCardPayment(this.accessToken, {
      orderId:         input.orderId,
      amount:          input.amount,
      description:     input.description,
      token:           input.cardToken,
      installments:    input.installments,
      paymentMethodId: input.paymentMethodId,
      issuerId:        input.issuerId,
      payerEmail:      input.payerEmail,
      notificationUrl: input.notificationUrl,
    });
    return {
      providerName:      this.name,
      providerPaymentId: r.paymentId,
      status:            normalizeStatus(r.status),
      statusDetail:      r.statusDetail,
      last4:             r.last4,
      brand:             r.brand,
      installments:      r.installments,
    };
  }
}
