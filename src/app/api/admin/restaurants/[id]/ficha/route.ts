/**
 * /api/admin/restaurants/[id]/ficha — o cadastro do cliente.
 *
 * GET → tudo que se sabe sobre aquele restaurante + o que ainda falta.
 * PUT → grava o que a equipe preencheu.
 *
 * Admin puro. O `internalNotes` mora aqui e NUNCA sai por rota de tenant — o
 * `STORE_PROFILE_SELECT` do lado do lojista é uma allowlist e não inclui os
 * campos novos, então não há vazamento por esquecimento.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import {
  avaliarCadastro,
  CAMPOS_DO_CADASTRO,
  CHAVES_DO_CADASTRO,
  GRUPOS,
  sanitizarCadastro,
} from "@/services/restaurant/CadastroDoCliente";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function guard(req: NextRequest): NextResponse | null {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ ok: false, error: "Endpoint desligado — ADMIN_SECRET não configurado." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

/** O select é explícito: campo novo no schema não vaza sem alguém decidir. */
const SELECT = Object.fromEntries(CHAVES_DO_CADASTRO.map((c) => [c, true]));

export async function GET(req: NextRequest, { params }: Params) {
  const bloqueio = guard(req);
  if (bloqueio) return bloqueio;

  try {
    const { id } = await params;
    const restaurante = await prisma.restaurant.findUnique({
      where:  { id },
      select: {
        id: true, name: true, slug: true, isActive: true, plan: true, createdAt: true,
        storeProfile: { select: SELECT },
      },
    });
    if (!restaurante) return NextResponse.json({ ok: false, error: "Restaurante não encontrado." }, { status: 404 });

    const cadastro = (restaurante.storeProfile ?? {}) as Record<string, unknown>;

    return NextResponse.json({
      ok: true,
      restaurante: {
        id: restaurante.id, name: restaurante.name, slug: restaurante.slug,
        isActive: restaurante.isActive, plan: restaurante.plan, createdAt: restaurante.createdAt,
      },
      cadastro,
      avaliacao: avaliarCadastro(cadastro),
      campos: CAMPOS_DO_CADASTRO,
      grupos: GRUPOS,
    });
  } catch (err) {
    console.error("[GET /api/admin/restaurants/[id]/ficha]", err);
    return NextResponse.json({ ok: false, error: "Erro ao ler a ficha." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  const bloqueio = guard(req);
  if (bloqueio) return bloqueio;

  try {
    const { id } = await params;
    const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const dados = sanitizarCadastro(corpo);

    if (Object.keys(dados).length === 0) {
      return NextResponse.json({ ok: false, error: "Nada para salvar." }, { status: 400 });
    }

    const existe = await prisma.restaurant.findUnique({ where: { id }, select: { id: true } });
    if (!existe) return NextResponse.json({ ok: false, error: "Restaurante não encontrado." }, { status: 404 });

    // upsert: restaurante que nunca preencheu a loja ainda não tem perfil.
    const salvo = await prisma.storeProfile.upsert({
      where:  { restaurantId: id },
      create: { restaurantId: id, ...dados },
      update: dados,
      select: SELECT,
    });

    const cadastro = salvo as Record<string, unknown>;
    return NextResponse.json({ ok: true, cadastro, avaliacao: avaliarCadastro(cadastro) });
  } catch (err) {
    console.error("[PUT /api/admin/restaurants/[id]/ficha]", err);
    return NextResponse.json({ ok: false, error: "Erro ao salvar a ficha." }, { status: 500 });
  }
}
