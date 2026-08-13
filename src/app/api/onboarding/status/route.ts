/**
 * GET  /api/onboarding/status  — prontidão do restaurante para o piloto
 * POST /api/onboarding/status  — marca o teste final como concluído
 *
 * Escopo de tenant: owner/manager acessam o próprio restaurante.
 *
 * O cálculo mora em `@/services/onboarding/onboardingStatus` porque o menu
 * lateral e o painel precisam da MESMA resposta que esta rota devolve — regra
 * repetida em três lugares vira três verdades diferentes.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { computeOnboardingStatus } from "@/services/onboarding/onboardingStatus";

export type {
  StepStatus,
  StepResult,
  OnboardingReadiness,
  OnboardingStatusData,
} from "@/services/onboarding/onboardingStatus";

// ── GET ────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  try {
    const data = await computeOnboardingStatus(ctx.restaurantId);
    return ok(data);
  } catch (err) {
    console.error("[GET /api/onboarding/status]", err);
    return serverError();
  }
}

// ── POST — marca o teste final como concluído ──────────────────────────────────

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  try {
    await prisma.restaurantOnboardingStatus.upsert({
      where:  { restaurantId: ctx.restaurantId },
      create: { restaurantId: ctx.restaurantId, finalTestCompletedAt: new Date() },
      update: { finalTestCompletedAt: new Date() },
    });

    const data = await computeOnboardingStatus(ctx.restaurantId);
    return ok(data);
  } catch (err) {
    console.error("[POST /api/onboarding/status]", err);
    return serverError();
  }
}
