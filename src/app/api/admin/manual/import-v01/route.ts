/**
 * POST /api/admin/manual/import-v01
 *
 * Protected internal action to import and publish Manual Operacional v0.1.
 *
 * Request body:
 *   { "mode": "dry-run" | "publish", "confirmation": "IMPORT_MANUAL_V01" }
 *
 * Safety rules:
 *   - Requires ADMIN_SECRET (same guard as all /api/admin/manual/* routes).
 *   - "publish" mode requires confirmation === "IMPORT_MANUAL_V01".
 *   - "dry-run" never writes to DB.
 *   - Never connects AI agents or embeddings.
 *   - Never exposes to restaurant users.
 *   - Never deletes anything.
 *   - Reports missing slugs (seed required) instead of creating them.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkAdminRequest } from "@/lib/admin-auth";
import { runManualV01Import } from "@/services/manual/importManualV01";

// ── Auth guard (identical pattern to all other /api/admin/manual/* routes) ───

function guardAdmin(req: NextRequest): NextResponse | null {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Admin access not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

// ── Request schema ────────────────────────────────────────────────────────────

const importSchema = z.object({
  mode:         z.enum(["dry-run", "publish"]),
  confirmation: z.string().optional(),
});

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const guard = guardAdmin(req);
  if (guard) return guard;

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const { mode, confirmation } = parsed.data;

  // Publish requires explicit confirmation string
  if (mode === "publish" && confirmation !== "IMPORT_MANUAL_V01") {
    return NextResponse.json(
      { error: "Confirmation required. Send confirmation: \"IMPORT_MANUAL_V01\" to proceed with publish." },
      { status: 422 },
    );
  }

  try {
    const result = await runManualV01Import(mode, "CHATGPT");

    return NextResponse.json({ result }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[import-v01] Fatal error:", message);
    return NextResponse.json(
      { error: `Import failed: ${message}` },
      { status: 500 },
    );
  }
}
