/**
 * GET /api/crm/top-customers
 *
 * Read-only ranking of the restaurant's most valuable customers (by spend).
 * Accepts ?from=ISO&to=ISO for a period; without params returns all-time totals.
 *
 * Short windows (Hoje / 7 dias / Esta semana) that return too few spenders fall
 * back to the last 12 months — the response flags this via `fallbackUsed`/`basis`
 * so the UI can label it honestly. Never invents spend. No LLM. No send. No mutation.
 */
import { NextRequest, NextResponse } from "next/server";
import { getTenantId } from "@/lib/tenant";
import { CRMService } from "@/services/crm/CRMService";

export async function GET(req: NextRequest) {
  let restaurantId: string;
  try { restaurantId = getTenantId(); }
  catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }

  const { searchParams } = req.nextUrl;
  const from = searchParams.get("from");
  const to   = searchParams.get("to");
  const dateRange = from && to ? { from: new Date(from), to: new Date(to) } : undefined;

  const result = await CRMService.getTopCustomers(restaurantId, dateRange);
  if (!result.ok) return NextResponse.json({ error: "Failed to load top customers" }, { status: 500 });
  return NextResponse.json({ data: result.data });
}
