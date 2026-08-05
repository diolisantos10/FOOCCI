/**
 * POST /api/help/message  { content }
 * Appends the lojista message and, while the thread is in AI mode, returns the
 * assistant's manual-grounded reply. Tenant-scoped.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, serverError } from "@/lib/api-response";
import { sendHelpMessageSchema } from "@/validators/help";
import { HelpThreadService } from "@/services/help/HelpThreadService";

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const raw = await req.json().catch(() => null);
    const parsed = sendHelpMessageSchema.safeParse(raw);
    if (!parsed.success) {
      return badRequest(
        parsed.error.issues[0]?.message ?? "Escreva sua dúvida ou anexe um arquivo.",
      );
    }

    const result = await HelpThreadService.sendMessage(
      ctx.restaurantId,
      ctx.userId,
      parsed.data.content,
      parsed.data.attachmentIds,
    );
    if (!result.ok) return serverError(result.error);

    return ok(result.data);
  } catch (err) {
    console.error("[POST /api/help/message]", err);
    return serverError();
  }
}
