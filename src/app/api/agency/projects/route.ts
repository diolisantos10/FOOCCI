/**
 * GET  /api/agency/projects  — list all projects for this restaurant
 * POST /api/agency/projects  — create a new project
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, created, badRequest, unauthorized, serverError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  try {
    const projects = await prisma.agencyProject.findMany({
      where:   { restaurantId: ctx.restaurantId },
      orderBy: { createdAt: "desc" },
      select: {
        id:        true,
        name:      true,
        objective: true,
        status:    true,
        services:  true,
        createdAt: true,
        updatedAt: true,
        strategySession: { select: { id: true, generatedAt: true } },
      },
    });
    return ok(projects);
  } catch (err) {
    return serverError("Erro ao buscar projetos", err);
  }
}

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  let body: unknown;
  try { body = await req.json(); } catch { return badRequest("JSON inválido"); }

  const { name, objective, audience, timeline, budget, services, notes } = body as Record<string, unknown>;

  if (typeof name !== "string" || !name.trim())      return badRequest("name é obrigatório");
  if (typeof objective !== "string" || !objective.trim()) return badRequest("objective é obrigatório");

  try {
    const project = await prisma.agencyProject.create({
      data: {
        restaurantId: ctx.restaurantId,
        name:         name.trim(),
        objective:    objective.trim(),
        audience:     typeof audience === "string" ? audience.trim() || null : null,
        timeline:     typeof timeline === "string" ? timeline.trim() || null : null,
        budget:       typeof budget   === "string" ? budget.trim()   || null : null,
        services:     Array.isArray(services) ? services : [],
        notes:        typeof notes === "string" ? notes.trim() || null : null,
        status:       "DRAFT",
      },
    });
    return created(project);
  } catch (err) {
    return serverError("Erro ao criar projeto", err);
  }
}
