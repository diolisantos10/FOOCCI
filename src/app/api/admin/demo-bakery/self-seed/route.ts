/**
 * POST /api/admin/demo-bakery/self-seed — o passo automático de todo deploy.
 *
 * Quem chama é o `scripts/start-production.sh`, em segundo plano, depois que o
 * servidor sobe — o mesmo padrão que já mantém os guias do lojista em dia. O
 * botão do admin (`/admin/padaria-vitrine`) continua existindo e continua sendo
 * o caminho manual para forçar ou regerar; esta rota é o caminho que não depende
 * de ninguém lembrar de clicar.
 *
 * O que ela faz: cria/atualiza a padaria (idempotente) e dispara em segundo plano
 * as fotos que ainda faltam — nunca as que já existem.
 *
 * **O status HTTP aqui é para o script, não para um humano:**
 *   200 → o cardápio está em dia (com ou sem foto nova). O script para de tentar.
 *   503 → o seed não passou (banco fora, por exemplo). O script tenta de novo,
 *         no máximo 3 vezes. Nem 200 nem 503 derrubam o boot: o `next start` já
 *         está rodando e o curl vive num subshell em segundo plano.
 *
 * Auth: `checkAdminRequest`. `/api/admin/**` está em PUBLIC_PATHS de propósito —
 * o middleware não protege esta rota, esta linha protege
 * (gate: src/security/routeGuards.test.ts).
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { unauthorized } from "@/lib/api-response";
import { runBakerySelfSeed } from "@/services/demo/bakerySelfSeed";

export const dynamic = "force-dynamic";
/** O seed percorre 7 categorias e 40 itens. 60s é folga, não meta. */
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!checkAdminRequest(req)) return unauthorized();

  // `runBakerySelfSeed` não lança em nenhum caminho — mas o `catch` fica aqui
  // assim mesmo. Esta rota roda no boot: ela é o último lugar do sistema que pode
  // se dar ao luxo de confiar numa promessa de que "nunca falha".
  try {
    const resultado = await runBakerySelfSeed();
    const status = resultado.seed.estado === "FALHOU" ? 503 : 200;
    return NextResponse.json({ success: resultado.seed.estado !== "FALHOU", data: resultado }, { status });
  } catch (e) {
    console.error("[admin/demo-bakery/self-seed] erro inesperado — o boot segue", e);
    return NextResponse.json(
      {
        success: false,
        error:
          "O seed automático da padaria parou por um erro inesperado. O site subiu assim mesmo; " +
          "a padaria pode estar faltando ou desatualizada.",
      },
      { status: 503 },
    );
  }
}
