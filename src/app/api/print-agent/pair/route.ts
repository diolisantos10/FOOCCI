/**
 * POST /api/print-agent/pair — pair the local Carteiro with a restaurant.
 *
 * Public route (no session): the agent is not a browser user. It sends the
 * `pairingCode` the owner copied from the panel; we return a durable token the
 * agent stores and uses for poll/ack. The code is single-use (rotated on pair).
 */

import { NextRequest, NextResponse } from "next/server";
import { pairByCode } from "@/services/print/PrintAgentService";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { pairingCode?: unknown };
  const code = typeof body.pairingCode === "string" ? body.pairingCode : "";
  if (!code.trim()) {
    return NextResponse.json({ ok: false, error: "Código de pareamento ausente." }, { status: 400 });
  }

  const agent = await pairByCode(code);
  if (!agent || !agent.token) {
    return NextResponse.json({ ok: false, error: "Código inválido ou expirado." }, { status: 404 });
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: agent.restaurantId },
    select: { name: true },
  });

  return NextResponse.json({
    ok: true,
    token: agent.token,
    restaurantId: agent.restaurantId,
    restaurantName: restaurant?.name ?? null,
  });
}
