/**
 * AuditorDePeca — julga uma peça que a Oficina NÃO produziu.
 *
 * É o caminho barato de medir: em vez de refazer o trabalho de um agente pra
 * comparar, a gente pega o que ele já entregou e passa pelos mesmos critérios.
 * Custo zero de IA (o crítico é determinístico) e risco zero (só lê).
 *
 * Serve pra qualquer agente existente virar mensurável sem ser reescrito — é o
 * jeito honesto de descobrir se a Oficina acrescenta algo ANTES de trocar o que
 * já funciona.
 */

import type { BusinessType } from "../core/BrainTypes";
import type { Ficha, Nota } from "./OficinaTypes";
import { resolveManual } from "./HouseManual";
import { criticarResultado } from "./OutputCritic";
import { buscarVerdade } from "./TruthSource";

export interface AuditoriaInput {
  businessType: BusinessType;
  businessId: string;
  /** Qual manual julga: "restaurante", "agencia", … */
  dominio: string;
  agentId: string;
  /** O assunto, pra buscar a verdade relevante. */
  intencao: string;
  /** A peça pronta, do jeito que foi (ou seria) entregue. */
  peca: string;
  /** Formato combinado, quando se sabe ("WhatsApp, 1 linha"). */
  formato?: string;
}

export interface Auditoria {
  nota: Nota;
  /** A ficha sintética usada para julgar — auditável. */
  ficha: Ficha;
  /** Quantos fatos do banco a peça tinha à disposição. 0 = juízo fraco. */
  fatosDisponiveis: number;
}

/**
 * Julga a peça contra a verdade do negócio.
 *
 * Cuidado de leitura importante: quando `fatosDisponiveis` é 0, a verdade não
 * foi encontrada e o veredito não vale grande coisa — a peça é julgada como
 * "genérica" por falta de base de comparação, não por culpa dela. Quem lê o
 * número PRECISA descartar essas amostras, senão a medição mente.
 */
export async function auditarPeca(input: AuditoriaInput): Promise<Auditoria> {
  const { verdade } = await buscarVerdade(input.businessType, input.businessId, {
    agentId: input.agentId,
    queryHint: input.intencao,
  });

  const manual = resolveManual(input.dominio);

  // Ficha sintética: só o que o crítico do RESULTADO consulta. Não passa pelo
  // crítico do comando de propósito — não é justo cobrar de uma peça pronta um
  // briefing que nunca existiu.
  const ficha: Ficha = {
    objetivo:   input.intencao,
    publico:    "",
    tom:        "",
    formato:    input.formato ?? "",
    verdade,
    proibicoes: manual?.proibicoesPadrao ?? [],
    eixos:      {},
    assinatura: "",
  };

  return {
    nota: criticarResultado(input.peca, ficha, manual),
    ficha,
    fatosDisponiveis: Object.keys(verdade).length,
  };
}
