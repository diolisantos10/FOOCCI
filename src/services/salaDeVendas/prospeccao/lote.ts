/**
 * O LOTE DE PROSPECÇÃO — carregar a lista sem queimar a lista.
 *
 * ── POR QUE ISTO EXISTE ─────────────────────────────────────────────────────
 *
 * A base de contatos é o ativo mais valioso desta empresa e o mais fácil de
 * destruir: bastam um disparo grande e um punhado de denúncias para o número
 * comercial ser restringido — e o número restringido não afeta só a prospecção,
 * afeta o atendimento de quem já é cliente.
 *
 * Por isso importar NÃO é abordar. São dois atos separados, com duas decisões
 * separadas: carregar (`importarLote`) é conferência; liberar (`liberarLote`) é
 * autorização, e é dela que sai a base legal declarada.
 *
 * ── O QUE ESTE ARQUIVO NÃO FAZ ──────────────────────────────────────────────
 *
 * Não envia mensagem. Não escolhe quem abordar. Não liga a prospecção. Ele
 * carrega, deduplica e registra — e nada aqui alcança o telefone de ninguém.
 */

import type { PrismaClient, Prisma } from "@prisma/client";
import { analisarWhatsappBr } from "@/lib/whatsapp-br";

type Cliente = PrismaClient | Prisma.TransactionClient;

export interface LinhaDaLista {
  nome?: string | null;
  whatsapp: string;
  empresa?: string | null;
  cidade?: string | null;
  estado?: string | null;
  tipo?: string | null;
}

export interface PedidoDeImportacao {
  nome: string;
  /** Por que temos estes contatos. Obrigatório, e é texto de gente. */
  proveniencia: string;
  linhas: LinhaDaLista[];
  criadoPor?: string | null;
  /** Teto próprio do lote. O teto global continua valendo por cima. */
  limiteDiario?: number;
}

export interface ResultadoDaImportacao {
  loteId: string;
  recebidas: number;
  aceitas: number;
  /** Telefone repetido dentro da própria planilha. */
  repetidasNoArquivo: number;
  /** Telefone que não é telefone. */
  invalidas: number;
  /** Já existe como lead na base — entra marcado, não vira carteira nova. */
  jaEramLead: number;
}

/** Teto de segurança por importação. Lista gigante entra em partes, conferida. */
export const MAX_LINHAS_POR_IMPORTACAO = 500;

export class ListaGrandeDemais extends Error {
  constructor(recebidas: number) {
    super(
      `A importação traz ${recebidas} linhas e o teto por lote é ${MAX_LINHAS_POR_IMPORTACAO}. ` +
        `Divida em lotes menores — lote grande é o que ninguém confere antes de liberar.`,
    );
    this.name = "ListaGrandeDemais";
  }
}

export class ProvenienciaAusente extends Error {
  constructor() {
    super(
      "O lote precisa declarar de onde vieram os contatos. Sem essa frase não " +
        "há como responder, depois, por que abordamos estas pessoas.",
    );
    this.name = "ProvenienciaAusente";
  }
}

/**
 * Carrega a lista num lote RASCUNHO.
 *
 * ── AS TRÊS DEDUPLICAÇÕES, E POR QUE SÃO TRÊS ───────────────────────────────
 *
 *   1. **dentro do arquivo** — a mesma planilha costuma repetir a mesma loja em
 *      duas linhas; sem isto o mesmo telefone seria abordado duas vezes;
 *   2. **contra o próprio lote no banco** — reimportar o mesmo arquivo não pode
 *      duplicar, e a trava real é o índice único `(loteId, whatsappDigits)`;
 *   3. **contra a base de leads** — quem já é lead não vira carteira nova. Ele
 *      entra como `DUPLICADO`, com o `leadId` apontando para a carteira que já
 *      existe, e é justamente isso que impede dois donos para a mesma pessoa.
 *
 * A terceira é a que evita o erro caro: prospectar como estranho alguém que já
 * está em conversa com a gente.
 */
export async function importarLote(
  db: Cliente,
  pedido: PedidoDeImportacao,
): Promise<ResultadoDaImportacao> {
  const proveniencia = pedido.proveniencia?.trim() ?? "";
  if (proveniencia === "") throw new ProvenienciaAusente();
  if (pedido.linhas.length > MAX_LINHAS_POR_IMPORTACAO) {
    throw new ListaGrandeDemais(pedido.linhas.length);
  }

  const lote = await db.loteDeProspeccao.create({
    data: {
      nome: pedido.nome.trim() || "Lote sem nome",
      proveniencia,
      criadoPor: pedido.criadoPor ?? null,
      limiteDiario: pedido.limiteDiario ?? 20,
    },
    select: { id: true },
  });

  const vistos = new Set<string>();
  let aceitas = 0;
  let repetidasNoArquivo = 0;
  let invalidas = 0;
  let jaEramLead = 0;

  for (const linha of pedido.linhas) {
    const analise = analisarWhatsappBr(linha.whatsapp ?? "");
    if (!analise.ok) {
      invalidas += 1;
      await db.itemDeProspeccao.create({
        data: {
          loteId: lote.id,
          nome: texto(linha.nome),
          whatsapp: String(linha.whatsapp ?? ""),
          // Sem dígitos válidos não há chave; o id mantém a linha única e
          // rastreável sem fingir um telefone que não existe.
          whatsappDigits: `invalido:${cryptoIdCurto()}`,
          empresa: texto(linha.empresa),
          cidade: texto(linha.cidade),
          estado: texto(linha.estado),
          tipo: texto(linha.tipo),
          situacao: "RECUSADO",
          motivo: "Telefone com formato improvável.",
          processadoEm: new Date(),
        },
      });
      continue;
    }

    const digitos = analise.digitos;

    if (vistos.has(digitos)) {
      repetidasNoArquivo += 1;
      continue;
    }
    vistos.add(digitos);

    const leadExistente = await db.siteLead.findFirst({
      where: { whatsappDigits: digitos },
      select: { id: true },
    });

    if (leadExistente) jaEramLead += 1;
    else aceitas += 1;

    await db.itemDeProspeccao.create({
      data: {
        loteId: lote.id,
        nome: texto(linha.nome),
        whatsapp: String(linha.whatsapp),
        whatsappDigits: digitos,
        empresa: texto(linha.empresa),
        cidade: texto(linha.cidade),
        estado: texto(linha.estado),
        tipo: texto(linha.tipo),
        situacao: leadExistente ? "DUPLICADO" : "PENDENTE",
        leadId: leadExistente?.id ?? null,
        motivo: leadExistente ? "Já existe como lead na base." : null,
        processadoEm: leadExistente ? new Date() : null,
      },
    });
  }

  return {
    loteId: lote.id,
    recebidas: pedido.linhas.length,
    aceitas,
    repetidasNoArquivo,
    invalidas,
    jaEramLead,
  };
}

/**
 * Libera o lote para abordagem — o ato que cria a autorização.
 *
 * A base legal declarada é a `proveniencia` do lote, e quem libera fica
 * registrado. Não existe liberar "no automático": se ninguém assinou, ninguém
 * autorizou.
 */
export async function liberarLote(
  db: Cliente,
  loteId: string,
  quem: string,
): Promise<{ ok: boolean; motivo?: string }> {
  const lote = await db.loteDeProspeccao.findUnique({
    where: { id: loteId },
    select: { situacao: true, proveniencia: true },
  });
  if (!lote) return { ok: false, motivo: "Lote não encontrado." };
  if ((lote.proveniencia ?? "").trim() === "") {
    return { ok: false, motivo: "Lote sem proveniência declarada." };
  }
  if (lote.situacao === "ENCERRADO") {
    return { ok: false, motivo: "Lote encerrado não volta a abordar." };
  }

  await db.loteDeProspeccao.update({
    where: { id: loteId },
    data: {
      situacao: "LIBERADO",
      liberadoEm: new Date(),
      liberadoPor: quem,
      // Retomar um lote pausado limpa a pausa, mas não apaga quem pausou:
      // essa história vive na trilha, não nesta linha.
      pausadoEm: null,
    },
  });

  return { ok: true };
}

/** Pausa imediata de um lote. Efeito na próxima seleção, sem deploy. */
export async function pausarLote(
  db: Cliente,
  loteId: string,
  quem: string,
): Promise<void> {
  await db.loteDeProspeccao.update({
    where: { id: loteId },
    data: { situacao: "PAUSADO", pausadoEm: new Date(), pausadoPor: quem },
  });
}

function texto(v: string | null | undefined): string | null {
  const t = typeof v === "string" ? v.trim() : "";
  return t === "" ? null : t;
}

/** Sufixo curto e único para linhas sem telefone utilizável. */
function cryptoIdCurto(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
