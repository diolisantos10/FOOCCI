/**
 * GET    /api/knowledge/[id]  — get single item
 * PATCH  /api/knowledge/[id]  — update (approve / reject / edit)
 * DELETE /api/knowledge/[id]  — delete
 *
 * OWNER or MANAGER only for mutations.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, forbidden, notFound, serverError } from "@/lib/api-response";
import { RestaurantKnowledgeService, type KnowledgeStatus } from "@/services/knowledge/RestaurantKnowledgeService";
import { z } from "zod";

type Params = { params: { id: string } };

const patchSchema = z.object({
  title:            z.string().min(1).optional(),
  category:         z.string().min(1).optional(),
  questionPatterns: z.array(z.string().min(1)).min(1).optional(),
  answer:           z.string().optional(),
  status:           z.enum(["SUGGESTED","APPROVED","REJECTED","ACTIVE"]).optional(),
  confidence:       z.number().min(0).max(1).nullable().optional(),
});

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const item = await RestaurantKnowledgeService.getById(params.id, ctx.restaurantId);
    if (!item) return notFound("Item não encontrado.");

    return ok(item);
  } catch (err) {
    console.error(`[GET /api/knowledge/${params.id}]`, err);
    return serverError();
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    if (ctx.role !== "OWNER" && ctx.role !== "MANAGER") return forbidden("Apenas proprietário ou gerente pode editar.");

    const body = await req.json().catch(() => null);
    if (!body) return badRequest("Corpo inválido.");

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return badRequest("Validação falhou.", parsed.error.flatten());

    const item = await RestaurantKnowledgeService.update(params.id, ctx.restaurantId, {
      ...parsed.data,
      status: parsed.data.status as KnowledgeStatus | undefined,
    });

    return ok(item);
  } catch (err) {
    if (err instanceof Error && err.message === "Not found") return notFound("Item não encontrado.");
    console.error(`[PATCH /api/knowledge/${params.id}]`, err);
    return serverError();
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    if (ctx.role !== "OWNER" && ctx.role !== "MANAGER") return forbidden("Apenas proprietário ou gerente pode excluir.");

    await RestaurantKnowledgeService.delete(params.id, ctx.restaurantId);
    return ok({ deleted: true });
  } catch (err) {
    if (err instanceof Error && err.message === "Not found") return notFound("Item não encontrado.");
    console.error(`[DELETE /api/knowledge/${params.id}]`, err);
    return serverError();
  }
}
