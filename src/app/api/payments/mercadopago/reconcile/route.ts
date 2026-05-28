/**
 * POST /api/payments/mercadopago/reconcile
 *
 * Admin-only endpoint that reconciles pending Mercado Pago Pix charges.
 *
 * Finds every order with payment.providerName=mercadopago + payment.status=LINK_SENT
 * for the authenticated restaurant (in any operational status including PREPARING),
 * fetches each payment's current status from the MP API, and confirms / expires
 * as appropriate.
 *
 * Optional body params:
 *   orderId  — reconcile only a single order (used by per-card "Verificar Pix" button)
 *   dryRun   — if true, check statuses but write nothing (default false)
 *   hours    — look-back window in hours (default 72, max 720)
 *
 * IMPORTANT: the order.status filter intentionally includes PREPARING so that orders
 * which were moved to the kitchen before payment was confirmed can still be reconciled.
 *
 * Requires OWNER or MANAGER role.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { getTenantContext } from "@/lib/tenant";
import { confirmMpPayment } from "../webhook/route";

const LOG = "[mp-reconcile]";

// Order statuses that can have an unconfirmed payment — includes PREPARING
// because operators sometimes move cards manually before payment lands.
const RECONCILABLE_STATUSES = ["PENDING", "AWAITING_PAYMENT", "CONFIRMED", "PREPARING"] as const;

interface ReconcileResult {
  total:       number;
  confirmed:   number;
  alreadyPaid: number;
  expired:     number;
  pending:     number;
  failed:      number;
  dryRun:      boolean;
  details:     Array<{ orderId: string; paymentId: string | null; mpStatus: string | null; result: string }>;
}

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (ctx.role !== "OWNER" && ctx.role !== "MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as {
    orderId?: string;
    dryRun?:  boolean;
    hours?:   number;
  };
  const dryRun    = body.dryRun  === true;
  const lookbackH = Math.min(Math.max(Number(body.hours ?? 72), 1), 720);
  const since     = new Date(Date.now() - lookbackH * 60 * 60_000);

  // Fetch MP access token for this restaurant
  const cfg = await prisma.integrationConfig.findUnique({
    where: { restaurantId_provider: { restaurantId: ctx.restaurantId, provider: "mercadopago" } },
    select: { configBlob: true, isActive: true },
  });

  if (!cfg || !cfg.isActive) {
    return NextResponse.json({ error: "Integração Mercado Pago não configurada" }, { status: 400 });
  }

  let accessToken: string;
  try {
    accessToken = (JSON.parse(decrypt(cfg.configBlob)) as { accessToken: string }).accessToken;
  } catch {
    return NextResponse.json({ error: "Token MP inválido" }, { status: 500 });
  }

  // Build query — single order or bulk within time window
  const pendingPayments = await prisma.payment.findMany({
    where: {
      providerName: "mercadopago",
      status: "LINK_SENT",
      order: {
        restaurantId: ctx.restaurantId,
        status: { in: [...RECONCILABLE_STATUSES] },
        ...(body.orderId
          ? { id: body.orderId }
          : { createdAt: { gte: since } }),
      },
    },
    select: {
      id:                true,
      providerReference: true,
      expiresAt:         true,
      amount:            true,
      status:            true,
      order:             { select: { id: true, restaurantId: true, status: true } },
    },
  });

  console.info(LOG, "reconcile started", {
    restaurantId: ctx.restaurantId,
    count: pendingPayments.length,
    orderId: body.orderId,
    dryRun,
    lookbackH,
  });

  const result: ReconcileResult = {
    total:     pendingPayments.length,
    confirmed: 0,
    alreadyPaid: 0,
    expired:   0,
    pending:   0,
    failed:    0,
    dryRun,
    details:   [],
  };

  const now = new Date();

  for (const payment of pendingPayments) {
    const orderId    = payment.order?.id ?? "unknown";
    const paymentRef = payment.providerReference;

    // Fast-path: already expired locally (no provider reference to check)
    if (payment.expiresAt && payment.expiresAt < now && !paymentRef) {
      if (!dryRun) {
        await prisma.payment.update({ where: { id: payment.id }, data: { status: "EXPIRED" } }).catch(() => null);
      }
      result.expired++;
      result.details.push({ orderId, paymentId: paymentRef, mpStatus: "expired_local", result: dryRun ? "would_expire" : "expired" });
      continue;
    }

    if (!paymentRef) {
      result.failed++;
      result.details.push({ orderId, paymentId: null, mpStatus: null, result: "no_provider_reference" });
      continue;
    }

    // Fetch current status from MP API
    let mpData: Record<string, unknown> | null = null;
    try {
      const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentRef}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (mpRes.ok) {
        mpData = await mpRes.json() as Record<string, unknown>;
      } else {
        console.warn(LOG, "MP API error", { paymentRef, status: mpRes.status });
      }
    } catch (err) {
      console.warn(LOG, "MP API fetch exception", { paymentRef, err });
    }

    if (!mpData) {
      result.failed++;
      result.details.push({ orderId, paymentId: paymentRef, mpStatus: null, result: "mp_api_error" });
      continue;
    }

    const mpStatus = mpData.status as string | undefined;
    console.info(LOG, "payment status from MP", { orderId, paymentRef, mpStatus, orderStatus: payment.order?.status });

    if (mpStatus === "approved") {
      if (dryRun) {
        result.confirmed++;
        result.details.push({ orderId, paymentId: paymentRef, mpStatus, result: "would_confirm" });
        continue;
      }

      const confirmResult = await confirmMpPayment(payment, mpData).catch((err) => {
        console.error(LOG, "confirmMpPayment failed", { orderId, err });
        return "error" as const;
      });

      if (confirmResult === "confirmed") {
        result.confirmed++;
      } else if (confirmResult === "already_paid") {
        result.alreadyPaid++;
      } else {
        result.failed++;
      }
      result.details.push({ orderId, paymentId: paymentRef, mpStatus, result: confirmResult });
    } else if (mpStatus === "cancelled" || mpStatus === "rejected" || mpStatus === "expired") {
      if (!dryRun) {
        await prisma.payment.update({ where: { id: payment.id }, data: { status: "EXPIRED" } }).catch(() => null);
      }
      result.expired++;
      result.details.push({ orderId, paymentId: paymentRef, mpStatus, result: dryRun ? "would_expire" : "expired" });
    } else {
      // pending, in_process, authorized, etc. — leave as-is
      result.pending++;
      result.details.push({ orderId, paymentId: paymentRef, mpStatus: mpStatus ?? null, result: "pending" });
    }
  }

  console.info(LOG, "reconcile done", { restaurantId: ctx.restaurantId, ...result });

  return NextResponse.json({ success: true, result });
}
