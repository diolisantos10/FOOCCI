/**
 * AS CONVERSAS DO SDR — a coluna 2 do desenho 12.
 *
 * ── QUAIS CONVERSAS SÃO "DO SDR", E POR QUE ESTAS ───────────────────────────
 *
 * O SDR trabalha o começo: quem chegou e ninguém falou, quem nós fomos buscar,
 * quem foi abordado, quem respondeu, e quem está sendo qualificado. Do
 * QUALIFICADO em diante a conversa deixa de ser caça ao decisor e vira venda —
 * e essa já é a mesa de `/comercial/conversas`.
 *
 * Recortar por aqui não é preferência de layout: uma "Central SDR" que
 * mostrasse também negociação e proposta seria a caixa de entrada inteira com
 * outro nome, e a tela perderia a única pergunta que ela responde.
 *
 * ── ⛔ NADA AQUI É INVENTADO ────────────────────────────────────────────────
 *
 * Cada campo desta lista é uma coluna de `SiteLead` que já existe e já é
 * mantida: a prévia e a hora são o espelho da última mensagem, o contador é
 * `naoLidas`, o canal é a porta de entrada e o estado é o estágio do funil.
 * O desenho mostra logotipo de cada restaurante; nós não temos imagem de
 * empresa arquivada, então saem as INICIAIS — a mesma adaptação que a moldura
 * já faz com a foto de quem está logado.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * Os estágios que o SDR trabalha. Escritos como lista e não como "tudo antes
 * de QUALIFICADO": uma comparação por ordem do enum quebraria calada no dia em
 * que alguém inserisse um estágio no meio.
 */
export const ESTAGIOS_DO_SDR = [
  "NOVO",
  "DISPONIVEL_PARA_PROSPECCAO",
  "PRIMEIRO_CONTATO",
  "RESPONDEU",
  "EM_QUALIFICACAO",
] as const;

/** O rótulo curto de cada estágio, como a pílula do desenho o escreve. */
export const ROTULO_DO_ESTAGIO_DO_SDR: Record<string, string> = {
  NOVO: "Novo",
  DISPONIVEL_PARA_PROSPECCAO: "Base fria",
  PRIMEIRO_CONTATO: "Abordado",
  RESPONDEU: "Respondeu",
  EM_QUALIFICACAO: "Qualificando",
};

export interface ConversaDoSdr {
  leadId: string;
  /** O que aparece em negrito na linha: o restaurante, ou a pessoa. */
  titulo: string;
  /** A pessoa, quando o título já é o restaurante. */
  subtitulo: string | null;
  /** As iniciais do título — não temos logotipo de empresa arquivado. */
  iniciais: string;
  /** O espelho da última mensagem. `null` = ninguém falou ainda. */
  previa: string | null;
  /** Quando foi a última mensagem. `null` = conversa nunca começou. */
  ultimaMensagemEm: string | null;
  /** Mensagens do lead ainda não lidas por gente. */
  naoLidas: number;
  /** Por onde este contato entrou — a pílula de canal do desenho. */
  canal: string;
  estagio: string;
  rotuloDoEstagio: string;
  /**
   * `true` quando a empresa deste lead está parada num porteiro. É o que a
   * pílula "Gatekeeper" do desenho quer dizer, e ela só aparece quando a
   * empresa existe e está nesse estágio — nunca por suposição.
   */
  emGatekeeper: boolean;
}

function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primeira = partes[0]![0] ?? "";
  const ultima = partes.length > 1 ? (partes[partes.length - 1]![0] ?? "") : "";
  return (primeira + ultima).toUpperCase();
}

/**
 * Lê as conversas que o SDR trabalha, mais recentes primeiro.
 *
 * ⚠️ Ordena por `ultimaMensagemEm` com `nulls: "last"`: quem nunca trocou
 * mensagem vai para o fim. Tratado como data zero, ele iria para o começo e
 * empurraria para baixo justamente quem está falando com a gente agora.
 */
export async function lerConversasDoSdr(
  db: PrismaClient | Prisma.TransactionClient,
  opcoes: { limite: number },
): Promise<{ itens: ConversaDoSdr[]; total: number }> {
  const where: Prisma.SiteLeadWhereInput = {
    stage: { in: [...ESTAGIOS_DO_SDR] as never },
    // Quem pediu silêncio sai da mesa de trabalho. Deixá-lo na lista é a forma
    // mais fácil de alguém abrir e responder sem reparar no aviso.
    optOutAt: null,
  };

  const [linhas, total] = await Promise.all([
    db.siteLead.findMany({
      where,
      orderBy: [{ ultimaMensagemEm: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: opcoes.limite,
      select: {
        id: true,
        nome: true,
        restaurante: true,
        fonte: true,
        stage: true,
        naoLidas: true,
        ultimaMensagemEm: true,
        ultimaMensagemTexto: true,
        empresa: { select: { estagio: true } },
      },
    }),
    db.siteLead.count({ where }),
  ]);

  const itens: ConversaDoSdr[] = linhas.map((l) => {
    const titulo = l.restaurante ?? l.nome;
    return {
      leadId: l.id,
      titulo,
      subtitulo: l.restaurante ? l.nome : null,
      iniciais: iniciaisDe(titulo),
      previa: l.ultimaMensagemTexto,
      ultimaMensagemEm: l.ultimaMensagemEm ? l.ultimaMensagemEm.toISOString() : null,
      naoLidas: l.naoLidas,
      canal: String(l.fonte),
      estagio: String(l.stage),
      rotuloDoEstagio: ROTULO_DO_ESTAGIO_DO_SDR[String(l.stage)] ?? String(l.stage),
      emGatekeeper: l.empresa?.estagio === "GATEKEEPER",
    };
  });

  return { itens, total };
}
