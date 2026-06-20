/**
 * POST /api/integracoes/whatsapp/meta/connect — finalize Meta Embedded Signup.
 *
 * Body: { code?, accessToken?, wabaId, phoneNumberId, displayPhoneNumber?, businessId?, configId? }
 * - The Embedded Signup SDK returns wabaId + phoneNumberId (message event) and a code
 *   (FB.login). We exchange the code for a server-side token, store everything
 *   encrypted, then health-check. Raw token never leaves the server.
 *
 * OWNER/MANAGER only. Does not switch the active provider — that is an explicit step.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, forbidden, serverError } from "@/lib/api-response";
import { isMetaWhatsAppEnabled } from "@/services/whatsapp/metaFlag";
import { MetaConfigService } from "@/services/whatsapp/MetaConfigService";
import { exchangeCodeForToken, fetchPhoneDetails } from "@/services/whatsapp/MetaOnboardingService";
import { MetaWhatsAppCloudProvider } from "@/services/whatsapp/providers/MetaWhatsAppCloudProvider";

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();
  if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();
  if (!isMetaWhatsAppEnabled()) return badRequest("Integração Meta desativada (META_WHATSAPP_ENABLED).");

  try {
    const body = (await req.json().catch(() => ({}))) as {
      code?: string; accessToken?: string; wabaId?: string; phoneNumberId?: string;
      displayPhoneNumber?: string; businessId?: string; configId?: string;
    };
    if (!body.wabaId || !body.phoneNumberId) {
      return badRequest("wabaId e phoneNumberId são obrigatórios.");
    }

    let accessToken = body.accessToken;
    if (!accessToken && body.code) {
      const ex = await exchangeCodeForToken(body.code);
      if (!ex.ok) return badRequest(ex.error);
      accessToken = ex.accessToken;
    }
    if (!accessToken) return badRequest("Faltam credenciais Meta (code ou accessToken).");

    const details = await fetchPhoneDetails(accessToken, body.phoneNumberId);

    await MetaConfigService.upsert({
      restaurantId:       ctx.restaurantId,
      wabaId:             body.wabaId,
      phoneNumberId:      body.phoneNumberId,
      displayPhoneNumber: body.displayPhoneNumber ?? details.displayPhoneNumber,
      businessId:         body.businessId ?? null,
      configId:           body.configId ?? null,
      accessToken,
    });

    // Verify the token works (reads the phone node — no message sent).
    const health = await new MetaWhatsAppCloudProvider().healthCheck(ctx.restaurantId);

    return ok({ connected: health.connected, detail: health.detail, meta: await MetaConfigService.getPublic(ctx.restaurantId) });
  } catch (err) {
    console.error("[POST meta/connect]", err);
    return serverError();
  }
}
