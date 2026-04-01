/**
 * Stone Payment Provider Client
 *
 * Handles OAuth 2.0 token acquisition (55-min in-memory cache) and
 * hosted payment link creation. When STONE_CLIENT_ID is not set,
 * all functions operate in mock mode to support development and E2E tests.
 */

import crypto from "crypto";

// ── Token cache ──────────────────────────────────────────────────

interface CachedToken {
  value: string;
  expiresAt: number; // epoch ms
}

let cachedToken: CachedToken | null = null;

async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.STONE_CLIENT_ID;
  const clientSecret = process.env.STONE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    // Mock mode: no credentials configured
    return null;
  }

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.value;
  }

  const tokenUrl =
    process.env.STONE_TOKEN_URL ?? "https://sandbox-accounts.openbank.stone.com.br/auth/realms/stone_bank/protocol/openid-connect/token";

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new Error(`Stone auth failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };

  cachedToken = {
    value: data.access_token,
    // Use 55 min even if token lasts longer, to avoid edge-case expiry
    expiresAt: now + Math.min(data.expires_in * 1000, 55 * 60 * 1000),
  };

  return cachedToken.value;
}

// ── Create payment link ──────────────────────────────────────────

export interface CreatePaymentLinkParams {
  orderId: string;
  amount: number;       // in BRL (e.g. 49.90)
  description: string;  // shown on checkout page
  expiresInMinutes?: number;  // default 30
}

export interface StonePaymentLinkResult {
  paymentUrl: string;
  providerReference: string;
  expiresAt: string; // ISO-8601
}

export async function createPaymentLink(
  params: CreatePaymentLinkParams
): Promise<StonePaymentLinkResult> {
  const { orderId, amount, description, expiresInMinutes = 30 } = params;
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60_000).toISOString();

  const token = await getAccessToken();

  if (!token) {
    // Mock mode — return a test URL that looks like Stone's
    return {
      paymentUrl: `https://checkout.stone.com.br/test/${orderId}`,
      providerReference: `test_${orderId}`,
      expiresAt,
    };
  }

  const apiUrl =
    process.env.STONE_API_URL ?? "https://sandbox-api.openbank.stone.com.br/api/v1";

  const res = await fetch(`${apiUrl}/payment_links`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      expires_at: expiresAt,
      amount: Math.round(amount * 100), // Stone expects amount in centavos
      description,
      metadata: { orderId },
    }),
  });

  if (!res.ok) {
    throw new Error(`Stone create-link failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as {
    id: string;
    checkout_url: string;
    expires_at: string;
  };

  return {
    paymentUrl: data.checkout_url,
    providerReference: data.id,
    expiresAt: data.expires_at,
  };
}

// ── Webhook signature verification ──────────────────────────────

/**
 * Returns true if the HMAC-SHA256 signature of rawBody matches the
 * provided signature header value. Uses timing-safe comparison.
 *
 * Returns false (not throw) when STONE_WEBHOOK_SECRET is not configured
 * so callers can decide whether to accept or reject unsigned webhooks.
 */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.STONE_WEBHOOK_SECRET;
  if (!secret) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");

  // Stone sends the signature as "sha256=<hex>" or plain hex
  const sigHex = signature.startsWith("sha256=") ? signature.slice(7) : signature;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(sigHex, "hex")
    );
  } catch {
    return false;
  }
}
