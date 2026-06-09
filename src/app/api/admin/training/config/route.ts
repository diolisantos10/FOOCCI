/**
 * GET   /api/admin/training/config — get training config (upsert default if missing)
 * PATCH /api/admin/training/config — update training config
 *
 * autoApplyProduction is always forced to false in v1 — never configurable from UI.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

const DEFAULT_CONFIG = {
  enableContinuousTraining:  false,
  maxScenariosPerHour:       20,
  useRealConversationMining: true,
  useAiGeneratedScenarios:   true,
  minimumScoreThreshold:     0.6,
  autoCreateProposals:       true,
  autoApplySandbox:          false,
  autoApplyProduction:       false,
  enabledRestaurantIds:      [] as string[],
};

export async function GET(req: NextRequest) {
  if (!checkAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const config = await prisma.agentTrainingConfig.upsert({
    where:  { agentType: "WHATSAPP_ORDERING" },
    update: {},
    create: { agentType: "WHATSAPP_ORDERING", ...DEFAULT_CONFIG, enabledRestaurantIds: [] },
  });

  return NextResponse.json(config);
}

export async function PATCH(req: NextRequest) {
  if (!checkAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));

  // autoApplyProduction is always false in v1
  const safe = { ...body, autoApplyProduction: false };

  const config = await prisma.agentTrainingConfig.upsert({
    where:  { agentType: "WHATSAPP_ORDERING" },
    update: safe,
    create: { agentType: "WHATSAPP_ORDERING", ...DEFAULT_CONFIG, ...safe, autoApplyProduction: false, enabledRestaurantIds: [] },
  });

  return NextResponse.json(config);
}
