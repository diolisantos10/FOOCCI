/**
 * GET /api/admin/foocci-crm/contatos — a base de prospects da Foocci.
 *
 * ADMIN ONLY (ver `../_guard.ts`). É a lista com nome e WhatsApp de gente real:
 * não existe versão pública desta rota, nem com dado "parcial".
 *
 * Filtros: `stage`, `naoAbordados=1` (a fila do SDR), `busca`, `limite`.
 */

import { NextRequest, NextResponse } from "next/server";
import { guardAdmin } from "../_guard";
import { listarContatos } from "@/services/foocci-crm/FoocciCrmService";
import { isEtapaValida } from "@/services/foocci-crm/foocciCrmFunnel";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const bloqueio = guardAdmin(req);
  if (bloqueio) return bloqueio;

  const sp = req.nextUrl.searchParams;
  const stageBruto = sp.get("stage");
  const limiteBruto = Number(sp.get("limite"));

  try {
    const contatos = await listarContatos({
      stage: isEtapaValida(stageBruto) ? stageBruto : undefined,
      somenteNaoAbordados: sp.get("naoAbordados") === "1",
      busca: sp.get("busca") ?? undefined,
      limite: Number.isFinite(limiteBruto) && limiteBruto > 0 ? limiteBruto : undefined,
    });
    return NextResponse.json({ ok: true, data: { contatos, total: contatos.length } });
  } catch (e) {
    console.error("[foocci-crm] listagem falhou:", e);
    return NextResponse.json(
      { ok: false, error: "Não consegui carregar os contatos agora." },
      { status: 500 },
    );
  }
}
