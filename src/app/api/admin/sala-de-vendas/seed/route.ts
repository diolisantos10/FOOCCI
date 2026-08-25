/**
 * POST /api/admin/sala-de-vendas/seed
 *
 * Semeia o que a Sala de Vendas precisa para funcionar. Idempotente.
 *
 * ── POR QUE UMA ROTA, E NÃO SÓ O SCRIPT ─────────────────────────────────────
 *
 * O script `npm run db:seed-sala` existe e continua valendo. Mas rodá-lo em
 * produção exige terminal no ambiente — e sem ele **nenhum lead pode ser
 * marcado como perdido**, porque a regra do funil exige motivo estruturado e o
 * catálogo de motivos nasce vazio.
 *
 * Esta casa já resolve isso do mesmo jeito duas vezes: `seed-howtos` e
 * `demo-bakery/self-seed` são chamadas por `start-production.sh` depois que o
 * servidor sobe. Esta é a terceira, no mesmo molde — e é por isso que ela é uma
 * rota e não uma invenção.
 *
 * ── O QUE ELA CRIA, E O QUE ELA NUNCA CRIA ──────────────────────────────────
 *
 * CRIA: os motivos de perda, a configuração do TA **desligada**, e uma cadência
 * **inativa**.
 *
 * NUNCA CRIA LEAD. O próprio script recusa — um lead falso numa base comercial
 * é indistinguível de um real três semanas depois, e alguém vai ligar para ele.
 * Pior: entra na contagem do funil e contamina toda taxa da tela.
 *
 * E **nunca liga nada**: o TA nasce desligado e o seed não o religa. Ligar e
 * desligar é ato humano, das duas direções.
 */

import { NextRequest } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { semearSalaDeVendas } from "@/services/salaDeVendas/semear";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    if (!checkAdminRequest(req)) return unauthorized();
    return ok(await semearSalaDeVendas());
  } catch (err) {
    console.error("[POST /api/admin/sala-de-vendas/seed]", err);
    return serverError();
  }
}
