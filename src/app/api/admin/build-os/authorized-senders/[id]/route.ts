/**
 * PATCH  /api/admin/build-os/authorized-senders/:id — edit operator (normalizes phone).
 * DELETE /api/admin/build-os/authorized-senders/:id — remove operator
 *         (?soft=true → deactivate instead of hard delete).
 *
 * Internal only (ADMIN_SECRET). No public route. No Claude/GitHub/LLM.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkAdminRequest } from "@/lib/admin-auth";
import {
  updateAuthorizedSender,
  deactivateAuthorizedSender,
  deleteAuthorizedSender,
} from "@/services/buildos/BuildOSConfigService";

function guardAdmin(req: NextRequest): NextResponse | null {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Admin access not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

const patchSchema = z.object({
  name: z.string().max(120).nullable().optional(),
  phone: z.string().min(6).max(40).optional(),
  role: z.string().max(40).optional(),
  isActive: z.boolean().optional(),
  allowedProjectIds: z.array(z.string()).max(50).optional(),
  notes: z.string().max(500).nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = guardAdmin(req);
  if (guard) return guard;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const result = await updateAuthorizedSender(id, parsed.data);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, normalizedPhone: result.normalizedPhone });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = guardAdmin(req);
  if (guard) return guard;

  const { id } = await params;
  const soft = req.nextUrl.searchParams.get("soft") === "true";
  const result = soft ? await deactivateAuthorizedSender(id) : await deleteAuthorizedSender(id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, soft });
}
