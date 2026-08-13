/**
 * POST /api/admin/reset-owner — FERRAMENTA DE OPERADOR. Apaga TODAS as contas de
 * usuário de UM restaurante (cardápio, pedidos e conversas ficam de pé).
 *
 * É irreversível: quem perde o acesso não recupera com "desfazer". Por isso ela
 * pede três coisas ao mesmo tempo, e recusa se faltar qualquer uma:
 *
 *   1. `x-admin-secret` igual ao `ADMIN_SECRET` (só cabeçalho — o cookie de sessão
 *      do admin NÃO serve aqui: um clique numa aba aberta não pode apagar acesso);
 *   2. `restaurantSlug` — o ALVO, escrito por extenso;
 *   3. `confirm: "APAGAR-USUARIOS"` — a frase que prova intenção.
 *
 * ── O QUE MUDOU EM 13/08/2026 ─────────────────────────────────────────────────
 * (a) A rota escolhia o alvo sozinha, com `restaurant.findFirst({ isActive: true })`
 *     — "um restaurante ativo qualquer". Num produto multi-restaurante isso é uma
 *     bomba sem mira: o operador pedia para limpar o restaurante A e o banco podia
 *     entregar o B. Agora o alvo é declarado e conferido; sem alvo, recusa.
 * (b) A comparação do segredo era `!==` cru. Passou a ser a de tempo constante de
 *     `@/lib/admin-auth`, a mesma que guarda o resto de `/api/admin`.
 * (c) A tela pública `/recover?force=true` chamava esta rota A UM CLIQUE do lojista
 *     — e sem mandar o segredo, então só sabia devolver "Unauthorized" em inglês.
 *     A tela foi removida. Esta rota não tem mais nenhum chamador no navegador, e
 *     não deve voltar a ter.
 * (d) `dryRun: true` responde quantas contas SERIAM apagadas sem apagar nenhuma —
 *     o ponto de reversão declarado antes de agir.
 *
 * Uso:
 *   curl -X POST https://<host>/api/admin/reset-owner \
 *     -H "x-admin-secret: $ADMIN_SECRET" -H "Content-Type: application/json" \
 *     -d '{"restaurantSlug":"pizzaria-nonna","confirm":"APAGAR-USUARIOS","dryRun":true}'
 *
 * Nenhuma resposta desta rota devolve segredo, nem pedaço dele, nem mascarado.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auditLog } from "@/lib/audit";
import { checkAdminSecretHeader } from "@/lib/admin-auth";

/** A frase de confirmação. Comparada inteira, sem normalizar: intenção não se adivinha. */
const CONFIRM_PHRASE = "APAGAR-USUARIOS";

export async function POST(req: NextRequest) {
  // Sem ADMIN_SECRET a rota não existe. Ausência de segredo REPROVA (guardrail 2).
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json(
      { error: "Rota desativada: ADMIN_SECRET não está configurado no servidor." },
      { status: 403 },
    );
  }

  if (!checkAdminSecretHeader(req)) {
    auditLog({
      action: "auth.login_failure",
      meta: { route: "POST /api/admin/reset-owner", reason: "invalid_secret" },
    });
    return NextResponse.json(
      { error: "Credencial de operador ausente ou inválida (cabeçalho x-admin-secret)." },
      { status: 401 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    restaurantSlug?: unknown;
    confirm?: unknown;
    dryRun?: unknown;
  } | null;

  const slug = typeof body?.restaurantSlug === "string" ? body.restaurantSlug.trim() : "";
  if (!slug) {
    return NextResponse.json(
      {
        error:
          'Informe o restaurante alvo em "restaurantSlug". Esta rota não escolhe ' +
          "restaurante sozinha — apagar acesso do inquilino errado é irreversível.",
      },
      { status: 400 },
    );
  }

  if (body?.confirm !== CONFIRM_PHRASE) {
    return NextResponse.json(
      { error: `Confirmação ausente. Envie "confirm": "${CONFIRM_PHRASE}".` },
      { status: 400 },
    );
  }

  const dryRun = body?.dryRun === true;

  try {
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug },
      select: { id: true, name: true, slug: true },
    });

    if (!restaurant) {
      return NextResponse.json(
        { error: `Nenhum restaurante com o slug "${slug}".` },
        { status: 404 },
      );
    }

    if (dryRun) {
      const wouldDelete = await prisma.user.count({ where: { restaurantId: restaurant.id } });
      return NextResponse.json({
        ok: true,
        dryRun: true,
        restaurantName: restaurant.name,
        restaurantSlug: restaurant.slug,
        wouldDeleteUsers: wouldDelete,
      });
    }

    const { count } = await prisma.user.deleteMany({
      where: { restaurantId: restaurant.id },
    });

    auditLog({
      action: "user.delete",
      restaurantId: restaurant.id,
      meta: { route: "reset-owner", restaurantSlug: restaurant.slug, deletedCount: count },
    });

    return NextResponse.json({
      ok: true,
      dryRun: false,
      restaurantName: restaurant.name,
      restaurantSlug: restaurant.slug,
      deletedUsers: count,
    });
  } catch (err) {
    console.error("[reset-owner]", err);
    return NextResponse.json(
      { error: "Erro de banco de dados. Nada foi apagado. Confira os logs." },
      { status: 503 },
    );
  }
}
