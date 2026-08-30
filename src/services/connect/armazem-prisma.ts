/**
 * O ARMAZÉM DO CONNECT NO BANCO — a única ponte deste kit para o Prisma.
 *
 * `despacho.ts` é puro; este arquivo é onde o banco entra. E ele entra por duas
 * portas só, ambas já existentes e ambas do laboratório de simulação:
 *
 *   `persistSimulationRun()` → grava a rodada e os cenários;
 *   `getRunDetail(runId)`    → ⭐ RELÊ a rodada, que é a prova.
 *
 * ⚠️ **Nenhuma tabela nova, e nenhuma tabela de negócio.** As duas usadas aqui
 * são as do laboratório, que declaram no próprio código: *"stores ONLY synthetic
 * simulation data + reviewable opportunities. It never writes to any business
 * table."* O domínio operacional do Foocci — pedido, WhatsApp de cliente,
 * cobrança, CRM — não é lido nem escrito por esta obra, e a forma deste arquivo
 * é onde isso se confere em dez segundos.
 *
 * ─── O FIO MORA NO `seed`, E POR QUÊ ───────────────────────────────────────
 *
 * A conversa precisa de histórico, e histórico precisa de consulta. O `seed` da
 * rodada é a semente determinística do laboratório — derivá-la de `fio#tN` faz
 * dela, ao mesmo tempo, a reprodutibilidade do ensaio e a **coluna consultável**
 * do fio. Enterrar o fio só no JSON de metadados obrigaria a varrer a tabela.
 *
 * E a consulta não é a conferência: `startsWith` é comparação de texto, então
 * toda linha que volta é reconferida em código contra o registro de caixa que
 * ela carrega (`linhaPertenceAoFio`). "O banco filtrou" não é "eu conferi".
 */

import { prisma } from "@/lib/prisma";
import { getRunDetail, persistSimulationRun } from "@/services/simulation/SimulationStore";
import type { SimulationRunResult } from "@/services/simulation/types";
import { AGENTE_DO_PILOTO } from "./cadastro";
import { prefixoDoFio, type ArmazemDoConnect, type LinhaDeRodadaLida, type RegistroDaCaixa } from "./armazem";

/** Quantos turnos anteriores do mesmo fio entram no contexto. Teto explícito. */
export const ANTECEDENTES_NO_FIO = 20;

type RunComDetalhe = NonNullable<Awaited<ReturnType<typeof getRunDetail>>>;

function linhaDeRodada(r: {
  id: string;
  agentSlug: string;
  status: string;
  seed: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  durationMs: number;
  scenariosTotal: number;
  scenariosPassed: number;
  scenariosWarning: number;
  scenariosFailed: number;
  p0Count: number;
  opportunityCount: number;
  metadata: string | null;
  scenarios?: RunComDetalhe["scenarios"];
  opportunities?: RunComDetalhe["opportunities"];
}): LinhaDeRodadaLida {
  return {
    id: r.id,
    agentSlug: r.agentSlug,
    status: String(r.status),
    seed: r.seed,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    durationMs: r.durationMs,
    scenariosTotal: r.scenariosTotal,
    scenariosPassed: r.scenariosPassed,
    scenariosWarning: r.scenariosWarning,
    scenariosFailed: r.scenariosFailed,
    p0Count: r.p0Count,
    opportunityCount: r.opportunityCount,
    metadata: r.metadata,
    cenarios: (r.scenarios ?? []).map((c) => ({
      scenarioKey: c.scenarioKey,
      status: String(c.status),
      severity: String(c.severity),
      score: c.score,
      summary: c.summary,
    })),
    oportunidades: (r.opportunities ?? []).map((o) => ({
      type: String(o.type),
      severity: String(o.severity),
      title: o.title,
      recommendation: o.recommendation,
    })),
  };
}

export function armazemDoConnectNoBanco(): ArmazemDoConnect {
  return {
    async antecedentes(fio) {
      const linhas = await prisma.agentSimulationRun.findMany({
        where: { agentSlug: AGENTE_DO_PILOTO, seed: { startsWith: prefixoDoFio(fio) } },
        orderBy: [{ startedAt: "asc" }, { id: "asc" }],
        take: ANTECEDENTES_NO_FIO,
        select: {
          id: true,
          agentSlug: true,
          status: true,
          seed: true,
          startedAt: true,
          finishedAt: true,
          durationMs: true,
          scenariosTotal: true,
          scenariosPassed: true,
          scenariosWarning: true,
          scenariosFailed: true,
          p0Count: true,
          opportunityCount: true,
          metadata: true,
        },
      });
      return linhas.map(linhaDeRodada);
    },

    async gravarRodada(resultado, registro: RegistroDaCaixa) {
      // O registro da caixa viaja nos metadados da rodada. `runtimeTouched: false`
      // é reimposto pelo próprio armazém do laboratório, depois deste objeto —
      // ninguém consegue sobrescrever a garantia por aqui.
      const runId = await persistSimulationRun(resultado as SimulationRunResult, { connect: registro });
      return { runId };
    },

    async relerRodada(runId) {
      const r = await getRunDetail(runId);
      return r ? linhaDeRodada(r) : null;
    },
  };
}
