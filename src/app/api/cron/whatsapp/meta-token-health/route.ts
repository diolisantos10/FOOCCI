/**
 * POST /api/cron/whatsapp/meta-token-health
 *
 * Pergunta à Meta, todo dia, se a credencial de WhatsApp de cada restaurante ainda
 * está viva — e grita antes de ela morrer. O Instagram tem essa varredura desde
 * julho; o WhatsApp, que é o canal no ar, nunca teve.
 *
 * SOMENTE LEITURA CONTRA A META. Não registra, não desconecta, não renova. As únicas
 * escritas são `tokenExpiresAt` e `lastHealthCheckAt` na própria config — dado que só
 * melhora o aviso de tela que já existia.
 *
 * Auth: Authorization: Bearer {CRON_SECRET}  (ou x-admin-secret para rodar na mão).
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { sweepMetaTokenHealth, TOKEN_WARN_DAYS } from "@/services/whatsapp/metaTokenHealth";
import { alertMetaTokenAttention } from "@/services/whatsapp/metaTokenAlert";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret && (req.headers.get("authorization") ?? "") === `Bearer ${secret}`) return true;
  return checkAdminRequest(req); // rodadas manuais do admin
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const body = (await req.json().catch(() => ({}))) as { warnDays?: number };
    const warnDays = typeof body.warnDays === "number" && body.warnDays > 0 ? body.warnDays : TOKEN_WARN_DAYS;

    const result = await sweepMetaTokenHealth(warnDays);
    const alert  = await alertMetaTokenAttention(result.attention);

    return NextResponse.json(
      { ok: true, warnDays, ...result, alertSent: alert.sent, alertReason: alert.reason },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido";
    return NextResponse.json({ ok: false, error: message }, { status: 200 });
  }
}
