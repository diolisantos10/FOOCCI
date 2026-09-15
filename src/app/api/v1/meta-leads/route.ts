import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSiteLeadSchema } from "@/validators/site-lead";
import { SiteLeadService } from "@/services/site/SiteLeadService";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/meta-leads
 *
 * Entrada máquina-a-máquina dos leads que a Meta já gravou no Google Sheets.
 * `/api/v1/*` já é liberado pelo middleware para integrações externas; a
 * autenticação de verdade acontece AQUI com um segredo exclusivo e fail-closed.
 *
 * Não cria uma segunda base comercial: entrega o contato ao mesmo
 * SiteLeadService do formulário do site, preservando deduplicação por WhatsApp,
 * histórico e semeadura da entrevista do SDR.
 */
const metaLeadSchema = z.object({
  metaLeadId: z.string().trim().min(1).max(200),
  createdTime: z.string().trim().max(80).optional().or(z.literal("")),
  adId: z.string().trim().max(200).optional().or(z.literal("")),
  adName: z.string().trim().max(300).optional().or(z.literal("")),
  adsetId: z.string().trim().max(200).optional().or(z.literal("")),
  adsetName: z.string().trim().max(300).optional().or(z.literal("")),
  campaignId: z.string().trim().max(200).optional().or(z.literal("")),
  campaignName: z.string().trim().max(300).optional().or(z.literal("")),
  formId: z.string().trim().max(200).optional().or(z.literal("")),
  formName: z.string().trim().max(300).optional().or(z.literal("")),
  isOrganic: z.boolean().optional(),
  platform: z.string().trim().max(80).optional().or(z.literal("")),
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254).optional().or(z.literal("")),
  phone: z.string().trim().min(1).max(30),
  leadStatus: z.string().trim().max(120).optional().or(z.literal("")),
});

type MetaLeadPayload = z.infer<typeof metaLeadSchema>;

function clean(value: string | undefined | null): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text === "" ? null : text;
}

function metaOrigin(payload: MetaLeadPayload): string {
  const form = clean(payload.formName) ?? clean(payload.formId);
  return form ? `Meta Lead Ads — ${form}` : "Meta Lead Ads";
}

function externalMarker(metaLeadId: string): string {
  return `meta-lead:${metaLeadId}`;
}

function parseSubmittedAt(value: string | undefined): Date {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function metadataNote(payload: MetaLeadPayload): string {
  const pairs = [
    ["meta_lead_id", payload.metaLeadId],
    ["created_time", clean(payload.createdTime)],
    ["campaign", clean(payload.campaignName)],
    ["campaign_id", clean(payload.campaignId)],
    ["adset", clean(payload.adsetName)],
    ["adset_id", clean(payload.adsetId)],
    ["ad", clean(payload.adName)],
    ["ad_id", clean(payload.adId)],
    ["form", clean(payload.formName)],
    ["form_id", clean(payload.formId)],
    ["platform", clean(payload.platform)],
    ["lead_status", clean(payload.leadStatus)],
    ["is_organic", payload.isOrganic === undefined ? null : String(payload.isOrganic)],
  ] as const;

  return `Meta Lead Ads | ${pairs
    .filter(([, value]) => value !== null && value !== "")
    .map(([key, value]) => `${key}=${value}`)
    .join(" | ")}`;
}

function authorized(req: NextRequest): boolean {
  const expected = process.env.FOOCCI_META_LEADS_KEY;
  if (!expected) return false;
  return req.headers.get("x-foocci-integration-key") === expected;
}

async function findAlreadyImported(marker: string, metaLeadId: string) {
  const byClickId = await prisma.siteLead.findFirst({
    where: { clickId: marker },
    select: { id: true, codigo: true, stage: true, fonte: true },
  });
  if (byClickId) return byClickId;

  // Um telefone pode já existir no CRM com outro clickId de primeiro toque.
  // Nesse caso não apagamos a atribuição original; a nota interna vira também
  // a prova de idempotência da submissão da Meta.
  const interaction = await prisma.siteLeadInteraction.findFirst({
    where: {
      actor: "integracao-meta-leads",
      tipo: "NOTA_INTERNA",
      nota: { contains: `meta_lead_id=${metaLeadId}` },
    },
    orderBy: { createdAt: "desc" },
    select: {
      lead: { select: { id: true, codigo: true, stage: true, fonte: true } },
    },
  });
  return interaction?.lead ?? null;
}

export async function POST(req: NextRequest) {
  if (!process.env.FOOCCI_META_LEADS_KEY) {
    console.error("[meta-leads] FOOCCI_META_LEADS_KEY não configurada");
    return NextResponse.json({ error: "Integração não configurada." }, { status: 503 });
  }

  if (!authorized(req)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const raw = await req.json().catch(() => null);
  const parsed = metaLeadSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Payload inválido." },
      { status: 400 },
    );
  }

  const payload = parsed.data;
  const marker = externalMarker(payload.metaLeadId);

  try {
    const alreadyImported = await findAlreadyImported(marker, payload.metaLeadId);
    if (alreadyImported) {
      return NextResponse.json({
        ok: true,
        leadId: alreadyImported.id,
        codigo: alreadyImported.codigo,
        stage: alreadyImported.stage,
        fonte: alreadyImported.fonte,
        deduplicated: true,
        idempotentReplay: true,
      });
    }

    const source = clean(payload.platform)?.toLowerCase() ?? "facebook";
    const mapped = createSiteLeadSchema.safeParse({
      nome: payload.fullName,
      whatsapp: payload.phone,
      restaurante: "",
      cidade: "",
      tipo: "",
      desafio: "",
      origem: metaOrigin(payload),
      utmSource: source,
      utmMedium: payload.isOrganic ? "organic" : "paid_social",
      utmCampaign: clean(payload.campaignName) ?? clean(payload.campaignId) ?? "",
      utmContent: clean(payload.adName) ?? clean(payload.adId) ?? "",
      utmTerm: clean(payload.adsetName) ?? clean(payload.adsetId) ?? "",
      clickId: marker,
      landingPath: "",
      referrer: "meta-lead-ads",
    });

    if (!mapped.success) {
      return NextResponse.json(
        { error: mapped.error.issues[0]?.message ?? "Lead inválido." },
        { status: 422 },
      );
    }

    const captured = await SiteLeadService.capture(mapped.data);
    const current = await prisma.siteLead.findUnique({
      where: { id: captured.id },
      select: { email: true, fonte: true },
    });

    const submittedAt = parseSubmittedAt(payload.createdTime);
    const now = new Date();

    await prisma.$transaction([
      prisma.siteLead.update({
        where: { id: captured.id },
        data: {
          // Primeiro toque não é sobrescrito. Se a pessoa já existia, a Meta
          // entra como interação; se nasceu aqui, a fonte é campanha paga.
          fonte: captured.duplicado ? current?.fonte : "CAMPANHA_PAGA",
          email: current?.email ?? clean(payload.email),
          consentAt: submittedAt,
          consentPolicyVersion: "META_LEAD_FORM",
          lastInteractionAt: now,
        },
      }),
      prisma.siteLeadInteraction.create({
        data: {
          leadId: captured.id,
          tipo: "NOTA_INTERNA",
          actor: "integracao-meta-leads",
          nota: metadataNote(payload),
          interna: true,
          createdAt: now,
        },
      }),
    ]);

    const finalLead = await prisma.siteLead.findUnique({
      where: { id: captured.id },
      select: { id: true, codigo: true, stage: true, fonte: true },
    });

    return NextResponse.json({
      ok: true,
      leadId: captured.id,
      codigo: captured.codigo,
      stage: finalLead?.stage ?? "NOVO",
      fonte: finalLead?.fonte ?? (captured.duplicado ? current?.fonte : "CAMPANHA_PAGA"),
      deduplicated: captured.duplicado,
      idempotentReplay: false,
    });
  } catch (error) {
    console.error("[meta-leads] falha ao importar lead:", error);
    return NextResponse.json(
      { error: "Falha ao registrar o lead no Foocci Comercial." },
      { status: 500 },
    );
  }
}
