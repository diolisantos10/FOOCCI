/**
 * COMO SE ACHA O LEAD DE UM TELEFONE — uma régua só, para a casa inteira.
 *
 * ── O DEFEITO QUE ISTO EXISTE PARA MATAR ────────────────────────────────────
 *
 * A prospecção casava item↔lead por **igualdade exata** de `whatsappDigits`. A
 * base não é uniforme: os leads antigos foram preenchidos por um backfill em SQL
 * cru (`20260805120000`) que concatenava `'55' || regexp_replace(...)` — sem
 * tirar o zero da operadora e sem tratar DDI. O mesmo telefone existe na base
 * como `5511987654321` e como `55011987654321`.
 *
 * O efeito não era uma busca que falha: era uma trava que **destrava**. Um lead
 * que PEDIU SILÊNCIO, gravado no formato legado, não seria encontrado — o item
 * entraria como novo, o portão receberia `optOutAt: null` com
 * `historicoConhecido: true`, e liberaria a abordagem **com convicção**.
 *
 * ── ⚠️ E A PRIMEIRA CORREÇÃO ESTAVA LARGA DEMAIS ────────────────────────────
 *
 * A tentativa anterior comparava só os **oito dígitos finais**. Ela resolvia o
 * formato legado e criava outro defeito, que a jornada contra Postgres pegou na
 * primeira execução: os oito finais **não têm DDD**. `(11) 93333-4444` e
 * `(21) 93333-4444` são duas pessoas diferentes e casavam como a mesma — o
 * contato prospectado grudava na carteira de um cliente alheio, silenciosamente.
 *
 * ── A RÉGUA QUE FICOU ───────────────────────────────────────────────────────
 *
 * Em vez de afrouxar a comparação, **enumeram-se os formatos**. A partir do
 * telefone canônico geram-se as grafias em que ele pode estar gravado (com e sem
 * DDI, com e sem o zero da operadora, com e sem o nono dígito) e a busca é por
 * igualdade contra esse conjunto.
 *
 * Isso é tolerante ao legado E preciso: o DDD entra em todas as variantes, então
 * dois números de DDDs diferentes nunca colidem. E continua sendo uma consulta
 * indexada — igualdade num conjunto pequeno, não varredura por sufixo.
 */

import type { PrismaClient, Prisma } from "@prisma/client";

type Cliente = PrismaClient | Prisma.TransactionClient;

/**
 * As grafias possíveis do mesmo telefone.
 *
 * Recebe o formato canônico desta casa (`55` + DDD + local, como
 * `analisarWhatsappBr` devolve) e enumera como ele pode ter sido gravado.
 */
export function grafiasDoTelefone(digitos: string | null | undefined): string[] {
  const bruto = (digitos ?? "").trim();

  // As linhas sem telefone utilizável recebem `invalido:<uuid>` como chave. Um
  // UUID tem dígitos: deixar passar faria a extração produzir um número
  // qualquer e sair procurando lead por ele.
  if (bruto.startsWith("invalido:")) return [];

  const so = bruto.replace(/\D/g, "");
  if (so.length < 10) return [];

  // Descasca o DDI para chegar ao nacional (DDD + local).
  const nacional = so.startsWith("55") && (so.length === 12 || so.length === 13) ? so.slice(2) : so;
  if (nacional.length !== 10 && nacional.length !== 11) return [];

  const ddd = nacional.slice(0, 2);
  const local = nacional.slice(2);

  // O nono dígito: um mesmo assinante aparece com e sem ele em bases antigas.
  const locais = new Set<string>([local]);
  if (local.length === 9 && local.startsWith("9")) locais.add(local.slice(1));
  if (local.length === 8) locais.add(`9${local}`);

  const grafias = new Set<string>();
  for (const l of locais) {
    const nac = `${ddd}${l}`;
    grafias.add(nac); //            11987654321
    grafias.add(`0${nac}`); //     011987654321  — zero da operadora
    grafias.add(`55${nac}`); //  5511987654321  — o canônico desta casa
    grafias.add(`550${nac}`); // 55011987654321 — o que o backfill antigo gerou
  }

  return [...grafias];
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
 * histórica do MESMO número, a carteira viva é a última.
 */
export async function acharLeadPeloTelefone(
  db: Cliente,
  whatsappDigits: string,
): Promise<LeadCasado | null> {
  const grafias = grafiasDoTelefone(whatsappDigits);
  if (grafias.length === 0) return null;

  return db.siteLead.findFirst({
    where: { whatsappDigits: { in: grafias } },
    orderBy: { createdAt: "desc" },
    select: { id: true, optOutAt: true, lastContactedAt: true },
  });
}

/** Existe algum lead para este telefone? Usado na importação. */
export async function existeLeadParaTelefone(
  db: Cliente,
  whatsappDigits: string,
): Promise<{ id: string } | null> {
  const grafias = grafiasDoTelefone(whatsappDigits);
  if (grafias.length === 0) return null;

  return db.siteLead.findFirst({
    where: { whatsappDigits: { in: grafias } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
}
