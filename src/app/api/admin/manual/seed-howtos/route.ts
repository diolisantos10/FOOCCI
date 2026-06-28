/**
 * POST /api/admin/manual/seed-howtos
 * Admin-only. Creates/updates the lojista how-to guides as published +
 * agent-visible chapters, so the in-app help assistant can answer with them.
 */

import { NextRequest } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { seedHowToGuides } from "@/services/manual/seedHowToGuides";

export async function POST(req: NextRequest) {
  try {
    if (!checkAdminRequest(req)) return unauthorized();
    const result = await seedHowToGuides();
    return ok(result);
  } catch (err) {
    console.error("[POST /api/admin/manual/seed-howtos]", err);
    return serverError();
  }
}
