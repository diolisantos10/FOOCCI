/**
 * Mercado Pago — Checkout Preferences (payment link creation)
 *
 * Uses the Preferences API to generate a hosted checkout URL.
 * - Production: init_point   (real payments)
 * - Sandbox/Test: sandbox_init_point (TEST_... token)
 */

const MP_API_URL = "https://api.mercadopago.com";

export interface CreateMPPaymentLinkParams {
  orderId: string;
  amount: number;       // BRL, e.g. 49.90
  description: string;
  expiresInMinutes?: number;
  notificationUrl?: string;
}

export interface MPPaymentLinkResult {
  paymentUrl: string;
  providerReference: string; // preference ID
  expiresAt: string;         // ISO-8601
}

export async function createMPPaymentLink(
  accessToken: string,
  params: CreateMPPaymentLinkParams
): Promise<MPPaymentLinkResult> {
  const { orderId, amount, description, expiresInMinutes = 30, notificationUrl } = params;
  const isTest = accessToken.startsWith("TEST-");

  const expiresAt = new Date(Date.now() + expiresInMinutes * 60_000);

  const body: Record<string, unknown> = {
    items: [
      {
        id: orderId,
        title: description,
        quantity: 1,
        unit_price: Math.round(amount * 100) / 100,
        currency_id: "BRL",
      },
    ],
    external_reference: orderId,
    // Allow all payment methods: credit/debit cards, PIX, boleto, MP balance
    payment_methods: {
      excluded_payment_types: [{ id: "ticket" }], // sem boleto bancário
      excluded_payment_methods: [],
      installments: 12,
    },
    // Do NOT set expires on the preference — boleto requires ≥3 business days
    // and a short window would hide it. We track our own expiry in the DB.
    statement_descriptor: "Foocci",
    ...(notificationUrl && { notification_url: notificationUrl }),
  };

  const res = await fetch(`${MP_API_URL}/checkout/preferences`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `Mercado Pago API error ${res.status}: ${JSON.stringify(err)}`
    );
  }

  const data = await res.json();

  const paymentUrl = isTest
    ? (data.sandbox_init_point as string)
    : (data.init_point as string);

  if (!paymentUrl) {
    throw new Error("Mercado Pago não retornou URL de pagamento.");
  }

  return {
    paymentUrl,
    providerReference: data.id as string,
    expiresAt: expiresAt.toISOString(),
  };
}
