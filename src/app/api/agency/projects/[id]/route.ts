/**
 * GET   /api/agency/projects/[id]  — fetch a single project with strategy session
 * PATCH /api/agency/projects/[id]  — update project fields / status
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, notFound, serverError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  const { id } = await params;

  try {
    const project = await prisma.agencyProject.findFirst({
      where:  { id, restaurantId: ctx.restaurantId },
      include: { strategySession: true },
    });
    if (!project) return notFound("Projeto não encontrado");
    return ok(project);
  } catch (err) {
    return serverError("Erro ao buscar projeto", err);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  const { id } = await params;

  let body: unknown;
  try { body = await req.json(); } catch { return badRequest("JSON inválido"); }

  const allowed = ["name", "objective", "audience", "timeline", "budget", "services", "notes", "status"] as const;
  const data: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in (body as Record<string, unknown>)) {
      data[key] = (body as Record<string, unknown>)[key];
    }
  }

  try {
    const project = await prisma.agencyProject.updateMany({
      where: { id, restaurantId: ctx.restaurantId },
      data,
    });
    if (project.count === 0) return notFound("Projeto não encontrado");
    return ok({ updated: true });
  } catch (err) {
    return serverError("Erro ao atualizar projeto", err);
  }
}
