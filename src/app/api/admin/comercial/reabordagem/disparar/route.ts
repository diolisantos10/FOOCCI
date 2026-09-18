/**
 * POST /api/admin/comercial/reabordagem/disparar?tamanho=40
 *
 * ⭐ O BOTÃO. Um lote por chamada, e só por chamada.
 *
 * ── ⛔ NÃO EXISTE CRON QUE LIGUE ISTO ───────────────────────────────────────
 * Nenhum agendamento chama esta rota. Ela roda quando uma pessoa com o segredo
 * a chama — uma vez, um lote. Quem aperta o botão é o CEO.
 *
 * ── O FREIO ─────────────────────────────────────────────────────────────────
 *   · 40 contatos por lote (teto de 80), justificado em `reabordagem/executar.ts`;
 *   · no mínimo 30 minutos entre um lote e o seguinte, lido do BANCO — chamar
 *     duas vezes seguidas é recusado, não duplicado;
 *   · o interruptor de pânico é consultado antes de CADA contato.
 *
 * ── AUTORIZAÇÃO ─────────────────────────────────────────────────────────────
 * `REABORDAGEM_SECRET`, variável PRÓPRIA, tempo constante, fail-closed.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CABECALHO_DO_SEGREDO, conferirSegredo } from "@/services/salaDeVendas/reabordagem/guarda";
import { dispararUmLote, TAMANHO_DO_LOTE_PADRAO } from "@/services/salaDeVendas/reabordagem/executar";
import { portaDeEnvioReal } from "@/services/salaDeVendas/reabordagem/portaDeEnvio";
import { responsavelPelaCampanha } from "@/services/salaDeVendas/reabordagem/responsavel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const guarda = conferirSegredo({
    proprio: req.headers.get(CABECALHO_DO_SEGREDO),
    authorization: req.headers.get("authorization"),
  });
  if (!guarda.ok) {
    return NextResponse.json({ ok: false, error: guarda.motivo }, { status: guarda.status });
  }

  // ⚠️ Sem responsável, nada sai. Mandar mensagem sem autor é o que a casa
  // decidiu não fazer — e "o sistema mandou" não é resposta.
  const responsavel = await responsavelPelaCampanha(prisma);
  if (!responsavel.ok) {
    return NextResponse.json({ ok: false, error: responsavel.motivo }, { status: 503 });
  }

  const bruto = req.nextUrl.searchParams.get("tamanho");
  const tamanho = bruto ? Number.parseInt(bruto, 10) : TAMANHO_DO_LOTE_PADRAO;

  try {
    const r = await dispararUmLote(prisma, {
      porta: portaDeEnvioReal(prisma, responsavel.autorUserId),
      tamanho: Number.isFinite(tamanho) ? tamanho : TAMANHO_DO_LOTE_PADRAO,
      quemDisparou: "rota administrativa (segredo próprio)",
    });

    // ⚠️ Recusa NÃO é erro de servidor: o freio funcionando é o sistema certo.
    // 409 diz "não agora", e o corpo diz por quê.
    if (!r.rodou) {
      return NextResponse.json({ ok: true, disparou: false, data: r }, { status: 409 });
    }

    return NextResponse.json({ ok: true, disparou: true, data: r.conta });
  } catch (e) {
    const detalhe = e instanceof Error ? e.message.slice(0, 200) : "erro desconhecido";
    console.error("[admin/comercial/reabordagem/disparar] falhou", { detalhe });
    return NextResponse.json({ ok: false, error: detalhe }, { status: 500 });
  }
}
