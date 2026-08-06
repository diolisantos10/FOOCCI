/**
 * POST /api/cron/instagram/refresh-tokens
 *
 * Refreshes Instagram long-lived tokens BEFORE they expire so inbound DMs never silently
 * stop (the July outage root cause). Run daily. Also callable with an admin secret for
 * on-demand refresh.
 *
 * Auth: Authorization: Bearer {CRON_SECRET}  (or x-admin-secret for manual runs).
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { refreshExpiringInstagramTokens, refreshInstagramTokenForRestaurant } from "@/services/instagram/instagramTokenRefresh";
import { alertInstagramAttention } from "@/services/instagram/instagramAttentionAlert";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret && (req.headers.get("authorization") ?? "") === `Bearer ${secret}`) return true;
  return checkAdminRequest(req); // manual admin runs
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const body = (await req.json().catch(() => ({}))) as { restaurantId?: string; withinDays?: number };
    // Targeted refresh for one restaurant (manual), else the daily sweep.
    if (body.restaurantId) {
      const one = await refreshInstagramTokenForRestaurant(body.restaurantId);
      return NextResponse.json({ ok: one.refreshed, result: one }, { status: 200 });
    }
    const result = await refreshExpiringInstagramTokens(typeof body.withinDays === "number" ? body.withinDays : 10);
    // O alarme já existia e já falhava — dentro do Actions, onde ninguém entra. Aqui ele
    // sai por e-mail (primeira via, sem depender da Meta) e, se estiver ligado, também
    // por WhatsApp. O resultado volta na resposta para o Actions poder gritar "nem
    // consegui avisar", que é pior ainda.
    const alert = await alertInstagramAttention(result.attention);
    return NextResponse.json(
      // `alertChannel` existe para o log do Actions não mentir sobre por onde o aviso
      // saiu; `alertDetail` mantém a via QUEBRADA visível mesmo quando a outra funcionou.
      // Meio aviso funcionando parece aviso inteiro — foi assim que treze dias passaram.
      {
        ok: true, ...result,
        alertSent: alert.sent, alertReason: alert.reason,
        alertChannel: alert.channel, alertDetail: alert.detail,
      },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido";
    return NextResponse.json({ ok: false, error: message }, { status: 200 });
  }
}
