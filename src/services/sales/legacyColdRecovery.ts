import { prisma } from "@/lib/prisma";
import { SiteLeadStage } from "@prisma/client";

export type LegacyRecoveryBucket =
  | "OPT_OUT"
  | "OPEN_24H"
  | "CLOSED_24H"
  | "NO_INBOUND_HISTORY"
  | "ALREADY_QUALIFIED";

export interface LegacyRecoveryItem {
  leadId: string;
  nome: string;
  restaurante: string | null;
  whatsapp: string;
  bucket: LegacyRecoveryBucket;
  nextAction: string;
  lastInboundAt: Date | null;
  lastMessageAt: Date | null;
}

export interface LegacyRecoveryDryRun {
  generatedAt: Date;
  total: number;
  counts: Record<LegacyRecoveryBucket, number>;
  samples: Partial<Record<LegacyRecoveryBucket, LegacyRecoveryItem[]>>;
  sendsPerformed: 0;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * Quem NÃO pode receber abordagem fria de recuperação.
 *
 * ⚠️ Esta tabela é `Record<SiteLeadStage, boolean>` de propósito: se alguém criar
 * um estágio novo no schema, o TypeScript PARA o build até que se decida aqui se
 * ele pode ou não ser reabordado. Um `Set` de strings soltas não trava nada — e
 * a primeira versão deste arquivo listava "OPORTUNIDADE", "PROPOSTA",
 * "NEGOCIACAO" e "FECHADO", que NÃO EXISTEM no enum. Resultado: um lead em
 * PROPOSTA_ENVIADA, EM_NEGOCIACAO ou já GANHO caía no balde de recuperação e
 * ficava elegível para levar uma mensagem fria de "olá, tudo bem?".
 */
const FORA_DA_RECUPERACAO: Record<SiteLeadStage, boolean> = {
  NOVO: false,
  DISPONIVEL_PARA_PROSPECCAO: false,
  PRIMEIRO_CONTATO: false,
  RESPONDEU: false,
  EM_QUALIFICACAO: false,
  NUTRICAO: false,
  PERDIDO: false,
  QUALIFICADO: true,
  DEMO_AGENDADA: true,
  DEMO_REALIZADA: true,
  PROPOSTA_ENVIADA: true,
  EM_NEGOCIACAO: true,
  GANHO: true,
};

export function classify(input: { optOutAt: Date | null; stage: string; lastInboundAt: Date | null }, now: Date): Pick<LegacyRecoveryItem, "bucket" | "nextAction"> {
  if (input.optOutAt) return { bucket: "OPT_OUT", nextAction: "STOP" };
  if (FORA_DA_RECUPERACAO[input.stage as SiteLeadStage]) return { bucket: "ALREADY_QUALIFIED", nextAction: "PRESERVE_CURRENT_FLOW" };
  if (!input.lastInboundAt) return { bucket: "NO_INBOUND_HISTORY", nextAction: "WAIT_APPROVED_TEMPLATE" };
  if (now.getTime() - input.lastInboundAt.getTime() < DAY_MS) return { bucket: "OPEN_24H", nextAction: "ELIGIBLE_FOR_RECOVERY_REVIEW" };
  return { bucket: "CLOSED_24H", nextAction: "WAIT_APPROVED_TEMPLATE" };
}

/**
 * Read-only inventory of the historical Foocci commercial base.
 * It intentionally performs no writes and sends no WhatsApp messages.
 * The 24h window is derived from the latest ENTRADA persisted from Meta,
 * never from lastInteractionAt/lastContactedAt.
 */
export async function dryRunLegacyColdRecovery(now = new Date(), sampleSize = 5): Promise<LegacyRecoveryDryRun> {
  const leads = await prisma.siteLead.findMany({
    select: {
      id: true,
      nome: true,
      restaurante: true,
      whatsapp: true,
      stage: true,
      optOutAt: true,
      ultimaMensagemEm: true,
      mensagens: {
        where: { direcao: "ENTRADA" },
        orderBy: { ocorreuEm: "desc" },
        take: 1,
        select: { ocorreuEm: true },
      },
    },
  });

  const counts: Record<LegacyRecoveryBucket, number> = {
    OPT_OUT: 0,
    OPEN_24H: 0,
    CLOSED_24H: 0,
    NO_INBOUND_HISTORY: 0,
    ALREADY_QUALIFIED: 0,
  };
  const samples: LegacyRecoveryDryRun["samples"] = {};

  for (const lead of leads) {
    const lastInboundAt = lead.mensagens[0]?.ocorreuEm ?? null;
    const decision = classify({ optOutAt: lead.optOutAt, stage: String(lead.stage), lastInboundAt }, now);
    counts[decision.bucket] += 1;
    const item: LegacyRecoveryItem = {
      leadId: lead.id,
      nome: lead.nome,
      restaurante: lead.restaurante,
      whatsapp: lead.whatsapp,
      bucket: decision.bucket,
      nextAction: decision.nextAction,
      lastInboundAt,
      lastMessageAt: lead.ultimaMensagemEm,
    };
    const list = samples[decision.bucket] ?? [];
    if (list.length < sampleSize) samples[decision.bucket] = [...list, item];
  }

  return { generatedAt: now, total: leads.length, counts, samples, sendsPerformed: 0 };
}
