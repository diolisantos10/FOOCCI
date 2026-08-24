/**
 * O PAINEL DO AGENTE GERENTE COMERCIAL.
 *
 *   GET ?de=…&ate=…
 *
 * ── POR QUE O SDR NÃO ENTRA AQUI ────────────────────────────────────────────
 *
 * Este painel mostra carga, produtividade e nota de QA de TODO o time. É
 * informação de gestão sobre pessoas — o SDR ver o desempenho comparado dos
 * colegas não é transparência, é outra coisa.
 *
 * A lista de papéis é explícita e NÃO reaproveita a guarda da Sala, que aceita
 * `AGENTE_HUMANO` de propósito. Reaproveitar seria o caminho curto que abre a
 * porta errada.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { autorizarInterno } from "@/lib/internal-auth";
import { visaoDoGerente } from "@/services/salaDeVendas/painel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = autorizarInterno(req, {
    papeis: ["MASTER_CEO", "DIRETOR_FOOCCI", "GERENTE_DEPARTAMENTO", "AUDITOR_QA"],
  });

  if (!auth.ok) {
    try {
      await prisma.internalAuditEvent.create({
        data: {
          actorType: auth.sessao ? "INTERNAL_USER" : "ANONIMO",
          actorLabel: auth.sessao ? `${auth.sessao.nome} (${auth.sessao.userId})` : "anônimo",
          acao: "ler_painel_do_gerente",
          recurso: "sala-de-vendas/painel",
          resultado: "NEGADO",
          motivo: auth.motivo,
        },
      });
    } catch { /* trilha fora do ar não abre a porta */ }

    return NextResponse.json({ ok: false, error: auth.motivo }, { status: auth.status });
  }

  const agora = new Date();
  const params = req.nextUrl.searchParams;

  const de = params.get("de") ? new Date(params.get("de")!) : new Date(agora.getTime() - 30 * 86_400_000);
  const ate = params.get("ate") ? new Date(params.get("ate")!) : agora;

  if (Number.isNaN(de.getTime()) || Number.isNaN(ate.getTime()) || de >= ate) {
    return NextResponse.json({ ok: false, error: "Período inválido." }, { status: 400 });
  }

  const data = await visaoDoGerente(prisma, { de, ate, agora });
  return NextResponse.json({ ok: true, data });
}
