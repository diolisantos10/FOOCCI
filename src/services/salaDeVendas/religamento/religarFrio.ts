/**
 * ⭐ O RELIGAMENTO lead ↔ Empresa, SEM CREDENCIAL DE BANCO NA MÃO.
 *
 * ── O PROBLEMA, EM UMA FRASE ────────────────────────────────────────────────
 *
 * `npm run frio:acordar` já existe e já faz a coisa certa — mas exige
 * `DATABASE_URL`, e a senha do banco de produção não é legível por ninguém
 * fora do próprio produto. Enquanto o religamento não roda,
 * `objetivoDaProspeccao()` devolve `null` para a base inteira e a campanha sai
 * CEGA: o agente não sabe que o objetivo de um número frio é achar o
 * responsável comercial.
 *
 * Este arquivo é o MESMO trabalho, chamado de dentro do produto. Nenhuma lógica
 * nova de retrofit vive aqui: ele delega para
 * `retrofitEmpresaDosLeadsDeProspeccao` e `corrigirEtapaDosContatosFrios`, que
 * já são idempotentes e já estão em produção. Duplicar a regra aqui seria criar
 * uma segunda verdade que ninguém concilia.
 *
 * ── ⛔ ELE NÃO MANDA MENSAGEM. NENHUMA. ─────────────────────────────────────
 *
 * Nem template, nem retomada, nem "só um oi". Isto é medido por
 * `contrato.test.ts`, que lê ESTE fonte (sem comentários) e reprova qualquer
 * caminho de envio da casa. O comentário é explicação; o teste é a trava.
 *
 * ── ENSAIO É O PADRÃO ───────────────────────────────────────────────────────
 *
 * `gravar: false` (o padrão) CONTA e não escreve — nenhuma escrita é sequer
 * chamada, e isso também é medido por teste com banco falso. Um retrofit que
 * escreve por omissão é um retrofit que já rodou errado uma vez antes de
 * alguém ler a saída.
 */

import type { PrismaClient } from "@prisma/client";
import {
  retrofitEmpresaDosLeadsDeProspeccao,
  corrigirEtapaDosContatosFrios,
  type ContagemDoRetrofit,
  type ContagemDaCorrecaoDeEtapa,
} from "../prospeccao/empresaDoLead";

/**
 * As portas de entrada em que NÓS fomos atrás. A mesma lista que o retrofit
 * usa por baixo — repetida aqui só para o ENSAIO poder contar sem escrever.
 */
export const FONTES_FRIAS = ["LISTA_PROSPECCAO", "INDICACAO", "IMPORTACAO"] as const;

export interface AntesDoReligamento {
  /** Contatos frios sem `empresaId` — os que fazem o objetivo sair `null`. */
  semEmpresaLigada: number;
  /** Contatos frios ainda carimbados como "Novo lead". */
  comSeloDeNovoLead: number;
}

export type ResultadoDoReligamento =
  | { gravou: false; antes: AntesDoReligamento; aviso: string }
  | {
      gravou: true;
      antes: AntesDoReligamento;
      ligacao: ContagemDoRetrofit;
      etapa: ContagemDaCorrecaoDeEtapa;
    };

export const AVISO_DO_ENSAIO =
  "ENSAIO — nada foi escrito. Confira os números acima e repita com ?gravar=1 para valer.";

/** As duas contagens de ANTES. Só `count`: nenhuma escrita neste caminho. */
export async function contarAntes(db: PrismaClient): Promise<AntesDoReligamento> {
  const semEmpresaLigada = await db.siteLead.count({
    where: { empresaId: null, fonte: { in: [...FONTES_FRIAS] } },
  });
  const comSeloDeNovoLead = await db.siteLead.count({
    where: { stage: "NOVO", fonte: { in: [...FONTES_FRIAS] } },
  });
  return { semEmpresaLigada, comSeloDeNovoLead };
}

/**
 * Religa a base. `gravar: false` (padrão) só conta.
 *
 * Idempotente: a segunda execução com `gravar: true` devolve `ligados: 0` e
 * `corrigidos: 0` — as escritas por baixo deduplicam no banco.
 */
export async function religarConscienciaDoFrio(
  db: PrismaClient,
  opcoes: { gravar?: boolean; agora?: Date } = {},
): Promise<ResultadoDoReligamento> {
  const antes = await contarAntes(db);

  // ⚠️ A saída do ensaio acontece ANTES de qualquer escrita ser sequer chamada.
  // Não é um `if` dentro do retrofit: é o retrofit não sendo chamado.
  if (!opcoes.gravar) {
    return { gravou: false, antes, aviso: AVISO_DO_ENSAIO };
  }

  const ligacao = await retrofitEmpresaDosLeadsDeProspeccao(db, { agora: opcoes.agora });
  const etapa = await corrigirEtapaDosContatosFrios(db, { agora: opcoes.agora });

  return { gravou: true, antes, ligacao, etapa };
}
