/**
 * POST /api/integrations/saipos/debug-auth
 *
 * Internal debug endpoint — tests Saipos authentication and returns safe
 * diagnostic info without ever exposing secrets.
 *
 * Access: authenticated session, OWNER role only.
 *
 * Returns:
 *   credentialDiagnostics — trim + invisible-char detection (safe, no secret values)
 *   curlExact             — attempt matching the confirmed working cURL: Content-Type only
 *   withAccept            — attempt with Accept: application/json added (for comparison)
 *   conclusion            — support-ready summary if 403 persists
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import type { SaiposRaw } from "@/services/integrations/SaiposIntegrationService";

const SAIPOS_AUTH_URL = "https://order-api.saipos.com/auth";

// Matches the same invisible chars stripped in SaiposIntegrationService._attemptAuth()
const INVISIBLE_RE = /[\r\n\t\u200b\u200c\u200d\ufeff\u00a0]/g;

function normalize(s: string): string {
  return s.replace(INVISIBLE_RE, "").trim();
}

function hasWhitespace(s: string): boolean {
  return /[\s]/.test(s);
}

function hasZeroWidthChars(s: string): boolean {
  return /[\u200b\u200c\u200d\ufeff\u00a0]/.test(s);
}

// ── Auth attempt ──────────────────────────────────────────────────────────────

interface AttemptResult {
  label:                   string;
  requestHeaderKeys:       string[];
  requestBodyKeys:         string[];
  responseStatus:          number | null;
  responseStatusText:      string | null;
  responseContentType:     string | null;
  responseBodyLength:      number;
  responseBodyType:        string;
  responseBodyEmpty:       boolean;
  responseBodyPreviewSafe: string;
  responseBodyKeys:        string[] | null;
  responseCorrelationId:   string | null;
  responseServerHeader:    string | null;
  responseDateHeader:      string | null;
  responseCfRay:           string | null;
  responseCfMitigated:     string | null;
  responseErrorCode:       string | number | null;
  responseErrorMessage:    string | null;
  success:                 boolean;
  networkError:            string | null;
}

async function attempt(
  label:       string,
  body:        Record<string, string>,
  headers:     Record<string, string>,
): Promise<AttemptResult> {
  const base: AttemptResult = {
    label,
    requestHeaderKeys:       Object.keys(headers),
    requestBodyKeys:         Object.keys(body),
    responseStatus:          null,
    responseStatusText:      null,
    responseContentType:     null,
    responseBodyLength:      0,
    responseBodyType:        "unknown",
    responseBodyEmpty:       true,
    responseBodyPreviewSafe: "",
    responseBodyKeys:        null,
    responseCorrelationId:   null,
    responseServerHeader:    null,
    responseDateHeader:      null,
    responseCfRay:           null,
    responseCfMitigated:     null,
    responseErrorCode:       null,
    responseErrorMessage:    null,
    success:                 false,
    networkError:            null,
  };

  let res: Response;
  let text = "";
  try {
    res  = await fetch(SAIPOS_AUTH_URL, {
      method:  "POST",
      headers,
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(10_000),
    });
    text = await res.text().catch(() => "");
  } catch (err) {
    return { ...base, networkError: err instanceof Error ? err.message : String(err) };
  }

  const ct            = res.headers.get("content-type");
  const bodyLenBytes  = Buffer.byteLength(text, "utf8");
  const bodyEmpty     = bodyLenBytes === 0;

  let bodyType: string;
  if (!text) {
    bodyType = "empty";
  } else if ((ct ?? "").includes("application/json") || text.trimStart().startsWith("{") || text.trimStart().startsWith("[")) {
    bodyType = "json";
  } else if ((ct ?? "").includes("text/html") || text.trimStart().startsWith("<")) {
    bodyType = "html";
  } else if ((ct ?? "").includes("text/plain")) {
    bodyType = "text";
  } else {
    bodyType = "unknown";
  }

  let errorCode:    string | number | null = null;
  let errorMessage: string | null          = null;
  let bodyKeys:     string[] | null        = null;
  let hasToken                             = false;

  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    errorCode    = (parsed.code ?? parsed.error_code ?? parsed.errorCode) as string | number | null ?? null;
    errorMessage = (parsed.message ?? parsed.error ?? parsed.mensagem) as string | null ?? null;
    hasToken     = Boolean(parsed.token);
    bodyKeys     = Object.keys(parsed);
  } catch { /* not JSON */ }

  if (res.status === 403 && !errorMessage) {
    errorMessage = bodyEmpty
      ? "HTTP 403 — Saipos returned empty body."
      : "HTTP 403 — Saipos rejected the request. Body: see responseBodyPreviewSafe.";
  }

  return {
    ...base,
    responseStatus:          res.status,
    responseStatusText:      res.statusText ?? null,
    responseContentType:     ct,
    responseBodyLength:      bodyLenBytes,
    responseBodyType:        bodyType,
    responseBodyEmpty:       bodyEmpty,
    responseBodyPreviewSafe: text.slice(0, 300),
    responseBodyKeys:        bodyKeys,
    responseCorrelationId:   res.headers.get("x-request-id") ?? res.headers.get("request-id") ?? res.headers.get("x-correlation-id") ?? res.headers.get("correlation-id") ?? null,
    responseServerHeader:    res.headers.get("server"),
    responseDateHeader:      res.headers.get("date"),
    responseCfRay:           res.headers.get("cf-ray"),
    responseCfMitigated:     res.headers.get("cf-mitigated"),
    responseErrorCode:       errorCode,
    responseErrorMessage:    errorMessage,
    success:                 res.status >= 200 && res.status < 300 && hasToken,
    networkError:            null,
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (ctx.role !== "OWNER") return NextResponse.json({ error: "Forbidden — OWNER role required" }, { status: 403 });

  const row = await prisma.integrationConfig.findUnique({
    where: { restaurantId_provider: { restaurantId: ctx.restaurantId, provider: "saipos" } },
  });
  if (!row) return NextResponse.json({ error: "Saipos integration not configured for this restaurant" }, { status: 404 });

  let raw: SaiposRaw;
  try {
    raw = JSON.parse(decrypt(row.configBlob)) as SaiposRaw;
  } catch {
    return NextResponse.json({ error: "Failed to decrypt stored config — config may be corrupt" }, { status: 500 });
  }

  // ── Credential diagnostics (safe — no secret values exposed) ─────────────
  const rawIdPartner = raw.idPartner ?? "";
  const rawSecret    = raw.apiKey    ?? "";
  const normId       = normalize(rawIdPartner);
  const normSecret   = normalize(rawSecret);

  const credentialDiagnostics = {
    authUrl:                      SAIPOS_AUTH_URL,
    codStore:                     raw.codStore,
    environment:                  raw.environment,

    idPartnerLengthBeforeTrim:    rawIdPartner.length,
    idPartnerLengthAfterTrim:     normId.length,
    idPartnerTrimChangedLength:   rawIdPartner.length !== normId.length,
    idPartnerPreview:             normId.length >= 8
      ? `${normId.slice(0, 4)}...${normId.slice(-4)}`
      : "(too short or empty)",
    hasWhitespaceInIdPartner:     hasWhitespace(rawIdPartner),
    hasZeroWidthCharsInIdPartner: hasZeroWidthChars(rawIdPartner),

    secretLengthBeforeTrim:       rawSecret.length,
    secretLengthAfterTrim:        normSecret.length,
    secretTrimChangedLength:      rawSecret.length !== normSecret.length,
    secretPreview:                normSecret.length >= 4
      ? `${normSecret.slice(0, 2)}...${normSecret.slice(-2)}`
      : "(too short or empty)",
    hasWhitespaceInSecret:        hasWhitespace(rawSecret),
    hasZeroWidthCharsInSecret:    hasZeroWidthChars(rawSecret),
  };

  const normalizedBody = { idPartner: normId, secret: normSecret };

  // ── Two attempts in parallel ───────────────────────────────────────────────
  const [curlExact, withAccept] = await Promise.all([
    attempt(
      "Content-Type only — exact cURL/Postman shape (no Accept header)",
      normalizedBody,
      { "Content-Type": "application/json" },
    ),
    attempt(
      "Content-Type + Accept: application/json",
      normalizedBody,
      { "Content-Type": "application/json", "Accept": "application/json" },
    ),
  ]);

  // ── Support-ready conclusion ───────────────────────────────────────────────
  let conclusion: string;
  if (curlExact.success) {
    conclusion = "SUCCESS — Foocci Railway request authenticated successfully with normalized credentials, Content-Type only, matching the confirmed cURL shape.";
  } else if (withAccept.success) {
    conclusion = "SUCCESS (with Accept header only) — Foocci authenticates when Accept: application/json is included but not when omitted. This is unexpected given the working cURL does not send Accept. Escalate to Saipos support with cf-ray values.";
  } else if (curlExact.responseStatus === 403) {
    conclusion =
      "STILL 403 — Same URL (https://order-api.saipos.com/auth), same body keys " +
      `{ idPartner, secret }, normalized credentials (idPartner trimmed to ${credentialDiagnostics.idPartnerLengthAfterTrim} chars, ` +
      `secret trimmed to ${credentialDiagnostics.secretLengthAfterTrim} chars), Content-Type: application/json only — ` +
      "Railway-origin request receives HTTP 403 while Saipos/Postman cURL with the same credentials receives HTTP 200. " +
      "This points to a server-side block on Railway's IP/ASN or a remaining Saipos channel configuration issue. " +
      `Share cf-ray (${curlExact.responseCfRay ?? "null"}) and cf-mitigated (${curlExact.responseCfMitigated ?? "null"}) with Saipos support.`;
  } else if (curlExact.networkError) {
    conclusion = `NETWORK ERROR — Could not reach Saipos auth endpoint: ${curlExact.networkError}`;
  } else {
    conclusion = `HTTP ${curlExact.responseStatus ?? "N/A"} — Unexpected response status. See curlExact for details.`;
  }

  return NextResponse.json({
    credentialDiagnostics,
    curlExact,
    withAccept,
    conclusion,
    note: "curlExact matches the confirmed working Postman/cURL shape: POST body { idPartner, secret }, header Content-Type: application/json only, normalized credentials. withAccept adds Accept: application/json for comparison. Safe to share with Saipos support.",
  });
}
