/**
 * DELETE /api/settings/api-keys/[id] — revoke a connection key (owner only).
 * A revoked key stops authenticating the public sales API immediately.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, forbidden, notFound, serverError } from "@/lib/api-response";
import { revokeApiKey } from "@/services/api/ApiKeyService";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    if (ctx.role !== "OWNER") return forbidden("Apenas o proprietário pode revogar chaves de conexão.");

    const { id } = await params;
    const revoked = await revokeApiKey(ctx.restaurantId, id);
    if (!revoked) return notFound("Chave não encontrada ou já revogada.");
    return ok({ revoked: true });
  } catch (err) {
    console.error("[DELETE /api/settings/api-keys/[id]]", err);
    return serverError();
  }
}
