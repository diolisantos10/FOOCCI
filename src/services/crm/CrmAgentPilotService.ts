/**
 * CrmAgentPilotService — a escada governada do reasoner de CRM, por agente.
 *
 * Espelha o BrainFreeFormConfigService do recepcionista, mas para o Agente de CRM:
 *
 *   SHADOW_ONLY (default) → ALLOWLIST (telefones do time) → RESTAURANT_WIDE
 *
 * Sem linha no banco = SHADOW_ONLY = produção atual (só sorteio; o agente observa
 * e loga evidência). Em ALLOWLIST/WIDE, uma fatia (abTestPercent) dos destinatários
 * ELEGÍVEIS recebe a mensagem COMPOSTA pelo agente; o resto segue o sorteio como
 * grupo de controle — é a prova A/B. Nunca lança: erro de DB = SHADOW_ONLY (seguro).
 *
 * Este serviço NÃO envia. Quem envia é o runner, e só depois do piso determinístico
 * (agentMessagePassesFloor) confirmar que a mensagem do agente é segura.
 */

import { prisma } from "@/lib/prisma";
import { isPhoneInList } from "@/lib/wa-text-ordering-flag";
import { detectSpamLanguage, impliesDiscount } from "@/services/crm/MessageVariationService";
import { guardStoredStage } from "@/services/brain/runtime/LiveStageGuard";

export type CrmPilotMode = "SHADOW_ONLY" | "ALLOWLIST" | "RESTAURANT_WIDE";

const DEFAULT_MIN_CONFIDENCE = 0.6;

export interface CrmPilotConfig {
  restaurantId: string;
  mode: CrmPilotMode;
  paused: boolean;
  minConfidence: number;
  abTestPercent: number;
  allowlistedPhones: string[];
  notes: string | null;
}

export interface CrmPilotAccess {
  /** Este telefone pode receber a mensagem COMPOSTA pelo agente (não o sorteio)? */
  allowed: boolean;
  mode: CrmPilotMode;
  reason: string;
}

function asMode(raw: string | undefined | null): CrmPilotMode {
  return raw === "ALLOWLIST" || raw === "RESTAURANT_WIDE" ? raw : "SHADOW_ONLY";
}

function asPhones(raw: unknown): string[] {
  return Array.isArray(raw) ? (raw as unknown[]).map(String) : [];
}

function clampPercent(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return 100;
  return Math.max(0, Math.min(100, Math.round(v)));
}

const DEFAULT_CONFIG = (restaurantId: string): CrmPilotConfig => ({
  restaurantId, mode: "SHADOW_ONLY", paused: false, minConfidence: DEFAULT_MIN_CONFIDENCE,
  abTestPercent: 100, allowlistedPhones: [], notes: null,
});

export async function getCrmPilotConfig(restaurantId: string): Promise<CrmPilotConfig> {
  try {
    const row = await prisma.crmAgentPilotConfig.findUnique({ where: { restaurantId } });
    if (!row) return DEFAULT_CONFIG(restaurantId);
    return {
      restaurantId,
      mode: asMode(row.mode),
      paused: row.paused,
      minConfidence: row.minConfidence ?? DEFAULT_MIN_CONFIDENCE,
      abTestPercent: clampPercent(row.abTestPercent),
      allowlistedPhones: asPhones(row.allowlistedPhones),
      notes: row.notes,
    };
  } catch {
    return DEFAULT_CONFIG(restaurantId);
  }
}

/**
 * TRAVA da escada do CRM — o degrau que VALE AGORA.
 *
 * `getCrmPilotConfig` devolve o degrau GRAVADO (é a verdade que a governança e o
 * painel precisam ver). Quem vai DISPARAR usa esta função: se o portão do CRM
 * não estiver verde neste instante, o piloto cai para SHADOW_ONLY e o cliente
 * recebe o SORTEIO — a mensagem sai do mesmo jeito, só que sem IA solta.
 */
export async function resolveLiveCrmPilotMode(config: CrmPilotConfig): Promise<{ mode: CrmPilotMode; demoted: boolean; reason: string }> {
  const guard = await guardStoredStage({
    agentId: "crm",
    stored: config.mode,
    safe: "SHADOW_ONLY" as CrmPilotMode,
    isElevated: (m) => m !== "SHADOW_ONLY",
  });
  return { mode: guard.effective, demoted: guard.demoted, reason: guard.reason };
}

/** Este telefone é elegível para receber a mensagem do agente AO VIVO? Nunca lança. */
export function resolveCrmPilotAccess(config: CrmPilotConfig, phone: string): CrmPilotAccess {
  if (config.paused) return { allowed: false, mode: config.mode, reason: "pausado (rollback ativo)" };
  if (config.mode === "SHADOW_ONLY") return { allowed: false, mode: config.mode, reason: "modo shadow — só sorteio" };
  if (config.mode === "ALLOWLIST") {
    const inList = isPhoneInList(phone, config.allowlistedPhones);
    return { allowed: inList, mode: config.mode, reason: inList ? "telefone na allowlist" : "fora da allowlist — sorteio" };
  }
  return { allowed: true, mode: "RESTAURANT_WIDE", reason: "aberto ao restaurante inteiro (decisão governada)" };
}

/**
 * Bucket A/B DETERMINÍSTICO: mesmo cliente cai sempre no mesmo braço (agente vs
 * sorteio), então a leitura de conversão não oscila entre ciclos. Hash estável do
 * customerId em [0,100); recebe a msg do agente quando o bucket < abTestPercent.
 */
export function crmAbPicksAgent(customerId: string, abTestPercent: number): boolean {
  const pct = clampPercent(abTestPercent);
  if (pct >= 100) return true;
  if (pct <= 0) return false;
  let h = 5381;
  for (let i = 0; i < customerId.length; i++) h = ((h << 5) + h + customerId.charCodeAt(i)) >>> 0;
  return h % 100 < pct;
}

/**
 * Piso DETERMINÍSTICO sobre a mensagem que o agente compôs — a última trava antes
 * de sair. Mesmo que o crítico do Brain deixe passar, uma mensagem que promete
 * desconto sem cupom real ou usa linguagem de spam NUNCA é enviada: degrada para
 * o sorteio. (Anti-repetição fica com a governança de dedupe do runner.)
 */
export function agentMessagePassesFloor(text: string, hasCoupon: boolean): boolean {
  if (!text.trim()) return false;
  if (detectSpamLanguage(text).length > 0) return false;
  if (!hasCoupon && impliesDiscount(text)) return false;
  return true;
}

/** Escrita interna — usada SOMENTE pela governança do piloto de CRM. */
export async function writeCrmPilotConfig(
  restaurantId: string,
  patch: Partial<{ mode: CrmPilotMode; allowlistedPhones: string[]; paused: boolean; minConfidence: number; abTestPercent: number; notes: string }>,
): Promise<void> {
  const existing = await prisma.crmAgentPilotConfig.findUnique({ where: { restaurantId } });
  const audit = patch.notes ?? "";
  const mergedNotes = existing?.notes ? `${existing.notes}\n${audit}`.slice(-2000) : audit;
  await prisma.crmAgentPilotConfig.upsert({
    where: { restaurantId },
    create: {
      restaurantId,
      mode: patch.mode ?? "SHADOW_ONLY",
      allowlistedPhones: (patch.allowlistedPhones ?? []) as never,
      paused: patch.paused ?? false,
      minConfidence: patch.minConfidence ?? DEFAULT_MIN_CONFIDENCE,
      abTestPercent: clampPercent(patch.abTestPercent ?? 100),
      notes: audit || null,
    },
    update: {
      ...(patch.mode ? { mode: patch.mode } : {}),
      ...(patch.allowlistedPhones ? { allowlistedPhones: patch.allowlistedPhones as never } : {}),
      ...(patch.paused !== undefined ? { paused: patch.paused } : {}),
      ...(patch.minConfidence !== undefined ? { minConfidence: patch.minConfidence } : {}),
      ...(patch.abTestPercent !== undefined ? { abTestPercent: clampPercent(patch.abTestPercent) } : {}),
      ...(audit ? { notes: mergedNotes } : {}),
    },
  });
}
