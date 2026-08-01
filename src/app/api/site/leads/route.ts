/**
 * POST /api/site/leads — demo request from the public marketing site.
 *
 * PUBLIC (whitelisted in middleware): a restaurant owner has no account yet, so
 * requiring auth here would mean requiring an account to ask for a demo.
 *
 * Rate-limited per IP. The limit is deliberately generous — a real owner may
 * legitimately resubmit after a typo, and losing a lead costs far more than
 * storing a duplicate.
 *
 * The response never reveals whether the notification e-mail went out. The
 * visitor did their part the moment the lead was stored; a provider outage is
 * not their problem and not their error message. `notifyError` is recorded on the
 * row for whoever reads the panel.
 */

import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { createSiteLeadSchema } from "@/validators/site-lead";
import { SiteLeadService } from "@/services/site/SiteLeadService";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = rateLimit({ key: `site-lead:${ip}`, limit: 5, windowMs: 60_000 });
  if (rl.limited) return rateLimitResponse(rl.retryAfter) as NextResponse;

  const raw = await req.json().catch(() => null);
  const parsed = createSiteLeadSchema.safeParse(raw);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 },
    );
  }

  try {
    await SiteLeadService.capture(parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    // Storage itself failed — this IS the visitor's problem: their data is gone.
    // Say so honestly so they can try again or reach out another way.
    console.error("[site-lead] falha ao gravar o lead:", e);
    return NextResponse.json(
      { error: "Não conseguimos registrar agora. Tente de novo em instantes." },
      { status: 500 },
    );
  }
}
