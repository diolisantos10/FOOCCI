/**
 * POST /api/cron/propostas/expirar
 *
 * A VARREDURA DA VALIDADE — proposta vencida não fica de pé para sempre.
 *
 * ── POR QUE ISTO É CRON E NÃO UM BOTÃO ──────────────────────────────────────
 *
 * Uma proposta com validade vencida e situação `ENVIADA` é receita em negociação
 * que não existe mais: ela infla o funil e some do radar ao mesmo tempo, porque
 * ninguém vai clicar em "expirar" numa lista que já rolou para baixo. O que não
 * expira sozinho não expira.
 *
 * ── O QUE ELA FAZ, e o que NÃO faz ──────────────────────────────────────────
 *
 * Chama `expirarPropostasVencidas` e devolve o extrato. **Não manda mensagem
 * nenhuma** — expirar é um fato do nosso lado, e avisar o cliente é outra
 * decisão, com outras travas. E não perde oportunidade sem motivo do catálogo:
 * sem o motivo semeado, a proposta expira e a oportunidade fica de pé, listada
 * em `naoExpiradas` com o porquê. Perder sem motivo é o arquivamento que o
 * documento do CEO proíbe.
 *
 * ── A GUARDA É FAIL-CLOSED ──────────────────────────────────────────────────
 *
 * Sem `CRON_SECRET`, 503 e não roda — mesmo desenho de
 * `api/cron/prospeccao/rodada`. Ausência de segredo é recusa, nunca passe livre.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { expirarPropostasVencidas } from "@/services/salaDeVendas/propostas";
import { AUTORIA_SISTEMA } from "@/services/salaDeVendas/jornadaComercial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function conferirCron(req: NextRequest): { ok: true } | { ok: false; status: 401 | 503; erro: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error(
      "[cron/propostas/expirar] CRON_SECRET não está configurado — a varredura NÃO roda. " +
        "Ausência de segredo é recusa, nunca passe livre.",
    );
    return { ok: false, status: 503, erro: "CRON_SECRET não configurado" };
  }
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return { ok: false, status: 401, erro: "Unauthorized" };
  }
  return { ok: true };
}

export async function POST(req: NextRequest) {
  const guarda = conferirCron(req);
  if (!guarda.ok) {
    return NextResponse.json({ ok: false, error: guarda.erro }, { status: guarda.status });
  }

  const extrato = await expirarPropostasVencidas(prisma, { autoria: AUTORIA_SISTEMA });

  if (extrato.naoExpiradas.length) {
    console.warn(
      `[cron/propostas/expirar] ${extrato.naoExpiradas.length} proposta(s) vencida(s) não fecharam o ciclo:`,
      extrato.naoExpiradas.slice(0, 10),
    );
  }

  return NextResponse.json({ ok: true, data: extrato });
}
