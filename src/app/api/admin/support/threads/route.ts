/**
 * GET /api/admin/support/threads?status=ESCALATED|RESOLVED|ALL
 * Admin-only. Lists help threads for the Foocci support team.
 */

import { NextRequest } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import {
  SupportInboxService,
  type SupportListFilter,
} from "@/services/help/SupportInboxService";

export async function GET(req: NextRequest) {
  try {
    if (!checkAdminRequest(req)) return unauthorized();

    const raw = (req.nextUrl.searchParams.get("status") ?? "ESCALATED").toUpperCase();
    const filter: SupportListFilter =
      raw === "RESOLVED" ? "RESOLVED" : raw === "ALL" ? "ALL" : "ESCALATED";

    const result = await SupportInboxService.list(filter);
    if (!result.ok) return serverError(result.error);

    return ok(result.data);
  } catch (err) {
    console.error("[GET /api/admin/support/threads]", err);
    return serverError();
  }
}
