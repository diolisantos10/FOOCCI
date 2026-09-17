/**
 * GET /api/cron/crm/raio-x-disparos
 *
 * O RAIO-X DE DISPAROS DO CRM DO RESTAURANTE — quantas mensagens saíram hoje e
 * em qual degrau as outras pararam.
 *
 * ⚠️ CRM **do restaurante** (o restaurante falando com os clientes DELE), não a
 * área comercial da Foocci. Aquela tem a rota dela, com segredo dela.
 *
 * ── ELA SÓ LÊ ───────────────────────────────────────────────────────────────
 * Não envia mensagem, não agenda envio, não escreve no banco, não muda campanha.
 * MEDIDO por teste de contrato que lê este fonte
 * (`src/services/crm/raioX/contrato.test.ts`), no molde do raio-x do comercial.
 *
 * ── PARÂMETROS ──────────────────────────────────────────────────────────────
 *   ?desde=2026-09-17T00:00:00Z   início da janela. Padrão: 24 h atrás.
 *   ?ate=2026-09-18T00:00:00Z     fim, exclusivo. Padrão: agora.
 *   ?restaurantId=<id>            repetível; ausente = todos com atividade.
 *
 * ── AUTORIZAÇÃO ─────────────────────────────────────────────────────────────
 * `RAIOX_CRM_SECRET`, variável PRÓPRIA, tempo constante, fail-closed. Sem ela,
 * 503 — nunca aberta por omissão, e sem encosto em CRON_SECRET/ADMIN_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CABECALHO_DO_SEGREDO, conferirSegredo } from "@/services/crm/raioX/guarda";
import { raioXDeDisparos } from "@/services/crm/raioX/funilDeDisparos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VINTE_E_QUATRO_HORAS_MS = 24 * 60 * 60 * 1000;

/** Data ISO, ou `null`. Data ilegível é recusada, não ignorada em silêncio. */
function lerData(bruto: string | null): { ok: true; valor: Date | null } | { ok: false; erro: string } {
  if (!bruto) return { ok: true, valor: null };
  const d = new Date(bruto);
  if (Number.isNaN(d.getTime())) {
    return { ok: false, erro: `data inválida: "${bruto}" — use ISO (ex.: 2026-09-17T00:00:00Z)` };
  }
  return { ok: true, valor: d };
}

export async function GET(req: NextRequest) {
  const guarda = conferirSegredo({
    proprio: req.headers.get(CABECALHO_DO_SEGREDO),
    authorization: req.headers.get("authorization"),
  });
  if (!guarda.ok) {
    return NextResponse.json({ erro: guarda.motivo }, { status: guarda.status });
  }

  const params = req.nextUrl.searchParams;
  const ate = lerData(params.get("ate"));
  if (!ate.ok) return NextResponse.json({ erro: ate.erro }, { status: 400 });
  const desde = lerData(params.get("desde"));
  if (!desde.ok) return NextResponse.json({ erro: desde.erro }, { status: 400 });

  const fim = ate.valor ?? new Date();
  const inicio = desde.valor ?? new Date(fim.getTime() - VINTE_E_QUATRO_HORAS_MS);
  if (inicio >= fim) {
    return NextResponse.json({ erro: "janela vazia: `desde` precisa ser anterior a `ate`" }, { status: 400 });
  }

  const restaurantIds = params.getAll("restaurantId").filter((s) => s.trim().length > 0);

  const relatorio = await raioXDeDisparos(prisma, { desde: inicio, ate: fim, restaurantIds });
  return NextResponse.json(relatorio);
}
