/**
 * POST /api/admin/meta/credentials/test — verifies the stored credentials against Meta.
 *
 * Read-only against the Graph API. Returns the app's own settings plus the App Review
 * problems we can detect without a human reading the dashboard (terms of service URL
 * pointing at facebook.com, missing app domains, and so on).
 *
 * Admin-only. No secret appears in the response.
 */

import { NextRequest } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { ok, unauthorized, serverError } from "@/lib/api-response";
import { MetaAppHealthService } from "@/services/meta/MetaAppHealthService";

export async function POST(req: NextRequest) {
  if (!checkAdminRequest(req)) return unauthorized();
  try {
    // A rejected credential is a real answer, not a server error — it comes back as
    // { ok: false, error } with 200 so the screen can render Meta's own message.
    return ok(await MetaAppHealthService.check());
  } catch (err) {
    console.error("[POST /api/admin/meta/credentials/test]", err);
    return serverError();
  }
}
