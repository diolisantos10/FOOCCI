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

/**
 * Subscribes OUR app to the merchant's WhatsApp Business Account so inbound message
 * webhooks route to us after Embedded Signup (POST /{wabaId}/subscribed_apps). Without
 * this, a freshly-onboarded number receives no inbound events. Best-effort + idempotent:
 * returns { ok:false } on failure (the caller treats it as non-fatal).
 */
export async function subscribeAppToWaba(
  accessToken: string,
  wabaId:      string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(metaGraphUrl(`${wabaId}/subscribed_apps`), {
      method:  "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json: unknown = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = (json as { error?: { message?: string } }).error?.message;
      return { ok: false, error: maskGraphResponse(err ?? "Falha ao assinar a conta do WhatsApp.") };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: maskGraphResponse(e instanceof Error ? e.message : String(e)) };
  }
}

/**
 * Read which apps are subscribed to a WABA (GET /{wabaId}/subscribed_apps). Used to
 * confirm inbound routing after (re)subscribing — if OUR app isn't listed, inbound
 * message webhooks never arrive and the assistant can't reply. Best-effort.
 */
export async function getWabaSubscribedApps(
  accessToken: string,
  wabaId:      string,
): Promise<{ ok: boolean; appNames: string[]; error?: string }> {
  try {
    const res = await fetch(metaGraphUrl(`${wabaId}/subscribed_apps`), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json: unknown = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = (json as { error?: { message?: string } }).error?.message;
      return { ok: false, appNames: [], error: maskGraphResponse(err ?? "Falha ao consultar assinaturas.") };
    }
    const data = (json as { data?: Array<{ whatsapp_business_api_data?: { name?: string } }> }).data ?? [];
    const appNames = data
      .map((d) => d?.whatsapp_business_api_data?.name)
      .filter((n): n is string => typeof n === "string" && n.length > 0);
    return { ok: true, appNames };
  } catch (e) {
    return { ok: false, appNames: [], error: maskGraphResponse(e instanceof Error ? e.message : String(e)) };
  }
}

/**
 * Register a phone number on the WhatsApp Cloud API (POST /{phoneNumberId}/register).
 * A migrated/verified number stays `platform_type: NOT_APPLICABLE` — connected to the
 * WABA but NOT activated on the Cloud runtime — until this runs, so Meta delivers no
 * inbound webhooks. `pin` is the number's 2-step verification PIN: if 2FA is unset it
 * gets set to this value; if already set it must match. Idempotent-ish (re-registering
 * an active number succeeds).
 */
export async function registerPhoneNumber(
  accessToken:   string,
  phoneNumberId: string,
  pin:           string,
): Promise<{ ok: boolean; error?: string; raw?: unknown }> {
  try {
    const res = await fetch(metaGraphUrl(`${phoneNumberId}/register`), {
      method:  "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body:    JSON.stringify({ messaging_product: "whatsapp", pin }),
    });
    const json: unknown = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = (json as { error?: { message?: string } }).error?.message;
      return { ok: false, error: maskGraphResponse(err ?? "Falha ao registrar o número na Cloud API."), raw: json };
    }
    return { ok: true, raw: json };
  } catch (e) {
    return { ok: false, error: maskGraphResponse(e instanceof Error ? e.message : String(e)) };
  }
}

/**
 * Deregister a phone number from the WhatsApp Cloud API (POST /{phoneNumberId}/deregister).
 * FREES the number so it can be used elsewhere — e.g. registered on the WhatsApp Business
 * App (the prerequisite for Coexistence). After this, the Cloud API stops delivering
 * inbound webhooks for the number until it is registered again.
 */
export async function deregisterPhoneNumber(
  accessToken:   string,
  phoneNumberId: string,
): Promise<{ ok: boolean; error?: string; raw?: unknown }> {
  try {
    const res = await fetch(metaGraphUrl(`${phoneNumberId}/deregister`), {
      method:  "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    });
    const json: unknown = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = (json as { error?: { message?: string } }).error?.message;
      return { ok: false, error: maskGraphResponse(err ?? "Falha ao liberar o número da Cloud API."), raw: json };
    }
    return { ok: true, raw: json };
  } catch (e) {
    return { ok: false, error: maskGraphResponse(e instanceof Error ? e.message : String(e)) };
  }
}

/**
 * Adds a NEW phone number to an existing WABA (POST /{wabaId}/phone_numbers).
 * Returns the new phone_number_id. The number must NOT be active on any WhatsApp
 * (consumer or Business app). `verifiedName` is the business display name shown to
 * recipients (may require Meta review). Additive — never touches existing numbers.
 */
export async function addPhoneNumberToWaba(
  accessToken:  string,
  wabaId:       string,
  cc:           string,
  phoneNumber:  string,
  verifiedName: string,
): Promise<{ ok: boolean; phoneNumberId?: string; error?: string; raw?: unknown }> {
  try {
    const res = await fetch(metaGraphUrl(`${wabaId}/phone_numbers`), {
      method:  "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body:    JSON.stringify({ cc, phone_number: phoneNumber, verified_name: verifiedName }),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
    if (!res.ok || !json.id) {
      return { ok: false, error: maskGraphResponse(json.error?.message ?? "Falha ao adicionar o número à conta."), raw: json };
    }
    return { ok: true, phoneNumberId: json.id, raw: json };
  } catch (e) {
    return { ok: false, error: maskGraphResponse(e instanceof Error ? e.message : String(e)) };
  }
}

/**
 * Requests a verification code for a pending phone number (POST /{phoneNumberId}/request_code).
 * Meta sends a 6-digit code to the physical line via SMS or VOICE.
 */
export async function requestVerificationCode(
  accessToken:   string,
  phoneNumberId: string,
  method:        "SMS" | "VOICE" = "SMS",
  language:      string = "pt_BR",
): Promise<{ ok: boolean; error?: string; raw?: unknown }> {
  try {
    const res = await fetch(metaGraphUrl(`${phoneNumberId}/request_code`), {
      method:  "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body:    JSON.stringify({ code_method: method, language }),
    });
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } };
    if (!res.ok || json.error) {
      return { ok: false, error: maskGraphResponse(json.error?.message ?? "Falha ao pedir o código de verificação."), raw: json };
    }
    return { ok: true, raw: json };
  } catch (e) {
    return { ok: false, error: maskGraphResponse(e instanceof Error ? e.message : String(e)) };
  }
}

/**
 * Submits the 6-digit verification code (POST /{phoneNumberId}/verify_code). On success
 * the number is verified and can then be registered on the Cloud API.
 */
export async function verifyPhoneCode(
  accessToken:   string,
  phoneNumberId: string,
  code:          string,
): Promise<{ ok: boolean; error?: string; raw?: unknown }> {
  try {
    const res = await fetch(metaGraphUrl(`${phoneNumberId}/verify_code`), {
      method:  "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body:    JSON.stringify({ code }),
    });
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } };
    if (!res.ok || json.error) {
      return { ok: false, error: maskGraphResponse(json.error?.message ?? "Código inválido ou expirado."), raw: json };
    }
    return { ok: true, raw: json };
  } catch (e) {
    return { ok: false, error: maskGraphResponse(e instanceof Error ? e.message : String(e)) };
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
