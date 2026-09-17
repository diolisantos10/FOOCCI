/**
 * A TELA DE CATÁLOGO, OFERTA E CHECKOUT — os planos, as propostas e o link.
 *
 * ── O QUE ELA NÃO FAZ, E É DE PROPÓSITO ─────────────────────────────────────
 *
 * Ela não cria proposta, não gera link e não manda nada no WhatsApp. É leitura.
 *
 * O caminho de envio já existe (`checkoutDaProposta.enviarPropostaNoWhatsApp`),
 * com as travas que separam prospecção de spam: janela, opt-out, freio de
 * ritmo. Abrir um segundo caminho de envio a partir de uma tela nova seria
 * criar um atalho por fora dessas travas — e a trava que se pode contornar por
 * outra porta não é trava.
 *
 * ── E A CONTA QUE NÃO SE INVENTA ────────────────────────────────────────────
 *
 * `LeadProposta.valorMensalCent` é opcional e nasce vazio. Somar propostas
 * tratando `null` como zero produziria um "pipeline" menor que a realidade, com
 * cara de número exato. Por isso toda soma desta tela vem em três partes: o
 * total em dinheiro, quantas propostas entraram nele e **quantas ficaram de
 * fora por não terem valor**.
 */

import type { Prisma, PrismaClient, SituacaoDaProposta } from "@prisma/client";
import {
  catalogoDePlanos,
  TRANSICOES_DA_PROPOSTA,
  SITUACOES_TERMINAIS_DA_PROPOSTA,
  VALIDADE_PADRAO_EM_DIAS,
  LIMITE_DE_DESCONTO_PCT,
  type ItemDoCatalogo,
} from "../propostas";

type Cliente = PrismaClient | Prisma.TransactionClient;

/** A ordem em que a proposta caminha. É a ordem das colunas da tela. */
export const ORDEM_DAS_SITUACOES: readonly SituacaoDaProposta[] = [
  "RASCUNHO",
  "ENVIADA",
  "EM_NEGOCIACAO",
  "ACEITA",
  "RECUSADA",
  "EXPIRADA",
];

export interface SomaDeValor {
  /** Em centavos, só do que tem valor gravado. */
  cents: number;
  comValor: number;
  /** Propostas sem valor. **Não entram na soma, e a tela diz quantas são.** */
  semValor: number;
}

export interface ColunaDeProposta {
  situacao: SituacaoDaProposta;
  total: number;
  soma: SomaDeValor;
  terminal: boolean;
  /** Para onde esta situação pode ir. Vazio nas terminais. */
  vaiPara: readonly SituacaoDaProposta[];
}

export interface PropostaVencendo {
  id: string;
  leadId: string;
  lead: string;
  plano: string | null;
  validaAte: string;
  /** Negativo quando já venceu. */
  diasParaVencer: number;
  valorMensalCent: number | null;
}

export interface PanoramaDaOferta {
  catalogo: ItemDoCatalogo[];
  validadePadraoEmDias: number;
  limiteDeDescontoPct: number;
  colunas: ColunaDeProposta[];
  totalDePropostas: number;
  /** Propostas de pé (não terminais) que já têm data de validade. */
  vencendo: PropostaVencendo[];
  naoMedido: string[];
}

const DIA = 86_400_000;

/**
 * ⭐ O panorama da oferta, no escopo de quem pergunta.
 *
 * O `escopo` é o `where` do LEAD, aplicado por relação: `{ lead: escopo }`. O
 * SDR vê as propostas dos leads dele. Um painel de propostas sem escopo
 * entregaria o pipeline inteiro da casa a quem só pode abrir seis fichas.
 */
export async function panoramaDaOferta(
  db: Cliente,
  params: { escopo: Prisma.SiteLeadWhereInput; agora?: Date; limiteVencendo?: number },
): Promise<PanoramaDaOferta> {
  const agora = params.agora ?? new Date();
  const doEscopo: Prisma.LeadPropostaWhereInput = { lead: params.escopo };

  const [porSituacao, somas, semValor, vencendoBruto] = await Promise.all([
    db.leadProposta.groupBy({
      by: ["situacao"],
      where: doEscopo,
      _count: { _all: true },
    }),
    db.leadProposta.groupBy({
      by: ["situacao"],
      where: { AND: [doEscopo, { valorMensalCent: { not: null } }] },
      _count: { _all: true },
      _sum: { valorMensalCent: true },
    }),
    db.leadProposta.groupBy({
      by: ["situacao"],
      where: { AND: [doEscopo, { valorMensalCent: null }] },
      _count: { _all: true },
    }),
    // As que ainda estão de pé e têm relógio. Terminal não vence: já terminou.
    db.leadProposta.findMany({
      where: {
        AND: [
          doEscopo,
          { situacao: { notIn: [...SITUACOES_TERMINAIS_DA_PROPOSTA] } },
          { validaAte: { not: null } },
        ],
      },
      orderBy: { validaAte: "asc" },
      take: params.limiteVencendo ?? 20,
      select: {
        id: true,
        leadId: true,
        plano: true,
        validaAte: true,
        valorMensalCent: true,
        lead: { select: { nome: true } },
      },
    }),
  ]);

  const totalPor = new Map(porSituacao.map((s) => [s.situacao, s._count._all]));
  const somaPor = new Map(somas.map((s) => [s.situacao, s]));
  const semValorPor = new Map(semValor.map((s) => [s.situacao, s._count._all]));

  const colunas: ColunaDeProposta[] = ORDEM_DAS_SITUACOES.map((situacao) => {
    const s = somaPor.get(situacao);
    return {
      situacao,
      total: totalPor.get(situacao) ?? 0,
      soma: {
        cents: s?._sum.valorMensalCent ?? 0,
        comValor: s?._count._all ?? 0,
        semValor: semValorPor.get(situacao) ?? 0,
      },
      terminal: SITUACOES_TERMINAIS_DA_PROPOSTA.includes(situacao),
      vaiPara: TRANSICOES_DA_PROPOSTA[situacao],
    };
  });

  const totalDePropostas = colunas.reduce((t, c) => t + c.total, 0);

  const vencendo: PropostaVencendo[] = vencendoBruto.map((p) => ({
    id: p.id,
    leadId: p.leadId,
    lead: p.lead.nome,
    plano: p.plano,
    validaAte: p.validaAte!.toISOString(),
    diasParaVencer: Math.floor((p.validaAte!.getTime() - agora.getTime()) / DIA),
    valorMensalCent: p.valorMensalCent,
  }));

  const naoMedido: string[] = [];
  if (totalDePropostas === 0) {
    naoMedido.push(
      "Nenhuma proposta registrada no seu escopo. O quadro fica vazio — e vazio aqui é ausência de proposta, não proposta de valor zero.",
    );
  }
  const totalSemValor = colunas.reduce((t, c) => t + c.soma.semValor, 0);
  if (totalSemValor > 0) {
    naoMedido.push(
      `${totalSemValor} proposta(s) sem valor gravado ficaram FORA de toda soma desta tela. ` +
        "`valorMensalCent` é opcional e nasce vazio; contá-las como zero encolheria o pipeline com cara de número exato.",
    );
  }

  return {
    catalogo: catalogoDePlanos(),
    validadePadraoEmDias: VALIDADE_PADRAO_EM_DIAS,
    limiteDeDescontoPct: LIMITE_DE_DESCONTO_PCT,
    colunas,
    totalDePropostas,
    vencendo,
    naoMedido,
  };
}
