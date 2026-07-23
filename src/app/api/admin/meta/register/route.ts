/**
 * POST /api/admin/meta/register — admin-only. Registers the stored Meta phone number(s)
 * on the WhatsApp Cloud API so inbound webhooks start flowing. A migrated number stays
 * platform_type=NOT_APPLICABLE (connected but not activated) until this runs.
 *
 * Body: { pin?: string, restaurantId?: string }  (pin defaults to 6 digits)
 * Read of secrets stays server-side; response is masked.
 */

import { NextRequest } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { ok, unauthorized, badRequest, serverError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { MetaConfigService } from "@/services/whatsapp/MetaConfigService";
import { registerPhoneNumber, deregisterPhoneNumber, subscribeAppToWaba } from "@/services/whatsapp/MetaOnboardingService";

export async function POST(req: NextRequest) {
  if (!checkAdminRequest(req)) return unauthorized();
  try {
    const body = (await req.json().catch(() => ({}))) as {
      pin?: string; restaurantId?: string; phoneNumberId?: string; displayPhoneNumber?: string; deregister?: boolean;
    };

    // DEREGISTER path: free the number from the Cloud API so it can go to the WhatsApp
    // Business App (Coexistence prerequisite). Marks the config DISCONNECTED — no PIN needed.
    if (body.deregister) {
      if (!body.restaurantId) return badRequest("restaurantId é obrigatório para liberar o número.");
      const cfg = await MetaConfigService.getResolved(body.restaurantId);
      if (!cfg) return badRequest("Sem config Meta para este restaurante.");
      // Target an explicit phoneNumberId when given (the config may point to the wrong
      // number, e.g. the +1 test number). The token is WABA-wide, so it works for any of
      // the WABA's numbers.
      const targetPhoneId = body.phoneNumberId?.trim() || cfg.phoneNumberId;
      const dereg = await deregisterPhoneNumber(cfg.accessToken, targetPhoneId);
      await prisma.metaWhatsAppConfig.updateMany({
        where: { restaurantId: body.restaurantId },
        data:  { connectionStatus: dereg.ok ? "DISCONNECTED" : "ERROR", lastError: dereg.error ?? null },
      });
      return ok({ deregistered: dereg.ok, error: dereg.error ?? null, targetPhoneId, raw: dereg.raw ?? null });
    }

    const pin  = (body.pin ?? "").trim();
    if (!/^\d{6}$/.test(pin)) return badRequest("Informe um PIN de 6 dígitos.");

    // Recovery: repoint the config to a specific phoneNumberId within the SAME WABA before
    // registering — used when a reconnect accidentally swapped the number (e.g. picked the
    // +1 test number). The encrypted access token is preserved (same WABA/portfolio).
    if (body.restaurantId && body.phoneNumberId) {
      await prisma.metaWhatsAppConfig.update({
        where: { restaurantId: body.restaurantId },
        data:  {
          phoneNumberId:    body.phoneNumberId,
          connectionStatus: "CONNECTED",
          lastError:        null,
          ...(body.displayPhoneNumber ? { displayPhoneNumber: body.displayPhoneNumber } : {}),
        },
      });
    }

    const rows = body.restaurantId
      ? [{ restaurantId: body.restaurantId }]
      : await prisma.metaWhatsAppConfig.findMany({ select: { restaurantId: true } });

    const results = [];
    for (const row of rows) {
      const cfg = await MetaConfigService.getResolved(row.restaurantId);
      if (!cfg) { results.push({ restaurantId: row.restaurantId, skipped: "no config" }); continue; }
      const reg = await registerPhoneNumber(cfg.accessToken, cfg.phoneNumberId, pin);
      const sub = await subscribeAppToWaba(cfg.accessToken, cfg.wabaId);
      results.push({
        restaurantId:  row.restaurantId,
        phone:         cfg.displayPhoneNumber,
        registered:    reg.ok,
        registerError: reg.error ?? null,
        registerRaw:   reg.raw ?? null,
        resubscribed:  sub.ok,
      });
    }

    return ok({ count: results.length, results });
  } catch (err) {
    console.error("[POST /api/admin/meta/register]", err);
    return serverError();
  }
}
