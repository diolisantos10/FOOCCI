/**
 * LiveStageGuard — a TRAVA da escada de liberação (SHADOW → ALLOWLIST → WIDE).
 *
 * O PROBLEMA QUE ESTE ARQUIVO FECHA
 * ---------------------------------
 * Até aqui a escada era uma CATRACA: o portão de qualidade era consultado no
 * momento de SUBIR (freeFormGovernance.runFreeFormGates,
 * WaiterRuntimeVersionService.activateVersion) e nunca mais. Depois da subida,
 * o degrau alto era lido direto do banco — `mode`, `scope`, `isActive` — sem
 * ninguém perguntar se o portão AINDA estava verde. Portão que fica vermelho
 * depois da subida não derrubava nada: só um humano, apertando rollback.
 *
 * Aqui a pergunta muda de lugar. O degrau alto passa a ser CONDICIONAL ao
 * veredito verde NO MOMENTO DA CHAMADA. Vermelho, vencido, ilegível ou ausente
 * ⇒ o agente cai sozinho para o degrau seguro, sem humano no meio.
 *
 * FALHA FECHADA, SEMPRE
 * ---------------------
 * Qualquer coisa que não seja um veredito POSITIVO, FRESCO e COM PROVA no dado
 * derruba o degrau:
 *   • sem run persistida para o agente        → degrau seguro
 *   • run sem NENHUM achado daquele auditor   → degrau seguro ("não estourou"
 *                                               não é verde)
 *   • qualquer achado P0 ou FAIL              → degrau seguro
 *   • veredito mais velho que a validade      → degrau seguro
 *   • banco fora do ar / erro / dado ilegível → degrau seguro
 *
 * O QUE A TRAVA NUNCA FAZ: CALAR O AGENTE
 * ---------------------------------------
 * Cair de degrau não é desligar. O degrau seguro de cada escada continua
 * atendendo o cliente final — o Garçom volta ao runtime CURRENT, o
 * recepcionista determinístico segue respondendo, o Pedido por Texto volta à
 * lista liberada, o CRM volta ao sorteio. A régua aperta; a boca não fecha.
 */

import { getLatestAgentVerdictRow } from "@/services/quality/persistence/QualityAuditStore";

/**
 * VALIDADE DO VEREDITO — por que 30 horas.
 *
 * A auditoria roda por cron UMA VEZ POR DIA (POST /api/cron/quality/run, "a
 * fresh audit every morning"). Logo, a idade normal de um veredito saudável vai
 * de 0h (acabou de rodar) a ~24h (véspera da próxima rodada). Um teto de 24h
 * cravado derrubaria a escada todo dia nos minutos antes do cron — barulho, não
 * segurança. 30h = a cadência de 24h + 6h de folga para atraso/retry do cron.
 *
 * Passou de 30h, a leitura é OUTRA: o cron parou. E cron parado significa que
 * ninguém está mais medindo este agente — a afirmação "está verde" perdeu o
 * lastro. Afirmação medida tem prazo: vencida, não vale. Cair de degrau com o
 * medidor quebrado é o comportamento certo, não um falso positivo.
 */
export const VERDICT_MAX_AGE_HOURS = 30;

/**
 * Cache em processo do veredito (60s). O degrau é lido POR MENSAGEM: sem isto,
 * cada mensagem de cliente viraria uma consulta ao banco. 60s também é o atraso
 * MÁXIMO entre o portão ficar vermelho e a escada cair — pequeno o bastante
 * para ser uma trava, grande o bastante para não pesar. O cache guarda o
 * veredito COMPLETO (inclusive o negativo), então falha fechada não vira
 * tempestade de consulta.
 */
export const VERDICT_CACHE_TTL_MS = 60_000;

export interface AgentQualityVerdict {
  /** true SÓ com veredito positivo, fresco e provado no dado. */
  green: boolean;
  /** Motivo legível — vai para o log/warning de quem foi derrubado. */
  reason: string;
  /** Quando o veredito foi medido (null = não há veredito). */
  measuredAt: Date | null;
  ageHours: number | null;
}

const cache = new Map<string, { at: number; verdict: AgentQualityVerdict }>();

/** Só para teste: limpa o cache em processo. */
export function __clearVerdictCache(): void {
  cache.clear();
}

function red(reason: string, measuredAt: Date | null = null, ageHours: number | null = null): AgentQualityVerdict {
  return { green: false, reason, measuredAt, ageHours };
}

/**
 * O veredito de qualidade vigente de um agente. NUNCA lança: erro vira vermelho.
 * `loadRow` é injetável para teste — nada mais.
 */
export async function getAgentQualityVerdict(
  agentId: string,
  opts: { now?: Date; loadRow?: typeof getLatestAgentVerdictRow; useCache?: boolean } = {},
): Promise<AgentQualityVerdict> {
  const now = opts.now ?? new Date();
  const useCache = opts.useCache !== false && !opts.loadRow && !opts.now;

  if (useCache) {
    const hit = cache.get(agentId);
    if (hit && now.getTime() - hit.at < VERDICT_CACHE_TTL_MS) return hit.verdict;
  }

  const verdict = await computeVerdict(agentId, now, opts.loadRow ?? getLatestAgentVerdictRow);
  if (useCache) cache.set(agentId, { at: now.getTime(), verdict });
  return verdict;
}

async function computeVerdict(
  agentId: string,
  now: Date,
  loadRow: typeof getLatestAgentVerdictRow,
): Promise<AgentQualityVerdict> {
  let row: Awaited<ReturnType<typeof getLatestAgentVerdictRow>>;
  try {
    row = await loadRow(agentId);
  } catch (err) {
    // Serviço de qualidade fora do ar. Não saber é o mesmo que não estar verde.
    const detail = err instanceof Error ? err.message.slice(0, 120) : "erro";
    return red(`veredito de qualidade ILEGÍVEL para "${agentId}" (${detail}) — degrau seguro`);
  }

  if (!row) {
    return red(`sem veredito de qualidade persistido para "${agentId}" — degrau seguro`);
  }

  // Prova no dado: uma run que não produziu NENHUM achado deste auditor não diz
  // nada sobre ele. Ausência de achado não é aprovação.
  if (!Array.isArray(row.findings) || row.findings.length === 0) {
    return red(`run ${row.runId} não tem achado nenhum de "${agentId}" — sem prova, degrau seguro`, row.finishedAt);
  }

  const measuredAt = row.finishedAt instanceof Date ? row.finishedAt : new Date(row.finishedAt);
  if (Number.isNaN(measuredAt.getTime())) {
    return red(`veredito de "${agentId}" sem data legível — degrau seguro`);
  }

  const ageHours = (now.getTime() - measuredAt.getTime()) / 3_600_000;
  if (ageHours > VERDICT_MAX_AGE_HOURS) {
    return red(
      `veredito de "${agentId}" VENCIDO (${ageHours.toFixed(1)}h > ${VERDICT_MAX_AGE_HOURS}h) — degrau seguro`,
      measuredAt,
      ageHours,
    );
  }
  // Veredito com data no futuro = relógio ou dado corrompido. Não é verde.
  if (ageHours < -1) {
    return red(`veredito de "${agentId}" com data no futuro — degrau seguro`, measuredAt, ageHours);
  }

  const blocking = row.findings.filter((f) => f.severity === "P0" || f.status === "FAIL");
  if (blocking.length > 0) {
    return red(
      `portão VERMELHO em "${agentId}": ${blocking.length} achado(s) P0/FAIL na run ${row.runId} — degrau seguro`,
      measuredAt,
      ageHours,
    );
  }

  return {
    green: true,
    reason: `portão verde em "${agentId}" (run ${row.runId}, ${ageHours.toFixed(1)}h atrás, ${row.findings.length} achado(s), 0 P0)`,
    measuredAt,
    ageHours,
  };
}

export interface GuardStoredStageInput<M extends string> {
  /** id do auditor de qualidade do agente (waiter | whatsapp | crm | ...). */
  agentId: string;
  /** O degrau GRAVADO no banco — o que alguém subiu um dia. */
  stored: M;
  /** Para onde cair. Tem que continuar atendendo o cliente final. */
  safe: M;
  /** Este degrau fala com o cliente final com IA solta? */
  isElevated: (mode: M) => boolean;
  now?: Date;
  loadRow?: typeof getLatestAgentVerdictRow;
}

export interface GuardedStage<M extends string> {
  /** O degrau que VALE AGORA. É este que o runtime deve obedecer. */
  effective: M;
  demoted: boolean;
  verdict: AgentQualityVerdict | null;
  reason: string;
}

/**
 * A TRAVA. Converte "o degrau que alguém gravou" em "o degrau que vale agora".
 *
 * Degrau já seguro não consulta nada (sem custo, sem novo ponto de falha) —
 * a trava só existe para SEGURAR o alto, nunca para impedir o baixo.
 */
export async function guardStoredStage<M extends string>(
  input: GuardStoredStageInput<M>,
): Promise<GuardedStage<M>> {
  if (!input.isElevated(input.stored)) {
    return { effective: input.stored, demoted: false, verdict: null, reason: "degrau já seguro — trava não se aplica" };
  }

  const verdict = await getAgentQualityVerdict(input.agentId, { now: input.now, loadRow: input.loadRow });
  if (verdict.green) {
    return { effective: input.stored, demoted: false, verdict, reason: verdict.reason };
  }

  return {
    effective: input.safe,
    demoted: true,
    verdict,
    reason: `QUEDA AUTOMÁTICA DE DEGRAU ${input.stored} → ${input.safe}: ${verdict.reason}`,
  };
}
