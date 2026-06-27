/**
 * POST /api/admin/support/threads/[id]/resolve
 * Admin-only. Marks an escalated help thread as resolved.
 */

import { NextRequest } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { ok, unauthorized, notFound, serverError } from "@/lib/api-response";
import { SupportInboxService } from "@/services/help/SupportInboxService";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!checkAdminRequest(req)) return unauthorized();

    const { id } = await params;
    const result = await SupportInboxService.resolve(id);
    if (!result.ok) {
      return result.status === 404 ? notFound(result.error) : serverError(result.error);
    }

    return ok(result.data);
  } catch (err) {
    console.error("[POST /api/admin/support/threads/[id]/resolve]", err);
    return serverError();
  }
}
