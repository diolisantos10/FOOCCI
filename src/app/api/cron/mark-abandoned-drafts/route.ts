/**
 * POST /api/cron/mark-abandoned-drafts
 *
 * ⚠️ ROTA ÓRFÃ DE PROPÓSITO — NÃO A AGENDE SEM LER ISTO (auditado em 05/08/2026)
 *
 * Nenhum agendador chama esta rota: nem `.github/workflows/crm-cron.yml`, nem o
 * Railway, nem o `instrumentation.ts`. Isso NÃO é esquecimento a ser corrigido
 * com uma linha de cron.
 *
 * O motor que realmente envia (`OrderDraftRecoverySendService`) só considera
 * rascunho com `status: "OPEN"`, dentro da janela de 2 minutos a 6 horas de
 * inatividade. Esta rota vira `OPEN → ABANDONED` a partir de 60 minutos. Ligá-la
 * como está encolhe a janela útil de recuperação de 6 h para 1 h e joga o resto
 * dos carrinhos num estado que o motor não enxerga — ou seja, ligar a "Fase 2"
 * DESLIGA a Fase 3 para a maior parte dos casos.
 *
 * Quem quiser a Fase 2 de verdade precisa, no mesmo bloco, ensinar o motor de
 * envio a ler ABANDONED. Travado em
 * `src/services/order/tests/CartRecoveryCronOrfao.test.ts`.
 *
 * Hoje o estado ABANDONED só é escrito pelo fluxo do próprio pedido
 * (`OrderDraftService`) e é lido pela analítica.
 *
 * Phase 2 of abandoned cart recovery: marks stale OPEN OrderDrafts as ABANDONED
 * so Phase 3 can send recovery messages to eligible customers.
 *
 * Auth: Authorization: Bearer {CRON_SECRET}
 *
 * Body (all optional):
 *   dryRun?          boolean  — if true, counts are computed but DB is not mutated
 *   thresholdMinutes? number  — override the inactivity threshold (default: 60)
 *
 * Response:
 *   { ok, dryRun, checked, markedAbandoned, skippedConfirmedOrder,
 *     skippedPendingPayment, skippedNoItems, thresholdMinutes, durationMs }
 *
 * Idempotent: re-running within the same window is safe — already-ABANDONED
 * and already-CONFIRMED drafts are never re-processed.
 *
 * Recommended schedule: every 15 minutes (e.g. Railway Cron / Vercel Cron).
 */

import { NextRequest, NextResponse } from "next/server";
import { OrderDraftAbandonmentService } from "@/services/order/OrderDraftAbandonmentService";

const LOG = "[cron/mark-abandoned-drafts]";

function checkCronAuth(req: NextRequest): { ok: true } | { ok: false; status: 401 | 503; error: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error(`${LOG} CRON_SECRET env var is not configured — abandonment detection will not run`);
    return { ok: false, status: 503, error: "CRON_SECRET is not configured" };
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true };
}

export async function POST(req: NextRequest) {
  const authCheck = checkCronAuth(req);
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
  }

  try {
    const body = await req.json().catch(() => ({})) as {
      dryRun?:          boolean;
      thresholdMinutes?: number;
    };

    const dryRun = body.dryRun === true;
    const thresholdMinutes =
      typeof body.thresholdMinutes === "number" && body.thresholdMinutes > 0
        ? Math.min(body.thresholdMinutes, 1440) // cap at 24h
        : 60; // default: 60 minutes

    console.info(`${LOG} starting`, { dryRun, thresholdMinutes });

    const result = await OrderDraftAbandonmentService.markAbandonedDrafts({
      thresholdMinutes,
      dryRun,
    });

    console.info(`${LOG} done`, result);

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error(`${LOG} unhandled error`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
