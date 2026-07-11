/**
 * Shared helpers for the public /api/v1/* endpoints: consistent JSON errors and
 * one-line Bearer-key auth WITH scope enforcement, so every data endpoint reads:
 *
 *   const auth = await requireApiScope(req, "customers:read");
 *   if (auth instanceof NextResponse) return auth;   // 401/403 already shaped
 *   // …use auth.restaurantId…
 *
 * A key only ever reaches the data sets the lojista ticked (see api-scopes).
 */

import { NextRequest, NextResponse } from "next/server";
import { bearerToken } from "@/lib/api-key";
import { hasScope, API_SCOPE_META, type ApiScope } from "@/lib/api-scopes";
import { resolveApiKey } from "@/services/api/ApiKeyService";

export function jsonError(status: number, error: string): NextResponse {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export function jsonOk(body: unknown): NextResponse {
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}

export interface V1Auth {
  restaurantId: string;
  scopes: ApiScope[];
}

/**
 * Authenticate the request's Bearer key and assert it holds `needed`. Returns
 * the auth context on success, or an already-shaped NextResponse (401 invalid
 * key / 403 missing scope) the caller returns as-is. Fail closed throughout.
 */
export async function requireApiScope(
  req: NextRequest,
  needed: ApiScope,
): Promise<V1Auth | NextResponse> {
  const key = await resolveApiKey(bearerToken(req.headers.get("authorization")));
  if (!key) return jsonError(401, "Chave de conexão inválida ou revogada.");
  if (!hasScope(key.scopes, needed)) {
    const label = API_SCOPE_META[needed]?.label ?? needed;
    return jsonError(403, `Esta chave não tem permissão para acessar ${label}.`);
  }
  return { restaurantId: key.restaurantId, scopes: key.scopes };
}

/** Cap on rows returned per call across the list endpoints; caller paginates by
 *  advancing `desde`. */
export const V1_MAX_ROWS = 1000;

/**
 * Strict AAAA-MM-DD (or full ISO) parse. Returns null for anything ambiguous or
 * invalid — we never hand a locale-dependent string to `new Date` and hope.
 */
export function parseStrictDate(raw: string): Date | null {
  const t = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const d = new Date(`${t}T00:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(t)) {
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Resolve the `?desde=` window: the strict date if valid, a default N-day window
 * if absent, or a 400 response if present-but-malformed.
 */
export function resolveDesde(req: NextRequest, defaultWindowDays = 30): { desde: Date } | NextResponse {
  const raw = req.nextUrl.searchParams.get("desde");
  if (raw) {
    const d = parseStrictDate(raw);
    if (!d) return jsonError(400, "Parâmetro 'desde' inválido. Use o formato AAAA-MM-DD.");
    return { desde: d };
  }
  return { desde: new Date(Date.now() - defaultWindowDays * 24 * 60 * 60 * 1000) };
}
