/**
 * /site/sair — preview logout (GET). Route handler (Node runtime).
 *
 * Clears the preview cookie and redirects back to /site, which then shows the
 * gate again. Isolated from product auth.
 */

import { NextResponse } from "next/server";
import { PREVIEW_COOKIE } from "@/components/marketing/preview/previewAuth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const target = new URL("/site", req.url);
  const res = NextResponse.redirect(target);
  res.cookies.set(PREVIEW_COOKIE, "", { path: "/site", maxAge: 0 });
  return res;
}
