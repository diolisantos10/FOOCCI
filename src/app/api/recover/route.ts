/**
 * GET/POST /api/recover — criação do PRIMEIRO proprietário de uma instalação que
 * ficou pela metade. Não é "esqueci minha senha" e nunca foi.
 *
 * ⚠️ ESTA ROTA É PÚBLICA: o middleware a libera explicitamente (`/api/recover` sai
 * antes de qualquer checagem de sessão). Quem passa aqui cria uma conta OWNER, com
 * acesso ao painel inteiro — pedidos, clientes, WhatsApp, pagamento. O que separa a
 * internet desse acesso é SÓ o portão abaixo, e por isso ele é fail-closed.
 *
 * ── O FURO CORRIGIDO EM 13/08/2026 ────────────────────────────────────────────
 * A versão anterior perguntava ao banco por `restaurant.findFirst({ isActive: true })`
 * — "o primeiro restaurante ativo", sem ordenação definida. Isso é lógica de sistema
 * de UM restaurante rodando num produto MULTI-restaurante, e produz dois defeitos:
 *
 *   1. AMBIGUIDADE DE ALVO — "o primeiro" é o que o Postgres devolver naquele dia.
 *      A conta podia nascer num restaurante que ninguém apontou.
 *   2. PORTA ABERTA — bastava esse restaurante sorteado estar sem OWNER ativo (dono
 *      desativado, tenant recém-criado, migração pela metade) para QUALQUER pessoa
 *      da internet virar proprietária dele. O limite de 5 tentativas não protege
 *      nada aqui: a primeira já basta.
 *
 * A trava: a recuperação só existe no estado de INSTALAÇÃO — o banco inteiro com
 * EXATAMENTE UM restaurante, ativo, e sem nenhum proprietário ativo. É o mesmo
 * invariante que `/api/setup` já usa ("recusa se já existe restaurante"), aplicado
 * do outro lado. Com dois ou mais restaurantes no banco, a resposta é sempre RECUSA:
 * em produção multi-inquilino devolver acesso é ato de operador com credencial, não
 * formulário aberto.
 *
 * Guardrail 2 aplicado: estado que a rota não sabe interpretar REPROVA, nunca libera.
 *
 * Outras travas mantidas/adicionadas:
 *   - o nome do restaurante só sai na resposta quando a recuperação está liberada
 *     (antes, qualquer visitante anônimo descobria o nome do inquilino do banco);
 *   - a checagem e a criação acontecem dentro da MESMA transação, para que duas
 *     chamadas simultâneas não criem dois donos;
 *   - limite de 5 tentativas / 5 min por IP;
 *   - toda mensagem em português — quem lê isto é o lojista, não o servidor.
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
});

type Reason = "no_restaurant" | "multi_tenant" | "owner_exists" | "db_error" | null;

interface RecoveryContext {
  allowed: boolean;
  reason: Reason;
  restaurant: { id: string; name: string } | null;
}

/** A mensagem que o lojista lê. Nunca revela quantos inquilinos existem no banco. */
const MESSAGE: Record<Exclude<Reason, null>, string> = {
  no_restaurant:
    "Nenhum restaurante instalado ainda. Use a página de instalação (/setup).",
  multi_tenant:
    "Esta página não redefine senha e não está disponível para este sistema. " +
    "Para recuperar o acesso, fale com a equipe do Foocci.",
  owner_exists:
    "Este restaurante já tem uma conta de proprietário ativa. " +
    "Entre pelo login; se a senha não funcionar, fale com a equipe do Foocci.",
  db_error:
    "Não foi possível conectar ao banco de dados. Tente novamente em alguns minutos.",
};

/**
 * O portão. Devolve `allowed: true` APENAS no estado de instalação inequívoco.
 *
 * `take: 2` é de propósito: a única pergunta é "existe mais de um?", e ela se
 * responde com duas linhas em vez de varrer a tabela.
 */
async function getRecoveryContext(
  db: Pick<typeof prisma, "restaurant" | "user">,
): Promise<RecoveryContext> {
  const restaurants = await db.restaurant.findMany({
    select: { id: true, name: true, isActive: true },
    take: 2,
  });

  if (restaurants.length === 0) {
    return { allowed: false, reason: "no_restaurant", restaurant: null };
  }

  // Dois ou mais inquilinos: não existe "o" restaurante desta página. Recusa.
  if (restaurants.length > 1) {
    return { allowed: false, reason: "multi_tenant", restaurant: null };
  }

  const only = restaurants[0]!;
  if (!only.isActive) {
    return { allowed: false, reason: "no_restaurant", restaurant: null };
  }

  const activeOwner = await db.user.findFirst({
    where: { restaurantId: only.id, role: "OWNER", isActive: true },
    select: { id: true },
  });

  if (activeOwner) {
    return {
      allowed: false,
      reason: "owner_exists",
      restaurant: { id: only.id, name: only.name },
    };
  }

  return { allowed: true, reason: null, restaurant: { id: only.id, name: only.name } };
}

export async function GET() {
  try {
    const ctx = await getRecoveryContext(prisma);
    return NextResponse.json({
      recoveryAllowed: ctx.allowed,
      reason: ctx.reason,
      // O nome só aparece quando a página vai mesmo criar a conta. Fora disso é
      // dado de inquilino saindo por uma rota anônima sem precisar.
      restaurantName: ctx.allowed ? ctx.restaurant?.name ?? null : null,
      message: ctx.reason ? MESSAGE[ctx.reason] : null,
    });
  } catch {
    return NextResponse.json({ error: MESSAGE.db_error }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  // Limite: 5 tentativas / 5 minutos por IP.
  const ip = getClientIp(req);
  const rl = rateLimit({ key: `recover:${ip}`, limit: 5, windowMs: 5 * 60_000 });
  if (rl.limited) {
    return NextResponse.json(
      { error: "Muitas tentativas seguidas. Tente de novo em alguns minutos." },
      { status: 429 },
    );
  }

  // Pré-checagem barata: recusa antes de gastar bcrypt e transação.
  const preCheck = await getRecoveryContext(prisma).catch(
    (): RecoveryContext => ({ allowed: false, reason: "db_error", restaurant: null }),
  );

  if (!preCheck.allowed || !preCheck.restaurant) {
    auditLog({
      action: "auth.login_failure",
      meta: { route: "POST /api/recover", reason: preCheck.reason ?? "unknown" },
    });
    return NextResponse.json(
      { error: MESSAGE[preCheck.reason ?? "multi_tenant"] },
      { status: preCheck.reason === "db_error" ? 503 : 403 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const parsed = recoverSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Confira os dados: nome, e-mail válido e senha de 8 a 72 caracteres." },
      { status: 422 },
    );
  }

  const { ownerName, ownerEmail, ownerPassword } = parsed.data;

  // bcrypt é lento de propósito — roda ANTES da transação para não segurar conexão.
  const hashedPassword = await hash(ownerPassword, 12);

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      // O portão INTEIRO roda de novo aqui dentro. Repetir só o "tem dono?" deixaria
      // passar o caso em que um segundo restaurante nasce entre a pré-checagem e a
      // escrita — e aí a conta cairia num banco que já é multi-inquilino.
      const ctx = await getRecoveryContext(tx as unknown as typeof prisma);
      if (!ctx.allowed || !ctx.restaurant) {
        return { blocked: true as const, reason: ctx.reason, restaurantName: null, id: null };
      }

      const restaurantId = ctx.restaurant.id;

      const existingUser = await tx.user.findFirst({
        where: { email: ownerEmail, restaurantId },
        select: { id: true },
      });

      if (existingUser) {
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

      return {
        blocked: false as const,
        reason: null,
        restaurantName: ctx.restaurant.name,
        id: restaurantId,
      };
    });

    if (outcome.blocked) {
      return NextResponse.json(
        { error: MESSAGE[outcome.reason ?? "multi_tenant"] },
        { status: 403 },
      );
    }

    auditLog({
      action: "user.create",
      restaurantId: outcome.id ?? undefined,
      meta: { route: "POST /api/recover", role: "OWNER" },
    });

    return NextResponse.json(
      { ok: true, restaurantName: outcome.restaurantName },
      { status: 201 },
    );
  } catch (err) {
    console.error("[POST /api/recover]", err);
    return NextResponse.json(
      { error: "Não foi possível criar a conta. Tente novamente." },
      { status: 500 },
    );
  }
}
