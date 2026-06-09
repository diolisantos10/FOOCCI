/**
 * CRMColdCampaignRestartService — prepares a NEW "cold customer recovery" campaign
 * in a SAFE, conservative configuration. It NEVER sends: the campaign is created
 * PAUSED, so the recurring runner (which only picks ACTIVE/SCHEDULED) ignores it
 * until a human explicitly activates it.
 *
 * Cold campaigns are conservative by policy: NORMAL priority, NO weekly override,
 * concept + message dedupe ON, dedupe window ≥ 30 (recommended 60).
 */

import { prisma } from "@/lib/prisma";
import { generateMessageFingerprint } from "./messageFingerprint";

export interface RestartColdInput {
  restaurantId: string;
  name?: string;
  campaignFamilyKey?: string;
  sourceCampaignId?: string;
  reuseMessage?: boolean;
  message?: string;
  dedupeWindowDays?: number;
}

export interface RestartColdResult {
  ok: boolean;
  campaignId: string;
  status: "PAUSED";
  campaignFamilyKey: string;
  messageFingerprint: string;
  dedupePolicy: { dedupeByConcept: boolean; dedupeByMessage: boolean; dedupeWindowDays: number; allowResendToImpacted: boolean };
  priority: "NORMAL";
  allowWeeklyCustomerCapOverride: false;
  note: string;
}

const DEFAULT_COLD_MESSAGE =
  "Oi {nome}! Sentimos sua falta 💛 Que tal voltar a pedir hoje? Temos novidades esperando por você.";

export async function restartColdCampaign(input: RestartColdInput): Promise<RestartColdResult> {
  let message = input.message ?? "";
  let targetSegment = "FRIO";
  let templateId = "recuperar-frios";

  if (input.sourceCampaignId) {
    const src = await prisma.campaign.findUnique({
      where: { id: input.sourceCampaignId },
      select: { message: true, targetSegment: true, templateId: true, restaurantId: true, campaignFamilyKey: true },
    });
    if (src && src.restaurantId === input.restaurantId) {
      if (input.reuseMessage !== false && src.message) message = src.message;
      targetSegment = src.targetSegment ?? targetSegment;
      templateId = src.templateId ?? templateId;
    }
  }
  if (!message.trim()) message = DEFAULT_COLD_MESSAGE;

  const campaignFamilyKey = input.campaignFamilyKey?.trim() || "reativacao-frios";
  const messageFingerprint = generateMessageFingerprint(message);
  const dedupePolicy = {
    dedupeByConcept: true,
    dedupeByMessage: true,
    dedupeWindowDays: Math.max(30, input.dedupeWindowDays ?? 60),
    allowResendToImpacted: false,
  };
  const scheduleConfig = {
    mode: "RECURRING",
    weekdays: [1, 2, 3, 4, 5],
    timeWindow: { start: "11:00", end: "20:00" },
    dailyLimit: 20,
    priority: "NORMAL" as const,
    allowWeeklyCustomerCapOverride: false, // cold campaigns NEVER override the weekly cap
    endCondition: "AUDIENCE_EXHAUSTED",
    timezone: "America/Sao_Paulo",
  };

  const campaign = await prisma.campaign.create({
    data: {
      restaurantId: input.restaurantId,
      name: input.name?.trim() || "Recuperar clientes frios",
      message,
      objective: "RECUPERAR",
      channel: "WHATSAPP",
      targetSegment,
      templateId,
      status: "PAUSED" as never, // never auto-sends — runner ignores PAUSED
      campaignFamilyKey,
      messageFingerprint,
      dedupePolicy,
      scheduleConfig,
      audienceConfig: { templateId, channel: "WHATSAPP", excludeAlreadySent: true },
    },
    select: { id: true },
  });

  return {
    ok: true,
    campaignId: campaign.id,
    status: "PAUSED",
    campaignFamilyKey,
    messageFingerprint,
    dedupePolicy,
    priority: "NORMAL",
    allowWeeklyCustomerCapOverride: false,
    note: "Campanha criada PAUSED — não envia. Rode o preflight e ative manualmente quando estiver pronto.",
  };
}
