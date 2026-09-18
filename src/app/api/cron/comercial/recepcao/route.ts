/**
 * POST /api/cron/comercial/recepcao
 *
 * A RODADA DA RECEPÇÃO — quem fala com o lead que chegou sozinho.
 *
 * ── O QUE ELA CONSERTA ──────────────────────────────────────────────────────
 * Até 18/09/2026, um lead que preenchia o formulário e não escrevia no WhatsApp
 * não era tocado por linha nenhuma de código: `atenderComOTA` só roda quando a
 * pessoa escreve, e a rodada das 9h varre exclusivamente a lista fria. Ele
 * nascia `NOVO`/`NINGUEM` e ficava. Esta rota é o chamador que faltava.
 *
 * ── O QUE ELA NÃO FAZ ───────────────────────────────────────────────────────
 * Não escolhe quem entra (é a fila), não monta mensagem (é o modelo aprovado) e
 * **não afrouxa portão nenhum**: cada lead atravessa exatamente `abordarLead`,
 * com o portão do contato, o freio de ritmo, a Supervisora, a trava de
 * repetição e as chaves do dono.
 *
 * ── ⛔ DUAS GUARDAS, E AS DUAS FECHADAS POR OMISSÃO ─────────────────────────
 *   · `CRON_SECRET` — quem pode chamar. Sem ela, 503.
 *   · `FOOCCI_RECEPCAO_LIGADA` — se a recepção automática existe. Sem ela, a
 *     rodada responde `ligada: false` e não encosta em lead nenhum.
 * A segunda é do DONO, não do agendador: ligar o canal para responder quem
 * escreveu não é, com o mesmo gesto, autorizar a casa a abrir conversa com
 * milhares de contatos que nunca foram abordados.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  rodadaDaRecepcao,
  TETO_PADRAO_DA_RODADA,
  TETO_MAXIMO_DA_RODADA,
} from "@/services/salaDeVendas/recepcao/recepcaoDeLeads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function conferirCron(req: NextRequest): { ok: true } | { ok: false; status: 401 | 503; erro: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error(
      "[cron/comercial/recepcao] CRON_SECRET não está configurado — a recepção NÃO roda. " +
        "Ausência de segredo é recusa, nunca passe livre.",
    );
    return { ok: false, status: 503, erro: "CRON_SECRET não configurado" };
  }
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return { ok: false, status: 401, erro: "Unauthorized" };
  }
  return { ok: true };
}

function lerTeto(bruto: unknown): number {
  const n = typeof bruto === "number" ? bruto : Number.parseInt(String(bruto ?? ""), 10);
  if (!Number.isFinite(n)) return TETO_PADRAO_DA_RODADA;
  return Math.min(Math.max(Math.trunc(n), 0), TETO_MAXIMO_DA_RODADA);
}

export async function POST(req: NextRequest) {
  const auth = conferirCron(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.erro }, { status: auth.status });

  const corpo = (await req.json().catch(() => ({}))) as { teto?: unknown };
  const teto = lerTeto(corpo.teto);

  const r = await rodadaDaRecepcao(prisma, { agora: new Date(), teto });

  const motivos: Record<string, number> = {};
  for (const linha of r.extrato) {
    const chave = linha.ok ? "ok" : (linha.motivo ?? "(sem motivo)");
    motivos[chave] = (motivos[chave] ?? 0) + 1;
  }

  console.info("[cron/comercial/recepcao] rodada concluída", {
    ligada: r.ligada,
    naFila: r.naFila,
    tentados: r.tentados,
    recebidos: r.recebidos,
    parouPor: r.parouPor,
    motivos,
  });

  return NextResponse.json({ ok: true, data: { ...r, motivos, teto } });
}
