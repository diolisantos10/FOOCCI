/**
 * POST /api/recover
 *
 * Recovery flow for when a restaurant exists but has no active OWNER.
 *
 * GET  → { recoveryAllowed: bool, reason?: string }
 * POST → creates a new OWNER user on the existing restaurant
 *
 * Safety gates:
 *   - Requires the x-admin-secret header to match ADMIN_SECRET. FAILS CLOSED:
 *     without ADMIN_SECRET configured the endpoint is disabled, never open.
 *   - The restaurant is named explicitly by the caller and verified; it is never
 *     guessed.
 *   - Blocked immediately if an active OWNER already exists.
 *   - The owner-existence check and user creation are wrapped in a single
 *     Prisma transaction to prevent race conditions where two simultaneous
 *     requests both pass the guard and both create owners.
 *   - Rate-limited (5 attempts / 5 min per IP).
 *
 * ⚠️ POR QUE ESTA ROTA MUDOU — os dois furos que ela tinha.
 *
 * 1. NÃO PEDIA CREDENCIAL NENHUMA. A rota é isenta de autenticação no middleware
 *    (src/middleware.ts, saída antecipada de /api/recover) e cria uma conta OWNER.
 *    O único portão era "não existe OWNER ativo" — que é uma condição do banco, não
 *    uma prova de quem chamou. Qualquer pessoa da internet que encontrasse um
 *    restaurante sem OWNER ativo virava dona dele. Agora o portão é ADMIN_SECRET,
 *    o mesmo segredo que o irmão /api/admin/reset-owner já exigia para o mesmo
 *    tipo de operação de emergência.
 *
 * 2. ESCOLHIA "O PRIMEIRO RESTAURANTE ATIVO" (`findFirst({ isActive: true })`).
 *    Isso é id não provado com outro nome: a rota decidia sozinha em quem mexer, sem
 *    ordenação definida, e num banco multi-inquilino "o primeiro" é arbitrário. Pior,
 *    prendia a recuperação a esse único restaurante — se o primeiro tinha OWNER, a
 *    recuperação de qualquer outro ficava impossível; se não tinha, era ele que era
 *    entregue. Agora o restaurante é NOMEADO pelo chamador e conferido. A omissão do
 *    id só é tolerada quando existe exatamente UM restaurante ativo, caso em que não
 *    há o que adivinhar; com dois ou mais, a rota exige o id em vez de escolher.
 *
 * Segredo ausente não pode significar "pode passar", e id recebido não é id provado.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import { z } from "zod";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { auditLog } from "@/lib/audit";

const recoverSchema = z.object({
  ownerName:     z.string().min(2).max(100),
  ownerEmail:    z.string().email(),
  ownerPassword: z.string().min(8).max(72),
  // Qual restaurante recuperar. Opcional apenas no caso de instalação única.
  restaurantId:  z.string().min(1).optional(),
});

type AuthOutcome = { ok: true } | { ok: false; status: 401 | 503; error: string };

/**
 * Portão de credencial. Fecha quando ADMIN_SECRET não existe — nunca abre.
 * Espelha /api/admin/reset-owner, que faz a operação irmã.
 */
function checkAdminSecret(req: NextRequest): AuthOutcome {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    console.error("[api/recover] ADMIN_SECRET não configurado — recuperação permanece fechada");
    return { ok: false, status: 503, error: "Recovery is disabled. Set ADMIN_SECRET to enable it." };
  }
  const provided = req.headers.get("x-admin-secret") ?? "";
  if (provided !== adminSecret) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true };
}

/**
 * Resolve o restaurante alvo SEM adivinhar.
 *  - id informado → tem que existir e estar ativo.
 *  - id ausente   → só resolve se houver exatamente um restaurante ativo.
 */
async function resolveTarget(restaurantId?: string) {
  if (restaurantId) {
    const restaurant = await prisma.restaurant.findFirst({
      where: { id: restaurantId, isActive: true },
      select: { id: true, name: true },
    });
    if (!restaurant) return { restaurant: null, reason: "restaurant_not_found" as const };
    return { restaurant, reason: null };
  }

  // Sem id: tolerado apenas quando não há ambiguidade nenhuma.
  const actives = await prisma.restaurant.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    take: 2,
  });
  if (actives.length === 0) return { restaurant: null, reason: "no_restaurant" as const };
  if (actives.length > 1) return { restaurant: null, reason: "restaurant_id_required" as const };
  return { restaurant: actives[0], reason: null };
}

async function getRecoveryContext(restaurantId?: string) {
  const { restaurant, reason } = await resolveTarget(restaurantId);
  if (!restaurant) {
    return { allowed: false, reason, restaurant: null };
  }

  const activeOwner = await prisma.user.findFirst({
    where: { restaurantId: restaurant.id, role: "OWNER", isActive: true },
    select: { id: true },
  });

  if (activeOwner) {
    return { allowed: false, reason: "owner_exists", restaurant };
  }

  return { allowed: true, reason: null, restaurant };
}

/**
 * GET só responde a quem apresenta o segredo. Antes ele devolvia o NOME do
 * restaurante a qualquer visitante anônimo, junto com o aviso de que a
 * recuperação estava liberada — ou seja, anunciava o alvo.
 */
export async function GET(req: NextRequest) {
  const auth = checkAdminSecret(req);
  if (!auth.ok) {
    return NextResponse.json(
      { recoveryAllowed: false, reason: "auth_required", restaurantName: null },
      { status: auth.status }
    );
  }

  try {
    const restaurantId = req.nextUrl.searchParams.get("restaurantId") ?? undefined;
    const ctx = await getRecoveryContext(restaurantId);
    return NextResponse.json({
      recoveryAllowed: ctx.allowed,
      reason: ctx.reason,
      restaurantName: ctx.restaurant?.name ?? null,
    });
  } catch {
    return NextResponse.json(
      { error: "Could not reach the database. Check DATABASE_URL." },
      { status: 503 }
    );
  }
}

export async function POST(req: NextRequest) {
  // Rate limit: 5 attempts / 5 minutes per IP
  const ip = getClientIp(req);
  const rl = rateLimit({ key: `recover:${ip}`, limit: 5, windowMs: 5 * 60_000 });
  if (rl.limited) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  // PORTÃO 1 — credencial. Antes de qualquer leitura do banco e antes de revelar
  // qualquer motivo ao chamador.
  const auth = checkAdminSecret(req);
  if (!auth.ok) {
    if (auth.status === 401) {
      auditLog({
        action: "auth.login_failure",
        meta: { route: "POST /api/recover", reason: "invalid_admin_secret" },
      });
    }
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = recoverSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Validation error." },
      { status: 422 }
    );
  }

  const { ownerName, ownerEmail, ownerPassword } = parsed.data;

  // PORTÃO 2 — alvo. O restaurante vem do pedido e é conferido; nunca é "o primeiro".
  const preCheck = await getRecoveryContext(parsed.data.restaurantId).catch(() => ({
    allowed: false,
    reason: "db_error",
    restaurant: null,
  }));

  if (!preCheck.allowed || !preCheck.restaurant) {
    const error =
      preCheck.reason === "owner_exists"
        ? "An active owner account already exists."
        : preCheck.reason === "restaurant_id_required"
          ? "restaurantId is required: more than one active restaurant exists."
          : preCheck.reason === "restaurant_not_found"
            ? "Restaurant not found."
            : "Recovery not available.";
    return NextResponse.json({ error }, { status: 403 });
  }

  const restaurantId = preCheck.restaurant.id;

  // Hash before the transaction — bcrypt is slow and we don't want to hold
  // a DB connection open while it runs.
  const hashedPassword = await hash(ownerPassword, 12);

  try {
    // Atomically re-check "no active owner" and create the owner.
    // This eliminates the race condition where two concurrent requests both
    // pass the pre-check above and both try to create an owner account.
    const outcome = await prisma.$transaction(async (tx) => {
      const activeOwner = await tx.user.findFirst({
        where: { restaurantId, role: "OWNER", isActive: true },
        select: { id: true },
      });
      if (activeOwner) return { blocked: true, restaurantName: null };

      const existingUser = await tx.user.findFirst({
        where: { email: ownerEmail, restaurantId },
        select: { id: true },
      });

      if (existingUser) {
        // Reactivate and promote to OWNER with new password
        await tx.user.update({
          where: { id: existingUser.id },
          data: { name: ownerName, password: hashedPassword, role: "OWNER", isActive: true },
        });
      } else {
        await tx.user.create({
          data: {
            restaurantId,
            name: ownerName,
            email: ownerEmail,
            password: hashedPassword,
            role: "OWNER",
            isActive: true,
          },
        });
      }

      return { blocked: false, restaurantName: preCheck.restaurant!.name };
    });

    if (outcome.blocked) {
      return NextResponse.json(
        { error: "An active owner account already exists." },
        { status: 403 }
      );
    }

    // Conceder OWNER é a operação mais poderosa desta rota. Sem trilha, uma
    // recuperação legítima e uma tomada de conta ficam indistinguíveis depois.
    auditLog({
      action: "user.create",
      restaurantId,
      meta: { route: "POST /api/recover", role: "OWNER", grantedTo: ownerEmail },
    });

    return NextResponse.json(
      { ok: true, restaurantName: outcome.restaurantName },
      { status: 201 }
    );
  } catch (err) {
    console.error("[POST /api/recover]", err);
    return NextResponse.json(
      { error: "Recovery failed. Check server logs." },
      { status: 500 }
    );
  }
}
