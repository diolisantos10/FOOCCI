/**
 * O RELÓGIO QUE NUNCA FOI LIGADO — `slaVenceEm`.
 *
 * ── O DEFEITO, MEDIDO EM 18/09/2026 ─────────────────────────────────────────
 *
 * A coluna `SiteLead.slaVenceEm` existe no schema, é LIDA em dois lugares
 * (`distribuicao.leadsComSlaEstourado` e a tela de roteamento) e **nenhuma
 * linha da casa jamais a escreveu**. O resultado é a pior forma de defeito:
 * a fila de "SLA estourado" devolvia zero, e zero ali não queria dizer
 * "ninguém está atrasado" — queria dizer "o relógio nunca foi ligado".
 * Exatamente a régua verde sobre o componente errado.
 *
 * ── POR QUE O PRAZO NASCE COM O LEAD, E NÃO NA PRIMEIRA ABORDAGEM ───────────
 *
 * O prazo mede a NOSSA demora. Se ele fosse gravado quando alguém aborda, um
 * lead que ninguém abordou jamais teria prazo — e um lead esquecido há um dia
 * é precisamente o caso que o CEO viu na tela ("Novo lead · esperando gente",
 * há 1 dia). O relógio tem de começar a correr no instante em que a pessoa
 * chega, não no instante em que nos lembramos dela.
 *
 * ── ESCRITA CONDICIONAL, E POR ISSO IDEMPOTENTE ─────────────────────────────
 *
 * `updateMany` com `slaVenceEm: null` no `where`. Reprocessar um lead não
 * empurra o prazo para a frente — empurrar o prazo seria a maneira mais
 * silenciosa possível de um lead atrasado nunca aparecer como atrasado.
 *
 * ⚠️ Este arquivo NÃO envia nada, NÃO muda dono e NÃO muda etapa. Ele liga um
 * relógio. Quem lê o relógio já existe e não muda.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

type Cliente = PrismaClient | Prisma.TransactionClient;

/**
 * Quanto tempo a casa se dá para falar com quem chegou sozinho.
 *
 * Trinta minutos, e não "um dia útil": quem preencheu um formulário está com a
 * página ainda aberta. A ordem do CEO é *"atendido em minutos, não em dias"*, e
 * um prazo que se mede em dias não distingue o lead de hoje do de ontem — que é
 * exatamente o estado que esta entrega encontrou.
 */
export const MINUTOS_PARA_A_PRIMEIRA_RESPOSTA = 30;

/** O prazo, a partir do instante em que a pessoa chegou. */
export function prazoDaPrimeiraResposta(chegouEm: Date): Date {
  return new Date(chegouEm.getTime() + MINUTOS_PARA_A_PRIMEIRA_RESPOSTA * 60_000);
}

export type ResultadoDoPrazo =
  | { marcou: true; venceEm: Date }
  /**
   * Não escreveu. Ou o lead já tinha prazo, ou ele não existe — e as duas
   * chegam como a mesma contagem `0` do `updateMany`. Não se inventa a
   * distinção: quem precisa dela pergunta ao banco.
   */
  | { marcou: false; motivo: "naoEscreveu" };

/**
 * Liga o relógio deste lead, se ele ainda não estiver ligado.
 *
 * `chegouEm` é o instante da CHEGADA (o `createdAt` do lead), nunca "agora":
 * passar "agora" para um lead de ontem daria a ele mais trinta minutos de
 * folga hoje, e o atraso de um dia desapareceria da conta.
 */
export async function marcarPrazoDePrimeiraResposta(
  db: Cliente,
  params: { leadId: string; chegouEm: Date },
): Promise<ResultadoDoPrazo> {
  const venceEm = prazoDaPrimeiraResposta(params.chegouEm);

  const alterados = await db.siteLead.updateMany({
    where: { id: params.leadId, slaVenceEm: null },
    data: { slaVenceEm: venceEm },
  });

  if (alterados.count === 1) return { marcou: true, venceEm };
  return { marcou: false, motivo: "naoEscreveu" };
}
