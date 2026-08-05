/**
 * GET    /api/admin/foocci-crm/contatos/[id] — o dossiê completo do contato.
 * DELETE /api/admin/foocci-crm/contatos/[id] — exclusão definitiva.
 *
 * ADMIN ONLY (ver `../../_guard.ts`).
 *
 * ⭐ O GET é o **ponto de integração do agente SDR**: devolve, num objeto só,
 * tudo que uma abordagem precisa — nome, WhatsApp pronto para link, restaurante,
 * cidade, origem (canal e campanha), o que a pessoa respondeu no formulário e o
 * histórico inteiro de contato. Ver `docs/crm-foocci.md`.
 *
 * O DELETE é exclusão de verdade, com cascata no histórico: é o direito de
 * eliminação da LGPD, e guardar a linha do tempo de quem pediu para sair seria
 * manter o dado pessoal com outro nome.
 */

import { NextRequest, NextResponse } from "next/server";
import { guardAdmin } from "../../_guard";
import { getDossie, excluirContato } from "@/services/foocci-crm/FoocciCrmService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const bloqueio = guardAdmin(req);
  if (bloqueio) return bloqueio;

  try {
    const dossie = await getDossie(params.id);
    if (!dossie) {
      return NextResponse.json({ ok: false, error: "Contato não encontrado." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, data: dossie });
  } catch (e) {
    console.error("[foocci-crm] dossiê falhou:", e);
    return NextResponse.json({ ok: false, error: "Não consegui abrir o contato." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const bloqueio = guardAdmin(req);
  if (bloqueio) return bloqueio;

  const r = await excluirContato(params.id);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.erro }, { status: 404 });
  return NextResponse.json({ ok: true });
}
