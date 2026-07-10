/**
 * QualityGovernanceBridge — o produtor AUTOMÁTICO do Brain Director.
 *
 * Fecha o elo "auditor acha → governança registra": quando a auditoria diária
 * detecta um NOVO P0 (regressão crítica), um BrainChangeRequest MEDIUM é
 * arquivado automaticamente (requestedByType TRAINING_CENTER) — entrando
 * PENDING_APPROVAL como tudo que não é humano. Nada é aplicado; um humano
 * decide. Dedupe por runId garante que a mesma regressão nunca abre dois
 * pedidos. Best-effort: falha aqui jamais derruba o cron de qualidade.
 */

import { prisma } from "@/lib/prisma";
import { deriveInternalAlerts, type AlertRunLike } from "@/services/quality/internalAlerts";
import { createChangeRequest } from "../director/PersistentBrainDirectorService";

export interface AutoFileResult {
  filed: string[]; // ids dos CRs criados
  skippedDuplicates: number;
  runtimeTouched: false;
}

/**
 * Compara as duas auditorias mais recentes; NOVO P0 → CR automático.
 * Chamado pelo cron de qualidade logo após persistir a rodada.
 */
export async function autoFileGovernanceForLatestRun(): Promise<AutoFileResult> {
  const empty: AutoFileResult = { filed: [], skippedDuplicates: 0, runtimeTouched: false };
  try {
    const { listHistory } = await import("@/services/quality/persistence/QualityAuditStore");
    const history = await listHistory(2);
    if (history.length < 2) return empty;

    const runs: AlertRunLike[] = history.map((r) => ({
      id: r.id,
      globalStatus: r.globalStatus as AlertRunLike["globalStatus"],
      countsBySeverity: (r.countsBySeverity ?? {}) as AlertRunLike["countsBySeverity"],
      createdAt: r.createdAt.toISOString(),
    }));

    const alerts = deriveInternalAlerts(runs, 1).filter((a) => a.type === "NEW_P0");
    if (!alerts.length) return empty;

    const result: AutoFileResult = { filed: [], skippedDuplicates: 0, runtimeTouched: false };
    for (const alert of alerts) {
      // Dedupe: a mesma rodada nunca abre dois pedidos.
      const existing = await prisma.brainChangeRequest
        .findFirst({ where: { metadata: { path: ["qualityRunId"], equals: alert.runId } }, select: { id: true } })
        .catch(() => null);
      if (existing) {
        result.skippedDuplicates += 1;
        continue;
      }

      const cr = await createChangeRequest({
        requestedByType: "TRAINING_CENTER",
        requestedById: "quality-auditor",
        target: "TRAINING_RULE",
        summary: `Novo P0 na auditoria de qualidade — ${alert.title}`,
        rationale:
          `${alert.summary} Detectado automaticamente pelo auditor diário (run ${alert.runId}, ` +
          `anterior ${alert.previousRunId}). Requer decisão humana: corrigir a causa, criar regra de ` +
          `treino ou ajustar o gate. Nada foi alterado no runtime.`,
        riskLevel: "MEDIUM",
        runtimeImpact: "NONE",
        metadata: { qualityRunId: alert.runId, previousRunId: alert.previousRunId, alertType: alert.type, autoFiled: true },
      });
      result.filed.push(cr.id);
      console.log(`[QualityGovernanceBridge] NOVO P0 → BrainChangeRequest ${cr.id} arquivado (PENDING_APPROVAL)`);
    }
    return result;
  } catch (err) {
    console.error("[QualityGovernanceBridge] auto-file failed:", err instanceof Error ? err.message : err);
    return empty;
  }
}
