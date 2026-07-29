/**
 * GET /api/admin/crm/agent/phrases-global?dias=90&restaurantIds=a,b
 *
 * A conversão por frase olhando a rede inteira: quais frases convertem acima da
 * média em várias casas diferentes — o repertório que vale copiar primeiro.
 *
 * Só admin, e de propósito: a leitura cruza restaurantes. Não existe caminho de
 * tenant até aqui. O relatório agrega template e contagem; nada de cliente.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { relatorioGlobalDeFrases } from "@/services/crm/CrmPhraseGlobalReport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  if (!checkAdminRequest(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const diasCru = Number(req.nextUrl.searchParams.get("dias"));
  const dias = Number.isFinite(diasCru) && diasCru > 0 ? Math.min(diasCru, 365) : null;
  const desde = dias ? new Date(Date.now() - dias * 24 * 60 * 60 * 1000) : undefined;

  const restaurantIds = (req.nextUrl.searchParams.get("restaurantIds") ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);

  try {
    const relatorio = await relatorioGlobalDeFrases({
      ...(desde ? { desde } : {}),
      ...(restaurantIds.length ? { restaurantIds } : {}),
    });
    return NextResponse.json(relatorio);
  } catch (err) {
    console.error("[GET /api/admin/crm/agent/phrases-global]", err);
    return NextResponse.json({ ok: false, error: "Falha ao montar o relatório global." }, { status: 500 });
  }
}
