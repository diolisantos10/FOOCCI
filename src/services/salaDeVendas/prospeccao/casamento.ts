/**
 * COMO SE ACHA O LEAD DE UM TELEFONE — uma régua só, para a casa inteira.
 *
 * ── O DEFEITO QUE ISTO EXISTE PARA MATAR ────────────────────────────────────
 *
 * A prospecção casava item↔lead por **igualdade exata** de `whatsappDigits`. A
 * base não é uniforme: os leads antigos foram preenchidos por um backfill em SQL
 * cru (`20260805120000`) que concatenava `'55' || regexp_replace(...)` — sem
 * tirar o zero da operadora e sem tratar DDD 55. Um mesmo telefone existe na
 * base como `5511987654321` e como `55011987654321`.
 *
 * O efeito não é uma busca que falha: é uma trava que **destrava**. Um lead que
 * PEDIU SILÊNCIO, gravado no formato legado, não seria encontrado — o item
 * entraria como novo, o portão receberia `optOutAt: null` com
 * `historicoConhecido: true`, e liberaria a abordagem **com convicção**. A pior
 * classe de defeito desta casa: a régua verde sobre o componente errado.
 *
 * ── POR QUE OS ÚLTIMOS OITO DÍGITOS ─────────────────────────────────────────
 *
 * É a régua que o recebimento do WhatsApp já usa (`FoocciSalesInbound`), e pelo
 * mesmo motivo: os oito finais sobrevivem a DDI, ao zero da operadora e ao nono
 * dígito. Duas partes do produto perguntando "quem é este telefone?" e
 * respondendo diferente é como o opt-out se perde.
 *
 * ⚠️ Casa a MAIS, não a menos — e essa é a assimetria certa. Um falso positivo
 * aqui trata dois números parecidos como a mesma pessoa e, no pior caso, deixa
 * de abordar alguém. Um falso negativo aborda quem pediu silêncio. Entre errar
 * para o lado de falar demais e para o lado de calar, cala-se.
 */

import type { PrismaClient, Prisma } from "@prisma/client";

type Cliente = PrismaClient | Prisma.TransactionClient;

/** Os oito finais, ou `null` quando o telefone não tem o que comparar. */
export function caudaDoTelefone(digitos: string | null | undefined): string | null {
  const cauda = (digitos ?? "").replace(/\D/g, "").slice(-8);
  return cauda.length === 8 ? cauda : null;
}

export interface LeadCasado {
  id: string;
  optOutAt: Date | null;
  lastContactedAt: Date | null;
}

/**
 * Acha o lead deste telefone, tolerando os formatos legados da base.
 *
 * Devolve o mais recente quando há mais de um — se a base tem duplicata
 * histórica, a carteira viva é a última.
 */
export async function acharLeadPeloTelefone(
  db: Cliente,
  whatsappDigits: string,
): Promise<LeadCasado | null> {
  const cauda = caudaDoTelefone(whatsappDigits);
  if (!cauda) return null;

  return db.siteLead.findFirst({
    where: { whatsappDigits: { contains: cauda } },
    orderBy: { createdAt: "desc" },
    select: { id: true, optOutAt: true, lastContactedAt: true },
  });
}

/** Existe algum lead para este telefone? Usado na importação. */
export async function existeLeadParaTelefone(
  db: Cliente,
  whatsappDigits: string,
): Promise<{ id: string } | null> {
  const cauda = caudaDoTelefone(whatsappDigits);
  if (!cauda) return null;

  return db.siteLead.findFirst({
    where: { whatsappDigits: { contains: cauda } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
}
