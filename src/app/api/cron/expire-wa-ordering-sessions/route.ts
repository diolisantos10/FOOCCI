/**
 * POST /api/cron/expire-wa-ordering-sessions
 *
 * Cron job: marks WhatsApp Text Ordering sessions past their TTL as EXPIRED.
 * Safe to call at any frequency — the underlying query is idempotent.
 * Recommended: every 15 minutes via Railway/Vercel Cron.
 *
 * Auth: Bearer token via CRON_SECRET env var (same pattern as other cron routes).
 */

import { NextRequest, NextResponse } from "next/server";
import { WhatsAppOrderingSessionService } from "@/services/whatsapp/ordering/WhatsAppOrderingSessionService";

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const count = await WhatsAppOrderingSessionService.expireOldSessions();
    console.log(`[Cron] expire-wa-ordering-sessions: expired ${count} sessions`);
    return NextResponse.json({ ok: true, expired: count, ts: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Cron] expire-wa-ordering-sessions failed:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
