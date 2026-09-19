/**
 * POST /api/admin/sala-de-vendas/prioridade — { leadId, prioritario }
 *
 * O botão **Prioridade** da Central de Atendimento (tela 03).
 *
 * ── ⚠️ POR QUE UMA ROTA PRÓPRIA, E NÃO `PATCH /ficha` ──────────────────────
 *
 * `PATCH /ficha` aceita `prioritario` — e **regrava a qualificação inteira no
 * mesmo movimento**: os campos que o corpo não trouxer viram `null` (ver o
 * `daFicha` daquele arquivo, que usa `?? null`, e o `upsert` logo abaixo).
 * Marcar prioridade por lá apagaria dor, urgência, orçamento e quem decide, e
 * ainda recalcularia o score sobre a ficha esvaziada.
 *
 * Um clique que muda uma coluna não pode arrastar dez outras. Esta rota escreve
 * **um campo**, e nada mais.
 *
 * As três camadas continuam as mesmas do resto da Sala: a guarda protege o
 * endereço, `podeVerOLead` protege o dado, e a auditoria lê e não escreve.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardarSalaDeVendas, somenteLeitura, podeVerOLead } from "../_guarda";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const portao = await guardarSalaDeVendas(req, "marcar_prioridade_do_lead");
  if (!portao.ok) return portao.resposta;

  if (somenteLeitura(portao.sessao)) {
    return NextResponse.json({ ok: false, error: "Auditoria lê e não escreve." }, { status: 403 });
  }

  const corpo = (await req.json().catch(() => null)) as
    | { leadId?: string; prioritario?: boolean }
    | null;

  const leadId = corpo?.leadId?.trim();
  if (!leadId) {
    return NextResponse.json({ ok: false, error: "leadId é obrigatório." }, { status: 400 });
  }
  if (typeof corpo?.prioritario !== "boolean") {
    return NextResponse.json(
      { ok: false, error: "prioritario precisa ser verdadeiro ou falso." },
      { status: 400 },
    );
  }

  const acesso = await podeVerOLead(portao.sessao, leadId, "marcar_prioridade_do_lead");
  if (!acesso.ok) return acesso.resposta;

  await prisma.siteLead.update({
    where: { id: leadId },
    data: { prioritario: corpo.prioritario },
  });

  return NextResponse.json({ ok: true, data: { prioritario: corpo.prioritario } });
}
