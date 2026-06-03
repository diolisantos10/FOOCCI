/**
 * GET  /api/admin/build-os/authorized-senders — list authorized operators.
 * POST /api/admin/build-os/authorized-senders — add an operator (normalizes phone).
 *
 * Internal only (ADMIN_SECRET). No public route. The phone list is never exposed
 * publicly. No Claude/GitHub/LLM.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkAdminRequest } from "@/lib/admin-auth";
import {
  listAuthorizedSenders,
  createAuthorizedSender,
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

export async function GET(req: NextRequest) {
  const guard = guardAdmin(req);
  if (guard) return guard;
  const data = await listAuthorizedSenders();
  return NextResponse.json({ data });
}

const createSchema = z.object({
  name: z.string().max(120).nullable().optional(),
  phone: z.string().min(6).max(40),
  role: z.string().max(40).optional(),
  isActive: z.boolean().optional(),
  allowedProjectIds: z.array(z.string()).max(50).optional(),
  notes: z.string().max(500).nullable().optional(),
});

export async function POST(req: NextRequest) {
  const guard = guardAdmin(req);
  if (guard) return guard;

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const result = await createAuthorizedSender(parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, id: result.id, normalizedPhone: result.normalizedPhone }, { status: 201 });
}
