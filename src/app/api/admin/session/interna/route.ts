/**
 * POST /api/admin/session/interna — entrar com e-mail e senha.
 * DELETE — sair.
 *
 * ── O BURACO QUE ESTA ROTA FECHA ────────────────────────────────────────────
 *
 * `autenticarInterno` e `criarCookieInterno` existiam em `src/lib/internal-auth.ts`
 * desde a v3, **e ninguém os chamava**. A identidade interna estava construída,
 * testada e sem porta: o único jeito de obter uma sessão era forjar o cookie por
 * script — que foi literalmente o que precisei fazer para capturar as evidências.
 *
 * Consequência prática: o comando manda o SDR entrar direto na Sala, e o SDR não
 * tinha como entrar em lugar nenhum. A tela de login só aceitava o `ADMIN_SECRET`,
 * que é a senha única da casa e dá acesso a tudo — o oposto do isolamento.
 *
 * ── PARA ONDE CADA UM VAI DEPOIS DE ENTRAR ──────────────────────────────────
 *
 * O destino vem do SERVIDOR, junto com a sessão, e não é escolhido pelo cliente.
 * Mandar o SDR para `/admin/restaurants` — o destino de todo mundo até aqui —
 * o jogaria numa tela que ele não pode ver, e a primeira coisa que ele veria do
 * sistema seria uma recusa.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  autenticarInterno,
  criarCookieInterno,
  cookieInternoDeSaida,
} from "@/lib/internal-auth";
// Fora do arquivo de rota de propósito: `route.ts` só pode exportar métodos
// HTTP e configuração — qualquer outro export derruba o `next build`.
import { destinoDe } from "@/lib/destino-por-papel";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let corpo: { email?: string; senha?: string };
  try {
    corpo = (await req.json()) as { email?: string; senha?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Corpo inválido." }, { status: 400 });
  }

  const email = corpo.email?.trim().toLowerCase();
  const senha = corpo.senha;

  if (!email || !senha) {
    return NextResponse.json(
      { ok: false, error: "Informe e-mail e senha." },
      { status: 400 },
    );
  }

  const sessao = await autenticarInterno(email, senha);

  if (!sessao) {
    // ── UMA MENSAGEM SÓ PARA TODAS AS FALHAS ──
    //
    // E-mail inexistente, senha errada, conta desativada e conta de IA devolvem
    // exatamente a mesma frase. Distinguir "não existe" de "senha errada"
    // entrega uma lista de e-mails válidos a quem estiver tentando.
    try {
      await prisma.internalAuditEvent.create({
        data: {
          actorType: "ANONIMO",
          actorLabel: email,
          acao: "entrar",
          recurso: "sessao-interna",
          resultado: "NEGADO",
          motivo: "credencial inválida",
        },
      });
    } catch {
      // Trilha fora do ar não abre a porta — nem fecha. A recusa já valeu.
    }

    return NextResponse.json(
      { ok: false, error: "E-mail ou senha incorretos." },
      { status: 401 },
    );
  }

  // Registro do acesso. Falhar aqui NÃO impede a entrada: quem já provou quem é
  // não pode ficar de fora porque o log caiu.
  try {
    await prisma.internalUser.update({
      where: { id: sessao.userId },
      data: { lastLoginAt: new Date() },
    });
    await prisma.internalAuditEvent.create({
      data: {
        actorType: "INTERNAL_USER",
        actorLabel: `${sessao.nome} (${sessao.userId})`,
        acao: "entrar",
        recurso: "sessao-interna",
        resultado: "PERMITIDO",
      },
    });
  } catch (e) {
    console.error("[sessao-interna] entrada não registrada na trilha:", e);
  }

  const res = NextResponse.json({
    ok: true,
    data: { nome: sessao.nome, papel: sessao.role, destino: destinoDe(sessao.role) },
  });

  res.headers.set("Set-Cookie", criarCookieInterno(sessao));
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", cookieInternoDeSaida());
  return res;
}
