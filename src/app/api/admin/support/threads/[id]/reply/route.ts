/**
 * POST /api/admin/support/threads/[id]/reply  { content, authorName? }
 * Admin-only. The Foocci team replies (as SUPPORT) to an escalated thread.
 */

import { NextRequest } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { ok, badRequest, unauthorized, notFound, serverError } from "@/lib/api-response";
import { supportReplySchema } from "@/validators/help";
import { SupportInboxService } from "@/services/help/SupportInboxService";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!checkAdminRequest(req)) return unauthorized();

    const { id } = await params;
    const raw = await req.json().catch(() => null);
    const parsed = supportReplySchema.safeParse(raw);
    if (!parsed.success) return badRequest("content is required");

    const result = await SupportInboxService.reply(
      id,
      parsed.data.content,
      parsed.data.authorName,
    );
    if (!result.ok) {
      return result.status === 404 ? notFound(result.error) : serverError(result.error);
    }

    return ok(result.data);
  } catch (err) {
    console.error("[POST /api/admin/support/threads/[id]/reply]", err);
    return serverError();
  }
}
