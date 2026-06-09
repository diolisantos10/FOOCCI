/**
 * Shared admin guard for the Waiter runtime-merge admin APIs.
 * Returns a NextResponse to short-circuit when unauthorized, or null when OK.
 * Mirrors the existing admin route pattern: 403 if ADMIN_SECRET is unset, 401 if
 * the request is not an authenticated admin. These routes are NEVER public.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";

export function guardAdmin(req: NextRequest): NextResponse | null {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ ok: false, error: "Endpoint disabled — ADMIN_SECRET not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
