/**
 * Mercado Pago — Payment integrations
 *
 * PRIMARY: createPixPayment() — direct Pix via Payments API.
 *   Creates a payment with payment_method_id="pix" and returns the QR code
 *   and copy-paste key to render inline in Foocci (no MP-hosted redirect).
 *
 * FALLBACK: createMPPaymentLink() — Checkout Pro (preference/redirect).
 *   Kept as compatibility layer. Excludes all non-Pix methods at preference
 *   level so even if customers reach the hosted page they only see Pix.
 */

const MP_API_URL = "https://api.mercadopago.com";

// ── Direct Pix (preferred) ────────────────────────────────────────────────────

export interface CreatePixPaymentParams {
  orderId: string;
  amount: number;        // BRL, e.g. 49.90
  description: string;
  notificationUrl?: string;
  expiresInMinutes?: number;
}

export interface MPPixResult {
  paymentId: string;       // MP numeric payment ID (stored as providerReference)
  pixCopyPaste: string;    // Pix Copia e Cola string (stored in paymentUrl column)
  pixQrCodeBase64: string; // base64 PNG — returned to frontend, not persisted
  expiresAt: string;       // ISO-8601
  status: string;          // "pending"
}

export async function createPixPayment(
  accessToken: string,
  params: CreatePixPaymentParams
): Promise<MPPixResult> {
  const { orderId, amount, description, notificationUrl, expiresInMinutes = 30 } = params;

  const expiresAt = new Date(Date.now() + expiresInMinutes * 60_000);

  const body: Record<string, unknown> = {
    transaction_amount: Math.round(amount * 100) / 100,
    description,
    payment_method_id: "pix",
    payer: {
      // MP requires an email for the payer — use a synthetic one since we don't
      // collect customer email during checkout.
      email: `pedido-${orderId.slice(-8).toLowerCase()}@foocci.app`,
    },
    external_reference: orderId,
    date_of_expiration: expiresAt.toISOString(),
    ...(notificationUrl && { notification_url: notificationUrl }),
  };

  const res = await fetch(`${MP_API_URL}/v1/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      "X-Idempotency-Key": `mercadopago-pix-${orderId}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `Mercado Pago Payments API error ${res.status}: ${JSON.stringify(err)}`
    );
  }

  const data = await res.json();

  const txData = (data.point_of_interaction as Record<string, unknown> | undefined)
    ?.transaction_data as Record<string, unknown> | undefined;

  const pixCopyPaste   = (txData?.qr_code as string | undefined) ?? "";
  const pixQrCodeBase64 = (txData?.qr_code_base64 as string | undefined) ?? "";

  if (!pixCopyPaste) {
    throw new Error("Mercado Pago não retornou código Pix. Verifique as credenciais.");
  }

  // Honour expiration returned by MP if present; fall back to our calculated value.
  const mpExpiry = data.date_of_expiration as string | undefined;

  return {
    paymentId:       String(data.id),
    pixCopyPaste,
    pixQrCodeBase64,
    expiresAt:       mpExpiry ?? expiresAt.toISOString(),
    status:          (data.status as string) ?? "pending",
  };
}

// ── Checkout Pro (compatibility layer) ────────────────────────────────────────

export interface CreateMPPaymentLinkParams {
  orderId: string;
  amount: number;
  description: string;
  expiresInMinutes?: number;
  notificationUrl?: string;
}

export interface MPPaymentLinkResult {
  paymentUrl: string;
  providerReference: string; // preference ID
  expiresAt: string;         // ISO-8601
}

/**
 * Creates a Checkout Pro preference restricted to Pix only.
 * Used as a fallback; prefer createPixPayment() for new flows.
 */
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
    // Pix-only: exclude every non-Pix payment type
    payment_methods: {
      excluded_payment_types: [
        { id: "credit_card" },
        { id: "debit_card" },
        { id: "ticket" },
        { id: "prepaid_card" },
        { id: "digital_currency" },
        { id: "digital_wallet" },
        { id: "voucher_card" },
      ],
      excluded_payment_methods: [],
      installments: 1,
    },
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
