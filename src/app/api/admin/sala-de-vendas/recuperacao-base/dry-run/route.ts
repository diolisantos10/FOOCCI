import { NextRequest, NextResponse } from "next/server";
import { guardarSalaDeVendas, vePelaOperacaoToda } from "../../_guarda";
import { dryRunLegacyColdRecovery } from "@/services/sales/legacyColdRecovery";

export const dynamic = "force-dynamic";

/**
 * Inventory only. This endpoint has no send path by design.
 * It is intentionally GET-only so inspecting the historical base cannot
 * accidentally trigger a WhatsApp recovery campaign.
 */
export async function GET(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, "dry_run_recuperacao_base_antiga");
  if (!portao.ok) return portao.resposta;
  if (!vePelaOperacaoToda(portao.sessao)) {
    return NextResponse.json({ ok: false, error: "Só quem enxerga a operação inteira pode auditar a recuperação da base." }, { status: 403 });
  }

  try {
    const report = await dryRunLegacyColdRecovery();
    return NextResponse.json({ ok: true, report });
  } catch (e) {
    console.error("[recuperacao-base] dry-run falhou:", e);
    return NextResponse.json({ ok: false, error: "Não foi possível gerar o dry-run da base antiga." }, { status: 500 });
  }
}
