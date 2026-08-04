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
import { normalizePhoneBR, isValidPhoneBR } from "@/lib/crm/normalizePhone";
import { maskPhone } from "@/lib/wa-text-ordering-flag";
import { MetaConfigService } from "@/services/whatsapp/MetaConfigService";
import { WhatsAppMessagingService } from "@/services/whatsapp/WhatsAppMessagingService";
import { classifyExecution, type ExecutionCategory, type Retryability } from "@/services/crm/crmExecutionClassification";

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
  // Sessão caída/instável do provedor antigo vinha como 400 — transitório. Estes
  // padrões são mantidos porque ainda existem linhas ANTIGAS no banco com esses
  // corpos: apagar a classificação faria o histórico virar "desconhecido".
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

    // Config da Meta (sem segredo) — só a presença e o phone_number_id.
    const cfg = await MetaConfigService.getResolved(restaurant.id).catch(() => null);
    const channelId = cfg?.phoneNumberId ?? "unknown";

    // Estado do canal, só leitura. Não sabemos = "unknown", nunca "conectado".
    let channelState = "unknown";
    let channelConnected = false;
    let channelCheckError: string | null = null;
    if (cfg) {
      try {
        const st = await WhatsAppMessagingService.getConnectionStatus(restaurant.id);
        channelConnected = st.connected;
        channelState     = st.connected ? "connected" : "disconnected";
      } catch (e) {
        channelCheckError = e instanceof Error ? e.message.slice(0, 120) : "unreachable";
      }
    }

    // Linhas antigas de campanha guardam o código do provedor anterior; as novas
    // guardam o da Meta. O diagnóstico precisa achar as duas — histórico não se
    // apaga só porque o provedor mudou.
    const code = `META_HTTP_${status}`;
    const legacyCode = `EVOLUTION_HTTP_${status}`;
    const execs = await prisma.campaignExecution.findMany({
      where: {
        campaignId: campaign.id,
        OR: [
          { errorMessage: code },
          { errorMessage: legacyCode },
          { failedReason: { contains: `HTTP ${status}` } },
          ...(status === "400" ? [{ failedReason: { contains: "Bad Request" } as never }] : []),
        ],
      },
      select: { id: true, status: true, customerId: true, customerPhone: true, failedReason: true, errorMessage: true, sentAt: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    // Aggregate.
    const bodyGroups = new Map<string, { subReason: string; count: number; sample: string }>();
    const subReasonCounts = new Map<string, number>();
    let phoneValid = 0, phoneInvalid = 0, phoneMissing = 0;
    const normCounts = new Map<string, number>();           // full normalized phone → occurrences (duplicate detection)
    const messageEmpty = !campaign.message?.trim();

    const samples: Array<{ rawMasked: string; normMasked: string; phoneValid: boolean; subReason: string; category: string; retryabilityLabel: string; bodySnippet: string; lastAttemptAt: string | null }> = [];

    // Real classification (same engine as the UI) so the report shows the post-fix labels.
    const catCounts = new Map<ExecutionCategory, number>();
    const retryCounts = new Map<Retryability, number>();
    let recoverableCount = 0;

    for (const e of execs) {
      const raw  = e.customerPhone ?? "";
      const norm = normalizePhoneBR(raw);
      const valid = isValidPhoneBR(norm);
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

      // Real classification (post-fix): session-error 400s now map to INSTANCE_DISCONNECTED/RETRYABLE_LATER.
      const cls = classifyExecution({ status: e.status, failedReason: e.failedReason, errorMessage: e.errorMessage });
      catCounts.set(cls.category, (catCounts.get(cls.category) ?? 0) + 1);
      retryCounts.set(cls.retryability, (retryCounts.get(cls.retryability) ?? 0) + 1);
      if (cls.kind === "FAILED" && cls.retryability === "RETRYABLE_LATER") recoverableCount++;

      if (samples.length < 8) {
        samples.push({
          rawMasked:  maskPhone(raw),
          normMasked: norm ? maskPhone(norm) : "(não normalizável)",
          phoneValid: valid,
          subReason,
          category: cls.category,
          retryabilityLabel: cls.retryabilityLabel,
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
        endpoint:     `POST /${channelId}/messages (Graph API)`,
        payloadShape: '{ "messaging_product": "whatsapp", "to": "<E.164 digits>", "type": "text", ... }',
        channelId,
      },
      channel: {
        id:         channelId,
        state:      channelState,            // connected | disconnected | unknown
        connected:  channelConnected,
        checkError: channelCheckError,
      },
      classification: {
        byCategory:     Object.fromEntries([...catCounts.entries()].sort((a, b) => b[1] - a[1])),
        byRetryability: Object.fromEntries([...retryCounts.entries()].sort((a, b) => b[1] - a[1])),
        recoverableCount,
      },
      // Só é seguro reprocessar com o canal CONECTADO e com linhas recuperáveis.
      // "unknown" não conta como conectado — guardrail 1.
      safeToReprocess: channelConnected && recoverableCount > 0,
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
