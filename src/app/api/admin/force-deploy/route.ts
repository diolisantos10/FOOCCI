/**
 * POST /api/admin/force-deploy
 *
 * Fallback endpoint: manually triggers a Railway deploy by calling the
 * RAILWAY_WEBHOOK_URL deploy hook.
 *
 * Use when GitHub Actions is unavailable or the deploy was not triggered
 * automatically after a merge to the default branch.
 *
 * SECURITY: requires x-admin-secret header === ADMIN_SECRET env var.
 * Endpoint is completely disabled when ADMIN_SECRET is not configured.
 *
 * Example:
 *   curl -X POST https://<app>/api/admin/force-deploy \
 *     -H "x-admin-secret: <ADMIN_SECRET>"
 */

import { NextRequest } from "next/server";
import { ok, unauthorized, badRequest, serverError } from "@/lib/api-response";

export async function POST(req: NextRequest) {
  // ── Auth guard ─────────────────────────────────────────────
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    console.error("[force-deploy] ADMIN_SECRET is not configured — endpoint disabled.");
    return unauthorized();
  }

  const provided = req.headers.get("x-admin-secret");
  if (provided !== adminSecret) {
    console.warn("[force-deploy] Invalid x-admin-secret header.");
    return unauthorized();
  }

  // ── Webhook URL check ──────────────────────────────────────
  const webhookUrl = process.env.RAILWAY_WEBHOOK_URL;
  if (!webhookUrl) {
    const msg = "RAILWAY_WEBHOOK_URL is not configured. Add it to Railway environment variables.";
    console.error(`[force-deploy] ${msg}`);
    return badRequest(msg);
  }

  // ── Trigger deploy ─────────────────────────────────────────
  const triggeredAt = new Date().toISOString();
  console.log(`[force-deploy] Triggering Railway deploy at ${triggeredAt}...`);

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    const httpStatus = res.status;
    console.log(`[force-deploy] Railway webhook responded: HTTP ${httpStatus}`);

    if (httpStatus !== 200 && httpStatus !== 202) {
      const body = await res.text().catch(() => "(no body)");
      console.error(`[force-deploy] Unexpected status ${httpStatus}. Body: ${body}`);
      return serverError(`Railway returned unexpected status ${httpStatus}.`);
    }

    console.log("[force-deploy] Deploy triggered successfully.");

    return ok({
      triggered:   true,
      triggeredAt,
      railwayStatus: httpStatus,
    });
  } catch (err) {
    console.error("[force-deploy] Failed to call Railway webhook:", err);
    return serverError("Failed to reach Railway deploy hook. Check RAILWAY_WEBHOOK_URL.");
  }
}
