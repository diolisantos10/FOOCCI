/**
 * GET /api/integrations/meta/oauth/candidates
 *
 * Returns the discovered Page candidates for the current restaurant's pending
 * connection (page-selection UI). NEVER includes any token. Tenant-scoped.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { listCandidates, isMetaConnectConfigured } from "@/services/instagram/metaOAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const candidates = await listCandidates(ctx.restaurantId);
  return NextResponse.json({ data: { candidates, metaConfigured: isMetaConnectConfigured() } });
}
