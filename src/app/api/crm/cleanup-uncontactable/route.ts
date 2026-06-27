/**
 * POST /api/crm/cleanup-uncontactable
 *
 * Permanently deletes "useless" contacts — non-guest customers with no valid
 * phone AND no e-mail (can't be reached on any channel). Customers that have any
 * Order or OrderDraft are skipped, so real sales history is never destroyed.
 *
 * Tenant-scoped. Destructive — the UI gates this behind an explicit confirmation.
 */
import { NextRequest, NextResponse } from "next/server";
import { getTenantId } from "@/lib/tenant";
import { CRMService } from "@/services/crm/CRMService";

export async function POST(_req: NextRequest) {
  let restaurantId: string;
  try { restaurantId = getTenantId(); }
  catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }

  const result = await CRMService.deleteUncontactable(restaurantId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  }
  return NextResponse.json({ data: result.data });
}
