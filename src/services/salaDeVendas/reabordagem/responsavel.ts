/**
 * QUEM RESPONDE PELAS MENSAGENS DA CAMPANHA.
 *
 * `abordarLead` e `registrarSaida` exigem `autorUserId` sem valor padrão, e com
 * razão: toda mensagem que sai em nome da empresa tem um responsável, e "o
 * sistema mandou" não é resposta para o dia em que alguém perguntar quem falou
 * com aquela pessoa.
 *
 * A campanha usa o agente da **Retomada** — "volta em quem parou de responder"
 * —, que é literalmente este trabalho. O time já é peça do sistema
 * (`garantirTimeNoSistema`): não se cria usuário novo para a campanha.
 *
 * ⚠️ Falha fechada: sem responsável, a campanha NÃO roda. Mandar mensagem sem
 * autor é exatamente o que a casa decidiu não fazer.
 */

import type { PrismaClient } from "@prisma/client";
import { garantirTimeNoSistema } from "../garantirTime";
import { TIME_DE_AGENTES } from "../timeDeAgentes";

/** "Retomada — volta em quem parou de responder". */
export const SLUG_DO_RESPONSAVEL = "agente-4";

export async function responsavelPelaCampanha(
  db: PrismaClient,
): Promise<{ ok: true; autorUserId: string } | { ok: false; motivo: string }> {
  const agente = TIME_DE_AGENTES.find((a) => a.slug === SLUG_DO_RESPONSAVEL);
  if (!agente) {
    return { ok: false, motivo: `o agente ${SLUG_DO_RESPONSAVEL} não está no time da Sala` };
  }

  await garantirTimeNoSistema(db);

  const usuario = await db.internalUser.findUnique({
    where: { email: agente.email },
    select: { id: true },
  });

  if (!usuario) {
    return {
      ok: false,
      motivo:
        `o agente da retomada (${agente.email}) não existe no sistema e não pôde ser criado. ` +
        "Sem responsável, a campanha não manda mensagem nenhuma.",
    };
  }

  return { ok: true, autorUserId: usuario.id };
}
