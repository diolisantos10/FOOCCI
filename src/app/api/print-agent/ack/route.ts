/**
 * POST /api/print-agent/ack — the Carteiro confirms a job printed (or failed).
 * Public route (token-auth). Marks the job PRINTED or FAILED.
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveByToken } from "@/services/print/PrintAgentService";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    token?: unknown;
    jobId?: unknown;
    ok?: unknown;
    error?: unknown;
  };
  const token = typeof body.token === "string" ? body.token : "";
  const agent = await resolveByToken(token);
  if (!agent) return NextResponse.json({ ok: false, error: "Não pareado." }, { status: 401 });

  const jobId = typeof body.jobId === "string" ? body.jobId : "";
  const job = await prisma.printJob.findFirst({
    where: { id: jobId, restaurantId: agent.restaurantId },
  });
  if (!job) return NextResponse.json({ ok: false, error: "Job não encontrado." }, { status: 404 });

  const printed = body.ok === true;
  await prisma.printJob.update({
    where: { id: job.id },
    data: {
      status: printed ? "PRINTED" : "FAILED",
      printedAt: printed ? new Date() : null,
      error: typeof body.error === "string" ? body.error.slice(0, 500) : null,
    },
  });

  return NextResponse.json({ ok: true });
}
