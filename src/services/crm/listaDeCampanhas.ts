/**
 * listaDeCampanhas — quais linhas de campanha o painel recebe.
 *
 * Medido em 27/09/2026 no Sushi Cazza: "Cliente morno" e "Cliente frio"
 * apareciam Ativas, "sem registro no período", com "Configurar e ligar". Elas
 * ESTAVAM ligadas no banco (é de lá que vem o selo Ativa) — mas a lista que
 * traz os números cortava nas 50 campanhas mais recentes, e as recorrentes
 * ligadas há mais tempo ficavam para fora do corte.
 *
 * A regra: campanha viva (ligada, pausada, enviando, rascunho) SEMPRE vem.
 * O corte de 50 vale só para o histórico.
 *
 * Módulo puro: sem banco, sem rede.
 */

/** Status que não são histórico — a campanha ainda está no painel do dono. */
export const STATUS_VIVOS = ["ACTIVE", "SCHEDULED", "SENDING", "PAUSED", "DRAFT"] as const;

/** Quantas campanhas de histórico (as mais recentes) vêm junto. */
export const HISTORICO_RECENTE = 50;

interface LinhaComData { id: string; createdAt: Date | string }

/**
 * Une as campanhas vivas com as mais recentes, sem repetir, da mais nova para
 * a mais antiga — a mesma ordem que a tela sempre recebeu.
 */
export function juntarVivasEHistorico<T extends LinhaComData>(
  vivas: readonly T[],
  recentes: readonly T[],
): T[] {
  const porId = new Map<string, T>();
  for (const c of [...recentes, ...vivas]) if (c?.id && !porId.has(c.id)) porId.set(c.id, c);
  return [...porId.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}
