/**
 * Cofre de Experiências — leitura de insights + backfill manual.
 *
 * GET  /api/admin/brain/vault?restaurantId=..&days=N
 *   → a experiência ACUMULADA do restaurante: total, por agente, por intenção,
 *     padrões mais comuns (tags), e amostras sanitizadas. É o retrato do que os
 *     clientes mais pedem/perguntam — o insumo pra deixar as IAs mais veteranas.
 *
 * POST /api/admin/brain/vault   { sinceDays?: number (default 7) }
 *   → backfill: ingere as conversas reais dos últimos N dias no cofre (idempotente).
 *
 * Admin-only (ADMIN_SECRET). Read-only sobre as conversas; nunca envia nada.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { ingestExperiences } from "@/services/brain/experience/ExperienceVaultService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const restaurantId = req.nextUrl.searchParams.get("restaurantId");
  if (!restaurantId) {
    return NextResponse.json({ ok: false, error: "restaurantId é obrigatório." }, { status: 400 });
  }
  const days = Math.max(1, Math.min(Number(req.nextUrl.searchParams.get("days") ?? 30), 365));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const where = { restaurantId, sourceAt: { gte: since } };

  const [total, byAgentRaw, byIntentRaw, recent] = await Promise.all([
    prisma.restaurantExperience.count({ where }).catch(() => 0),
    prisma.restaurantExperience.groupBy({ by: ["agentId"], where, _count: { _all: true } }).catch(() => []),
    prisma.restaurantExperience.groupBy({ by: ["intent"], where, _count: { _all: true } }).catch(() => []),
    prisma.restaurantExperience
      .findMany({ where, orderBy: { sourceAt: "desc" }, take: 500, select: { agentId: true, intent: true, customerText: true, tags: true, sourceAt: true } })
      .catch(() => [] as Array<{ agentId: string; intent: string | null; customerText: string; tags: string[]; sourceAt: Date }>),
  ]);

  const byAgent = Object.fromEntries(byAgentRaw.map((r) => [r.agentId, r._count._all]));
  const byIntent = Object.fromEntries(byIntentRaw.map((r) => [r.intent ?? "—", r._count._all]));

  // Padrões mais comuns (tags) — o que os clientes mais tocam.
  const tagCounts: Record<string, number> = {};
  for (const r of recent) for (const t of r.tags) tagCounts[t] = (tagCounts[t] ?? 0) + 1;
  const topPatterns = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([tag, count]) => ({ tag, count }));

  const samples = recent.slice(0, 12).map((r) => ({
    when: r.sourceAt.toISOString().slice(0, 16),
    agent: r.agentId,
    intent: r.intent ?? "—",
    pergunta: r.customerText.slice(0, 120),
  }));

  return NextResponse.json({
    ok: true,
    restaurantId,
    windowDays: days,
    summary: { totalExperiencias: total, sampledForPatterns: recent.length },
    byAgent,
    byIntent,
    topPatterns,
    samples,
    runtimeTouched: false,
  });
}

export async function POST(req: NextRequest) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ ok: false, error: "ADMIN_SECRET não configurado." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { sinceDays?: number; maxRecords?: number };
  const sinceDays = Number.isFinite(body.sinceDays) ? Math.max(1, Math.min(Number(body.sinceDays), 90)) : 7;
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const result = await ingestExperiences({ since, maxRecords: body.maxRecords });
  return NextResponse.json({ ok: true, sinceDays, result });
}
