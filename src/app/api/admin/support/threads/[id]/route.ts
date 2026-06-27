/**
 * GET /api/admin/support/threads/[id]
 * Admin-only. Full transcript of one help thread.
 */

import { NextRequest } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { ok, unauthorized, notFound, serverError } from "@/lib/api-response";
import { SupportInboxService } from "@/services/help/SupportInboxService";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!checkAdminRequest(req)) return unauthorized();

    const { id } = await params;
    const result = await SupportInboxService.get(id);
    if (!result.ok) {
      return result.status === 404 ? notFound(result.error) : serverError(result.error);
    }

    return ok(result.data);
  } catch (err) {
    console.error("[GET /api/admin/support/threads/[id]]", err);
    return serverError();
  }
}
