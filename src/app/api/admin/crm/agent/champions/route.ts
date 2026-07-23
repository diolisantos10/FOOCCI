/**
 * GET /api/admin/crm/agent/champions?restaurantId=..
 *
 * As "frases campeãs" que o agente descobriu sozinho: as que convertem muito
 * acima da média da campanha, com amostra suficiente. São o que o agente imita
 * pra renovar o repertório. Read-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { findChampions } from "@/services/crm/CrmChampionDetector";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  if (!checkAdminRequest(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const restaurantId = req.nextUrl.searchParams.get("restaurantId");
  if (!restaurantId) return NextResponse.json({ ok: false, error: "restaurantId é obrigatório." }, { status: 400 });
  const result = await findChampions(restaurantId);
  return NextResponse.json(result);
}
