/**
 * GET  /api/admin/training/brain-versions — list brain versions
 * POST /api/admin/training/brain-versions — create a candidate brain version
 *
 * ACTIVE versions are read-only. Only DRAFT/SANDBOX can be created from here.
 * No automatic promotion to ACTIVE in v1.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  if (!checkAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const agentType = searchParams.get("agentType") ?? "WHATSAPP_ORDERING";

  const versions = await prisma.agentBrainVersion.findMany({
    where:   { agentType },
    orderBy: { createdAt: "desc" },
    take:    50,
  });

  return NextResponse.json(versions);
}

export async function POST(req: NextRequest) {
  if (!checkAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { agentType, restaurantId, versionLabel, promptText, configJson, sourceProposalId } = body;

  if (!versionLabel || !agentType) {
    return NextResponse.json({ error: "agentType e versionLabel são obrigatórios" }, { status: 400 });
  }

  // Only DRAFT or SANDBOX can be created — never ACTIVE
  const version = await prisma.agentBrainVersion.create({
    data: {
      agentType,
      restaurantId:    restaurantId    ?? null,
      versionLabel,
      status:          "DRAFT",         // always starts as DRAFT
      promptText:      promptText       ?? null,
      configJson:      configJson       ?? null,
      sourceProposalId: sourceProposalId ?? null,
    },
  });

  return NextResponse.json(version, { status: 201 });
}
