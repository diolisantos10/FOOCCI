/**
 * A CRM IA — O PLANO DO DIA.
 *
 * ── O QUE ELA É, E O QUE ELA NÃO É ──────────────────────────────────────────
 *
 * O documento é explícito: *"A CRM IA não caça cliente. Ela é a responsável pela
 * saúde da base. Imagine ela como a Diretora de CRM digital."* E a pergunta que
 * ela responde todo dia é uma só: **quem precisa receber alguma ação hoje?**
 *
 * Não é disparador de campanha. Disparador recebe uma lista e manda. Esta varre
 * a base, classifica contato por contato pela régua de `estadoDeFollowUp.ts`, e
 * devolve as filas com **contagem real** e **receita potencial somada**.
 *
 * ── A REGRA QUE VALE MAIS QUE O NÚMERO BONITO ───────────────────────────────
 *
 * **Receita que não dá para medir aparece como não medida — jamais como zero.**
 * `Oportunidade.valorPotencialCents` é anulável de propósito (B1 escreveu isso
 * no schema: *"`null` = ninguém estimou — nunca zero por omissão"*). Somar nulo
 * como zero produziria um total menor que a verdade, com cara de verdade — e é
 * exatamente sobre esse número que alguém decide onde põe o time amanhã.
 *
 * Por isso `PlanoDoDia` carrega, ao lado de cada soma, quantos itens entraram
 * sem valor estimado. O total nunca é apresentado sozinho.
 *
 * ── O QUE ELA NÃO FAZ: MANDAR ───────────────────────────────────────────────
 *
 * O plano **sugere e enfileira**. Quem envia é o motor que já existe
 * (`abordar.ts`, com portão do lead, freio de ritmo, Supervisora e a chave
 * `FOOCCI_SDR_SEND_ENABLED`), chamado pela rodada de cadência. Se a trava
 * recusar, o item fica pendente e aparece — nunca some.
 *
 * ── ⚠️ ESTE CRM É O DA FOOCCI ───────────────────────────────────────────────
 *
 * O CRM do restaurante (o produto que o cliente usa com os clientes DELE) é
 * outra coisa, com outro tenant e outra régua. Nada aqui é generalizado para
 * servir aos dois: decisão tomada, e misturá-los faria a saúde da base comercial
 * da Foocci ser calculada com dados de consumidor final.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import {
  classificarFollowUp,
  fichaDaLinha,
  estaEsfriando,
  pedeAcao,
  SELECT_PARA_CLASSIFICAR,
  type Classificacao,
  type EstadoDeFollowUp,
  type FichaParaClassificar,
} from "./estadoDeFollowUp";
import { REGUA_DE_CHURN, avaliarRiscoDeChurn, type FichaDoCliente } from "./posVenda";
import { inscreverEmCadencia } from "../followUp";

type Cliente = PrismaClient | Prisma.TransactionClient;

// ─────────────────────────────────────────────────────────────────────────────
// O FORMATO DO PLANO
// ─────────────────────────────────────────────────────────────────────────────

export interface ItemDaFila {
  leadId: string;
  nome: string;
  estado: EstadoDeFollowUp;
  porque: string;
  /** Em centavos. `null` = ninguém estimou. Nunca zero por omissão. */
  valorPotencialCents: number | null;
}

export interface ItemDeCliente {
  clienteId: string;
  motivo: string;
  /** Receita já realizada por esta conta, em centavos. É medida, não estimada. */
  receitaTotalCents: number;
}

/**
 * Um valor somado com a sua própria honestidade ao lado.
 *
 * `semEstimativa` é a contagem de itens que entraram na fila SEM valor. Ele não
 * é um detalhe de rodapé: enquanto ele for maior que zero, `cents` é um piso,
 * não um total, e quem lê precisa saber disso.
 */
export interface SomaMedida {
  cents: number;
  comEstimativa: number;
  semEstimativa: number;
}

export interface PlanoDoDia {
  emitidoEm: Date;
  contatosAnalisados: number;
  clientesAnalisados: number;

  filas: {
    precisamDeFollowUp: ItemDaFila[];
    esfriando: ItemDaFila[];
    oportunidadesAbandonadas: ItemDaFila[];
    propostasSemRetorno: ItemDaFila[];
    reunioesPendentes: ItemDaFila[];
    chanceDeUpsell: ItemDeCliente[];
    paraReativar: ItemDeCliente[];
    riscoDeChurn: ItemDeCliente[];
  };

  /** A receita potencial das filas de lead, somada só do que foi estimado. */
  receitaPotencial: SomaMedida;

  /** Quantos contatos a régua não conseguiu classificar. Nunca escondido. */
  naoMedidos: number;

  /**
   * Quantos contatos caíram em CADA um dos estados — os catorze, inclusive os
   * zerados.
   *
   * ── POR QUE ISTO NÃO SAI DAS FILAS ─────────────────────────────────────────
   *
   * As filas acima só carregam os estados que pedem ação hoje. Quem lê o painel
   * da CRM precisa da outra metade: quantos pediram silêncio, quantos viraram
   * cliente, quantos não têm perfil. Deduzir esses números por subtração das
   * filas daria um número errado, porque um mesmo lead entra em mais de uma
   * fila. Aqui cada contato classificado conta uma vez, no estado dele.
   *
   * `NAO_MEDIDO` é o mesmo número de `naoMedidos`, repetido aqui para a tela
   * poder exibir os catorze baldes com uma varredura só.
   */
  porEstado: Record<EstadoDeFollowUp, number>;

  /**
   * A leitura bateu no teto de linhas.
   *
   * Quando é `true`, TODA contagem deste plano é um piso, não um total — e a
   * tela precisa dizer isso. Um piso estampado como total é a mentira mais cara
   * que um painel consegue contar, porque ela parece um número.
   */
  limiteAtingido: boolean;
}

/** Os catorze baldes zerados. Balde que some quando zera é balde que ninguém investiga. */
export function contagemZeradaPorEstado(): Record<EstadoDeFollowUp, number> {
  return {
    PEDIU_SILENCIO: 0,
    VIROU_CLIENTE: 0,
    VENDA_PERDIDA: 0,
    OPORTUNIDADE_FUTURA: 0,
    LEAD_SEM_PERFIL: 0,
    PAGAMENTO_ABANDONADO: 0,
    CARRINHO_ABANDONADO: 0,
    PROPOSTA_PARADA: 0,
    REUNIAO_PENDENTE: 0,
    CLIENTE_SUMIU: 0,
    PENSANDO: 0,
    NUNCA_RESPONDEU: 0,
    NAO_ABORDADO: 0,
    NAO_MEDIDO: 0,
  };
}

/** Os estados que somam em "oportunidades abandonadas" no painel. */
const ABANDONO: readonly EstadoDeFollowUp[] = ["CARRINHO_ABANDONADO", "PAGAMENTO_ABANDONADO"];

// ─────────────────────────────────────────────────────────────────────────────
// A RÉGUA DOS CLIENTES — o que o documento chama de upsell e reativação
// ─────────────────────────────────────────────────────────────────────────────

export const REGUA_DE_BASE = {
  /** Cliente ativo há pelo menos isto, sem nenhum upsell, é chance de upsell. */
  diasAtivoParaUpsell: 90,
  /** Saúde mínima para propor upsell. Conta doente não recebe oferta, recebe socorro. */
  saudeMinimaParaUpsell: 70,
} as const;

/** Chance de upsell, com regra escrita — e `saude === null` NÃO qualifica. */
export function ehChanceDeUpsell(c: FichaDoCliente, agora: Date): string | null {
  if (c.situacao !== "ATIVO") return null;
  if (!c.ativadoEm) return null;
  if (c.upsells > 0) return null;
  // ⚠️ Saúde não medida não vira oferta. Oferecer mais a quem ninguém olhou é o
  // jeito conhecido de descobrir o churn pelo e-mail de cancelamento.
  if (c.saude === null || c.saude < REGUA_DE_BASE.saudeMinimaParaUpsell) return null;

  const dias = Math.floor((agora.getTime() - c.ativadoEm.getTime()) / 86_400_000);
  if (dias < REGUA_DE_BASE.diasAtivoParaUpsell) return null;

  return `ativo há ${dias} dias, saúde ${c.saude} e nenhum upsell — conta madura e saudável sem oferta nova`;
}

/** Para reativar: parou de usar e não cancelou. */
export function ehParaReativar(c: FichaDoCliente): string | null {
  if (c.situacao !== "INATIVO") return null;
  return "parou de usar sem cancelar — reativação é mais barata que aquisição, e a conta ainda existe";
}

// ─────────────────────────────────────────────────────────────────────────────
// A VARREDURA
// ─────────────────────────────────────────────────────────────────────────────

export const SELECT_DO_CLIENTE = {
  id: true,
  situacao: true,
  ganhoEm: true,
  ativadoEm: true,
  passosDeAtivacao: true,
  saude: true,
  saudeEm: true,
  nps: true,
  npsEm: true,
  riscoDeChurn: true,
  motivoDoRisco: true,
  ultimaCompraEm: true,
  recompras: true,
  upsells: true,
  receitaTotalCents: true,
} as const;

function somar(itens: { valorPotencialCents: number | null }[]): SomaMedida {
  let cents = 0;
  let comEstimativa = 0;
  let semEstimativa = 0;

  for (const i of itens) {
    if (i.valorPotencialCents === null) semEstimativa += 1;
    else {
      cents += i.valorPotencialCents;
      comEstimativa += 1;
    }
  }

  return { cents, comEstimativa, semEstimativa };
}

function item(f: FichaParaClassificar, c: Classificacao): ItemDaFila {
  return {
    leadId: f.leadId,
    nome: f.nome,
    estado: c.estado,
    porque: c.porque,
    valorPotencialCents: f.valorPotencialCents,
  };
}

/**
 * ⭐ O PLANO DO DIA.
 *
 * Varre os contatos em aberto e as contas de cliente, classifica cada um pela
 * régua, e monta as filas. **Nada é enviado aqui.**
 *
 * `escopo` existe para o job poder rodar por lote sem carregar a base inteira
 * na memória — a contagem `contatosAnalisados` é o que foi de fato analisado,
 * não uma estimativa do tamanho da base.
 */
export async function montarPlanoDoDia(
  db: Cliente,
  params: {
    agora?: Date;
    escopo?: Prisma.SiteLeadWhereInput;
    limite?: number;
  } = {},
): Promise<PlanoDoDia> {
  const agora = params.agora ?? new Date();
  const limite = params.limite ?? 5000;

  const linhas = (await db.siteLead.findMany({
    where: {
      AND: [
        params.escopo ?? {},
        // Quem pediu silêncio não é analisado: ele não entra em fila nenhuma, e
        // contá-lo entre os "analisados" inflaria o número com gente intocável.
        { optOutAt: null },
      ],
    },
    orderBy: { ultimaMensagemEm: "asc" },
    take: limite,
    select: SELECT_PARA_CLASSIFICAR as unknown as Prisma.SiteLeadSelect,
  })) as unknown as Parameters<typeof fichaDaLinha>[0][];

  const filas: PlanoDoDia["filas"] = {
    precisamDeFollowUp: [],
    esfriando: [],
    oportunidadesAbandonadas: [],
    propostasSemRetorno: [],
    reunioesPendentes: [],
    chanceDeUpsell: [],
    paraReativar: [],
    riscoDeChurn: [],
  };

  let naoMedidos = 0;
  const porEstado = contagemZeradaPorEstado();

  for (const linha of linhas) {
    const ficha = fichaDaLinha(linha);
    const c = classificarFollowUp(ficha, agora);

    if (!c.medido) {
      naoMedidos += 1;
      porEstado.NAO_MEDIDO += 1;
      continue;
    }

    porEstado[c.estado] += 1;

    if (pedeAcao(c)) filas.precisamDeFollowUp.push(item(ficha, c));
    if (estaEsfriando(c)) filas.esfriando.push(item(ficha, c));
    if (ABANDONO.includes(c.estado)) filas.oportunidadesAbandonadas.push(item(ficha, c));
    if (c.estado === "PROPOSTA_PARADA") filas.propostasSemRetorno.push(item(ficha, c));
    if (c.estado === "REUNIAO_PENDENTE") filas.reunioesPendentes.push(item(ficha, c));
  }

  const clientes = (await db.cliente.findMany({
    where: { situacao: { not: "CANCELADO" } },
    take: params.limite ?? 5000,
    select: SELECT_DO_CLIENTE,
  })) as unknown as FichaDoCliente[];

  for (const cl of clientes) {
    const upsell = ehChanceDeUpsell(cl, agora);
    if (upsell) {
      filas.chanceDeUpsell.push({ clienteId: cl.id, motivo: upsell, receitaTotalCents: cl.receitaTotalCents });
    }

    const reativar = ehParaReativar(cl);
    if (reativar) {
      filas.paraReativar.push({ clienteId: cl.id, motivo: reativar, receitaTotalCents: cl.receitaTotalCents });
    }

    const risco = avaliarRiscoDeChurn(cl, agora);
    if (risco.risco !== null && risco.risco >= REGUA_DE_CHURN.limiarDeRisco) {
      filas.riscoDeChurn.push({ clienteId: cl.id, motivo: risco.motivo, receitaTotalCents: cl.receitaTotalCents });
    }
  }

  // A receita potencial é a das oportunidades ligadas aos contatos que pedem
  // ação HOJE — não a do funil inteiro. Cada lead conta uma vez, mesmo quando
  // aparece em duas filas (quem tem proposta parada também precisa de follow-up).
  const unicos = new Map<string, ItemDaFila>();
  for (const i of [
    ...filas.precisamDeFollowUp,
    ...filas.esfriando,
    ...filas.oportunidadesAbandonadas,
    ...filas.propostasSemRetorno,
    ...filas.reunioesPendentes,
  ]) {
    unicos.set(i.leadId, i);
  }

  return {
    emitidoEm: agora,
    contatosAnalisados: linhas.length,
    clientesAnalisados: clientes.length,
    filas,
    receitaPotencial: somar([...unicos.values()]),
    naoMedidos,
    porEstado,
    limiteAtingido: linhas.length >= limite,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// A CAMPANHA — público segmentado, objeção e prazo
// ─────────────────────────────────────────────────────────────────────────────

export interface SegmentoDeCampanha {
  /** Quantos contatos entram. Contagem real, nunca arredondada para cima. */
  tamanho: number;
  caracteristicas: string[];
  /** A objeção que mais aparece neste público. `null` = nenhuma registrada. */
  objecaoPrincipal: string | null;
  acaoRecomendada: string;
  /** Em dias. */
  prazo: number;
  objetivo: string;
  leadIds: string[];
  receitaPotencial: SomaMedida;
}

/**
 * A campanha que o documento desenha: *"ela cria o público; o Marketing cria a
 * comunicação; a automação executa; a CRM mede."*
 *
 * Este arquivo faz **a primeira parte e só ela**. A comunicação não é escrita
 * aqui, e a campanha não sai daqui: o público entra na fila e passa pelas
 * mesmas travas de qualquer toque.
 */
export function proporCampanha(
  plano: PlanoDoDia,
  objecoesPorLead: ReadonlyMap<string, string[]> = new Map(),
): SegmentoDeCampanha | null {
  // O público mais caro da base: gente que viu a proposta e não contratou.
  const publico = plano.filas.propostasSemRetorno;
  if (!publico.length) return null;

  const contagem = new Map<string, number>();
  for (const i of publico) {
    for (const o of objecoesPorLead.get(i.leadId) ?? []) {
      contagem.set(o, (contagem.get(o) ?? 0) + 1);
    }
  }

  // Sem objeção registrada a resposta é `null`, e não um chute plausível. Uma
  // campanha construída sobre objeção inventada erra o argumento em todo mundo.
  const objecaoPrincipal =
    [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    tamanho: publico.length,
    caracteristicas: [
      "receberam proposta por escrito",
      "não responderam dentro do prazo da régua",
      "oportunidade ainda aberta — não foram perdidos com motivo",
    ],
    objecaoPrincipal,
    acaoRecomendada: objecaoPrincipal
      ? `retomar a negociação respondendo à objeção "${objecaoPrincipal}"`
      : "retomar a negociação perguntando o que travou — a objeção deste público não está registrada",
    prazo: 3,
    objetivo: "retomar negociação",
    leadIds: publico.map((i) => i.leadId),
    receitaPotencial: somar(publico),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ENFILEIRAR — o plano sugere; quem manda continua sendo o motor de sempre
// ─────────────────────────────────────────────────────────────────────────────

/**
 * De qual cadência cada estado precisa.
 *
 * Um mapa e não um `if`: é ele que faz "cliente sumido" e "carrinho abandonado"
 * receberem tratamentos diferentes — que é a exigência inteira do item 9 do
 * documento. Estado ausente daqui **não é enfileirado**, e isso é deliberado:
 * `NUNCA_RESPONDEU` e `NAO_ABORDADO` pertencem à fila de prospecção, que tem
 * régua própria (`prospeccao/abordarDaFila.ts`), e duplicá-los aqui faria o
 * mesmo contato ser tocado por dois motores.
 */
export const CADENCIA_POR_ESTADO: Readonly<Partial<Record<EstadoDeFollowUp, string>>> = {
  CLIENTE_SUMIU: "retomada-sem-resposta",
  CARRINHO_ABANDONADO: "carrinho-abandonado",
  PAGAMENTO_ABANDONADO: "pagamento-abandonado",
  PROPOSTA_PARADA: "proposta-sem-retorno",
  REUNIAO_PENDENTE: "confirmacao-de-reuniao",
};

export interface ResultadoDoEnfileiramento {
  inscritos: number;
  /** Já estava na cadência — a rodada repetida não inscreve de novo. */
  jaEstavam: number;
  /** Não havia cadência para o estado, ou ela está desligada/sem passos. */
  semCadencia: { leadId: string; estado: EstadoDeFollowUp; causa: string }[];
}

/**
 * ⭐ Enfileira o plano. **Não envia nada.**
 *
 * Inscrever é marcar um lugar na fila; sair da fila é outro ato, e ele acontece
 * em `rodarCadencias()`, que chama `abordarLead()` — portão do lead, freio de
 * ritmo, Supervisora e `FOOCCI_SDR_SEND_ENABLED`. Se a trava recusar lá, o
 * passo fica pendente e aparece na contagem da rodada.
 *
 * Idempotente pela restrição `@@unique([leadId, cadenciaId])` do banco: rodar o
 * plano duas vezes no mesmo dia devolve `jaEstavam`, não uma segunda inscrição.
 */
export async function enfileirarPlano(
  db: PrismaClient,
  plano: PlanoDoDia,
  params: { agora?: Date } = {},
): Promise<ResultadoDoEnfileiramento> {
  const agora = params.agora ?? plano.emitidoEm;
  const saida: ResultadoDoEnfileiramento = { inscritos: 0, jaEstavam: 0, semCadencia: [] };

  // Cada lead entra uma vez só, pelo estado que a régua deu — mesmo quando ele
  // aparece em duas filas. Duas inscrições seriam duas sequências de mensagens.
  const porLead = new Map<string, ItemDaFila>();
  for (const i of [
    ...plano.filas.precisamDeFollowUp,
    ...plano.filas.oportunidadesAbandonadas,
    ...plano.filas.propostasSemRetorno,
    ...plano.filas.reunioesPendentes,
  ]) {
    porLead.set(i.leadId, i);
  }

  const slugs = [
    ...new Set([...porLead.values()].map((i) => CADENCIA_POR_ESTADO[i.estado]).filter(Boolean)),
  ] as string[];

  const cadencias = slugs.length
    ? await db.cadencia.findMany({ where: { slug: { in: slugs } }, select: { id: true, slug: true } })
    : [];
  const idPorSlug = new Map(cadencias.map((c) => [c.slug, c.id]));

  for (const item of porLead.values()) {
    const slug = CADENCIA_POR_ESTADO[item.estado];
    if (!slug) continue;

    const cadenciaId = idPorSlug.get(slug);
    if (!cadenciaId) {
      saida.semCadencia.push({
        leadId: item.leadId,
        estado: item.estado,
        causa: `a cadência "${slug}" não existe na base`,
      });
      continue;
    }

    const r = await inscreverEmCadencia(db, { leadId: item.leadId, cadenciaId, agora });
    if (r.ok) saida.inscritos += 1;
    else if (r.causa === "jaInscrito") saida.jaEstavam += 1;
    else saida.semCadencia.push({ leadId: item.leadId, estado: item.estado, causa: r.causa });
  }

  return saida;
}
