/**
 * POST /api/admin/session  — validate ADMIN_SECRET, set httpOnly admin cookie
 * DELETE /api/admin/session — clear admin cookie (logout)
 */

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, makeAdminToken } from "@/lib/admin-auth";
import { cookieInternoDeSaida } from "@/lib/internal-auth";

export async function POST(req: NextRequest) {
  const envSecret = process.env.ADMIN_SECRET;
  if (!envSecret) {
    return NextResponse.json(
      { error: "Admin access not configured. Set ADMIN_SECRET." },
      { status: 403 },
    );
  }

  let body: { secret?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.secret || body.secret !== envSecret) {
    return NextResponse.json({ error: "Secret inválido." }, { status: 401 });
  }

  const token = makeAdminToken();
  const res = NextResponse.json({ success: true });
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 8 * 60 * 60, // 8 hours
    path: "/",
  });
  return res;
}

/**
 * Sair — e sair das DUAS portas.
 *
 * ── O DEFEITO QUE ISTO EVITA ──
 *
 * Existem dois cookies de acesso: o do `ADMIN_SECRET` e o da sessão interna. Esta
 * rota é a única chamada pelo botão "Sair", e limpava só o primeiro.
 *
 * Quem tivesse entrado com e-mail e senha clicaria em "Sair", veria a tela de
 * login, e **continuaria dentro** — bastaria digitar qualquer endereço do Admin.
 * Num computador compartilhado da operação, é a sessão do SDR anterior ainda
 * aberta para o próximo que sentar.
 *
 * Limpar as duas é sempre correto: sair de uma porta em que não se entrou não
 * faz nada.
 */
export async function DELETE() {
  const res = NextResponse.json({ success: true });

  res.cookies.set(ADMIN_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });

  res.headers.append("Set-Cookie", cookieInternoDeSaida());
  return res;
}
