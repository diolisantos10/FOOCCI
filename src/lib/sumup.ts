/**
 * Low-level client for SumUp Online Payments.
 *   Docs: https://developer.sumup.com/online-payments
 *
 * Flow (transparent / PCI-safe):
 *   1. Server creates a checkout  → POST /v0.1/checkouts  → { id, status: PENDING }
 *   2. Client mounts the SumUp Card widget with that id; the customer types the
 *      card in SumUp's iframe (card data NEVER reaches our server, 3DS built in).
 *   3. Server verifies the final status → GET /v0.1/checkouts/{id} → PAID/FAILED.
 *
 * Auth: `Authorization: Bearer <apiKey>` — a SumUp secret API key (sup_sk_…) or
 * an OAuth access token. Server-to-server only; the secret never reaches the client.
 */

const SUMUP_API = "https://api.sumup.com/v0.1";

export interface SumUpCredentials {
  apiKey: string;         // secret — Bearer token
  merchantCode: string;   // merchant identifier (not a secret)
}

export interface CreateSumUpCheckoutParams {
  orderId: string;        // becomes checkout_reference (our idempotency handle)
  amount: number;         // BRL
  description?: string;
  currency?: string;      // default "BRL"
  returnUrl?: string;     // optional webhook/return URL
}

export interface SumUpCheckout {
  id: string;
  status: string;         // PENDING | PAID | FAILED | EXPIRED | …
  amount?: number;
  currency?: string;
  reference?: string;     // checkout_reference (our orderId)
  transactionCode?: string;
  last4?: string;
  brand?: string;
  installments?: number;
}

/** Defensive parse — SumUp nests card/txn details under a `transactions` array. */
function parseCheckout(data: Record<string, unknown>): SumUpCheckout {
  const txns = Array.isArray(data.transactions) ? (data.transactions as Record<string, unknown>[]) : [];
  const tx = (txns[txns.length - 1] ?? {}) as Record<string, unknown>;
  const txCard = (tx.card as Record<string, unknown> | undefined) ?? undefined;
  const topCard = (data.card as Record<string, unknown> | undefined) ?? undefined;
  return {
    id:              String(data.id ?? ""),
    status:          String(data.status ?? "UNKNOWN"),
    amount:          typeof data.amount === "number" ? (data.amount as number) : undefined,
    currency:        (data.currency as string | undefined) ?? undefined,
    reference:       (data.checkout_reference as string | undefined) ?? undefined,
    transactionCode: (tx.transaction_code as string | undefined) ?? undefined,
    last4:           (txCard?.last_4_digits as string | undefined) ?? (topCard?.last_4_digits as string | undefined),
    brand:           (txCard?.type as string | undefined) ?? (topCard?.type as string | undefined),
    installments:    (tx.installments_count as number | undefined) ?? undefined,
  };
}

/** Create a checkout server-side. checkout_reference = orderId makes retries idempotent-ish. */
export async function createSumUpCheckout(
  creds: SumUpCredentials,
  params: CreateSumUpCheckoutParams
): Promise<SumUpCheckout> {
  const body: Record<string, unknown> = {
    checkout_reference: params.orderId,
    amount:             Math.round(params.amount * 100) / 100,
    currency:           params.currency ?? "BRL",
    merchant_code:      creds.merchantCode,
    description:        params.description ?? `Pedido ${params.orderId}`,
    ...(params.returnUrl && { return_url: params.returnUrl }),
  };

  const res = await fetch(`${SUMUP_API}/checkouts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${creds.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`SumUp create checkout error ${res.status}: ${JSON.stringify(data)}`);
  }
  return parseCheckout(data as Record<string, unknown>);
}

/** Fetch a checkout's current status — the SOURCE OF TRUTH for confirmation. */
export async function getSumUpCheckout(
  creds: SumUpCredentials,
  checkoutId: string
): Promise<SumUpCheckout> {
  const res = await fetch(`${SUMUP_API}/checkouts/${encodeURIComponent(checkoutId)}`, {
    headers: { Authorization: `Bearer ${creds.apiKey}` },
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`SumUp get checkout error ${res.status}: ${JSON.stringify(data)}`);
  }
  return parseCheckout(data as Record<string, unknown>);
}

/** Validate credentials for the integration test — hits the authenticated /me. */
export async function validateSumUpCredentials(
  creds: SumUpCredentials
): Promise<{ ok: boolean; message: string }> {
  if (!creds.apiKey)       return { ok: false, message: "API key não configurada." };
  if (!creds.merchantCode) return { ok: false, message: "Merchant code não configurado." };
  try {
    const res = await fetch(`${SUMUP_API}/me`, {
      headers: { Authorization: `Bearer ${creds.apiKey}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      const mc = (data as { merchant_profile?: { merchant_code?: string } })?.merchant_profile?.merchant_code;
      return { ok: true, message: mc ? `Conectado (merchant ${mc}).` : "Credenciais SumUp válidas." };
    }
    if (res.status === 401) return { ok: false, message: "API key inválida ou expirada." };
    return { ok: false, message: `SumUp retornou HTTP ${res.status}.` };
  } catch {
    return { ok: false, message: "Não foi possível alcançar o SumUp." };
  }
}
