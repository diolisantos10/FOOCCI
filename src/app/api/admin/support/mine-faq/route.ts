/**
 * POST /api/admin/support/mine-faq
 * Mines resolved support conversations into PENDING FAQ change-requests
 * (approved by the team in /admin/manual-operacional → Solicitações).
 *
 * Auth: admin (x-admin-secret / cookie) OR cron (Authorization: Bearer CRON_SECRET)
 * — the weekly GitHub Actions cron uses the latter.
 */

import { NextRequest } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { mineFaqFromSupport } from "@/services/help/FaqMiner";

function checkCronRequest(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  try {
    if (!checkAdminRequest(req) && !checkCronRequest(req)) return unauthorized();

    const result = await mineFaqFromSupport(30);
    return ok(result);
  } catch (err) {
    console.error("[POST /api/admin/support/mine-faq]", err);
    return serverError();
  }
}
