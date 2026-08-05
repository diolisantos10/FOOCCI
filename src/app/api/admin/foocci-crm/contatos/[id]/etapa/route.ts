/**
 * PATCH /api/admin/foocci-crm/contatos/[id]/etapa — move o contato no funil.
 *
 * ADMIN ONLY (ver `../../../_guard.ts`).
 *
 * A etapa é DADO, não texto: `para` precisa ser um valor do enum, e qualquer
 * outra coisa é 400. É o que garante que o funil conta o que existe — uma
 * etapa digitada à mão ("quase fechando") não seria contável nem por pessoa nem
 * por agente.
 *
 * O autor vem do CANAL, não do corpo do pedido: quem entra por esta rota é o
 * admin autenticado, então `actor = "admin"`. Deixar o cliente escolher o autor
 * seria deixar o registro de responsabilidade nas mãos de quem age.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardAdmin } from "../../../_guard";
import { moverEtapa } from "@/services/foocci-crm/FoocciCrmService";
import { TODAS_AS_ETAPAS } from "@/services/foocci-crm/foocciCrmFunnel";

export const dynamic = "force-dynamic";

const schema = z.object({
  para: z.enum(TODAS_AS_ETAPAS as [string, ...string[]]),
  nota: z.string().trim().max(1000).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const bloqueio = guardAdmin(req);
  if (bloqueio) return bloqueio;

  const bruto = await req.json().catch(() => null);
  const parsed = schema.safeParse(bruto);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Etapa inválida. Use uma das etapas do funil." },
      { status: 400 },
    );
  }

  try {
    const r = await moverEtapa({
      leadId: params.id,
      para: parsed.data.para as never,
      actor: "admin",
      nota: parsed.data.nota,
    });
    if (!r.ok) return NextResponse.json({ ok: false, error: r.erro }, { status: 400 });
    return NextResponse.json({ ok: true, data: { de: r.de, para: r.para, em: r.em } });
  } catch (e) {
    console.error("[foocci-crm] mudança de etapa falhou:", e);
    return NextResponse.json({ ok: false, error: "Não consegui mudar a etapa." }, { status: 500 });
  }
}
