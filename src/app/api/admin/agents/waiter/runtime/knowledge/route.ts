/**
 * GET /api/admin/agents/waiter/runtime/knowledge?restaurantId=...
 * Cockpit summary: what the Library→runtime bridge currently resolves for the
 * scope (active version, mode, techniques, promptBlock) + a CURRENT vs
 * LIBRARY_ASSISTED comparison. Admin-only, read-only, never seen by customers.
 */

import { NextRequest, NextResponse } from "next/server";
import { guardAdmin } from "../_guard";
import { getWaiterRuntimeKnowledge } from "@/services/waiterRuntime/WaiterLibraryRuntimeBridge";
import { compareRuntimePromptBlocks } from "@/services/waiterRuntime/comparison";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = guardAdmin(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const restaurantIdParam = url.searchParams.get("restaurantId");
  const restaurantId = restaurantIdParam || null;

  try {
    const knowledge = await getWaiterRuntimeKnowledge({ restaurantId, agentSlug: "waiter" });
    // CURRENT prompt block is always empty (no Library). Compare against it.
    const comparison = compareRuntimePromptBlocks("", knowledge.promptBlock);
    return NextResponse.json({ ok: true, knowledge, comparison });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao resolver knowledge.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
