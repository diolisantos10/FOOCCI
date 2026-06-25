/**
 * MetaOnboardingService — Embedded Signup helpers: exchange the returned code for a
 * server-side access token and read the connected phone's details. Never logs raw
 * tokens (Graph responses are masked).
 */

import { metaAppId, metaAppSecret, metaGraphUrl } from "./metaFlag";
import { maskGraphResponse } from "./providers/metaPayload";

export async function exchangeCodeForToken(
  code: string,
): Promise<{ ok: true; accessToken: string } | { ok: false; error: string }> {
  const appId = metaAppId();
  const secret = metaAppSecret();
  if (!appId || !secret) return { ok: false, error: "Serviço Meta não disponível no momento. Fale com o suporte Foocci." };
  try {
    const res = await fetch(
      metaGraphUrl(`oauth/access_token?client_id=${appId}&client_secret=${secret}&code=${encodeURIComponent(code)}`),
    );
    const json: unknown = await res.json().catch(() => ({}));
    const token = (json as { access_token?: string }).access_token;
    if (!res.ok || !token) {
      const err = (json as { error?: { message?: string } }).error;
      return { ok: false, error: maskGraphResponse(err?.message ?? "Falha ao trocar o código pela credencial.") };
    }
    return { ok: true, accessToken: token };
  } catch (e) {
    return { ok: false, error: maskGraphResponse(e instanceof Error ? e.message : String(e)) };
  }
}

/**
 * Inspect an access token via Graph `debug_token` to learn when it expires, so we can
 * persist `tokenExpiresAt` and warn (in health checks) before a merchant's sends start
 * failing silently. `data.expires_at === 0` means the token never expires.
 * Best-effort: returns { expiresAt: null } on any failure (never blocks onboarding).
 */
export async function inspectTokenExpiry(accessToken: string): Promise<{ expiresAt: Date | null }> {
  const appId = metaAppId();
  const secret = metaAppSecret();
  if (!appId || !secret) return { expiresAt: null };
  try {
    const appToken = `${appId}|${secret}`;
    const res = await fetch(
      metaGraphUrl(`debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(appToken)}`),
    );
    const json: unknown = await res.json().catch(() => ({}));
    if (!res.ok) return { expiresAt: null };
    const expiresAt = (json as { data?: { expires_at?: number } }).data?.expires_at;
    if (typeof expiresAt !== "number" || expiresAt <= 0) return { expiresAt: null }; // 0 = never expires
    return { expiresAt: new Date(expiresAt * 1000) };
  } catch {
    return { expiresAt: null };
  }
}

export async function fetchPhoneDetails(
  accessToken:   string,
  phoneNumberId: string,
): Promise<{ displayPhoneNumber: string | null; verifiedName: string | null }> {
  try {
    const res = await fetch(
      metaGraphUrl(`${phoneNumberId}?fields=display_phone_number,verified_name`),
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const json: unknown = await res.json().catch(() => ({}));
    if (res.ok) {
      const d = json as { display_phone_number?: string; verified_name?: string };
      return { displayPhoneNumber: d.display_phone_number ?? null, verifiedName: d.verified_name ?? null };
    }
  } catch { /* best-effort */ }
  return { displayPhoneNumber: null, verifiedName: null };
}
