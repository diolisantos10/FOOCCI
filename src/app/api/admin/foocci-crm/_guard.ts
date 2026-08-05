/**
 * Guarda de admin do CRM da Foocci.
 *
 * ESTA BASE É DADO PESSOAL. Cada linha é um dono de restaurante que preencheu um
 * formulário: nome, WhatsApp, cidade, o negócio dele. A base legal existe (ele
 * pediu contato), mas isso autoriza a Foocci a falar com ele — não autoriza a
 * internet a ler a lista. Nenhuma rota deste diretório pode ser pública, nem
 * "só a de leitura", nem "só a de contagem".
 *
 * Devolve um NextResponse para curto-circuitar quando não autorizado, ou null
 * quando pode seguir. Espelha `api/admin/agents/waiter/runtime/_guard.ts`.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";

export function guardAdmin(req: NextRequest): NextResponse | null {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json(
      { ok: false, error: "Endpoint desligado — ADMIN_SECRET não configurado." },
      { status: 403 },
    );
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "Não autorizado" }, { status: 401 });
  }
  return null;
}
