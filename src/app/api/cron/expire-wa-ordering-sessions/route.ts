/**
 * POST /api/cron/expire-wa-ordering-sessions
 *
 * Cron job: marks WhatsApp Text Ordering sessions past their TTL as EXPIRED.
 * Safe to call at any frequency — the underlying query is idempotent.
 * Recommended: every 15 minutes via Railway/Vercel Cron.
 *
 * Auth: Bearer token via CRON_SECRET env var (same pattern as other cron routes).
 *
 * ⚠️ FALHA FECHADA, de propósito. Este bloco já foi `if (secret) { ...confere... }`,
 * que é o defeito clássico "segredo ausente vira passe livre": quem esquecesse de
 * configurar CRON_SECRET no Railway não deixava a rota desprotegida por engano —
 * deixava desprotegida em silêncio, e a rota é pública no middleware
 * (`/^\/api\/cron(\/.*)?$/` em src/middleware.ts). Ausência de segredo tem que
 * REPROVAR. O padrão correto já existia em /api/cron/quality/run e é o seguido aqui:
 *   sem CRON_SECRET  → 503 (a rota se declara indisponível, não aberta)
 *   segredo errado   → 401
 */

import { NextRequest, NextResponse } from "next/server";
import { WhatsAppOrderingSessionService } from "@/services/whatsapp/ordering/WhatsAppOrderingSessionService";

function checkCronAuth(req: NextRequest): { ok: true } | { ok: false; status: 401 | 503; error: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/expire-wa-ordering-sessions] CRON_SECRET não configurado — a rota permanece fechada");
    return { ok: false, status: 503, error: "CRON_SECRET is not configured" };
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true };
}

export async function POST(req: NextRequest) {
  const auth = checkCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
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
