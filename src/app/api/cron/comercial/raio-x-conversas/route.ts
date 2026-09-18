/**
 * GET /api/cron/comercial/raio-x-conversas
 *
 * O RAIO-X DAS CONVERSAS DE PROSPECÇÃO — a porta de LEITURA que faltava.
 *
 * ── POR QUE ELA EXISTE ──────────────────────────────────────────────────────
 * O CEO quer reabordar quem já foi contactado e não deu em nada, e capturar o
 * telefone do responsável comercial. Antes de reabordar é preciso VER o que já
 * aconteceu — e o banco de produção não é alcançável de fora, nem a senha é
 * legível por ferramenta. Esta rota é o único caminho honesto: ler de dentro.
 *
 * ── ELA SÓ LÊ ───────────────────────────────────────────────────────────────
 * Não envia mensagem, não agenda envio, não escreve no banco, não muda estágio.
 * Não importa canal, `entregarMensagem`, `registrarSaida`, `abordar` nem nada
 * do `ta/`. Isso é MEDIDO por teste de contrato que lê este fonte
 * (`contrato.test.ts`), no molde do copiloto da Sala de Vendas — o mesmo teste
 * proíbe `prisma.*.create/update/upsert/delete` e `$executeRaw` aqui dentro.
 *
 * ── PARÂMETROS ──────────────────────────────────────────────────────────────
 *   ?desde=2026-08-01           janela (ISO). Ausente = todo o histórico.
 *   ?ate=2026-09-17             exclusivo no fim.
 *   ?amostra=20                 conversas na amostra (padrão 20, teto 200).
 *   ?pagina=1&porPagina=50      paginação da lista de reabordagem (teto 500).
 *   ?telefoneCompleto=1         devolve o número inteiro — E FICA NO LOG.
 *
 * ── AUTORIZAÇÃO ─────────────────────────────────────────────────────────────
 * `RAIOX_COMERCIAL_SECRET`, variável PRÓPRIA, comparada em tempo constante,
 * fail-closed. Sem ela, 503 — nunca aberta por omissão. Ver `raioX/guarda.ts`
 * para por que não se encosta em `CRON_SECRET` nem em `ADMIN_SECRET`.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CABECALHO_DO_SEGREDO, conferirSegredo } from "@/services/salaDeVendas/raioX/guarda";
import { telefoneParaResposta } from "@/services/salaDeVendas/raioX/telefone";
import {
  AMOSTRA_MAXIMA,
  AMOSTRA_PADRAO,
  POR_PAGINA_MAXIMA,
  POR_PAGINA_PADRAO,
  raioXDasConversas,
} from "@/services/salaDeVendas/raioX/raioXDasConversas";
import { painelDaReabordagem } from "@/services/salaDeVendas/reabordagem/painel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Data ISO, ou `null`. Data ilegível é recusada, não ignorada em silêncio. */
function lerData(bruto: string | null): { ok: true; valor: Date | null } | { ok: false; erro: string } {
  if (!bruto) return { ok: true, valor: null };
  const d = new Date(bruto);
  if (Number.isNaN(d.getTime())) {
    return { ok: false, erro: `data inválida: "${bruto}" — use ISO (ex.: 2026-08-01)` };
  }
  return { ok: true, valor: d };
}

function lerInteiro(bruto: string | null, padrao: number, minimo: number, teto: number): number {
  if (!bruto) return padrao;
  const n = Number.parseInt(bruto, 10);
  if (!Number.isFinite(n)) return padrao;
  return Math.min(Math.max(n, minimo), teto);
}

export async function GET(req: NextRequest) {
  const guarda = conferirSegredo({
    proprio: req.headers.get(CABECALHO_DO_SEGREDO),
    authorization: req.headers.get("authorization"),
  });
  if (!guarda.ok) {
    return NextResponse.json({ ok: false, error: guarda.motivo }, { status: guarda.status });
  }

  const q = req.nextUrl.searchParams;

  const desde = lerData(q.get("desde"));
  if (!desde.ok) return NextResponse.json({ ok: false, error: desde.erro }, { status: 400 });
  const ate = lerData(q.get("ate"));
  if (!ate.ok) return NextResponse.json({ ok: false, error: ate.erro }, { status: 400 });

  const telefoneCompleto = q.get("telefoneCompleto") === "1";

  // ⚠️ Abrir telefone é ATO, e ato fica registrado. O log não guarda número
  // nenhum — guarda que alguém abriu, quando, e com que recorte.
  if (telefoneCompleto) {
    console.warn("[cron/comercial/raio-x-conversas] TELEFONE COMPLETO liberado", {
      em: new Date().toISOString(),
      desde: q.get("desde"),
      ate: q.get("ate"),
      amostra: q.get("amostra"),
      motivo: "parâmetro explícito ?telefoneCompleto=1 — dado pessoal de terceiro",
    });
  }

  const raioX = await raioXDasConversas(prisma, {
    agora: new Date(),
    desde: desde.valor,
    ate: ate.valor,
    amostra: lerInteiro(q.get("amostra"), AMOSTRA_PADRAO, 0, AMOSTRA_MAXIMA),
    pagina: lerInteiro(q.get("pagina"), 1, 1, Number.MAX_SAFE_INTEGER),
    porPagina: lerInteiro(q.get("porPagina"), POR_PAGINA_PADRAO, 1, POR_PAGINA_MAXIMA),
    telefoneCompleto,
    formatarTelefone: telefoneParaResposta,
  });

  // ⭐ A CAMPANHA DE REABORDAGEM ENTRA AQUI, e não num painel novo.
  //
  // Ordem explícita: reaproveitar o raio-X. Mesma porta, mesmo segredo, mesma
  // doutrina de NÃO MEDIDO. Só leitura — ver `reabordagem/painel.ts`.
  const campanha = await painelDaReabordagem(prisma);

  console.info("[cron/comercial/raio-x-conversas] raio-x lido", {
    mensagensNaJanela: raioX.mensagensNaJanela,
    abordagemMedida: raioX.abordagem.medido,
    conversasNaAmostra: raioX.amostra.length,
    telefoneCompleto,
  });

  return NextResponse.json({ ok: true, data: { ...raioX, campanhaDeReabordagem: campanha } });
}
