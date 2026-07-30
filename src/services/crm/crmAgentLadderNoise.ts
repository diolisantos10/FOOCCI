/**
 * O que a escada do agente NÃO deve listar.
 *
 * A lista de campanhas do agente vinha crua do banco e ficava impossível de
 * operar: dezenas de linhas, quase todas inúteis. Duas famílias de ruído, e as
 * duas pelo mesmo motivo — o interruptor ali não liga coisa nenhuma:
 *
 * • `auto:` — registros que o motor de automações cria por baixo. Não são
 *   campanhas que alguém escreveu; são o rastro do robô.
 *
 * • já encerradas — SENT, COMPLETED, CANCELLED. Não vão disparar de novo.
 *
 * Determinístico e sem banco, de propósito: é regra de leitura, e regra de
 * leitura tem que ser fácil de testar e de mudar de ideia.
 */

/** Campanha encerrada não dispara mais — interruptor nela é decoração. */
export const STATUS_ENCERRADO = ["SENT", "COMPLETED", "CANCELLED"];

export interface CampanhaParaEscada {
  templateId: string | null;
  status: string;
}

export function ehRuidoNaEscada(c: CampanhaParaEscada): boolean {
  return c.templateId?.startsWith("auto:") === true || STATUS_ENCERRADO.includes(c.status);
}

/** As campanhas que merecem um interruptor, e quantas ficaram de fora. */
export function filtrarParaEscada<T extends CampanhaParaEscada>(campanhas: T[]): { vivas: T[]; ocultas: number } {
  const vivas = campanhas.filter((c) => !ehRuidoNaEscada(c));
  return { vivas, ocultas: campanhas.length - vivas.length };
}
