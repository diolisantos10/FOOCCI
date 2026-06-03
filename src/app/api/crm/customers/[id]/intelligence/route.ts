import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, notFound, serverError } from "@/lib/api-response";
import { CustomerIntelligenceSnapshotService } from "@/services/crm/CustomerIntelligenceSnapshotService";

type Params = { params: { id: string } };

/**
 * GET /api/crm/customers/[id]/intelligence
 *
 * Returns the unified Customer Intelligence Snapshot — value, recency, frequency,
 * preferences, behavior, safety and the deterministic Next Best Action.
 *
 * Read-only. Tenant-scoped. Never sends messages or runs campaigns.
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const snapshot = await CustomerIntelligenceSnapshotService.getSnapshot(
      ctx.restaurantId,
      params.id,
    );

    if (!snapshot) return notFound("Cliente não encontrado");

    return ok(snapshot);
  } catch (err) {
    console.error("[GET /api/crm/customers/[id]/intelligence]", err);
    return serverError();
  }
}
