/**
 * POST /api/admin/foocci-crm/contatos/[id]/interacao — registra o que aconteceu.
 *
 * ADMIN ONLY (ver `../../../_guard.ts`).
 *
 * É por aqui que "mandei mensagem", "ele respondeu", "liguei" e "fizemos a
 * demonstração" entram na linha do tempo — sem mexer na etapa. Separar as duas
 * coisas é proposital: nem toda conversa faz o contato avançar, e forçar uma
 * mudança de etapa a cada toque encheria o funil de movimento falso.
 *
 * `MUDANCA_ETAPA` NÃO é aceita aqui. Mudança de etapa tem rota própria, que
 * escreve estado e histórico na mesma transação — permitir os dois caminhos seria
 * abrir uma porta para o histórico dizer uma coisa e o `stage` dizer outra.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardAdmin } from "../../../_guard";
import { registrarInteracao } from "@/services/foocci-crm/FoocciCrmService";

export const dynamic = "force-dynamic";

const TIPOS_PERMITIDOS = [
  "MENSAGEM_ENVIADA", "RESPOSTA_RECEBIDA", "LIGACAO", "REUNIAO", "NOTA",
] as const;

const schema = z.object({
  tipo: z.enum(TIPOS_PERMITIDOS),
  nota: z.string().trim().max(1000).optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const bloqueio = guardAdmin(req);
  if (bloqueio) return bloqueio;

  const bruto = await req.json().catch(() => null);
  const parsed = schema.safeParse(bruto);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Tipo de interação inválido." },
      { status: 400 },
    );
  }

  try {
    const r = await registrarInteracao({
      leadId: params.id,
      tipo: parsed.data.tipo,
      actor: "admin",
      nota: parsed.data.nota,
    });
    if (!r.ok) return NextResponse.json({ ok: false, error: r.erro }, { status: 404 });
    return NextResponse.json({ ok: true, data: { em: r.em } });
  } catch (e) {
    console.error("[foocci-crm] interação falhou:", e);
    return NextResponse.json({ ok: false, error: "Não consegui registrar." }, { status: 500 });
  }
}
