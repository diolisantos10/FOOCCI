/**
 * Rotina que precisa de atenção humana abre CHAMADO na Sala de Manutenção da
 * Control Room, com a evidência dentro (ordem do CEO de 04/10/2026: "isso
 * precisa parar" — a caixa de e-mail cheia de falhas).
 *
 * O workflow do GitHub lê `chamado.aberto`: aberto → termina verde, sem e-mail.
 * Não abriu → falha como antes, e o e-mail é a reserva (guardrail 2).
 */
import { abrirChamadoNaManutencao, type ResultadoDoChamado } from "./portaDoCofre";

export type ChamadoDaRotina = ResultadoDoChamado | { aberto: false; motivo: "nada_a_relatar" };

export async function abrirChamadoQuandoPrecisa(
  rotina: string,
  precisaDeAtencao: boolean,
  atencao: readonly string[],
): Promise<ChamadoDaRotina> {
  if (!precisaDeAtencao) return { aberto: false, motivo: "nada_a_relatar" };
  return abrirChamadoNaManutencao({
    gravidade: "critico",
    descricao: `${rotina}: ${atencao.join(" | ") || "precisa de atenção humana (sem detalhe)"}`,
    evidencia: `rotina ${rotina}, Foocci em produção`,
  });
}
