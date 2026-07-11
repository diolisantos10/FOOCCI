/**
 * GET  /api/settings/api-keys — list this restaurant's active connection keys.
 * POST /api/settings/api-keys — mint a new key (owner only). Returns the
 *      plaintext token ONCE — the UI must show/copy it immediately.
 *
 * These are the authenticated management endpoints behind Integrações →
 * Conexões externas. The keys themselves authenticate the PUBLIC sales API
 * (GET /api/v1/vendas); see ApiKeyService.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { ok, created, badRequest, unauthorized, forbidden, serverError } from "@/lib/api-response";
import { listApiKeys, createApiKey } from "@/services/api/ApiKeyService";

const createSchema = z.object({
  name: z.string().trim().max(60).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    const keys = await listApiKeys(ctx.restaurantId);
    return ok({ keys });
  } catch (err) {
    console.error("[GET /api/settings/api-keys]", err);
    return serverError();
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    // Generating a key that grants access to all sales is owner-level.
    if (ctx.role !== "OWNER") return forbidden("Apenas o proprietário pode gerar chaves de conexão.");

    const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return badRequest("Apelido inválido.");

    const key = await createApiKey(ctx.restaurantId, parsed.data.name ?? null, ctx.userId);
    return created({ key }); // key.token present ONCE here
  } catch (err) {
    console.error("[POST /api/settings/api-keys]", err);
    return serverError();
  }
}
