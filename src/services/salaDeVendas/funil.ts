/**
 * AS REGRAS DO FUNIL NA SALA DE VENDAS.
 *
 * ── O QUE ESTE ARQUIVO ACRESCENTA A `foocci-crm` ────────────────────────────
 *
 * `foocciCrmFunnel.ts` define a régua (quais etapas existem, em que ordem) e
 * `FoocciCrmService.moverEtapa` faz o movimento de forma atômica, com histórico.
 * Nada disso é reescrito aqui.
 *
 * O que faltava, e é o item 6 do comando, são as REGRAS DE NEGÓCIO do movimento:
 *
 *   - perdido exige motivo estruturado;
 *   - ganho precisa deixar a venda pronta para a implantação;
 *   - arrastar no Kanban precisa ser validado, não aceito de qualquer jeito;
 *   - entrar e sair de etapa dispara efeitos.
 *
 * Elas moram separadas porque mudam com a operação comercial, e o movimento
 * atômico não pode mudar junto.
 *
 * ── A REGRA QUE PARECE BUROCRACIA E NÃO É ───────────────────────────────────
 *
 * *"Não permitir fechamento como perdido sem motivo."*
 *
 * Motivo de perda em texto livre não vira relatório: cada vendedor escreve
 * "caro", "achou caro", "preço" e "sem verba", e a pergunta que paga a próxima
 * decisão de produto — *o que mais nos faz perder?* — fica sem resposta. Por
 * isso o motivo é uma chave estrangeira para um catálogo, e não uma nota.
 */

import type { Prisma, PrismaClient, SiteLeadStage, LeadAtendidoPor } from "@prisma/client";
import { SEQUENCIA_FUNIL, indiceEtapa, ROTULO_ETAPA } from "@/services/foocci-crm/foocciCrmFunnel";

type Cliente = PrismaClient | Prisma.TransactionClient;

/** As etapas que encerram o ciclo. */
export const ETAPAS_TERMINAIS: readonly SiteLeadStage[] = ["GANHO", "PERDIDO", "NUTRICAO"];

export function ehTerminal(e: SiteLeadStage): boolean {
  return ETAPAS_TERMINAIS.includes(e);
}

// ── Validação do movimento ───────────────────────────────────────────────────

export interface PedidoDeMovimento {
  de: SiteLeadStage;
  para: SiteLeadStage;
  /** Obrigatório para PERDIDO. */
  motivoPerdaId?: string | null;
  /** Texto de apoio; nunca substitui o motivo estruturado. */
  nota?: string | null;
  /** O gerente pode fazer movimentos que o SDR não pode. */
  ehGerente?: boolean;
}

export interface RecusaDeMovimento {
  campo: string;
  motivo: string;
}

/**
 * O movimento é permitido?
 *
 * ── POR QUE PULAR ETAPA É PERMITIDO, E VOLTAR TAMBÉM ────────────────────────
 *
 * Um funil que só anda de um em um obriga o vendedor a mentir: a demonstração
 * que virou fechamento na mesma ligação passaria por três cliques em etapas que
 * nunca existiram, e o relatório de conversão contaria três degraus que
 * ninguém subiu.
 *
 * Voltar também é permitido, porque acontece de verdade: quem "ia fechar" volta
 * para negociação, e proibir isso faria o vendedor deixar o lead na etapa
 * errada — que é pior do que registrar o retrocesso.
 *
 * O que NÃO se permite é sair de uma terminal sem ser gerente. GANHO virou
 * contrato; PERDIDO entrou em relatório. Desfazer é correção, e correção tem
 * dono.
 */
export function validarMovimento(p: PedidoDeMovimento): RecusaDeMovimento[] {
  const recusas: RecusaDeMovimento[] = [];

  if (p.de === p.para) {
    recusas.push({ campo: "para", motivo: "o contato já está nesta etapa" });
    return recusas;
  }

  if (ehTerminal(p.de) && !p.ehGerente) {
    recusas.push({
      campo: "de",
      motivo: `sair de "${ROTULO_ETAPA[p.de]}" é correção, e só o gerente faz`,
    });
  }

  if (p.para === "PERDIDO" && !p.motivoPerdaId) {
    recusas.push({
      campo: "motivoPerdaId",
      motivo: "perda sem motivo estruturado não vira relatório, e a pergunta 'o que mais nos faz perder' fica sem resposta",
    });
  }

  return recusas;
}

// ── O que acontece ao entrar numa etapa ──────────────────────────────────────

export interface EfeitoDeEntrada {
  /** Sugestão de próxima ação, em horas a partir de agora. `null` = nenhuma. */
  proximaAcaoEmHoras: number | null;
  proximaAcaoNota: string | null;
  /** Sai da fila de cobrança automática. */
  encerraCadencias: boolean;
  /** Marca que esta venda está pronta para seguir para implantação. */
  preparaImplantacao: boolean;
}

/**
 * O que cada etapa exige depois que o lead entra nela.
 *
 * ── A REGRA GERAL, E ELA É DO COMANDO ───────────────────────────────────────
 *
 * *"Nenhum lead em aberto deve ficar sem responsável e sem próxima ação."*
 *
 * Por isso toda etapa não-terminal devolve um prazo. Um lead sem próxima ação é
 * invisível: não aparece em nenhuma fila de cobrança, e some até alguém lembrar
 * dele — que na prática quer dizer nunca.
 */
export function efeitoDeEntrar(etapa: SiteLeadStage): EfeitoDeEntrada {
  switch (etapa) {
    case "NOVO":
      // Prazo curto: é o único momento em que a velocidade muda a conversão de
      // forma comprovada, e é o SLA de primeira resposta.
      return { proximaAcaoEmHoras: 1, proximaAcaoNota: "Fazer o primeiro contato", encerraCadencias: false, preparaImplantacao: false };

    case "PRIMEIRO_CONTATO":
      return { proximaAcaoEmHoras: 24, proximaAcaoNota: "Retomar se não responder", encerraCadencias: false, preparaImplantacao: false };

    case "EM_QUALIFICACAO":
      return { proximaAcaoEmHoras: 48, proximaAcaoNota: "Concluir a descoberta", encerraCadencias: false, preparaImplantacao: false };

    case "QUALIFICADO":
      return { proximaAcaoEmHoras: 24, proximaAcaoNota: "Agendar a demonstração", encerraCadencias: false, preparaImplantacao: false };

    case "DEMO_AGENDADA":
      // O prazo aqui é a confirmação, não a demo: demo marcada e não confirmada
      // é a maior fonte de não comparecimento.
      return { proximaAcaoEmHoras: 24, proximaAcaoNota: "Confirmar presença na demonstração", encerraCadencias: false, preparaImplantacao: false };

    case "DEMO_REALIZADA":
      return { proximaAcaoEmHoras: 24, proximaAcaoNota: "Enviar a proposta", encerraCadencias: false, preparaImplantacao: false };

    case "PROPOSTA_ENVIADA":
      return { proximaAcaoEmHoras: 48, proximaAcaoNota: "Retomar a proposta", encerraCadencias: false, preparaImplantacao: false };

    case "EM_NEGOCIACAO":
      return { proximaAcaoEmHoras: 24, proximaAcaoNota: "Fechar ou entender o que falta", encerraCadencias: false, preparaImplantacao: false };

    case "GANHO":
      // Item 6: "Ganho deve preparar o handoff futuro para implantação."
      // O handoff em si é do departamento 2 e não existe ainda — o que existe é
      // a marcação e a tarefa, para a venda não morrer entre as duas áreas.
      return { proximaAcaoEmHoras: 24, proximaAcaoNota: "Passar para implantação", encerraCadencias: true, preparaImplantacao: true };

    case "PERDIDO":
      return { proximaAcaoEmHoras: null, proximaAcaoNota: null, encerraCadencias: true, preparaImplantacao: false };

    case "NUTRICAO":
      // Noventa dias. NUTRICAO sem data de volta é o mesmo que perdido, só que
      // sem ninguém admitir — e a lista cresce sem nunca ser trabalhada.
      return { proximaAcaoEmHoras: 24 * 90, proximaAcaoNota: "Retomar contato", encerraCadencias: true, preparaImplantacao: false };

    default:
      return { proximaAcaoEmHoras: null, proximaAcaoNota: null, encerraCadencias: false, preparaImplantacao: false };
  }
}

// ── O movimento, com as regras aplicadas ─────────────────────────────────────

export type ResultadoDoMovimento =
  | { ok: true; de: SiteLeadStage; para: SiteLeadStage; em: Date }
  | { ok: false; recusas: RecusaDeMovimento[] }
  | { ok: false; causa: "naoExiste" }
  | { ok: false; causa: "mudouAntes"; agoraEsta: SiteLeadStage };

/**
 * Move o lead de etapa aplicando as regras da Sala.
 *
 * ── POR QUE A ESCRITA É CONDICIONAL NA ETAPA DE ORIGEM ──────────────────────
 *
 * Duas pessoas arrastando o mesmo cartão no Kanban ao mesmo tempo é o caso
 * comum, não o exótico — o gerente reorganiza a coluna enquanto o SDR atualiza a
 * conversa. Sem a condição, o segundo movimento sobrescreve o primeiro e o
 * histórico registra uma transição que nunca existiu ("de QUALIFICADO para
 * GANHO" quando o lead já estava em PROPOSTA_ENVIADA).
 */
export async function moverNaSala(
  db: PrismaClient,
  params: {
    leadId: string;
    para: SiteLeadStage;
    actor: string;
    motivoPerdaId?: string | null;
    nota?: string | null;
    ehGerente?: boolean;
    agora?: Date;
  },
): Promise<ResultadoDoMovimento> {
  const lead = await db.siteLead.findUnique({
    where: { id: params.leadId },
    select: { id: true, stage: true },
  });
  if (!lead) return { ok: false, causa: "naoExiste" };

  const recusas = validarMovimento({
    de: lead.stage,
    para: params.para,
    motivoPerdaId: params.motivoPerdaId,
    nota: params.nota,
    ehGerente: params.ehGerente,
  });
  if (recusas.length) return { ok: false, recusas };

  const agora = params.agora ?? new Date();
  const efeito = efeitoDeEntrar(params.para);

  const proximaAcaoEm = efeito.proximaAcaoEmHoras === null
    ? null
    : new Date(agora.getTime() + efeito.proximaAcaoEmHoras * 3_600_000);

  const resultado = await db.$transaction(async (tx) => {
    const alterados = await tx.siteLead.updateMany({
      // A etapa de origem vai DENTRO do where: é o que impede dois arrastes
      // simultâneos de gravarem duas transições contraditórias.
      where: { id: params.leadId, stage: lead.stage },
      data: {
        stage: params.para,
        stageChangedAt: agora,
        stageChangedBy: params.actor,
        lastInteractionAt: agora,
        motivoPerdaId: params.para === "PERDIDO" ? params.motivoPerdaId! : null,
        proximaAcaoEm,
        proximaAcaoNota: efeito.proximaAcaoNota,
      },
    });

    if (alterados.count !== 1) return null;

    await tx.siteLeadInteraction.create({
      data: {
        leadId: params.leadId,
        tipo: "MUDANCA_ETAPA",
        fromStage: lead.stage,
        toStage: params.para,
        actor: params.actor,
        nota: params.nota?.trim() || null,
        createdAt: agora,
      },
    });

    if (efeito.encerraCadencias) {
      await tx.leadCadencia.updateMany({
        where: { leadId: params.leadId, situacao: "ATIVA" },
        data: {
          situacao: "CONCLUIDA",
          motivoDaSaida: `lead foi para ${ROTULO_ETAPA[params.para]}`,
        },
      });
    }

    if (efeito.preparaImplantacao) {
      await tx.leadTarefa.create({
        data: {
          leadId: params.leadId,
          tipo: "OUTRO",
          titulo: "Passar a venda para implantação",
          nota:
            "Venda ganha. A implantação é do departamento 2 (Implantação e Sucesso do " +
            "Cliente) e ainda não tem entrada automática — esta tarefa existe para a " +
            "venda não morrer entre as duas áreas.",
          venceEm: proximaAcaoEm ?? agora,
          criadaPor: "SISTEMA",
        },
      });
    }

    return { de: lead.stage, para: params.para, em: agora };
  });

  if (!resultado) {
    const atual = await db.siteLead.findUnique({
      where: { id: params.leadId },
      select: { stage: true },
    });
    return { ok: false, causa: "mudouAntes", agoraEsta: atual?.stage ?? lead.stage };
  }

  return { ok: true, ...resultado };
}

// ── O Kanban ─────────────────────────────────────────────────────────────────

export interface ColunaDoKanban {
  etapa: SiteLeadStage;
  rotulo: string;
  total: number;
}

/**
 * As colunas do quadro, com contagem.
 *
 * Traz as nove da sequência mais PERDIDO e NUTRICAO no fim. As duas terminais
 * aparecem porque o vendedor precisa arrastar PARA elas — um quadro que só
 * mostra o caminho feliz obriga a sair do quadro para registrar a perda, e o que
 * não se registra no fluxo não se registra.
 */
export async function colunasDoKanban(
  db: Cliente,
  escopo: Prisma.SiteLeadWhereInput,
): Promise<ColunaDoKanban[]> {
  const contagens = await db.siteLead.groupBy({
    by: ["stage"],
    where: escopo,
    _count: { _all: true },
  });

  const por = new Map(contagens.map((c) => [c.stage, c._count._all]));
  const ordem: SiteLeadStage[] = [...SEQUENCIA_FUNIL, "PERDIDO", "NUTRICAO"];

  return ordem.map((etapa) => ({
    etapa,
    rotulo: ROTULO_ETAPA[etapa],
    total: por.get(etapa) ?? 0,
  }));
}

/**
 * Os cartões de uma coluna.
 *
 * ── POR QUE O QUADRO PRECISA DELES ──────────────────────────────────────────
 *
 * Até 26/08/2026 o funil mostrava só a CONTAGEM. Um quadro de Kanban sem cartão
 * é um relatório: informa e não deixa fazer nada. O vendedor via "3 em
 * negociação", e para mover qualquer um deles tinha que sair do quadro, achar o
 * lead na fila e abrir a ficha.
 *
 * O que não se registra no fluxo não se registra. Era exatamente por isso que a
 * etapa envelhecia: o gesto certo custava quatro telas.
 *
 * ── O TETO POR COLUNA, E POR QUE ELE EXISTE ─────────────────────────────────
 *
 * Vinte. Não é paginação, é desenho: uma coluna com trezentos cartões não é um
 * quadro que alguém trabalha — é uma lista, e lista tem tela própria (as Filas).
 * O quadro serve para ver o que está EM MOVIMENTO e mexer nisso.
 *
 * A contagem cheia continua vindo à parte, e a tela diz quantos ficaram de fora.
 * Truncar em silêncio faria o total parecer errado.
 */
export interface CartaoDoFunil {
  id: string;
  nome: string;
  restaurante: string | null;
  /** Quando alguém falou com ele pela última vez. Null = ninguém falou. */
  ultimaInteracaoEm: Date | null;
  /** Null quando ninguém pontuou ainda — e null NÃO é zero (guardrail 1). */
  score: number | null;
  /** Quem está com ele agora — o que impede duas pessoas na mesma conversa. */
  atendidoPor: LeadAtendidoPor;
}

export const CARTOES_POR_COLUNA = 20;

/**
 * Os cartões de cada coluna, no escopo de quem pergunta.
 *
 * ⚠️ O `escopo` é o MESMO que governa a contagem. Um quadro que mostrasse
 * cartões fora do escopo entregaria ao vendedor um lead que ele não pode abrir —
 * e ele descobriria isso ao clicar, com um 403.
 *
 * Ordena pelo mais parado primeiro: numa coluna de funil, o cartão que mais
 * precisa de atenção é o que está há mais tempo sem ninguém falar com ele. Por
 * data de criação, o quadro premiaria o que acabou de chegar — que é justamente
 * o que menos corre risco.
 */
export async function cartoesDoKanban(
  db: Cliente,
  escopo: Prisma.SiteLeadWhereInput,
  porColuna = CARTOES_POR_COLUNA,
): Promise<Record<string, CartaoDoFunil[]>> {
  const ordem: SiteLeadStage[] = [...SEQUENCIA_FUNIL, "PERDIDO", "NUTRICAO"];

  const listas = await Promise.all(
    ordem.map((etapa) =>
      db.siteLead.findMany({
        where: { ...escopo, stage: etapa },
        // `nulls: "first"` é o ponto: quem NUNCA foi atendido vem antes de quem
        // foi atendido há muito tempo. Ausência de contato é mais urgente que
        // contato velho, e um `null` jogado para o fim esconde exatamente isso.
        orderBy: { lastInteractionAt: { sort: "asc", nulls: "first" } },
        take: porColuna,
        select: {
          id: true,
          nome: true,
          restaurante: true,
          lastInteractionAt: true,
          score: true,
          atendidoPor: true,
        },
      }),
    ),
  );

  const por: Record<string, CartaoDoFunil[]> = {};
  ordem.forEach((etapa, i) => {
    por[etapa] = (listas[i] ?? []).map((l) => ({
      id: l.id,
      nome: l.nome,
      restaurante: l.restaurante,
      ultimaInteracaoEm: l.lastInteractionAt,
      score: l.score,
      atendidoPor: l.atendidoPor,
    }));
  });

  return por;
}

/** Posição na régua, para a tela ordenar sem repetir a sequência. */
export function posicaoNaRegua(e: SiteLeadStage): number {
  return indiceEtapa(e as never);
}
