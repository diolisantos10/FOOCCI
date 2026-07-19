/**
 * paymentOptions — pure model for the unified /pedido payment UI.
 *
 * UI/UX only: groups the EXISTING payment options into two blocks — "Pagar agora"
 * (online) and "Pagar na entrega/retirada" (on arrival). It does NOT change any
 * payment rule, Pix/Mercado Pago flow, totals or order finalization. Selecting an
 * option still maps to the same paymentMode/paymentMethodSub used today.
 *
 * Kept pure (no React) so the option model is unit-tested.
 */

export type PaymentModeId = "pay_now" | "pay_on_delivery" | "pay_on_pickup";
/** Existing on-arrival sub-methods (unchanged). */
export type DeliverySubId = "card_machine" | "pix_in_person" | "cash";

export interface PayOption {
  /** Stable id used by the click handler (maps to existing state). */
  id: string;
  label: string;
  emoji: string;
  hint?: string;
}

/**
 * Online ("Pagar agora") options — each shown only when its operator is
 * enabled/configured. Pix → Mercado Pago; Cartão → SumUp (checkout transparente).
 */
export function payNowOptions(pixOnlineEnabled: boolean, cardOnlineEnabled = false): PayOption[] {
  const opts: PayOption[] = [];
  if (pixOnlineEnabled)  opts.push({ id: "pix_online",  label: "Pix",                emoji: "⚡", hint: "QR Code ou copia e cola" });
  if (cardOnlineEnabled) opts.push({ id: "card_online", label: "Cartão de crédito",  emoji: "💳", hint: "Pague pelo app, sem sair da tela" });
  return opts;
}

/** Whether the "Pagar agora" block should be shown at all. */
export function shouldShowPayNow(pixOnlineEnabled: boolean, cardOnlineEnabled = false): boolean {
  return payNowOptions(pixOnlineEnabled, cardOnlineEnabled).length > 0;
}

/**
 * On-arrival ("Pagar na entrega/retirada") options. These are the existing,
 * already-supported methods — no new method is invented.
 */
export function deliveryPaymentOptions(): Array<{ id: DeliverySubId } & PayOption> {
  return [
    { id: "cash",         label: "Dinheiro",                              emoji: "💵" },
    { id: "card_machine", label: "Cartão (crédito/débito) na maquininha", emoji: "💳" },
    { id: "pix_in_person", label: "Pix na entrega/retirada",             emoji: "📱" },
  ];
}

/** Maps the fulfillment type to the existing on-arrival payment mode. */
export function resolveArrivalMode(deliveryMethod: "delivery" | "pickup" | null): Extract<PaymentModeId, "pay_on_delivery" | "pay_on_pickup"> {
  return deliveryMethod === "pickup" ? "pay_on_pickup" : "pay_on_delivery";
}

/** Title for the on-arrival block, based on fulfillment type. */
export function arrivalBlockTitle(deliveryMethod: "delivery" | "pickup" | null): string {
  return deliveryMethod === "pickup" ? "Pagar na retirada" : "Pagar na entrega";
}
