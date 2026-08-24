/**
 * BrainFreeFormConfigService — a escada governada do raciocínio livre.
 *
 * Substitui o kill-switch hardcoded (ALLOW_BRAIN_FREE_FORM const) por config
 * por restaurante com a MESMA disciplina do Text Ordering:
 *
 *   SHADOW_ONLY (default) → ALLOWLIST (telefones do time) → RESTAURANT_WIDE
 *
 * Sem linha no banco = SHADOW_ONLY = comportamento atual de produção (o Brain
 * observa e loga; o recepcionista responde). Promoção/rollback SÓ via
 * freeFormGovernance (gates + confirm strings). Este serviço nunca lança para
 * dentro do webhook: erro de DB = SHADOW_ONLY.
 */

import { prisma } from "@/lib/prisma";
import { isPhoneInList } from "@/lib/wa-text-ordering-flag";
import { guardStoredStage } from "./LiveStageGuard";

export type FreeFormMode = "SHADOW_ONLY" | "ALLOWLIST" | "RESTAURANT_WIDE";

export interface FreeFormAccess {
  /** Pode responder AO VIVO este telefone? (nunca true em SHADOW_ONLY/paused) */
  allowed: boolean;
  mode: FreeFormMode;
  paused: boolean;
  minConfidence: number;
  reason: string;
}

export interface FreeFormConfigSnapshot {
  restaurantId: string;
  mode: FreeFormMode;
  paused: boolean;
  minConfidence: number;
  allowlistCount: number;
  notes: string | null;
}

const DEFAULT_MIN_CONFIDENCE = 0.6;

function asMode(raw: string | undefined | null): FreeFormMode {
  return raw === "ALLOWLIST" || raw === "RESTAURANT_WIDE" ? raw : "SHADOW_ONLY";
}

export async function getFreeFormConfig(restaurantId: string): Promise<FreeFormConfigSnapshot> {
  try {
    const row = await prisma.brainFreeFormConfig.findUnique({ where: { restaurantId } });
    if (!row) {
      return { restaurantId, mode: "SHADOW_ONLY", paused: false, minConfidence: DEFAULT_MIN_CONFIDENCE, allowlistCount: 0, notes: null };
    }
    const phones = Array.isArray(row.allowlistedPhones) ? (row.allowlistedPhones as string[]) : [];
    return {
      restaurantId,
      mode: asMode(row.mode),
      paused: row.paused,
      minConfidence: row.minConfidence ?? DEFAULT_MIN_CONFIDENCE,
      allowlistCount: phones.length,
      notes: row.notes,
    };
  } catch {
    return { restaurantId, mode: "SHADOW_ONLY", paused: false, minConfidence: DEFAULT_MIN_CONFIDENCE, allowlistCount: 0, notes: null };
  }
}

/** Decide o acesso deste telefone ao raciocínio livre AO VIVO. Nunca lança. */
export async function resolveFreeFormAccess(restaurantId: string, phone: string): Promise<FreeFormAccess> {
  try {
    const row = await prisma.brainFreeFormConfig.findUnique({ where: { restaurantId } });
    if (!row) return { allowed: false, mode: "SHADOW_ONLY", paused: false, minConfidence: DEFAULT_MIN_CONFIDENCE, reason: "sem config — shadow (default seguro)" };

    const storedMode = asMode(row.mode);
    const minConfidence = row.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
    if (row.paused) return { allowed: false, mode: storedMode, paused: true, minConfidence, reason: "pausado (rollback ativo)" };

    // TRAVA: o degrau gravado só vale se o portão de qualidade do recepcionista
    // estiver VERDE agora. Vermelho/vencido/ausente ⇒ SHADOW_ONLY na hora, sem
    // humano no meio. Ninguém fica sem resposta: em sombra o recepcionista
    // determinístico continua atendendo, com a régua apertada.
    const guard = await guardStoredStage({
      agentId: "whatsapp",
      stored: storedMode,
      safe: "SHADOW_ONLY" as FreeFormMode,
      isElevated: (m) => m !== "SHADOW_ONLY",
    });
    const mode = guard.effective;
    if (mode === "SHADOW_ONLY") {
      return {
        allowed: false,
        mode,
        paused: false,
        minConfidence,
        reason: guard.demoted ? guard.reason : "modo shadow — só observa",
      };
    }

    if (mode === "ALLOWLIST") {
      const phones = Array.isArray(row.allowlistedPhones) ? (row.allowlistedPhones as string[]) : [];
      const inList = isPhoneInList(phone, phones);
      return {
        allowed: inList,
        mode,
        paused: false,
        minConfidence,
        reason: inList ? "telefone na allowlist" : "fora da allowlist — shadow",
      };
    }

    return { allowed: true, mode: "RESTAURANT_WIDE", paused: false, minConfidence, reason: "aberto ao restaurante inteiro (decisão governada)" };
  } catch {
    return { allowed: false, mode: "SHADOW_ONLY", paused: false, minConfidence: DEFAULT_MIN_CONFIDENCE, reason: "erro de config — shadow (default seguro)" };
  }
}

/** Escrita interna — usada SOMENTE por freeFormGovernance/ChangeRequestApplier. */
export async function writeFreeFormConfig(
  restaurantId: string,
  patch: Partial<{ mode: FreeFormMode; allowlistedPhones: string[]; paused: boolean; minConfidence: number; notes: string }>,
): Promise<void> {
  const existing = await prisma.brainFreeFormConfig.findUnique({ where: { restaurantId } });
  const audit = patch.notes ?? "";
  const mergedNotes = existing?.notes ? `${existing.notes}\n${audit}`.slice(-2000) : audit;
  await prisma.brainFreeFormConfig.upsert({
    where: { restaurantId },
    create: {
      restaurantId,
      mode: patch.mode ?? "SHADOW_ONLY",
      allowlistedPhones: patch.allowlistedPhones ?? [],
      paused: patch.paused ?? false,
      minConfidence: patch.minConfidence ?? DEFAULT_MIN_CONFIDENCE,
      notes: audit || null,
    },
    update: {
      ...(patch.mode ? { mode: patch.mode } : {}),
      ...(patch.allowlistedPhones ? { allowlistedPhones: patch.allowlistedPhones } : {}),
      ...(patch.paused !== undefined ? { paused: patch.paused } : {}),
      ...(patch.minConfidence !== undefined ? { minConfidence: patch.minConfidence } : {}),
      ...(audit ? { notes: mergedNotes } : {}),
    },
  });
}
