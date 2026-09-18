/**
 * POST /api/admin/comercial/religar-frio?gravar=0|1
 *
 * O RELIGAMENTO lead ↔ Empresa, por comando explícito.
 *
 * ── POR QUE ESTA ROTA EXISTE ────────────────────────────────────────────────
 * `npm run frio:acordar` precisa de `DATABASE_URL`, e a senha do banco de
 * produção não é legível fora do produto. Sem o religamento,
 * `objetivoDaProspeccao()` devolve `null` para a base inteira e a campanha de
 * reabordagem sai cega. Esta é a única porta honesta: rodar de dentro.
 *
 * ── ⛔ ELA NÃO ENVIA MENSAGEM. NENHUMA. ─────────────────────────────────────
 * Medido por `religamento/contrato.test.ts`, que lê ESTE fonte sem comentários
 * e reprova qualquer caminho de envio da casa.
 *
 * ── ENSAIO É O PADRÃO ───────────────────────────────────────────────────────
 *   ?gravar=0 (ou ausente) → conta e NÃO escreve nada.
 *   ?gravar=1              → executa, e devolve a conta linha a linha.
 *
 * ── ⚠️ POST, E NÃO GET ──────────────────────────────────────────────────────
 * Com `gravar=1` isto muda a base. GET é o verbo do que não muda nada — e é o
 * verbo que um navegador, um pré-carregador de link ou um robô dispara sozinho.
 *
 * ── AUTORIZAÇÃO ─────────────────────────────────────────────────────────────
 * `RELIGAMENTO_FRIO_SECRET`, variável PRÓPRIA, tempo constante, fail-closed.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  CABECALHO_DO_SEGREDO,
  conferirSegredo,
} from "@/services/salaDeVendas/religamento/guarda";
import { religarConscienciaDoFrio } from "@/services/salaDeVendas/religamento/religarFrio";

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

  // ⚠️ Gravar é ATO EXPLÍCITO. Qualquer valor que não seja exatamente "1" é
  // ensaio — inclusive "true", "sim" e vazio. Na dúvida, não escreve.
  const gravar = req.nextUrl.searchParams.get("gravar") === "1";

  if (gravar) {
    console.warn("[admin/comercial/religar-frio] GRAVANDO", {
      em: new Date().toISOString(),
      motivo: "parâmetro explícito ?gravar=1 — o religamento escreve na base comercial",
    });
  }

  try {
    const r = await religarConscienciaDoFrio(prisma, { gravar });
    console.info("[admin/comercial/religar-frio] religamento", {
      gravou: r.gravou,
      semEmpresaLigada: r.antes.semEmpresaLigada,
      comSeloDeNovoLead: r.antes.comSeloDeNovoLead,
      ligados: r.gravou ? r.ligacao.ligados : null,
      corrigidos: r.gravou ? r.etapa.corrigidos : null,
    });
    return NextResponse.json({ ok: true, data: r });
  } catch (e) {
    // ⚠️ A mensagem do banco é recortada: ela pode carregar trecho de consulta,
    // e consulta carrega dado de terceiro.
    const detalhe = e instanceof Error ? e.message.slice(0, 200) : "erro desconhecido";
    console.error("[admin/comercial/religar-frio] falhou", { detalhe });
    return NextResponse.json({ ok: false, error: detalhe }, { status: 500 });
  }
}
