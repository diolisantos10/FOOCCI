/**
 * GET /api/admin/diagnostics/recovery-scheduler
 *
 * Diagnostic: shows whether CartRecoveryScheduler would start in this
 * environment, and runs a dry-run of sendCartRecoveryMessages to surface
 * exactly which drafts are candidates and why each was skipped.
 *
 * Auth: x-admin-secret header OR foocci-admin-token cookie.
 *
 * Query params:
 *   inactivityMinutes — threshold override (default: 2, same as scheduler)
 *   limit             — max candidates to inspect (default: 20)
 *   slug              — optional restaurant slug to scope the dry-run to a single
 *                       restaurant (default: global pool, matching the scheduler).
 *
 * Safe: read-only. No messages sent. Phones masked to last-4 digits.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { OrderDraftRecoverySendService } from "@/services/order/OrderDraftRecoverySendService";
import { CartRecoveryScheduler } from "@/services/order/CartRecoveryScheduler";
import { CartRecoveryHealthService } from "@/services/order/CartRecoveryHealthService";

export async function GET(req: NextRequest) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Endpoint disabled — ADMIN_SECRET not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const inactivityMinutes = Math.min(
    Math.max(Number(sp.get("inactivityMinutes") ?? "2"), 0),
    60,
  );
  const limit = Math.min(Number(sp.get("limit") ?? "20"), 100);
  const slug  = sp.get("slug")?.trim().toLowerCase() || null;

  // ── 1. Environment state ───────────────────────────────────────────────────
  const nodeEnv     = process.env.NODE_ENV;
  const nextRuntime = process.env.NEXT_RUNTIME;
  const railwayEnv  = process.env.RAILWAY_ENVIRONMENT;

  const schedulerWouldStart =
    nodeEnv === "production" && nextRuntime === "nodejs";

  // ── 2. Optional restaurant scope ───────────────────────────────────────────
  let restaurantId: string | undefined;
  if (slug) {
    const restaurant = await prisma.restaurant.findFirst({
      where:  { slug },
      select: { id: true },
    });
    if (!restaurant) {
      return NextResponse.json(
        { ok: false, error: `No restaurant found with slug "${slug}"` },
        { status: 404 },
      );
    }
    restaurantId = restaurant.id;
  }

  // ── 3. Dry-run recovery pass ───────────────────────────────────────────────
  const dryRunResult = await OrderDraftRecoverySendService.sendCartRecoveryMessages({
    inactivityMinutes,
    limit,
    dryRun: true,
    ...(restaurantId ? { restaurantId } : {}),
  });

  // ── 4. Saúde histórica — o que o dry-run de AGORA não consegue contar ──────
  // O dry-run responde "há carrinho cobrável neste minuto?". Ele não responde
  // "quando saiu a última mensagem?" nem "quantos venceram sem tentativa?" — e
  // era exatamente essa a pergunta impossível de responder pela tela.
  const health = restaurantId
    ? await CartRecoveryHealthService
        .get(restaurantId, await CartRecoveryHealthService.estaAtiva(restaurantId))
        .catch(() => null)
    : await CartRecoveryHealthService.varredura().catch(() => []);

  return NextResponse.json({
    ok:        true,
    queriedAt: new Date().toISOString(),
    scope:     slug ? { slug, restaurantId } : { slug: null, note: "global pool (all restaurants)" },

    health,

    schedulerEnv: {
      NODE_ENV:     nodeEnv,
      NEXT_RUNTIME: nextRuntime,
      RAILWAY_ENV:  railwayEnv,
      schedulerWouldStart,
      note: schedulerWouldStart
        ? "Scheduler should be running. If no ticks appear in Railway logs, redeploy to trigger instrumentation.ts."
        : `Scheduler is DISABLED. NODE_ENV="${nodeEnv}" NEXT_RUNTIME="${nextRuntime}". ` +
          `Both must be "production" and "nodejs" respectively.`,
    },

    // Live in-memory snapshot from the running scheduler singleton (resets on restart).
    schedulerLive: CartRecoveryScheduler.getState(),

    dryRun: {
      ...dryRunResult,
      note: dryRunResult.eligible === 0
        ? dryRunResult.checked === 0
          ? "No OPEN drafts with recoveryAttempts=0 and items found. Check draft status and recoveryAttempts."
          : dryRunResult.skippedRestaurantClosed > 0
            // Decisão do CEO 05/08/2026: loja fechada no instante do abandono
            // não é adiamento — é recusa definitiva. O texto de antes prometia
            // uma retentativa que nem naquela época existia de fato (o prazo de
            // 6h vencia antes de a loja abrir).
            ? `${dryRunResult.checked} carrinho(s) avaliado(s); ${dryRunResult.skippedRestaurantClosed} NÃO será(ão) cobrado(s): a loja estava fechada no instante do abandono. Isto é definitivo — não há reenvio quando a loja abrir. O rascunho não foi carimbado; o cliente que voltar pelo link acha o carrinho intacto.`
            : dryRunResult.skippedTooLate > 0
              ? `${dryRunResult.checked} carrinho(s) avaliado(s); ${dryRunResult.skippedTooLate} fora da janela de entrega de ${dryRunResult.deliveryWindowMinutes} min contados do abandono. Mensagem de carrinho é do momento — passou disso, não sai mais.`
              : `${dryRunResult.checked} drafts checked but none eligible. See skip counts above.`
        : `${dryRunResult.eligible} draft(s) eligible — would send ${dryRunResult.eligible} message(s).`,
    },
  });
}
