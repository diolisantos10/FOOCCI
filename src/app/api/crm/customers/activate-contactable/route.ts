/**
 * POST /api/crm/customers/activate-contactable
 *
 * "Ativar base": turns ON crmContactable for every non-guest customer that HAS a
 * phone and has NOT opted out but is currently off — the imported base that never
 * entered WhatsApp campaigns. This is what gives a "avisar 100% da base" campaign
 * an actual audience.
 *
 * Body: { dryRun?: boolean }  (default true)
 *   dryRun=true  → only counts how many WOULD be activated (nothing written).
 *   dryRun=false → performs the update, returns how many were activated.
 *
 * Safe by design: never touches opted-out customers or customers without a phone;
 * enabling contactability sends nothing (every send still passes the safety
 * pipeline); fully reversible. Tenant-scoped — only the caller's restaurant.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { CRMService } from "@/services/crm/CRMService";

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const body   = await req.json().catch(() => ({}));
    const dryRun = body?.dryRun !== false; // default TRUE — must opt in to write

    const res = await CRMService.activateContactableBase(ctx.restaurantId, { dryRun });
    if (!res.ok) return serverError();
    return ok(res.data);
  } catch (err) {
    console.error("[POST /api/crm/customers/activate-contactable]", err);
    return serverError();
  }
}
