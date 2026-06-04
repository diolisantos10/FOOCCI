/**
 * POST /api/admin/build-os/diagnostics/authorize-sender
 *
 * One-click authorization of the REAL sender behind an unauthorized /build
 * webhook trace, driven entirely from the Build OS → Diagnóstico screen.
 *
 * Security:
 *   • Admin-only (ADMIN_SECRET), same guard as the other admin routes.
 *   • The browser sends ONLY a `traceId` — never a phone number. The full number
 *     is recovered server-side from the trace's `rawPhone` and is never returned.
 *   • Only traces that genuinely failed as `unauthorized_sender` for an internal
 *     command prefix can be authorized (see authorizeSenderFromTrace).
 *   • Existing operators are preserved; Build OS config is kept enabled.
 *
 * NO Claude/GitHub/LLM, NO execution. Never returns secrets or full phones.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkAdminRequest } from "@/lib/admin-auth";
import { authorizeSenderFromTrace } from "@/services/buildos/BuildOSConfigService";

function guardAdmin(req: NextRequest): NextResponse | null {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Admin access not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

const bodySchema = z.object({
  // Full BuildWebhookTrace id — the ONLY identifier accepted. No phone field
  // exists on purpose: a client can never supply a number to authorize.
  traceId: z.string().min(8).max(64),
  name: z.string().max(120).optional(),
  role: z.enum(["owner", "admin", "operator"]).optional(),
});

export async function POST(req: NextRequest) {
  const guard = guardAdmin(req);
  if (guard) return guard;

  const raw = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const result = await authorizeSenderFromTrace({
    traceId: parsed.data.traceId,
    name: parsed.data.name ?? null,
    role: parsed.data.role ?? null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Falha ao autorizar." }, { status: 400 });
  }

  // Masked phone only — never the full number.
  return NextResponse.json({
    ok: true,
    maskedPhone: result.maskedPhone,
    action: result.action,
    message: "Remetente autorizado. Envie /build novamente no WhatsApp.",
  });
}
