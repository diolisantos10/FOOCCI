/**
 * /api/admin/demo-bakery/seed — cria/atualiza a padaria de vitrine pelo painel.
 *
 * Existe porque o ambiente de desenvolvimento não tem o banco de produção: só a
 * produção (Railway) tem. Quem precisa da vitrine no ar não tem terminal — tem
 * botão. A lógica NÃO mora aqui: mora em `FoocciBakeryService`, o mesmo serviço
 * que `npm run bakery:seed` chama.
 *
 *   GET  → retrato da padaria (existe? quantos itens? quantos sem foto? rotas)
 *   POST → roda o seed. Body: { dryRun?: boolean, prune?: boolean }
 *
 * Auth: `checkAdminRequest` (cookie de admin ou x-admin-secret). `/api/admin/**`
 * está em PUBLIC_PATHS de propósito — o middleware não protege esta rota, esta
 * linha protege. É o que o gate de `src/security/routeGuards.test.ts` cobra.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { checkAdminRequest } from "@/lib/admin-auth";
import { ok, serverError, unauthorized } from "@/lib/api-response";
import {
  BAKERY_ERROR_STATUS,
  BakeryOperationError,
  getBakeryOverview,
  seedBakery,
} from "@/services/demo/FoocciBakeryService";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
// O seed percorre 7 categorias e 40 itens com variantes e adicionais: dezenas de
// idas ao banco. 60s é folga, não meta.
export const maxDuration = 60;

const bodySchema = z.object({
  dryRun: z.boolean().optional(),
  prune: z.boolean().optional(),
});

/** Recusa conhecida → status próprio + frase que o CEO entende. Nunca 500 anônimo. */
function refusal(err: BakeryOperationError) {
  return NextResponse.json(
    { success: false, error: err.message, code: err.code },
    { status: BAKERY_ERROR_STATUS[err.code] },
  );
}

export async function GET(req: NextRequest) {
  if (!checkAdminRequest(req)) return unauthorized();
  try {
    return ok(await getBakeryOverview());
  } catch (e) {
    console.error("[admin/demo-bakery/seed] GET", e);
    return serverError("Não consegui ler o estado da padaria — o banco não respondeu.");
  }
}

export async function POST(req: NextRequest) {
  if (!checkAdminRequest(req)) return unauthorized();

  const raw = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw ?? {});
  const options = parsed.success ? parsed.data : {};

  try {
    const result = await seedBakery(options);
    console.log("[admin/demo-bakery/seed] concluído", {
      dryRun: result.dryRun,
      restaurantCreated: result.restaurantCreated,
      categorias: result.categoriesCreated + result.categoriesUpdated,
      itens: result.itemsCreated + result.itemsUpdated,
      semFoto: result.itemsWithoutImage,
    });
    // A senha do dono, quando nasce agora, aparece UMA vez — e só na resposta do
    // clique que a criou. Não fica em log nenhum.
    return ok(result);
  } catch (e) {
    if (e instanceof BakeryOperationError) {
      console.error("[admin/demo-bakery/seed] recusado", { code: e.code, evidence: e.evidence });
      return refusal(e);
    }
    console.error("[admin/demo-bakery/seed] POST", e);
    return serverError(
      "A criação da padaria parou por um erro inesperado do servidor. Nada ficou pela metade " +
        "sem aviso: pode clicar de novo — a operação não duplica nada.",
    );
  }
}
