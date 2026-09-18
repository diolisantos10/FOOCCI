/**
 * GET /api/cron/comercial/estado-da-corrente
 *
 * A PORTA QUE MOSTRA ONDE A CORRENTE ARREBENTA — do lead que entra ao plano
 * vendido, numa chamada só.
 *
 * ── POR QUE ELA EXISTE ──────────────────────────────────────────────────────
 * Os interruptores da casa moram em variáveis de ambiente do Railway, e os
 * valores vêm OCULTOS: ninguém consegue lê-los na tela, e ler o arquivo que
 * define a chave diz o NOME dela, nunca o VALOR em produção. O estado só é
 * conhecido de DENTRO do processo. Esta rota é esse "de dentro" — e é o único
 * caminho honesto para não presumir o que não se mediu.
 *
 * ── ELA SÓ LÊ ───────────────────────────────────────────────────────────────
 * Não envia, não agenda, não escreve, não muda estágio nem dono. MEDIDO por
 * `estadoDaCorrente/contrato.test.ts`, que lê este fonte — o mesmo molde do
 * raio-x das conversas.
 *
 * ── AUTORIZAÇÃO ─────────────────────────────────────────────────────────────
 * `CORRENTE_COMERCIAL_SECRET`, variável PRÓPRIA, comparada em tempo constante,
 * fail-closed. Sem ela, 503 — nunca aberta por omissão, e sem encosto em
 * `CRON_SECRET`, `ADMIN_SECRET` nem `RAIOX_COMERCIAL_SECRET`.
 *
 * ⚠️ Nenhum telefone, nome ou texto de conversa sai por aqui: a resposta é
 * contagem e estado. O único identificador devolvido é o `id` do lead parado
 * mais recente, para que o Diretor consiga abri-lo no CRM.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CABECALHO_DO_SEGREDO, conferirSegredo } from "@/services/salaDeVendas/estadoDaCorrente/guarda";
import { estadoDaCorrente } from "@/services/salaDeVendas/estadoDaCorrente/estadoDaCorrente";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guarda = conferirSegredo({
    proprio: req.headers.get(CABECALHO_DO_SEGREDO),
    authorization: req.headers.get("authorization"),
  });
  if (!guarda.ok) {
    return NextResponse.json({ ok: false, error: guarda.motivo }, { status: guarda.status });
  }

  const data = await estadoDaCorrente(prisma, { agora: new Date() });

  console.info("[cron/comercial/estado-da-corrente] estado lido", {
    oLeadQueChegaSozinhoEAtendido: data.interruptores.oLeadQueChegaSozinhoEAtendido,
    oQueFaltaLigar: data.interruptores.oQueFaltaLigar.length,
    semDono: data.largados.semDono,
    naoMedido: data.naoMedido.length,
  });

  return NextResponse.json({ ok: true, data });
}
