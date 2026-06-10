/**
 * GET  /api/admin/agents/waiter/training-suggestions — list training proposals + stats
 * POST /api/admin/agents/waiter/training-suggestions — generate proposals for pending real cases
 *
 * "Casos reais para revisar": each real case becomes a clear training proposal
 * (problem · ideal response · training rule · impact). Admin-only, read-only on
 * real data, never touches the runtime.
 */

import { NextRequest, NextResponse } from "next/server";
import { guardAdmin } from "../runtime/_guard";
import {
  listSuggestions,
  suggestionStats,
  generatePendingTrainingSuggestions,
  type SuggestionStatus,
} from "@/services/waiterTraining/WaiterTrainingSuggestionStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES: SuggestionStatus[] = ["PENDING_REVIEW", "APPROVED", "REJECTED", "BACKLOG"];

export async function GET(req: NextRequest) {
  const guard = guardAdmin(req);
  if (guard) return guard;
  try {
    const status = req.nextUrl.searchParams.get("status");
    const [items, stats] = await Promise.all([
      listSuggestions({
        status: status && STATUSES.includes(status as SuggestionStatus) ? (status as SuggestionStatus) : undefined,
        limit: Number(req.nextUrl.searchParams.get("limit") ?? 50) || 50,
      }),
      suggestionStats(),
    ]);
    return NextResponse.json({ ok: true, items, stats });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido";
    return NextResponse.json({ ok: false, error: message }, { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  const guard = guardAdmin(req);
  if (guard) return guard;
  try {
    const result = await generatePendingTrainingSuggestions();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido";
    return NextResponse.json({ ok: false, error: message }, { status: 200 });
  }
}
