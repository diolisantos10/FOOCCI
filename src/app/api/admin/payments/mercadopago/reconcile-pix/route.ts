/**
 * POST /api/admin/payments/mercadopago/reconcile-pix
 *
 * Cross-tenant admin endpoint to reconcile stuck Mercado Pago Pix charges.
 * Finds orders with payment.status=LINK_SENT across all restaurants (or a
 * specific orderId), queries the MP API for each, and confirms approved ones.
 *
 * Auth: x-admin-secret header OR foocci-admin-token cookie.
 *
 * Body (all optional):
 *   orderId  — reconcile only this single order
 *   dryRun   — if true, check statuses but write nothing (default false)
 *   hours    — look-back window in hours (default 72, max 720)
 *
 * Safe:
 *   - Never marks a payment paid unless MP API returns status="approved".
 *   - Never downgrades an order that's already in operational flow.
 *   - Does not cancel, refund, or duplicate any order.
 *   - Does not log access tokens or secrets.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdminRequest } from "@/lib/admin-auth";
import { decrypt } from "@/lib/crypto";
import { confirmMpPayment } from "@/app/api/payments/mercadopago/webhook/route";

const LOG = "[admin-mp-reconcile-pix]";

const RECONCILABLE_STATUSES = ["PENDING", "AWAITING_PAYMENT", "CONFIRMED", "PREPARING"] as const;

export async function POST(req: NextRequest) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Endpoint disabled — ADMIN_SECRET not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as {
    orderId?: string;
    dryRun?:  boolean;
    hours?:   number;
  };

  const dryRun    = body.dryRun === true;
  const lookbackH = Math.min(Math.max(Number(body.hours ?? 72), 1), 720);
  const since     = new Date(Date.now() - lookbackH * 60 * 60_000);

  console.info(LOG, "started", { orderId: body.orderId, dryRun, lookbackH });

  // Load all active MP integration configs
  const activeCfgs = await prisma.integrationConfig.findMany({
    where: { provider: "mercadopago", isActive: true },
    select: { restaurantId: true, configBlob: true },
  });

  const tokenMap = new Map<string, string>();
  for (const cfg of activeCfgs) {
    try {
      const token = (JSON.parse(decrypt(cfg.configBlob)) as { accessToken: string }).accessToken;
      if (token) tokenMap.set(cfg.restaurantId, token);
    } catch {
      // skip bad configs
    }
  }

  const pendingPayments = await prisma.payment.findMany({
    where: {
      providerName: "mercadopago",
      status: "LINK_SENT",
      order: {
        restaurantId: { in: [...tokenMap.keys()] },
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

  console.info(LOG, "payments found", { count: pendingPayments.length });

  const now = new Date();
  const details: Array<{
    orderId:      string;
    restaurantId: string;
    paymentId:    string | null;
    orderStatus:  string;
    mpStatus:     string | null;
    result:       string;
  }> = [];

  let confirmed   = 0;
  let alreadyPaid = 0;
  let expired     = 0;
  let pending     = 0;
  let failed      = 0;

  for (const payment of pendingPayments) {
    const orderId      = payment.order?.id ?? "unknown";
    const restaurantId = payment.order?.restaurantId ?? "";
    const paymentRef   = payment.providerReference;
    const orderStatus  = payment.order?.status ?? "unknown";

    // Fast-path: locally expired with no reference
    if (payment.expiresAt && payment.expiresAt < now && !paymentRef) {
      if (!dryRun) {
        await prisma.payment.update({ where: { id: payment.id }, data: { status: "EXPIRED" } }).catch(() => null);
      }
      expired++;
      details.push({ orderId, restaurantId, paymentId: null, orderStatus, mpStatus: "expired_local", result: dryRun ? "would_expire" : "expired" });
      continue;
    }

    if (!paymentRef) {
      failed++;
      details.push({ orderId, restaurantId, paymentId: null, orderStatus, mpStatus: null, result: "no_provider_reference" });
      continue;
    }

    const accessToken = tokenMap.get(restaurantId);
    if (!accessToken) {
      failed++;
      details.push({ orderId, restaurantId, paymentId: paymentRef, orderStatus, mpStatus: null, result: "no_mp_token" });
      continue;
    }

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
      failed++;
      details.push({ orderId, restaurantId, paymentId: paymentRef, orderStatus, mpStatus: null, result: "mp_api_error" });
      continue;
    }

    const mpStatus = mpData.status as string | undefined;
    console.info(LOG, "payment status", { orderId, paymentRef, mpStatus, orderStatus });

    if (mpStatus === "approved") {
      if (dryRun) {
        confirmed++;
        details.push({ orderId, restaurantId, paymentId: paymentRef, orderStatus, mpStatus, result: "would_confirm" });
        continue;
      }

      const confirmResult = await confirmMpPayment(payment, mpData).catch((err) => {
        console.error(LOG, "confirmMpPayment failed", { orderId, err });
        return "error" as const;
      });

      if (confirmResult === "confirmed") confirmed++;
      else if (confirmResult === "already_paid") alreadyPaid++;
      else failed++;

      details.push({ orderId, restaurantId, paymentId: paymentRef, orderStatus, mpStatus, result: confirmResult });
    } else if (mpStatus === "cancelled" || mpStatus === "rejected" || mpStatus === "expired") {
      if (!dryRun) {
        await prisma.payment.update({ where: { id: payment.id }, data: { status: "EXPIRED" } }).catch(() => null);
      }
      expired++;
      details.push({ orderId, restaurantId, paymentId: paymentRef, orderStatus, mpStatus, result: dryRun ? "would_expire" : "expired" });
    } else {
      pending++;
      details.push({ orderId, restaurantId, paymentId: paymentRef, orderStatus, mpStatus: mpStatus ?? null, result: "pending" });
    }
  }

  const summary = { total: pendingPayments.length, confirmed, alreadyPaid, expired, pending, failed, dryRun, lookbackH };
  console.info(LOG, "done", summary);

  return NextResponse.json({ ok: true, ...summary, details });
}
