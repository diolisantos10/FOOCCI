/**
 * GET /api/admin/training/inbox — the unified approval inbox.
 *
 * Aggregates every pending approval (improvement proposals, simulation
 * opportunities, training suggestions) into ONE list, filterable by agent
 * (?agent=whatsapp|waiter|crm|analytics). Admin-only, read-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { listInbox, type ApprovalAgentKey } from "@/services/agent-training/approvalInbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_AGENTS: ApprovalAgentKey[] = ["whatsapp", "waiter", "crm", "analytics", "outro"];

export async function GET(req: NextRequest) {
  if (!checkAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = req.nextUrl.searchParams.get("agent");
  const agent = raw && VALID_AGENTS.includes(raw as ApprovalAgentKey) ? (raw as ApprovalAgentKey) : undefined;

  try {
    const result = await listInbox(agent);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[GET training/inbox]", err);
    return NextResponse.json({ error: "Erro ao carregar a caixa de aprovação." }, { status: 500 });
  }
}
