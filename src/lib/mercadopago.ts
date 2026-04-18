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
  const { orderId, amount, description, expiresInMinutes = 30 } = params;
  const isTest = accessToken.startsWith("TEST-");

  const expiresAt = new Date(Date.now() + expiresInMinutes * 60_000);

  const body = {
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
    expires: true,
    expiration_date_from: new Date().toISOString(),
    expiration_date_to: expiresAt.toISOString(),
    statement_descriptor: "Foocci",
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
