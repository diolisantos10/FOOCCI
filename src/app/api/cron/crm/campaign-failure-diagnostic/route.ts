/**
 * POST /api/cron/crm/campaign-failure-diagnostic
 *
 * Auth: Authorization: Bearer {CRON_SECRET}
 *
 * READ-ONLY. Aggregates a campaign's failed executions for a given provider
 * status (default HTTP 400) so an operator can see the EXACT cause before any
 * retry. Sends nothing, mutates nothing. Phones are masked; provider bodies are
 * grouped and truncated.
 *
 * Body / query params:
 *   restaurantSlug  (or restaurantId)
 *   campaignName    (substring, case-insensitive) (or campaignId)
 *   status          provider HTTP status to inspect (default "400")
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhoneForEvolution, isValidEvolutionPhone } from "@/lib/crm/normalizePhone";
import { maskPhone } from "@/lib/wa-text-ordering-flag";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";

function checkCronAuth(req: NextRequest): { ok: true } | { ok: false; status: 401 | 503; error: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, status: 503, error: "CRON_SECRET is not configured" };
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) return { ok: false, status: 401, error: "Unauthorized" };
  return { ok: true };
}

/** Categorise a provider 400 body into an actionable sub-reason. */
function classifyBody(text: string): string {
  const t = text.toLowerCase();
  // Evolution/Baileys wraps a dropped/unhealthy session in a 400 — transient, retry after reconnect.
  if (t.includes("connection closed") || t.includes("connection terminated") || t.includes("lost connection") ||
      t.includes("cannot read properties of undefined") || t.includes("reading 'id'") || t.includes("socket") ||
      t.includes("websocket") || t.includes("baileys") || t.includes("stream errored") ||
      t.includes("session closed") || t.includes("not connected")) return "INSTANCE_SESSION_ERROR";
  if (t.includes("exists\":false") || t.includes("not registered") || t.includes("not on whatsapp") ||
      t.includes("não existe no whatsapp") || t.includes("no account") || t.includes("invalid wuid") ||
      t.includes("number does not exist")) return "NUMBER_NOT_ON_WHATSAPP";
  if (t.includes("number") && (t.includes("required") || t.includes("invalid") || t.includes("must"))) return "NUMBER_FIELD_REJECTED";
  if (t.includes("text") && (t.includes("required") || t.includes("empty") || t.includes("must"))) return "TEXT_FIELD_REJECTED";
  if (t.includes("instance") && (t.includes("not found") || t.includes("does not exist"))) return "INSTANCE_NOT_FOUND";
  return "OTHER_400";
}

export async function POST(req: NextRequest) {
  const auth = checkCronAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const url  = req.nextUrl;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const restaurantSlug = (url.searchParams.get("restaurantSlug") ?? body.restaurantSlug as string | undefined) || undefined;
    const restaurantId   = (url.searchParams.get("restaurantId")   ?? body.restaurantId   as string | undefined) || undefined;
    const campaignName   = (url.searchParams.get("campaignName")   ?? body.campaignName   as string | undefined) || undefined;
    const campaignId     = (url.searchParams.get("campaignId")     ?? body.campaignId     as string | undefined) || undefined;
    const status         = (url.searchParams.get("status")         ?? body.status         as string | undefined) || "400";

    const restaurant = await prisma.restaurant.findFirst({
      where:  restaurantId ? { id: restaurantId } : restaurantSlug ? { slug: restaurantSlug } : {},
      select: { id: true, name: true, slug: true },
    });
    if (!restaurant) return NextResponse.json({ error: "restaurant_not_found" }, { status: 404 });

    const campaign = await prisma.campaign.findFirst({
      where: {
        restaurantId: restaurant.id,
        ...(campaignId ? { id: campaignId } : campaignName ? { name: { contains: campaignName, mode: "insensitive" } } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, message: true, totalAudience: true, totalSent: true, totalFailed: true },
    });
    if (!campaign) return NextResponse.json({ error: "campaign_not_found" }, { status: 404 });

    // Evolution config (no secrets) — confirm instance/endpoint shape.
    const cfg = await EvolutionConfigService.getSnapshot(restaurant.id).catch(() => null);
    const instanceName = cfg?.ok ? cfg.data.instanceName : "unknown";

    const code = `EVOLUTION_HTTP_${status}`;
    const execs = await prisma.campaignExecution.findMany({
      where: {
        campaignId: campaign.id,
        OR: [
          { errorMessage: code },
          { failedReason: { contains: `HTTP ${status}` } },
          ...(status === "400" ? [{ failedReason: { contains: "Bad Request" } as never }] : []),
        ],
      },
      select: { id: true, customerId: true, customerPhone: true, failedReason: true, errorMessage: true, sentAt: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    // Aggregate.
    const bodyGroups = new Map<string, { subReason: string; count: number; sample: string }>();
    const subReasonCounts = new Map<string, number>();
    let phoneValid = 0, phoneInvalid = 0, phoneMissing = 0;
    const normCounts = new Map<string, number>();           // full normalized phone → occurrences (duplicate detection)
    const messageEmpty = !campaign.message?.trim();

    const samples: Array<{ rawMasked: string; normMasked: string; phoneValid: boolean; subReason: string; bodySnippet: string; lastAttemptAt: string | null }> = [];

    for (const e of execs) {
      const raw  = e.customerPhone ?? "";
      const norm = normalizePhoneForEvolution(raw);
      const valid = isValidEvolutionPhone(norm);
      if (!raw.trim()) phoneMissing++;
      else if (valid) phoneValid++;
      else phoneInvalid++;
      if (norm) normCounts.set(norm, (normCounts.get(norm) ?? 0) + 1);

      const fr = e.failedReason ?? "";
      // Strip the "HTTP 400: " prefix to get the provider body.
      const providerBody = fr.replace(/^HTTP\s+\d+:\s*/i, "").trim() || fr || "(sem corpo)";
      const subReason = classifyBody(providerBody);
      subReasonCounts.set(subReason, (subReasonCounts.get(subReason) ?? 0) + 1);

      const key = providerBody.slice(0, 200);
      const g = bodyGroups.get(key);
      if (g) g.count++;
      else bodyGroups.set(key, { subReason, count: 1, sample: providerBody.slice(0, 300) });

      if (samples.length < 8) {
        samples.push({
          rawMasked:  maskPhone(raw),
          normMasked: norm ? maskPhone(norm) : "(não normalizável)",
          phoneValid: valid,
          subReason,
          bodySnippet: providerBody.slice(0, 200),
          lastAttemptAt: (e.sentAt ?? e.createdAt)?.toISOString() ?? null,
        });
      }
    }

    const duplicatePhones = [...normCounts.values()].filter((n) => n > 1).length;
    const distinctPhones  = normCounts.size;

    return NextResponse.json({
      ok: true,
      restaurant: { slug: restaurant.slug, name: restaurant.name },
      campaign:   { id: campaign.id, name: campaign.name, audience: campaign.totalAudience, sent: campaign.totalSent, totalFailed: campaign.totalFailed },
      provider: {
        endpoint:     `POST /message/sendText/${instanceName}`,
        payloadShape: '{ "number": "<E.164 digits>", "text": "<message>" }',
        instanceName,
      },
      status,
      total: execs.length,
      message: { empty: messageEmpty, length: campaign.message?.length ?? 0 },
      phones: { valid: phoneValid, invalid: phoneInvalid, missing: phoneMissing, distinct: distinctPhones, duplicates: duplicatePhones },
      subReasons: Object.fromEntries([...subReasonCounts.entries()].sort((a, b) => b[1] - a[1])),
      distinctBodies: [...bodyGroups.values()].sort((a, b) => b.count - a.count).map((g) => ({ subReason: g.subReason, count: g.count, sample: g.sample })),
      samples,
    });
  } catch (err) {
    console.error("[cron/crm/campaign-failure-diagnostic]", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
