/**
 * POST /api/cron/crm/create-custom-campaign
 *
 * OPS endpoint (Bearer CRON_SECRET): creates — or updates, idempotent by
 * restaurant+name — a CUSTOM recurring campaign, optionally ACTIVE right away.
 * Exists so campaigns can be provisioned remotely (GitHub Actions ops workflow,
 * and later the CRM agent) without a dashboard session.
 *
 * Body:
 *   slug | restaurantId  — tenant (slug resolved to id)
 *   name                 — campaign name (idempotency key per restaurant)
 *   message              — the phrase (also seeded into the message pool, ON)
 *   targetSegment        — default "TODOS"
 *   weekdays             — [0..6], default all
 *   timeWindow           — { start, end }, default 11:00–20:00
 *   dailyLimit           — default 40
 *   activate             — default true (RECURRING campaigns are born ACTIVE)
 *
 * Also auto-submits the phrase's Meta template (best-effort) so official-API
 * delivery unlocks as soon as Meta approves.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CrmCampaignService } from "@/services/crm/CrmCampaignService";
import { buildMetaTemplate } from "@/services/whatsapp/metaTemplateBuilder";
import { MetaTemplateService } from "@/services/whatsapp/MetaTemplateService";
import { phraseKey } from "@/services/crm/crmMessagePool";

const OPT_OUT_FOOTER = "Para não receber mais ofertas, responda SAIR.";

/** Submits the custom phrase as its own Meta template and wires the per-phrase
 *  mapping, so official-API delivery unlocks the moment Meta approves. */
async function submitCustomTemplate(restaurantId: string, campaignId: string, message: string) {
  const metaCfg = await prisma.metaWhatsAppConfig.findUnique({
    where:  { restaurantId },
    select: { metaCrmEnabled: true, connectionStatus: true },
  }).catch(() => null);
  if (!(metaCfg?.metaCrmEnabled && metaCfg.connectionStatus === "CONNECTED")) {
    return { skipped: "meta-not-connected" };
  }

  const key     = phraseKey(message);
  const tplName = `campanha_${key.replace(/^mf_/, "v").replace(/[^a-z0-9_]/g, "")}`.slice(0, 120);
  const built   = buildMetaTemplate({
    name: tplName, message, category: "MARKETING", language: "pt_BR",
    footer: OPT_OUT_FOOTER, examples: {},
  });

  const res = await MetaTemplateService.createOnMeta(restaurantId, built.payload);
  if (!res.ok && !res.alreadyExists) return { failed: res.error };

  await MetaTemplateService.upsert({
    restaurantId, templateName: tplName, languageCode: "pt_BR",
    category: "MARKETING", bodyVariables: built.bodyVariables,
    ...(res.ok ? { status: "PENDING" } : {}),
    ...(res.id ? { metaTemplateId: res.id } : {}),
  });
  const prevCampaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { audienceConfig: true } });
  const prev = (prevCampaign?.audienceConfig && typeof prevCampaign.audienceConfig === "object")
    ? (prevCampaign.audienceConfig as Record<string, unknown>) : {};
  // Preserve any per-phrase mappings already on the campaign — merge, don't clobber.
  const prevTemplates = (prev.metaTemplates && typeof prev.metaTemplates === "object")
    ? (prev.metaTemplates as Record<string, unknown>) : {};
  await prisma.campaign.update({
    where: { id: campaignId },
    data:  { audienceConfig: { ...prev, metaTemplates: { ...prevTemplates, [key]: { name: tplName, language: "pt_BR", params: built.paramTokens, submittedMessage: message } } } as never },
  });
  return { submitted: tplName, alreadyExisted: !!res.alreadyExists };
}

function checkCronAuth(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (req.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!checkCronAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({})) as {
      slug?: string; restaurantId?: string;
      name?: string; message?: string; targetSegment?: string;
      weekdays?: number[]; timeWindow?: { start?: string; end?: string };
      dailyLimit?: number; activate?: boolean;
    };

    if (!body.name?.trim() || !body.message?.trim()) {
      return NextResponse.json({ error: "name e message são obrigatórios" }, { status: 400 });
    }

    // Resolve tenant.
    let restaurantId = body.restaurantId?.trim() || null;
    if (!restaurantId && body.slug?.trim()) {
      const r = await prisma.restaurant.findUnique({ where: { slug: body.slug.trim() }, select: { id: true } });
      restaurantId = r?.id ?? null;
    }
    if (!restaurantId) return NextResponse.json({ error: "Restaurante não encontrado (slug/restaurantId)" }, { status: 404 });

    const name          = body.name.trim();
    const message       = body.message.trim();
    const targetSegment = body.targetSegment?.trim() || "TODOS";
    const weekdays      = Array.isArray(body.weekdays) && body.weekdays.length > 0
      ? body.weekdays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
      : [0, 1, 2, 3, 4, 5, 6];
    const timeWindow = {
      start: body.timeWindow?.start ?? "11:00",
      end:   body.timeWindow?.end   ?? "20:00",
    };
    const dailyLimit = typeof body.dailyLimit === "number" && body.dailyLimit > 0 ? Math.min(body.dailyLimit, 200) : 40;
    const activate   = body.activate !== false;

    const scheduleConfig = {
      mode: "RECURRING",
      weekdays, timeWindow, dailyLimit,
      // The phrase also lives in the message pool (ON), so the modal shows it
      // as a selectable/editable phrase like any other.
      messagePool: { custom: [{ id: "ops1", text: message, on: true }] },
    };

    // Idempotent by restaurant+name: update the existing non-terminal row.
    const existing = await prisma.campaign.findFirst({
      where:   { restaurantId, name, status: { notIn: ["SENT", "COMPLETED", "CANCELLED"] as never[] } },
      orderBy: { createdAt: "desc" },
      select:  { id: true },
    });

    let campaignId: string;
    let action: "created" | "updated";
    if (existing) {
      await prisma.campaign.update({
        where: { id: existing.id },
        data: {
          message, targetSegment,
          scheduleConfig: scheduleConfig as object,
          status: (activate ? "ACTIVE" : "PAUSED") as never,
        },
      });
      campaignId = existing.id;
      action = "updated";
    } else {
      const result = await CrmCampaignService.create(restaurantId, {
        name,
        targetSegment,
        messageTemplate: message,
        channel:         "WHATSAPP",
        scheduleConfig,
      });
      campaignId = result.campaignId;
      if (!activate) {
        await prisma.campaign.update({ where: { id: campaignId }, data: { status: "PAUSED" as never } });
      }
      action = "created";
    }

    // Kick the Meta template submission immediately (best-effort) — official-API
    // delivery unlocks the moment Meta approves.
    const provision = await submitCustomTemplate(restaurantId, campaignId, message)
      .catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));

    return NextResponse.json({ ok: true, action, campaignId, active: activate, provision });
  } catch (err) {
    console.error("[cron/crm/create-custom-campaign]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
