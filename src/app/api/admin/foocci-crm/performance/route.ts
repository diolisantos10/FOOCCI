/**
 * GET /api/admin/foocci-crm/performance — o funil e a origem dos contatos.
 *
 * ADMIN ONLY (ver `../_guard.ts`). Devolve contagens sempre e taxas só quando há
 * amostra: o serviço já entrega `taxa: null` + explicação quando não dá para
 * afirmar, e a tela é obrigada a repetir a frase honesta em vez de estampar 0%.
 *
 * Período obrigatório por construção: sem `period` cai em 30d, nunca em vitalício.
 */

import { NextRequest, NextResponse } from "next/server";
import { guardAdmin } from "../_guard";
import { getPerformance } from "@/services/foocci-crm/FoocciCrmPerformanceService";
import type { Period } from "@/lib/dashboard-periods";

export const dynamic = "force-dynamic";

const PERIODOS: Period[] = [
  "today", "yesterday", "this_week", "7d", "current_month", "last_month", "30d", "custom",
];

export async function GET(req: NextRequest) {
  const bloqueio = guardAdmin(req);
  if (bloqueio) return bloqueio;

  const sp = req.nextUrl.searchParams;
  const bruto = sp.get("period");
  const period: Period = PERIODOS.includes(bruto as Period) ? (bruto as Period) : "30d";

  try {
    const data = await getPerformance({
      period,
      startDate: sp.get("startDate"),
      endDate: sp.get("endDate"),
    });
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    console.error("[foocci-crm] performance falhou:", e);
    return NextResponse.json(
      { ok: false, error: "Não consegui calcular a performance agora." },
      { status: 500 },
    );
  }
}
