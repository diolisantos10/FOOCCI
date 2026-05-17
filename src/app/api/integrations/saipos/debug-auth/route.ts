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
  bodyKeys:            string[];
  responseStatus:      number | null;
  responseErrorCode:   string | number | null;
  responseErrorMessage: string | null;
  responsePreview:     string;
  success:             boolean;
}

async function tryAuth(
  authUrl: string,
  body: Record<string, string>
): Promise<AuthAttemptResult> {
  let responseStatus: number | null = null;
  let responseText = "";

  try {
    const res = await fetch(authUrl, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(10_000),
    });
    responseStatus = res.status;
    responseText   = await res.text().catch(() => "");
  } catch (err) {
    return {
      bodyKeys:             Object.keys(body),
      responseStatus:       null,
      responseErrorCode:    null,
      responseErrorMessage: err instanceof Error ? err.message : String(err),
      responsePreview:      "",
      success:              false,
    };
  }

  let errorCode:    string | number | null = null;
  let errorMessage: string | null          = null;
  let hasToken = false;

  try {
    const parsed = JSON.parse(responseText) as Record<string, unknown>;
    errorCode    = (parsed.code ?? parsed.error_code ?? parsed.errorCode) as string | number | null ?? null;
    errorMessage = (parsed.message ?? parsed.error ?? parsed.mensagem) as string | null ?? null;
    hasToken     = Boolean((parsed as Record<string, unknown>).token);
  } catch { /* not JSON */ }

  return {
    bodyKeys:             Object.keys(body),
    responseStatus,
    responseErrorCode:    errorCode,
    responseErrorMessage: errorMessage,
    responsePreview:      responseText.slice(0, 300),
    success:              responseStatus !== null && responseStatus >= 200 && responseStatus < 300 && hasToken,
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
    note: "Option A is the format currently used by SaiposIntegrationService.getAuthToken(). If Option B succeeds and A fails, update the auth body accordingly.",
  });
}
