/**
 * MercadoPagoProvider — Pix via the Mercado Pago Payments API.
 *
 * Mercado Pago is used for Pix ONLY in this operation. Card is handled by a
 * dedicated card operator (SumUp) — see PaymentRouter / SumUpProvider.
 */

import { createPixPayment } from "@/lib/mercadopago";
import type { PixProvider, PixChargeInput, PixChargeResult } from "./types";

export class MercadoPagoProvider implements PixProvider {
  readonly name = "mercadopago";

  constructor(private readonly accessToken: string) {}

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
}
