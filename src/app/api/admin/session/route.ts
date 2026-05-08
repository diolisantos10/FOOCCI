/**
 * POST /api/admin/session  — validate ADMIN_SECRET, set httpOnly admin cookie
 * DELETE /api/admin/session — clear admin cookie (logout)
 */

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, makeAdminToken } from "@/lib/admin-auth";

export async function POST(req: NextRequest) {
  const envSecret = process.env.ADMIN_SECRET;
  if (!envSecret) {
    return NextResponse.json(
      { error: "Admin access not configured. Set ADMIN_SECRET." },
      { status: 403 },
    );
  }

  let body: { secret?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.secret || body.secret !== envSecret) {
    return NextResponse.json({ error: "Secret inválido." }, { status: 401 });
  }

  const token = makeAdminToken();
  const res = NextResponse.json({ success: true });
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 8 * 60 * 60, // 8 hours
    path: "/",
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ success: true });
  res.cookies.set(ADMIN_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return res;
}
