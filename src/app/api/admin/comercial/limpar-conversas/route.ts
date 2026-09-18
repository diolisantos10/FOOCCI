/**
 * POST /api/admin/comercial/limpar-conversas?apagar=0|1
 *
 * A LIMPEZA DAS CONVERSAS DE ATENDIMENTO — ordem do CEO, 18/09/2026.
 * O que ela apaga, o que ela preserva e por quê está em
 * `src/services/salaDeVendas/limpeza/limparConversas.ts`.
 *
 * ── ENSAIO É O PADRÃO ───────────────────────────────────────────────────────
 *   ?apagar=0 (ou ausente) → devolve o que APAGARIA. Não escreve nada.
 *   ?apagar=1              → executa, em lotes, e devolve a conta.
 * Qualquer valor que não seja exatamente "1" é ensaio — inclusive "true" e
 * "sim". Uma rota que apaga tudo por omissão é acidente esperando acontecer.
 *
 * ── RETOMÁVEL ───────────────────────────────────────────────────────────────
 * `faltaRodarDeNovo: true` na resposta = sobrou conversa; chame de novo, com o
 * mesmo comando. Rodar duas vezes não quebra e não duplica o arquivo.
 *
 * ── AUTORIZAÇÃO ─────────────────────────────────────────────────────────────
 * `LIMPEZA_CONVERSAS_SECRET`, variável PRÓPRIA, tempo constante, fail-closed.
 *
 * ── ⚠️ POST, E NÃO GET ──────────────────────────────────────────────────────
 * Com `apagar=1` isto destrói dado. GET é o verbo que um pré-carregador de link
 * dispara sozinho.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CABECALHO_DO_SEGREDO, conferirSegredo } from "@/services/salaDeVendas/limpeza/guarda";
import { limparConversas } from "@/services/salaDeVendas/limpeza/limparConversas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const guarda = conferirSegredo({
    proprio: req.headers.get(CABECALHO_DO_SEGREDO),
    authorization: req.headers.get("authorization"),
  });
  if (!guarda.ok) {
    return NextResponse.json({ ok: false, error: guarda.motivo }, { status: guarda.status });
  }

  const apagar = req.nextUrl.searchParams.get("apagar") === "1";
  const lote = Number(req.nextUrl.searchParams.get("lote") ?? "");
  const tamanhoDoLote = Number.isFinite(lote) && lote > 0 ? lote : undefined;

  if (apagar) {
    console.warn("[admin/comercial/limpar-conversas] APAGANDO", {
      em: new Date().toISOString(),
      motivo: "parâmetro explícito ?apagar=1 — as conversas serão arquivadas e apagadas",
    });
  }

  try {
    const r = await limparConversas(prisma, { apagar, tamanhoDoLote });
    console.info("[admin/comercial/limpar-conversas] conta", {
      ensaio: r.ensaio,
      noAlvo: r.conversas.noAlvo,
      apagadas: r.conversas.apagadas,
      optOuts: r.preservado.optOuts,
      faltaRodarDeNovo: r.faltaRodarDeNovo,
    });
    return NextResponse.json({ ok: true, data: r });
  } catch (e) {
    // ⚠️ A mensagem do banco é recortada: ela pode carregar trecho de consulta.
    const detalhe = e instanceof Error ? e.message.slice(0, 200) : "erro desconhecido";
    console.error("[admin/comercial/limpar-conversas] falhou", { detalhe });
    return NextResponse.json({ ok: false, error: detalhe }, { status: 500 });
  }
}
