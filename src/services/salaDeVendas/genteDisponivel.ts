/**
 * TEM GENTE PARA ATENDER AGORA? — a pergunta que ninguém fazia antes de passar
 * o bastão.
 *
 * ── O DEFEITO, NAS PALAVRAS DO QUE A TELA MOSTROU ───────────────────────────
 *
 * `passarParaGente` trocava o dono para `AGUARDANDO_HUMANO` **sem nunca
 * perguntar se existia humano**. Onde não há humano, isso não é um handoff: é
 * um abandono com formulário. O lead sai da mão da IA (que o gate 2 do TA passa
 * a calar), entra numa fila que ninguém puxa, e aparece na tela como
 * *"esperando gente"* — exatamente o estado do lead que o CEO viu parado há um
 * dia, e a origem dos 6.273 largados.
 *
 * ── O QUE CONTA COMO "DISPONÍVEL" ───────────────────────────────────────────
 *
 * Nada de novo: a MESMA leitura que a distribuição já usa (`lerCandidatos` +
 * `podeReceber`). Quem está OFFLINE, em pausa válida ou no limite de carga não
 * está disponível. Uma segunda definição de "disponível" divergiria da primeira,
 * e a que diverge é sempre a que ninguém lembra de atualizar.
 *
 * ⚠️ Este arquivo só LÊ. Ele não troca dono, não envia e não decide nada — quem
 * decide é quem pergunta.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { lerCandidatos, podeReceber, descreverInaptidao, type MotivoDaInaptidao } from "./distribuicao";

type Cliente = PrismaClient | Prisma.TransactionClient;

export interface GenteAgora {
  /** Há pelo menos uma pessoa que pode receber um lead neste instante. */
  tem: boolean;
  aptos: number;
  /** Quantas pessoas existem no time, aptas ou não. */
  noTime: number;
  /** Por que os inaptos estão inaptos — a frase que a tela mostra. */
  porQueNaoPodem: string;
}

export async function genteDisponivelAgora(db: Cliente, agora: Date): Promise<GenteAgora> {
  const candidatos = await lerCandidatos(db);

  const inaptos: Record<MotivoDaInaptidao, number> = {
    offline: 0, pausado: 0, noLimite: 0, semEspecialidade: 0, semRegiao: 0,
  };
  let aptos = 0;

  for (const c of candidatos) {
    const a = podeReceber(c, agora);
    if (a.apto) aptos += 1;
    else if (a.motivo) inaptos[a.motivo] += 1;
  }

  return {
    tem: aptos > 0,
    aptos,
    noTime: candidatos.length,
    porQueNaoPodem:
      candidatos.length === 0
        ? "não há nenhuma pessoa cadastrada com disponibilidade no time comercial"
        : descreverInaptidao(inaptos),
  };
}
