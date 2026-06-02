/**
 * POST /api/agency/projects/[id]/strategy
 *
 * Generates (or regenerates) an AI Strategy Room session for the project.
 * Rule-based — no external LLM calls. Idempotent: a new session replaces the old one.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, notFound, serverError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { generateStrategyRoom } from "@/services/agency/StrategyRoomService";
import type { BriefInput } from "@/services/agency/StrategyRoomService";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  const { id } = await params;

  try {
    const project = await prisma.agencyProject.findFirst({
      where: { id, restaurantId: ctx.restaurantId },
    });
    if (!project) return notFound("Projeto não encontrado");

    // Fetch brand persona for richer generation
    const brandConfig = await prisma.restaurantBrandConfig.findUnique({
      where:  { restaurantId: ctx.restaurantId },
      select: {
        tone:               true,
        personalityPreset:  true,
        brandPersona:       true,
      },
    });

    const persona = brandConfig?.brandPersona as Record<string, unknown> | null ?? null;
    const restaurant = await prisma.restaurant.findUnique({
      where:  { id: ctx.restaurantId },
      select: { name: true },
    });

    const brief: BriefInput = {
      restaurantName:         restaurant?.name ?? "Restaurante",
      objective:              project.objective,
      audience:               project.audience ?? null,
      timeline:               project.timeline ?? null,
      budget:                 project.budget   ?? null,
      services:               Array.isArray(project.services) ? (project.services as string[]) : [],
      brandArchetype:         persona?.brandArchetype as string | null ?? null,
      personalityPreset:      brandConfig?.personalityPreset ?? null,
      tone:                   brandConfig?.tone ?? null,
      mainDishes:             persona?.mainDishes as string | null ?? null,
      uniqueValueProposition: persona?.uniqueValueProposition as string | null ?? null,
    };

    const output = generateStrategyRoom(brief);

    const briefSnapshot = {
      restaurantName: brief.restaurantName,
      objective:      brief.objective,
      audience:       brief.audience,
      timeline:       brief.timeline,
      budget:         brief.budget,
      services:       brief.services,
      brandArchetype: brief.brandArchetype,
      personalityPreset: brief.personalityPreset,
      generatedAt:    new Date().toISOString(),
    };

    // Cast typed outputs to Prisma's InputJsonValue (JSON columns accept any serializable value)
    const j = (v: unknown) => v as Parameters<typeof prisma.strategyRoomSession.create>[0]["data"]["strategist"];

    // Upsert: replace existing session or create new one
    const session = await prisma.strategyRoomSession.upsert({
      where:  { projectId: id },
      update: {
        briefSnapshot:  j(briefSnapshot),
        strategist:     j(output.strategist),
        socialMedia:    j(output.socialMedia),
        creative:       j(output.creative),
        paidTraffic:    j(output.paidTraffic),
        businessScope:  j(output.businessScope),
        criticalReview: j(output.criticalReview),
        synthesis:      j(output.synthesis),
        generatedAt:    new Date(),
        status:         "DONE",
      },
      create: {
        projectId:      id,
        briefSnapshot:  j(briefSnapshot),
        strategist:     j(output.strategist),
        socialMedia:    j(output.socialMedia),
        creative:       j(output.creative),
        paidTraffic:    j(output.paidTraffic),
        businessScope:  j(output.businessScope),
        criticalReview: j(output.criticalReview),
        synthesis:      j(output.synthesis),
        status:         "DONE",
      },
    });

    // Advance project status
    await prisma.agencyProject.update({
      where: { id },
      data:  { status: "STRATEGY_DONE" },
    });

    return ok(session);
  } catch (err) {
    return serverError("Erro ao gerar estratégia", err);
  }
}
