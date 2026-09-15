import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSiteLeadSchema } from "@/validators/site-lead";
import { SiteLeadService } from "@/services/site/SiteLeadService";

export const dynamic = "force-dynamic";

/**
 * Entrada máquina-a-máquina dos leads que a Meta já gravou no Google Sheets.
 *
 * IMPORTANTE: este endpoint NÃO cria uma segunda base comercial. Ele entrega o
 * contato ao mesmo SiteLeadService usado pelo formulário do site; por isso o
 * lead já nasce no CRM da Foocci, com deduplicação por WhatsApp, histórico e
 * semeadura da entrevista do SDR.
 *
 * A autenticação é um segredo próprio da integração. Nunca reutilize cookie,
 * senha de admin ou token do WhatsApp no Apps Script.
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
  // `clickId` já é o campo de identificador externo de atribuição do SiteLead.
  // O prefixo evita colisão com fbclid/gclid que chegam pelo site.
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
    // Idempotência da ponte Sheet -> Foocci. Se o Apps Script receber timeout
    // depois do commit e reenviar a mesma linha, ela não vira novo reenvio do
    // lead nem dispara uma segunda notificação.
    const alreadyImported = await prisma.siteLead.findFirst({
      where: { clickId: marker },
      select: { id: true, codigo: true, stage: true, fonte: true },
    });

    if (alreadyImported) {
      return NextResponse.json({
        ok: true,
        leadId: alreadyImported.id,
        codigo: alreadyImported.codigo,
        stage: alreadyImported.stage,
        fonte: alreadyImported.fonte,
        deduplicated: true,
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
      // Para Lead Ads, o conjunto ocupa o nível de segmentação equivalente ao
      // contexto de campanha que o CRM precisa preservar.
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
          // Se o telefone já existia (por exemplo, lead anterior do site), a
          // primeira origem continua sendo a verdade. Só um contato criado AGORA
          // pela ponte passa a ter CAMPANHA_PAGA como fonte de primeiro toque.
          fonte: captured.duplicado ? current?.fonte : "CAMPANHA_PAGA",
          email: current?.email ?? clean(payload.email),
          consentAt: submittedAt,
          // A submissão aconteceu no formulário da Meta. Não fingimos que foi a
          // versão do formulário do site; o marcador deixa a proveniência clara.
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
    });
  } catch (error) {
    console.error("[meta-leads] falha ao importar lead:", error);
    return NextResponse.json(
      { error: "Falha ao registrar o lead no Foocci Comercial." },
      { status: 500 },
    );
  }
}
