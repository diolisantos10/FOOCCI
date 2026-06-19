/**
 * GET /api/whatsapp/learning?status=PENDING_REVIEW
 *
 * Lists WhatsApp learnings (the "Aprendizados do WhatsApp" queue) for the current
 * restaurant. Read-only, no PII. Dashboard (tenant-scoped) auth.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { listLearnings } from "@/services/whatsapp/learning/WhatsAppLearningQueueService";
import { LEARNING_STATUS, type LearningStatus } from "@/services/whatsapp/learning/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID = new Set<string>(Object.values(LEARNING_STATUS));

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    const statusRaw = req.nextUrl.searchParams.get("status");
    const status = statusRaw && VALID.has(statusRaw) ? (statusRaw as LearningStatus) : undefined;
    const learnings = await listLearnings({ restaurantId: ctx.restaurantId, status });
    return ok({ learnings });
  } catch (err) {
    return serverError(err instanceof Error ? err.message : "erro ao listar aprendizados");
  }
}
