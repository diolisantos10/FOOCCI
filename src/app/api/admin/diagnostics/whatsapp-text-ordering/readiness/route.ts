/**
 * POST /api/admin/diagnostics/whatsapp-text-ordering/readiness
 *
 * Admin-facing readiness checklist: composes the live CONFIG diagnostic with the
 * hermetic FLOW diagnostic into replyOnly/fullTest/restaurantWide readiness +
 * blockers / warnings / requiredNextActions. READ-ONLY — never writes, sends,
 * creates an order or generates a Pix. Admin-only (ADMIN_SECRET / cookie).
 *
 * Body (JSON): { restaurantSlug?: string, restaurantId?: string, phone?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { runReadinessDiagnostic } from "@/services/whatsapp/ordering/readinessDiagnostic";

export async function POST(req: NextRequest) {
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { restaurantSlug?: string; restaurantId?: string; phone?: string };
  const result = await runReadinessDiagnostic({
    restaurantSlug: typeof body.restaurantSlug === "string" ? body.restaurantSlug : undefined,
    restaurantId: typeof body.restaurantId === "string" ? body.restaurantId : undefined,
    phone: typeof body.phone === "string" ? body.phone : undefined,
  });
  return NextResponse.json(result, { status: 200 });
}
