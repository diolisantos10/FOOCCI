/**
 * POST /api/integracoes/whatsapp/meta/repair-inbound — re-subscribe our app to the
 * merchant's WhatsApp Business Account so inbound message webhooks route to us.
 *
 * After Embedded Signup, subscribeAppToWaba() runs best-effort and can silently fail
 * (transient error, permissions still propagating). When it does, the number connects
 * and can SEND, but incoming customer messages never reach Foocci — so the assistant
 * looks "off". This endpoint re-runs the subscription and confirms it, giving the owner
 * a one-click repair instead of reconnecting from scratch.
 *
 * OWNER/MANAGER only. Sends no message.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, forbidden, serverError } from "@/lib/api-response";
import { MetaConfigService } from "@/services/whatsapp/MetaConfigService";
import { subscribeAppToWaba, getWabaSubscribedApps } from "@/services/whatsapp/MetaOnboardingService";

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();
  if (!["OWNER", "MANAGER"].includes(ctx.role)) return forbidden();

  try {
    const cfg = await MetaConfigService.getResolved(ctx.restaurantId);
    if (!cfg) return badRequest("Conecte o WhatsApp oficial da Meta antes de reparar o recebimento.");

    const sub = await subscribeAppToWaba(cfg.accessToken, cfg.wabaId);
    if (!sub.ok) {
      return badRequest(sub.error ?? "Não foi possível reativar o recebimento. Tente reconectar o WhatsApp da Meta.");
    }

    // Confirm our app now appears among the WABA's subscribed apps.
    const check = await getWabaSubscribedApps(cfg.accessToken, cfg.wabaId);
    return ok({
      repaired:       true,
      subscribedApps: check.appNames,
      confirmed:      check.ok,
    });
  } catch (err) {
    console.error("[POST meta/repair-inbound]", err);
    return serverError();
  }
}
