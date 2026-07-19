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

import crypto from "crypto";

const MP_API_URL = "https://api.mercadopago.com";

// ── Webhook signature verification ───────────────────────────────────────────

/**
 * Result of verifyMpWebhookSignature().
 *   "verified"  — signature present and matches
 *   "invalid"   — signature present but does not match (reject request)
 *   "missing"   — x-signature header absent (caller decides whether to allow)
 *   "no_secret" — MERCADO_PAGO_WEBHOOK_SECRET not configured (caller decides)
 */
export type MpSigResult = "verified" | "invalid" | "missing" | "no_secret";

/**
 * Verifies the official Mercado Pago Webhooks API signature.
 *
 * Official spec (https://www.mercadopago.com.br/developers/en/docs/your-integrations/notifications/webhooks):
 *   x-signature  : "ts=<epoch_seconds>,v1=<hmac_sha256_hex>"
 *   x-request-id : "<uuid>"
 *
 * Manifest: "id:<dataId>;request-id:<xRequestId>;ts:<ts>;"
 * HMAC-SHA256 keyed with MERCADO_PAGO_WEBHOOK_SECRET.
 *
 * @param dataId      The payment/resource ID from the notification body (data.id).
 * @param xSignature  Value of the x-signature header.
 * @param xRequestId  Value of the x-request-id header.
 */
export function verifyMpWebhookSignature(
  dataId: string,
  xSignature: string,
  xRequestId: string,
): MpSigResult {
  if (!xSignature) return "missing";

  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  if (!secret) return "no_secret";

  // Parse "ts=<value>,v1=<value>" — ignore unknown parts
  const parts: Record<string, string> = {};
  for (const part of xSignature.split(",")) {
    const eqIdx = part.indexOf("=");
    if (eqIdx > 0) parts[part.slice(0, eqIdx).trim()] = part.slice(eqIdx + 1).trim();
  }
  const ts = parts["ts"];
  const v1 = parts["v1"];
  if (!ts || !v1) return "invalid";

  // Build manifest per MP spec
  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(manifest, "utf8")
    .digest("hex");

  try {
    const expectedBuf = Buffer.from(expected, "hex");
    const v1Buf       = Buffer.from(v1,       "hex");
    if (expectedBuf.length !== v1Buf.length) return "invalid";
    return crypto.timingSafeEqual(expectedBuf, v1Buf) ? "verified" : "invalid";
  } catch {
    return "invalid";
  }
}

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

// ── Transparent card (Checkout API) ───────────────────────────────────────────

export interface CreateCardPaymentParams {
  orderId: string;
  amount: number;              // BRL
  description: string;
  token: string;               // card token created CLIENT-SIDE by the MP SDK.
                               //   Raw PAN/CVV never reach our server (PCI SAQ A-EP).
  installments: number;        // 1 = à vista
  paymentMethodId?: string;    // "visa" | "master" | ... (from the MP SDK)
  issuerId?: string;           // card issuer id (from the MP SDK)
  payerEmail?: string;
  notificationUrl?: string;
}

export interface MPCardResult {
  paymentId: string;
  status: string;              // "approved" | "in_process" | "rejected" | ...
  statusDetail: string;        // e.g. "accredited", "cc_rejected_insufficient_amount"
  last4?: string;
  brand?: string;              // payment_method_id echoed back (visa/master/…)
  installments: number;
}

/**
 * Charges a tokenized card via the Mercado Pago Payments API — the "checkout
 * transparente" flow. The customer never leaves Foocci and never sees Mercado
 * Pago: the card is tokenized in the browser by the MP SDK, and only the opaque
 * token reaches us. We POST it to /v1/payments and get an immediate result.
 */
export async function createCardPayment(
  accessToken: string,
  params: CreateCardPaymentParams
): Promise<MPCardResult> {
  const {
    orderId, amount, description, token, installments,
    paymentMethodId, issuerId, payerEmail, notificationUrl,
  } = params;

  const body: Record<string, unknown> = {
    transaction_amount: Math.round(amount * 100) / 100,
    token,
    description,
    installments: Math.max(1, Math.floor(installments || 1)),
    external_reference: orderId,
    payer: {
      email: payerEmail?.trim() || `pedido-${orderId.slice(-8).toLowerCase()}@foocci.app`,
    },
    ...(paymentMethodId && { payment_method_id: paymentMethodId }),
    ...(issuerId && { issuer_id: issuerId }),
    ...(notificationUrl && { notification_url: notificationUrl }),
  };

  const res = await fetch(`${MP_API_URL}/v1/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      // One charge per order — a retry with the same key never double-charges.
      "X-Idempotency-Key": `mercadopago-card-${orderId}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    // MP returns a helpful `message`/`cause` on 4xx (bad token, etc.)
    throw new Error(
      `Mercado Pago card charge error ${res.status}: ${JSON.stringify(data)}`
    );
  }

  const card = (data.card as Record<string, unknown> | undefined) ?? undefined;

  return {
    paymentId:    String(data.id),
    status:       (data.status as string) ?? "unknown",
    statusDetail: (data.status_detail as string) ?? "",
    last4:        (card?.last_four_digits as string | undefined) ?? undefined,
    brand:        (data.payment_method_id as string | undefined) ?? paymentMethodId,
    installments: (data.installments as number | undefined) ?? Math.max(1, Math.floor(installments || 1)),
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
