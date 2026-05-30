/**
 * GET /api/admin/build/commands — list received Build OS commands (read-only).
 *
 * Internal only. Requires ADMIN_SECRET (header or session cookie). Restaurant
 * users and the public must never reach this endpoint. Priority 1.1: read-only
 * — no create/update/delete, no Claude/GitHub/LLM.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { getBuildCommandsForAdmin } from "@/services/buildos/BuildCommandService";

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

  const data = await getBuildCommandsForAdmin();
  return NextResponse.json({ data });
}
