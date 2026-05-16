/**
 * Shared webhook authentication utility.
 *
 * Checks ALL candidate header/body values against the stored webhookSecret.
 * Never short-circuits on the first failed candidate — Evolution versions
 * differ on which header/field they use for the secret.
 *
 * Never logs or returns raw secret values — only SHA-256 hash previews
 * (first 8 hex chars) for safe diagnostic comparison.
 */

import { createHmac, timingSafeEqual, createHash } from "crypto";

// ─── types ───────────────────────────────────────────────────

export interface WebhookAuthCandidates {
  hmacHeader:              string | null; // x-evolution-hmac-sha256
  xEvolutionSecret:        string | null; // x-evolution-secret
  xEvolutionWebhookSecret: string | null; // x-evolution-webhook-secret
  xWebhookSecret:          string | null; // x-webhook-secret
  webhookSecretHeader:     string | null; // webhook-secret
  authorizationBearer:     string | null; // Authorization: Bearer <token> → extracted token
  bodySecret:              string | null; // body.secret
  bodyWebhookSecret:       string | null; // body.webhookSecret
  bodyApikey:              string | null; // body.apikey
  queryToken:              string | null; // ?token= query param in webhook URL
}

export interface WebhookAuthResult {
  accepted:        boolean;
  matchedStrategy: string | null;
  diagnostics: {
    hasHmac:                    boolean;
    hasXEvolutionSecret:        boolean;
    hasXEvolutionWebhookSecret: boolean;
    hasXWebhookSecret:          boolean;
    hasWebhookSecretHeader:     boolean;
    hasAuthorizationBearer:     boolean;
    hasBodySecret:              boolean;
    hasBodyWebhookSecret:       boolean;
    hasBodyApikey:              boolean;
    // first 8 hex chars of sha256 — safe to log, useless as secret
    expectedHashPreview:      string;
    candidateHashPreviews:    Record<string, string>;
  };
}

// ─── helpers ─────────────────────────────────────────────────

function sha256Preview(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 8);
}

function safeEqualUtf8(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    // timingSafeEqual requires same length
    if (ab.length !== bb.length) return false;
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

// ─── main exports ────────────────────────────────────────────

/**
 * Build candidate set from a real NextRequest + parsed body.
 * Compatible with any object that has a `headers.get(name)` method.
 */
export function extractWebhookAuthCandidates(
  req: { headers: { get: (name: string) => string | null } },
  body: unknown
): WebhookAuthCandidates {
  const bodyObj = (body && typeof body === "object" && !Array.isArray(body))
    ? (body as Record<string, unknown>)
    : null;

  const authHeader    = req.headers.get("authorization") ?? "";
  const bearerToken   = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() || null : null;

  return {
    hmacHeader:              req.headers.get("x-evolution-hmac-sha256"),
    xEvolutionSecret:        req.headers.get("x-evolution-secret"),
    xEvolutionWebhookSecret: req.headers.get("x-evolution-webhook-secret"),
    xWebhookSecret:          req.headers.get("x-webhook-secret"),
    webhookSecretHeader:     req.headers.get("webhook-secret"),
    authorizationBearer:     bearerToken,
    bodySecret:       (bodyObj && typeof bodyObj.secret       === "string" && bodyObj.secret)       ? bodyObj.secret       : null,
    bodyWebhookSecret:(bodyObj && typeof bodyObj.webhookSecret === "string" && bodyObj.webhookSecret) ? bodyObj.webhookSecret : null,
    bodyApikey:       (bodyObj && typeof bodyObj.apikey        === "string" && bodyObj.apikey)        ? bodyObj.apikey        : null,
    queryToken:       null, // caller must inject from req.nextUrl.searchParams.get("token")
  };
}

/**
 * Verify webhook authentication against all known Evolution header/body variants.
 *
 * Tries every candidate — does NOT stop on the first failure.
 * Returns accepted=true on the first match found.
 *
 * If secret is empty string, accepts all (no secret configured).
 */
export function verifyWebhookAuth(
  rawBody:    string,
  candidates: WebhookAuthCandidates,
  secret:     string
): WebhookAuthResult {
  const candidateHashPreviews: Record<string, string> = {};

  const diag = {
    hasHmac:                    !!candidates.hmacHeader,
    hasXEvolutionSecret:        candidates.xEvolutionSecret        !== null,
    hasXEvolutionWebhookSecret: candidates.xEvolutionWebhookSecret !== null,
    hasXWebhookSecret:          candidates.xWebhookSecret          !== null,
    hasWebhookSecretHeader:     candidates.webhookSecretHeader      !== null,
    hasAuthorizationBearer:     candidates.authorizationBearer     !== null,
    hasBodySecret:              candidates.bodySecret              !== null,
    hasBodyWebhookSecret:       candidates.bodyWebhookSecret       !== null,
    hasBodyApikey:              candidates.bodyApikey              !== null,
    hasQueryToken:              candidates.queryToken              !== null,
    expectedHashPreview:        secret ? sha256Preview(secret) : "00000000",
    candidateHashPreviews,
  };

  // No secret configured → open endpoint, accept all
  if (!secret) {
    return { accepted: true, matchedStrategy: "no_secret_configured", diagnostics: diag };
  }

  let matchedStrategy: string | null = null;

  // Strategy 1: HMAC-SHA256 (strongest — check first)
  if (candidates.hmacHeader) {
    candidateHashPreviews["x-evolution-hmac-sha256"] = candidates.hmacHeader.slice(0, 8);
    if (!matchedStrategy) {
      try {
        const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
        const hmacBuf  = Buffer.from(candidates.hmacHeader, "hex");
        const expBuf   = Buffer.from(expected, "hex");
        if (hmacBuf.length === expBuf.length && timingSafeEqual(hmacBuf, expBuf)) {
          matchedStrategy = "x-evolution-hmac-sha256";
        }
      } catch { /* malformed hex */ }
    }
  }

  // Strategies 2-N: plain token candidates — check ALL
  const plainCandidates: Array<{ name: string; value: string | null }> = [
    { name: "x-evolution-secret",         value: candidates.xEvolutionSecret        },
    { name: "x-evolution-webhook-secret", value: candidates.xEvolutionWebhookSecret },
    { name: "x-webhook-secret",           value: candidates.xWebhookSecret          },
    { name: "webhook-secret",             value: candidates.webhookSecretHeader      },
    { name: "authorization-bearer",       value: candidates.authorizationBearer      },
    { name: "body.secret",                value: candidates.bodySecret               },
    { name: "body.webhookSecret",         value: candidates.bodyWebhookSecret        },
    { name: "body.apikey",                value: candidates.bodyApikey               },
    { name: "query.token",                value: candidates.queryToken               },
  ];

  for (const { name, value } of plainCandidates) {
    if (value !== null) {
      candidateHashPreviews[name] = sha256Preview(value);
      if (!matchedStrategy && safeEqualUtf8(value, secret)) {
        matchedStrategy = name;
      }
    }
  }

  return { accepted: matchedStrategy !== null, matchedStrategy, diagnostics: diag };
}
