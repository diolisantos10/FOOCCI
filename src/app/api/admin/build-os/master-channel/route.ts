/**
 * GET   /api/admin/build-os/master-channel — focused Admin channel status (masked).
 * PATCH /api/admin/build-os/master-channel — save admin WhatsApp config (system-level).
 *
 * Admin-only (ADMIN_SECRET). The Build OS WhatsApp channel is SYSTEM-level and has
 * NO restaurant. Credentials are stored encrypted; the API never returns the full
 * apiKey/token or full phone. No Claude/GitHub/LLM.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkAdminRequest } from "@/lib/admin-auth";
import { getMasterChannelStatus } from "@/services/buildos/BuildOSMasterChannelService";
import { upsertAdminWhatsApp } from "@/services/buildos/AdminWhatsAppConfigService";

function guardAdmin(req: NextRequest): NextResponse | null {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Admin access not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const guard = guardAdmin(req);
  if (guard) return guard;

  const status = await getMasterChannelStatus();
  return NextResponse.json({ ok: true, status });
}

const patchSchema = z.object({
  instanceName: z.string().min(1).max(120).optional(),
  baseUrl: z.string().min(1).max(300).optional(),
  // Plaintext API key — encrypted server-side, never echoed back. Omit to keep.
  apiKey: z.string().min(1).max(500).optional(),
  isEnabled: z.boolean().optional(),
});

export async function PATCH(req: NextRequest) {
  const guard = guardAdmin(req);
  if (guard) return guard;

  const raw = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const result = await upsertAdminWhatsApp(parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Falha ao salvar." }, { status: 400 });
  }
  const status = await getMasterChannelStatus();
  return NextResponse.json({ ok: true, status });
}
