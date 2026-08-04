/**
 * /api/admin/demo-bakery/imagens — as fotos do cardápio da vitrine. DINHEIRO REAL.
 *
 *   GET  → o ensaio: quantas fotos faltam, quanto custaria, tem chave da OpenAI?
 *          e o estado do trabalho em curso (para a tela mostrar progresso).
 *   POST → dispara a geração. Body: { confirmar: true, regerar?: boolean, limite?: number }
 *
 * Três regras que esta rota existe para cumprir:
 *
 *  1. **O custo aparece ANTES.** O GET é de graça, não precisa de chave e devolve
 *     a estimativa. A tela mostra o número e só então oferece o botão.
 *  2. **`confirmar` é obrigatório.** Sem ele o serviço recusa — não há caminho em
 *     que um POST vazio gaste dinheiro.
 *  3. **Duplo clique não paga duas vezes.** Enquanto um trabalho está no prazo, o
 *     segundo POST leva 409. E o padrão nunca regera quem já tem foto: `regerar`
 *     é escolha separada e consciente.
 *
 * Auth: `checkAdminRequest`. `/api/admin/**` está em PUBLIC_PATHS — o middleware
 * não protege esta rota, esta linha protege (gate: src/security/routeGuards.test.ts).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkAdminRequest } from "@/lib/admin-auth";
import { ok, serverError, unauthorized } from "@/lib/api-response";
import {
  BAKERY_ERROR_STATUS,
  BakeryOperationError,
  getBakeryImageJob,
  planBakeryImages,
  startBakeryImageJob,
} from "@/services/demo/FoocciBakeryService";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  /** Obrigatoriamente `true`. Qualquer outra coisa é recusa — é dinheiro. */
  confirmar: z.literal(true).optional(),
  regerar: z.boolean().optional(),
  limite: z.number().int().min(1).max(200).optional(),
});

function refusal(err: BakeryOperationError) {
  return NextResponse.json(
    { success: false, error: err.message, code: err.code },
    { status: BAKERY_ERROR_STATUS[err.code] },
  );
}

export async function GET(req: NextRequest) {
  if (!checkAdminRequest(req)) return unauthorized();

  const regerar = req.nextUrl.searchParams.get("regerar") === "1";
  try {
    const plano = await planBakeryImages({ regerar });
    return ok({ plano, trabalho: getBakeryImageJob() });
  } catch (e) {
    console.error("[admin/demo-bakery/imagens] GET", e);
    return serverError("Não consegui ler o estado das fotos — o banco não respondeu.");
  }
}

export async function POST(req: NextRequest) {
  if (!checkAdminRequest(req)) return unauthorized();

  const raw = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw ?? {});
  const body = parsed.success ? parsed.data : {};

  try {
    const trabalho = await startBakeryImageJob({
      confirmar: body.confirmar === true,
      regerar: body.regerar,
      limite: body.limite,
    });
    console.log("[admin/demo-bakery/imagens] geração iniciada", {
      id: trabalho.id,
      total: trabalho.total,
      regerar: trabalho.regerar,
      custoEstimadoUsd: trabalho.custoEstimadoUsd,
    });
    return ok({ trabalho });
  } catch (e) {
    if (e instanceof BakeryOperationError) {
      console.error("[admin/demo-bakery/imagens] recusado", { code: e.code, evidence: e.evidence });
      return refusal(e);
    }
    console.error("[admin/demo-bakery/imagens] POST", e);
    return serverError(
      "A geração de fotos parou por um erro inesperado do servidor. Nenhuma foto nova foi " +
        "cobrada além das que já apareceram no cardápio.",
    );
  }
}
