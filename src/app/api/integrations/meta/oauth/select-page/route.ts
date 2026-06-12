/**
 * POST /api/integrations/meta/oauth/select-page
 *
 * Saves the chosen Page: re-fetches its Page Access Token via the stored (and
 * encrypted) user token, persists InstagramChannelConfig with mode RECEIVE_ONLY /
 * scope TEST_ACCOUNT_ONLY (token encrypted), and consumes the OAuth state. The
 * pageId must belong to the current restaurant's pending connection. Tenant-scoped.
 * Never sends a Direct, never creates an order/Pix; token never returned.
 *
 * Body: { pageId: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { selectPage } from "@/services/instagram/metaOAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (ctx.role !== "OWNER" && ctx.role !== "MANAGER") {
    return NextResponse.json({ error: "Apenas o proprietário ou gerente pode conectar." }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { pageId?: string };
  if (!body.pageId) return NextResponse.json({ error: "pageId é obrigatório." }, { status: 400 });

  const result = await selectPage({ restaurantId: ctx.restaurantId, pageId: body.pageId });
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 422 });
  return NextResponse.json({ data: result.view });
}
