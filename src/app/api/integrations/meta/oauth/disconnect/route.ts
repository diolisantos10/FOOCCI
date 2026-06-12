/**
 * POST /api/integrations/meta/oauth/disconnect
 *
 * Disconnects the Meta/Instagram integration: pauses + disables, wipes the stored
 * Page token, keeps the config row. Conversation history (Customer/Conversation/
 * Message) is PRESERVED — nothing is deleted. Tenant-scoped.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { disconnectMeta } from "@/services/instagram/metaOAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (ctx.role !== "OWNER" && ctx.role !== "MANAGER") {
    return NextResponse.json({ error: "Apenas o proprietário ou gerente pode desconectar." }, { status: 403 });
  }
  const result = await disconnectMeta(ctx.restaurantId);
  return NextResponse.json({ data: result });
}
