/**
 * POST /api/whatsapp/learning/[id]
 * Body: { decision: "APPROVE" | "REJECT" | "BACKLOG" }
 *
 * Applies a human decision to a WhatsApp learning. ONLY changes the learning's
 * status + review metadata — it NEVER alters the live agent, config, prompt, or
 * any production behavior. Approving marks the learning for the next training
 * round (consumed via the existing gate). Dashboard (tenant-scoped) auth.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, badRequest, notFound, serverError } from "@/lib/api-response";
import { decideLearning, type LearningDecision } from "@/services/whatsapp/learning/WhatsAppLearningQueueService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID: LearningDecision[] = ["APPROVE", "REJECT", "BACKLOG"];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { decision?: string };
    if (!body.decision || !VALID.includes(body.decision as LearningDecision)) {
      return badRequest("decision deve ser APPROVE, REJECT ou BACKLOG");
    }
    const view = await decideLearning(id, body.decision as LearningDecision, ctx.userId);
    if (!view) return notFound("aprendizado não encontrado");
    return ok({ learning: view });
  } catch (err) {
    return serverError(err instanceof Error ? err.message : "erro ao decidir aprendizado");
  }
}
