/**
 * GET  /api/knowledge         — list knowledge items (all or by status)
 * POST /api/knowledge         — create a knowledge item (manual or suggest)
 *
 * Auth required. OWNER role required for mutations.
 * restaurantId always sourced from session.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, forbidden, serverError } from "@/lib/api-response";
import {
  RestaurantKnowledgeService,
  type KnowledgeStatus,
  type KnowledgeCategory,
  type KnowledgeSource,
} from "@/services/knowledge/RestaurantKnowledgeService";
import { z } from "zod";

const createSchema = z.object({
  title:            z.string().min(1, "Título obrigatório"),
  category:         z.string().min(1),
  questionPatterns: z.array(z.string().min(1)).min(1, "Ao menos um exemplo de pergunta"),
  answer:           z.string().default(""),
  status:           z.enum(["SUGGESTED","APPROVED","REJECTED","ACTIVE"]).default("SUGGESTED"),
  source:           z.enum(["HUMAN_REPLY","MANUAL","AI_SUGGESTED","IMPORTED"]).default("MANUAL"),
  confidence:       z.number().min(0).max(1).optional(),
  createdFromConversationId: z.string().optional(),
  createdFromMessageIds:     z.array(z.string()).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") as KnowledgeStatus | null;

    const items = await RestaurantKnowledgeService.list(ctx.restaurantId, status ?? undefined);
    return ok(items);
  } catch (err) {
    console.error("[GET /api/knowledge]", err);
    return serverError();
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    if (ctx.role !== "OWNER" && ctx.role !== "MANAGER") return forbidden("Apenas proprietário ou gerente pode criar conhecimento.");

    const body = await req.json().catch(() => null);
    if (!body) return badRequest("Corpo inválido.");

    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return badRequest("Validação falhou.", parsed.error.flatten());

    const item = await RestaurantKnowledgeService.create(ctx.restaurantId, {
      title:            parsed.data.title,
      category:         parsed.data.category as KnowledgeCategory,
      questionPatterns: parsed.data.questionPatterns,
      answer:           parsed.data.answer,
      status:           parsed.data.status as KnowledgeStatus,
      source:           parsed.data.source as KnowledgeSource,
      confidence:       parsed.data.confidence,
      createdFromConversationId: parsed.data.createdFromConversationId,
      createdFromMessageIds:     parsed.data.createdFromMessageIds,
    });

    return ok(item);
  } catch (err) {
    console.error("[POST /api/knowledge]", err);
    return serverError();
  }
}
