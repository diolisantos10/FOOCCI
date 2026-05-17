/**
 * POST /api/integrations/saipos/debug-auth
 *
 * Internal debug endpoint — tests Saipos authentication and returns safe
 * diagnostic info without ever exposing secrets.
 *
 * Access: authenticated session, OWNER role only.
 * Use when the normal "Testar conexão" button fails and you need to see exactly
 * what URL, payload shape, response code, and error message Saipos returned.
 *
 * Returns:
 *   authUrl, bodyKeys, idPartnerLength, secretLength, codStore,
 *   responseStatus, responseErrorCode, responseErrorMessage,
 *   and a limited preview of the raw response body.
 *
 * Tries Option A { idPartner, secret } (current default) first, then
 * Option B { partnerId, secret } if A fails, so both formats are reported
 * in a single call.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import type { SaiposRaw } from "@/services/integrations/SaiposIntegrationService";

// Auth endpoint fixed to v2.5 order-api host — env-independent per Saipos support.
const SAIPOS_AUTH_URL = "https://order-api.saipos.com/auth";

interface AuthAttemptResult {
  bodyKeys:              string[];          // request body keys
  responseStatus:        number | null;
  responseStatusText:    string | null;
  responseContentType:   string | null;
  responseBodyType:      string;            // "json" | "html" | "text" | "empty" | "unknown"
  responseBodyEmpty:     boolean;
  responseBodyPreviewSafe: string;          // ≤300 chars, safe for support logs
  responseBodyKeys:      string[] | null;   // JSON response body keys, if parsed
  responseCorrelationId: string | null;
  responseServerHeader:  string | null;
  responseDateHeader:    string | null;
  responseErrorCode:     string | number | null;
  responseErrorMessage:  string | null;
  responsePreview:       string;            // kept for backward compat
  success:               boolean;
}

async function tryAuth(
  authUrl: string,
  body: Record<string, string>
): Promise<AuthAttemptResult> {
  const requestBodyKeys = Object.keys(body);

  let res: Response;
  let responseText = "";
  try {
    res = await fetch(authUrl, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(10_000),
    });
    responseText = await res.text().catch(() => "");
  } catch (err) {
    return {
      bodyKeys:              requestBodyKeys,
      responseStatus:        null,
      responseStatusText:    null,
      responseContentType:   null,
      responseBodyType:      "unknown",
      responseBodyEmpty:     true,
      responseBodyPreviewSafe: "",
      responseBodyKeys:      null,
      responseCorrelationId: null,
      responseServerHeader:  null,
      responseDateHeader:    null,
      responseErrorCode:     null,
      responseErrorMessage:  err instanceof Error ? err.message : String(err),
      responsePreview:       "",
      success:               false,
    };
  }

  const responseContentType = res.headers.get("content-type");
  const responseCorrelationId =
    res.headers.get("x-request-id") ??
    res.headers.get("request-id") ??
    res.headers.get("x-correlation-id") ??
    res.headers.get("correlation-id") ??
    null;
  const responseServerHeader = res.headers.get("server");
  const responseDateHeader   = res.headers.get("date");
  const responseBodyEmpty    = !responseText;
  const ct = responseContentType ?? "";

  let responseBodyType: string;
  if (!responseText) {
    responseBodyType = "empty";
  } else if (ct.includes("application/json") || responseText.trimStart().startsWith("{") || responseText.trimStart().startsWith("[")) {
    responseBodyType = "json";
  } else if (ct.includes("text/html") || responseText.trimStart().startsWith("<")) {
    responseBodyType = "html";
  } else if (ct.includes("text/plain")) {
    responseBodyType = "text";
  } else {
    responseBodyType = "unknown";
  }

  const responseBodyPreviewSafe = responseText.slice(0, 300);

  let errorCode:       string | number | null = null;
  let errorMessage:    string | null          = null;
  let responseBodyKeys: string[] | null       = null;
  let hasToken = false;

  try {
    const parsed = JSON.parse(responseText) as Record<string, unknown>;
    errorCode       = (parsed.code ?? parsed.error_code ?? parsed.errorCode) as string | number | null ?? null;
    errorMessage    = (parsed.message ?? parsed.error ?? parsed.mensagem) as string | null ?? null;
    hasToken        = Boolean(parsed.token);
    responseBodyKeys = Object.keys(parsed);
  } catch { /* not JSON */ }

  if (res.status === 403 && !errorMessage) {
    errorMessage = responseBodyEmpty
      ? "HTTP 403 returned by Saipos with empty response body."
      : "Falha na autenticação Saipos (HTTP 403): acesso negado pela Saipos no endpoint v2.5. Verifique se o parceiro/credencial está liberado para autenticação em https://order-api.saipos.com/auth.";
  }

  return {
    bodyKeys:              requestBodyKeys,
    responseStatus:        res.status,
    responseStatusText:    res.statusText ?? null,
    responseContentType,
    responseBodyType,
    responseBodyEmpty,
    responseBodyPreviewSafe,
    responseBodyKeys,
    responseCorrelationId,
    responseServerHeader,
    responseDateHeader,
    responseErrorCode:    errorCode,
    responseErrorMessage: errorMessage,
    responsePreview:      responseText.slice(0, 300),
    success:              res.status >= 200 && res.status < 300 && hasToken,
  };
}

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (ctx.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden — OWNER role required" }, { status: 403 });
  }

  const row = await prisma.integrationConfig.findUnique({
    where: { restaurantId_provider: { restaurantId: ctx.restaurantId, provider: "saipos" } },
  });

  if (!row) {
    return NextResponse.json(
      { error: "Saipos integration not configured for this restaurant" },
      { status: 404 }
    );
  }

  let raw: SaiposRaw;
  try {
    raw = JSON.parse(decrypt(row.configBlob)) as SaiposRaw;
  } catch {
    return NextResponse.json(
      { error: "Failed to decrypt stored config — config may be corrupt" },
      { status: 500 }
    );
  }

  const authUrl = SAIPOS_AUTH_URL;

  const credentials = {
    idPartnerExists:  Boolean(raw.idPartner),
    idPartnerLength:  raw.idPartner?.length ?? 0,
    idPartnerPreview: raw.idPartner
      ? `${raw.idPartner.slice(0, 4)}...${raw.idPartner.slice(-4)}`
      : "(empty)",
    secretExists:     Boolean(raw.apiKey),
    secretLength:     raw.apiKey?.length ?? 0,
    secretPreview:    raw.apiKey && raw.apiKey.length >= 4
      ? `${raw.apiKey.slice(0, 2)}...${raw.apiKey.slice(-2)}`
      : "(too short or empty)",
    codStore:         raw.codStore,
    environment:      raw.environment,
    authUrl,
  };

  // Try both known payload shapes in parallel
  const [optionA, optionB] = await Promise.all([
    tryAuth(authUrl, { idPartner: raw.idPartner, secret: raw.apiKey }),
    tryAuth(authUrl, { partnerId: raw.idPartner, secret: raw.apiKey }),
  ]);

  return NextResponse.json({
    ...credentials,
    optionA: { label: '{ "idPartner", "secret" }', ...optionA },
    optionB: { label: '{ "partnerId", "secret" }', ...optionB },
    currentDefaultFormat: "optionA",
    note: "Option A { idPartner, secret } is the current default. Each result includes: responseStatus, responseStatusText, responseContentType, responseBodyType, responseBodyEmpty, responseBodyPreviewSafe, responseBodyKeys, responseCorrelationId, responseServerHeader, responseDateHeader — safe to share with Saipos support.",
  });
}
