/**
 * /site/acesso — preview login (POST only). Route handler (Node runtime).
 *
 * Validates the submitted password against `MARKETING_PREVIEW_PASSWORD` and, on
 * success, sets the httpOnly preview cookie scoped to `/site`. Isolated from
 * product auth/NextAuth. Route handlers bypass the /site layout, so this endpoint
 * is reachable while the rest of /site is gated.
 */

import { NextResponse } from "next/server";
import {
  PREVIEW_COOKIE,
  PREVIEW_MAX_AGE,
  isPreviewConfigured,
  previewToken,
  verifyPassword,
} from "@/components/marketing/preview/previewAuth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isPreviewConfigured()) {
    return NextResponse.json({ ok: false, error: "unconfigured" }, { status: 503 });
  }

  const form = await req.formData().catch(() => null);
  const password = form ? String(form.get("password") ?? "") : "";

  if (!verifyPassword(password)) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(PREVIEW_COOKIE, previewToken()!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/site",
    maxAge: PREVIEW_MAX_AGE,
  });
  return res;
}

/** Any non-POST method is not allowed (no content leak). */
export async function GET() {
  return NextResponse.json({ ok: false, error: "method_not_allowed" }, { status: 405 });
}
