/**
 * A TELA DE RELACIONAMENTO — follow-up automático e pós-venda.
 *
 * ── POR QUE AS DUAS NA MESMA LEITURA ────────────────────────────────────────
 *
 * São a mesma pergunta feita dos dois lados do GANHO: *"o que está parado, e
 * quando alguém toca de novo?"* Antes da venda chama-se follow-up e o relógio é
 * o silêncio; depois chama-se pós-venda e o relógio é a ativação. Separar em
 * duas telas obrigaria o gerente a somar de cabeça a base inteira.
 *
 * ── ⚠️ O QUE ESTA TELA NÃO FAZ ──────────────────────────────────────────────
 *
 * Nada é enviado, inscrito ou disparado daqui. A classificação é calculada na
 * leitura e **não é gravada**: quem grava é `registrarClassificacao`, chamado
 * pela CRM IA. Uma tela que gravasse a cada F5 encheria a linha do tempo de
 * cada lead com uma nota por visita.
 *
 * ── E A LINHA QUE SEPARA MEDIDO DE CHUTADO ──────────────────────────────────
 *
 * `NAO_MEDIDO` é um dos catorze estados, e ele sai contado à parte, fora dos
 * totais que pedem ação. É o que impede a tela de somar "não sei" dentro de um
 * número — que é como um painel passa a mentir sem nenhuma linha errada.
 */

import type { Prisma, PrismaClient, SituacaoDoCliente } from "@prisma/client";
import {
  REGRAS,
  REGUA,
  ESTADOS_QUE_PEDEM_ACAO,
  SELECT_PARA_CLASSIFICAR,
  fichaDaLinha,
  classificarFollowUp,
  estaEsfriando,
  type EstadoDeFollowUp,
} from "../crm/estadoDeFollowUp";
import { CADENCIA_POR_ESTADO, SELECT_DO_CLIENTE } from "../crm/planoDoDia";
import { PARADAS, CATALOGO_DE_CONDICOES } from "../crm/cadenciaPorComportamento";
import {
  proximosPassosDoCliente,
  avaliarRiscoDeChurn,
  REGUA_DO_POS_VENDA,
  REGUA_DE_CHURN,
  SINAIS_DE_CHURN,
  type FichaDoCliente,
  type MarcoDoPosVenda,
} from "../crm/posVenda";

type Cliente = PrismaClient | Prisma.TransactionClient;

// ─────────────────────────────────────────────────────────────────────────────
// OS CATORZE ESTADOS — derivados das regras, nunca digitados
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Os estados de follow-up, na ordem normativa das regras.
 *
 * Derivada de `REGRAS`, que é a doutrina: a ordem em que as regras valem É a
 * ordem em que os estados se sobrepõem. `NAO_MEDIDO` entra no fim porque ele
 * não tem regra — é o que sobra quando nenhuma casa, e é o único que sai com
 * `medido: false`.
 *
 * Digitar a lista à mão aqui criaria uma décima quinta versão da verdade: bastava
 * alguém acrescentar uma regra para a tela passar a esconder um estado inteiro.
 */
export function estadosNaOrdemDasRegras(): EstadoDeFollowUp[] {
  const vistos: EstadoDeFollowUp[] = [];
  for (const r of REGRAS) if (!vistos.includes(r.estado)) vistos.push(r.estado);
  if (!vistos.includes("NAO_MEDIDO")) vistos.push("NAO_MEDIDO");
  return vistos;
}

export interface RegraNaTela {
  codigo: string;
  estado: EstadoDeFollowUp;
  /** A cadência que este estado aciona, quando existe. */
  cadencia: string | null;
  pedeAcao: boolean;
}

/** As regras, na ordem em que valem, com a cadência de cada uma. */
export function regrasNaTela(): RegraNaTela[] {
  return REGRAS.map((r) => ({
    codigo: r.codigo,
    estado: r.estado,
    cadencia: CADENCIA_POR_ESTADO[r.estado] ?? null,
    pedeAcao: ESTADOS_QUE_PEDEM_ACAO.includes(r.estado),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// O PANORAMA
// ─────────────────────────────────────────────────────────────────────────────

export interface EstadoContado {
  estado: EstadoDeFollowUp;
  total: number;
  pedeAcao: boolean;
  cadencia: string | null;
  /** `false` só em NAO_MEDIDO. */
  medido: boolean;
  /** Um porquê de exemplo, tal como a regra o escreveu. */
  exemplo: string | null;
}

export interface CadenciaNaTela {
  slug: string;
  nome: string;
  ativa: boolean;
  passos: number;
  /** Quantos contatos estão inscritos nela agora, com a cadência em curso. */
  inscritosAtivos: number;
  /** Os estados de follow-up que a acionam. */
  acionadaPor: EstadoDeFollowUp[];
  /** As condições declaradas passo a passo. */
  condicoes: { passo: string; descricao: string; estados: readonly EstadoDeFollowUp[] }[];
}

export interface MarcoContado {
  marco: MarcoDoPosVenda;
  /** Quantas contas têm este marco pendente agora. */
  contas: number;
  exemplo: string | null;
}

export interface FaixaDeRisco {
  rotulo: string;
  contas: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// A FICHA DO CLIENTE — a peça 10 do desenho, traduzida para o que existe
//
// ── O QUE O DESENHO PEDE E A CASA TEM ───────────────────────────────────────
//
// O desenho 10 foi feito com uma loja de varejo vendendo para empresas: lista
// de clientes, ficha com CNPJ, linha do tempo, rosca de saúde, NPS e tickets de
// suporte. A Foocci vende PLANO para restaurante, e a conta que nasce da venda
// é `Cliente` — que já guarda `saude` (0–100), `nps`, `recompras`,
// `ultimaCompraEm` e `receitaTotalCents`. A rosca e a lista, portanto, não são
// invenção: são campos.
//
// ── O QUE A CASA NÃO TEM, E SAI ESCRITO ─────────────────────────────────────
//
// **Tickets de suporte não existem para esta conta.** `SupportTicket` existe no
// schema, mas é da OUTRA casa: é escopado por `restaurantId`, o suporte que o
// restaurante dá ao cliente final dele. Contar aquilo aqui seria juntar as duas
// casas que `LEIA-ANTES-DE-TOCAR.md` manda não juntar. Então a ficha devolve o
// motivo, não um zero.
//
// **NPS só existe se alguém respondeu.** `Cliente.nps` nasce `null`, e não há
// pesquisa rodando na sala comercial. Média de conjunto vazio é `NaN` — e `0`
// no lugar dela diria "os clientes nos odeiam", que é o oposto de "não
// perguntamos".
// ─────────────────────────────────────────────────────────────────────────────

/** Um evento da trilha, já pronto para a Linha do Tempo do Cliente. */
export interface EventoNaFicha {
  id: string;
  /** ISO. A tela formata; o serviço não escolhe fuso. */
  quando: string;
  tipo: string;
  titulo: string;
  detalhe: string | null;
  /** Quem decidiu: IA, HUMANO ou SISTEMA. */
  autor: string;
}

export interface ClienteNaFicha {
  id: string;
  empresa: string;
  /** A pessoa decisora, quando a oportunidade guardou uma. */
  pessoa: string | null;
  situacao: SituacaoDoCliente;
  ganhoEm: string;
  ativadoEm: string | null;
  ultimaCompraEm: string | null;
  /** Dias desde a última compra. `null` quando nunca houve compra registrada. */
  diasDesdeAUltimaCompra: number | null;
  /** Vendas nesta conta: a primeira mais as recompras. */
  compras: number;
  recompras: number;
  upsells: number;
  /** `null` quando nada entrou — e `0` gravado é zero medido, não ausência. */
  receitaTotalCents: number | null;
  saude: number | null;
  nps: number | null;
  riscoDeChurn: number | null;
  motivoDoRisco: string | null;
  /** Os sinais de churn observados agora, na leitura. Não é gravado. */
  sinaisObservados: string[];
  /** O que o pós-venda cobra desta conta hoje. */
  proximosPassos: { marco: MarcoDoPosVenda; porque: string; venceEm: string }[];
  linhaDoTempo: EventoNaFicha[];
}

/** As faixas do desenho, sobre a saúde 0–100 que o banco guarda. */
export interface FaixaDeSaude {
  rotulo: string;
  de: number;
  ate: number;
  contas: number;
}

/** Os cinco indicadores do topo da peça 10. `null` = não medido, com motivo. */
export interface IndicadoresDoPosVenda {
  clientesAtivos: number;
  recompras: number;
  ticketMedioCents: number | null;
  ticketMedioMotivo: string | null;
  /** NPS de −100 a 100, calculado só sobre quem respondeu. */
  nps: number | null;
  npsMotivo: string | null;
  /** Quantos responderam — sem isto, um NPS de uma resposta pareceria da base. */
  npsRespostas: number;
  paraReativar: number;
  /**
   * A frase da comparação. Não há retrato do mês anterior guardado em lugar
   * nenhum, então ela diz isso em vez de desenhar uma seta para cima.
   */
  comparacao: string;
}

export interface PanoramaDoRelacionamento {
  // ── Follow-up ──
  contatosAnalisados: number;
  /** Fora da análise por terem pedido silêncio. Não são zero: são intocáveis. */
  emSilencio: number;
  estados: EstadoContado[];
  pedindoAcao: number;
  naoMedidos: number;
  esfriando: number;
  regua: typeof REGUA;
  regras: RegraNaTela[];
  cadencias: CadenciaNaTela[];
  paradas: { motivo: string; explicacao: string }[];

  // ── Pós-venda ──
  clientes: number;
  porSituacao: { situacao: SituacaoDoCliente; total: number }[];
  marcos: MarcoContado[];
  risco: FaixaDeRisco[];
  /** Contas em que nenhum sinal pôde ser observado. Risco não medido ≠ risco 0. */
  riscoNaoMedido: number;
  reguaDoPosVenda: typeof REGUA_DO_POS_VENDA;
  reguaDeChurn: typeof REGUA_DE_CHURN;
  sinaisDeChurn: { codigo: string; peso: number; descricao: string }[];

  // ── A peça 10: lista, ficha, linha do tempo e rosca de saúde ──
  indicadores: IndicadoresDoPosVenda;
  listaDeClientes: ClienteNaFicha[];
  /** `true` quando o teto cortou a lista — a tela diz que cortou. */
  listaCortada: boolean;
  faixasDeSaude: FaixaDeSaude[];
  /** Contas sem `saude` gravada. Ficam FORA da rosca, e a tela diz quantas. */
  saudeNaoMedida: number;

  naoMedido: string[];
}

/** Teto da lista de fichas. A tela diz quando cortou — ver `listaCortada`. */
export const LIMITE_DA_LISTA_DE_CLIENTES = 60;

/** Quantos eventos por ficha. O resto fica atrás do "ver todo o histórico". */
export const EVENTOS_POR_FICHA = 8;

const DIA_EM_MS = 86_400_000;

/**
 * As faixas da rosca do desenho, com os mesmos cortes que a imagem mostra.
 *
 * Elas são do DESENHO, não de uma régua da casa — `REGUA_DE_CHURN.saudeBaixa`
 * corta em 50 e é outra pergunta (risco), não a mesma. Ficam aqui, nomeadas,
 * em vez de espalhadas em `if`s dentro da tela.
 */
const FAIXAS_DE_SAUDE: readonly { rotulo: string; de: number; ate: number }[] = [
  { rotulo: "Excelente", de: 85, ate: 100 },
  { rotulo: "Boa", de: 70, ate: 84 },
  { rotulo: "Atenção", de: 50, ate: 69 },
  { rotulo: "Em risco", de: 0, ate: 49 },
];

/** A conta com os nomes que a lista precisa mostrar. */
type ContaComNomes = FichaDoCliente & {
  empresa: { nome: string };
  oportunidade: { contatoDecisor: { nome: string } | null } | null;
};

/**
 * O título de um evento da trilha, em português de gente.
 *
 * O enum do banco é `MUDANCA_DE_ESTAGIO`; a linha do tempo do desenho diz
 * "Compra realizada". Traduzir aqui — e não na tela — mantém uma versão só.
 */
function tituloDoEvento(
  tipo: string,
  deEstagio: string | null,
  paraEstagio: string | null,
): string {
  switch (tipo) {
    case "CRIACAO":
      return "Conta criada — a venda virou cliente";
    case "MUDANCA_DE_ESTAGIO":
      return deEstagio && paraEstagio
        ? `Mudou de ${deEstagio.replace(/_/g, " ").toLowerCase()} para ${paraEstagio.replace(/_/g, " ").toLowerCase()}`
        : paraEstagio
          ? `Passou para ${paraEstagio.replace(/_/g, " ").toLowerCase()}`
          : "Mudança de estágio";
    case "ENRIQUECIMENTO":
      return "Dado novo na ficha";
    case "VINCULO":
      return "Vínculo registrado";
    case "SCORE_CALCULADO":
      return "Pontuação recalculada";
    case "NOTA":
      return "Nota registrada";
    default:
      return tipo.replace(/_/g, " ").toLowerCase();
  }
}

/** Teto de leitura. O mesmo do plano do dia, pelo mesmo motivo: memória. */
export const LIMITE_DA_VARREDURA = 5000;

/**
 * ⭐ O panorama do relacionamento.
 *
 * `contatosAnalisados` é o que de fato foi lido — não uma estimativa do tamanho
 * da base. Se o teto cortar, a tela diz que cortou, em vez de apresentar uma
 * amostra como se fosse o total.
 */
export async function panoramaDoRelacionamento(
  db: Cliente,
  params: { escopo: Prisma.SiteLeadWhereInput; agora?: Date; limite?: number },
): Promise<PanoramaDoRelacionamento> {
  const agora = params.agora ?? new Date();
  const limite = params.limite ?? LIMITE_DA_VARREDURA;

  const [linhas, emSilencio, cadenciasBrutas, contas] = await Promise.all([
    db.siteLead.findMany({
      where: { AND: [params.escopo, { optOutAt: null }] },
      orderBy: { ultimaMensagemEm: "asc" },
      take: limite,
      select: SELECT_PARA_CLASSIFICAR as unknown as Prisma.SiteLeadSelect,
    }) as unknown as Promise<Parameters<typeof fichaDaLinha>[0][]>,
    db.siteLead.count({ where: { AND: [params.escopo, { optOutAt: { not: null } }] } }),
    db.cadencia.findMany({
      orderBy: { slug: "asc" },
      select: {
        slug: true,
        nome: true,
        ativa: true,
        _count: { select: { passos: true } },
        em: { where: { situacao: "ATIVA" }, select: { id: true } },
      },
    }),
    db.cliente.findMany({ select: SELECT_DO_CLIENTE as unknown as Prisma.ClienteSelect }) as unknown as Promise<
      FichaDoCliente[]
    >,
  ]);

  // ── Follow-up: classifica na leitura, sem gravar ──
  const totalPorEstado = new Map<EstadoDeFollowUp, number>();
  const exemploPorEstado = new Map<EstadoDeFollowUp, string>();
  let esfriando = 0;

  for (const linha of linhas) {
    const ficha = fichaDaLinha(linha);
    const c = classificarFollowUp(ficha, agora);
    totalPorEstado.set(c.estado, (totalPorEstado.get(c.estado) ?? 0) + 1);
    if (!exemploPorEstado.has(c.estado)) exemploPorEstado.set(c.estado, c.porque);
    if (estaEsfriando(c)) esfriando += 1;
  }

  const estados: EstadoContado[] = estadosNaOrdemDasRegras().map((e) => ({
    estado: e,
    total: totalPorEstado.get(e) ?? 0,
    pedeAcao: ESTADOS_QUE_PEDEM_ACAO.includes(e),
    cadencia: CADENCIA_POR_ESTADO[e] ?? null,
    medido: e !== "NAO_MEDIDO",
    exemplo: exemploPorEstado.get(e) ?? null,
  }));

  const pedindoAcao = estados.filter((e) => e.pedeAcao).reduce((t, e) => t + e.total, 0);
  const naoMedidos = totalPorEstado.get("NAO_MEDIDO") ?? 0;

  // ── As cadências que existem no banco, com as condições declaradas ──
  const acionaPor = new Map<string, EstadoDeFollowUp[]>();
  for (const [estado, slug] of Object.entries(CADENCIA_POR_ESTADO)) {
    if (!slug) continue;
    const lista = acionaPor.get(slug) ?? [];
    lista.push(estado as EstadoDeFollowUp);
    acionaPor.set(slug, lista);
  }

  const cadencias: CadenciaNaTela[] = cadenciasBrutas.map((c) => ({
    slug: c.slug,
    nome: c.nome,
    ativa: c.ativa,
    passos: c._count.passos,
    inscritosAtivos: c.em.length,
    acionadaPor: acionaPor.get(c.slug) ?? [],
    condicoes: Object.entries(CATALOGO_DE_CONDICOES)
      .filter(([chave]) => chave.startsWith(`${c.slug}#`))
      .map(([chave, cond]) => ({
        passo: chave,
        descricao: cond.descricao,
        estados: cond.estados,
      })),
  }));

  // ── Pós-venda ──
  const porSituacaoMapa = new Map<SituacaoDoCliente, number>();
  const marcoTotal = new Map<MarcoDoPosVenda, number>();
  const marcoExemplo = new Map<MarcoDoPosVenda, string>();
  const faixas = new Map<string, number>();
  let riscoNaoMedido = 0;

  for (const conta of contas) {
    porSituacaoMapa.set(conta.situacao, (porSituacaoMapa.get(conta.situacao) ?? 0) + 1);

    for (const passo of proximosPassosDoCliente(conta, agora)) {
      marcoTotal.set(passo.marco, (marcoTotal.get(passo.marco) ?? 0) + 1);
      if (!marcoExemplo.has(passo.marco)) marcoExemplo.set(passo.marco, passo.porque);
    }

    const leitura = avaliarRiscoDeChurn(conta, agora);
    if (leitura.risco === null) riscoNaoMedido += 1;
    else {
      const rotulo =
        leitura.risco === 0
          ? "sem sinal (olhado)"
          : leitura.risco < REGUA_DE_CHURN.limiarDeRisco
            ? `abaixo do limiar (< ${REGUA_DE_CHURN.limiarDeRisco})`
            : `em risco (≥ ${REGUA_DE_CHURN.limiarDeRisco})`;
      faixas.set(rotulo, (faixas.get(rotulo) ?? 0) + 1);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // A PEÇA 10 — a lista, a ficha, a linha do tempo e a rosca de saúde
  //
  // A lista tem teto e o teto é dito. Uma lista cortada em silêncio faria o
  // gerente pensar que a base inteira cabe na tela.
  // ───────────────────────────────────────────────────────────────────────────
  const brutos = (await db.cliente.findMany({
    orderBy: [{ ganhoEm: "desc" }],
    take: LIMITE_DA_LISTA_DE_CLIENTES + 1,
    select: {
      ...SELECT_DO_CLIENTE,
      empresa: { select: { nome: true } },
      oportunidade: { select: { contatoDecisor: { select: { nome: true } } } },
    } as unknown as Prisma.ClienteSelect,
  })) as unknown as ContaComNomes[];

  const listaCortada = brutos.length > LIMITE_DA_LISTA_DE_CLIENTES;
  const daLista = brutos.slice(0, LIMITE_DA_LISTA_DE_CLIENTES);

  // Uma consulta só para a trilha de todas as fichas. Uma por cliente seria
  // N+1 numa tela que abre sessenta fichas.
  const eventos = daLista.length
    ? await db.eventoDaJornada.findMany({
        where: { clienteId: { in: daLista.map((c) => c.id) } },
        orderBy: { criadoEm: "desc" },
        take: LIMITE_DA_LISTA_DE_CLIENTES * EVENTOS_POR_FICHA,
        select: {
          id: true,
          clienteId: true,
          criadoEm: true,
          tipo: true,
          deEstagio: true,
          paraEstagio: true,
          motivo: true,
          nota: true,
          autor: true,
          autorLabel: true,
        },
      })
    : [];

  const trilhaPorCliente = new Map<string, EventoNaFicha[]>();
  for (const e of eventos) {
    if (!e.clienteId) continue;
    const ja = trilhaPorCliente.get(e.clienteId) ?? [];
    if (ja.length >= EVENTOS_POR_FICHA) continue;
    ja.push({
      id: e.id,
      quando: e.criadoEm.toISOString(),
      tipo: e.tipo,
      titulo: tituloDoEvento(e.tipo, e.deEstagio, e.paraEstagio),
      detalhe: e.motivo ?? e.nota ?? null,
      autor: e.autorLabel ?? e.autor,
    });
    trilhaPorCliente.set(e.clienteId, ja);
  }

  const faixasDeSaude: FaixaDeSaude[] = FAIXAS_DE_SAUDE.map((f) => ({ ...f, contas: 0 }));
  let saudeNaoMedida = 0;

  const listaDeClientes: ClienteNaFicha[] = daLista.map((c) => {
    const leitura = avaliarRiscoDeChurn(c, agora);
    if (c.saude === null) saudeNaoMedida += 1;
    else {
      const faixa = faixasDeSaude.find((f) => c.saude! >= f.de && c.saude! <= f.ate);
      if (faixa) faixa.contas += 1;
    }

    return {
      id: c.id,
      empresa: c.empresa.nome,
      pessoa: c.oportunidade?.contatoDecisor?.nome ?? null,
      situacao: c.situacao,
      ganhoEm: c.ganhoEm.toISOString(),
      ativadoEm: c.ativadoEm?.toISOString() ?? null,
      ultimaCompraEm: c.ultimaCompraEm?.toISOString() ?? null,
      diasDesdeAUltimaCompra: c.ultimaCompraEm
        ? Math.floor((agora.getTime() - c.ultimaCompraEm.getTime()) / DIA_EM_MS)
        : null,
      compras: 1 + c.recompras,
      recompras: c.recompras,
      upsells: c.upsells,
      // `0` gravado é zero medido. Mas conta sem nenhuma entrada e conta com
      // R$ 0,00 registrado são a mesma linha no banco, e nenhuma das duas
      // deveria virar "ticket médio R$ 0,00" — ver o ticket médio abaixo.
      receitaTotalCents: c.receitaTotalCents,
      saude: c.saude,
      nps: c.nps,
      riscoDeChurn: leitura.risco,
      motivoDoRisco: c.motivoDoRisco ?? leitura.motivo,
      sinaisObservados: leitura.sinais,
      proximosPassos: proximosPassosDoCliente(c, agora).map((p) => ({
        marco: p.marco,
        porque: p.porque,
        venceEm: p.venceEm.toISOString(),
      })),
      linhaDoTempo: trilhaPorCliente.get(c.id) ?? [],
    };
  });

  // ── Os cinco indicadores do topo ──
  //
  // Todos saem de `contas`, que é a base inteira — e não da lista, que tem
  // teto. Indicador calculado sobre uma amostra com cara de total é a forma
  // mais silenciosa de um painel mentir.
  const clientesAtivos = contas.filter((c) => c.situacao === "ATIVO").length;
  const somaDeRecompras = contas.reduce((t, c) => t + c.recompras, 0);

  const comReceita = contas.filter((c) => c.receitaTotalCents > 0);
  const comprasComReceita = comReceita.reduce((t, c) => t + 1 + c.recompras, 0);
  const ticketMedioCents = comprasComReceita
    ? Math.round(comReceita.reduce((t, c) => t + c.receitaTotalCents, 0) / comprasComReceita)
    : null;
  const ticketMedioMotivo = ticketMedioCents
    ? null
    : contas.length
      ? "Nenhuma conta tem receita registrada. `receitaTotalCents` nasce em 0 e só é preenchido quando a cobrança entra — dividir por contas sem receita daria um ticket médio de R$ 0,00 com cara de medição."
      : "Não há cliente registrado: a primeira venda ainda não virou conta.";

  // NPS de verdade: promotores menos detratores, sobre QUEM RESPONDEU.
  const respostas = contas.filter((c): c is typeof c & { nps: number } => c.nps !== null);
  const promotores = respostas.filter((c) => c.nps >= 9).length;
  const detratores = respostas.filter((c) => c.nps <= 6).length;
  const nps = respostas.length
    ? Math.round(((promotores - detratores) / respostas.length) * 100)
    : null;
  const npsMotivo = respostas.length
    ? null
    : "Nenhum cliente respondeu pesquisa de satisfação. `Cliente.nps` nasce vazio e não há pesquisa de NPS rodando na sala comercial — um 0 aqui diria que fomos mal avaliados, quando o que houve é que não perguntamos.";

  const paraReativar = contas.filter(
    (c) => c.situacao === "INATIVO" || c.situacao === "EM_RISCO",
  ).length;

  const indicadores: IndicadoresDoPosVenda = {
    clientesAtivos,
    recompras: somaDeRecompras,
    ticketMedioCents,
    ticketMedioMotivo,
    nps,
    npsMotivo,
    npsRespostas: respostas.length,
    paraReativar,
    comparacao:
      "sem retrato do mês anterior guardado — nada nesta casa fotografa a base todo mês, então não há de onde tirar a variação",
  };

  const naoMedido: string[] = [];
  if (listaCortada) {
    naoMedido.push(
      `A lista de clientes parou no teto de ${LIMITE_DA_LISTA_DE_CLIENTES}. Os cinco indicadores do topo são da base inteira; a lista, não.`,
    );
  }
  if (saudeNaoMedida > 0) {
    naoMedido.push(
      `${saudeNaoMedida} conta(s) sem saúde gravada ficam FORA da rosca. \`Cliente.saude\` nasce vazio, e 0 ali significaria conta morta.`,
    );
  }
  if (linhas.length >= limite) {
    naoMedido.push(
      `A varredura parou no teto de ${limite} contatos. Os números de follow-up são do que foi lido, e não da base inteira.`,
    );
  }
  if (!linhas.length) {
    naoMedido.push("Nenhum contato para classificar no seu escopo — as filas ficam vazias, e vazio aqui é ausência de contato.");
  }
  if (naoMedidos > 0) {
    naoMedido.push(
      `${naoMedidos} contato(s) em NÃO MEDIDO: nenhuma regra casou com o retrato deles. Eles ficam FORA do total que pede ação, de propósito.`,
    );
  }
  if (!contas.length) {
    naoMedido.push("Nenhum cliente registrado ainda — a jornada de pós-venda só começa no primeiro GANHO.");
  }
  if (riscoNaoMedido > 0) {
    naoMedido.push(
      `${riscoNaoMedido} conta(s) com risco de churn NÃO MEDIDO: sem ativação, sem saúde e sem NPS não há sinal a observar. Isso não é risco zero.`,
    );
  }
  if (!cadencias.length) {
    naoMedido.push("Nenhuma cadência cadastrada no banco — os estados acima classificam, e nada é acionado.");
  }

  return {
    contatosAnalisados: linhas.length,
    emSilencio,
    estados,
    pedindoAcao,
    naoMedidos,
    esfriando,
    regua: REGUA,
    regras: regrasNaTela(),
    cadencias,
    paradas: PARADAS.map((p) => ({ motivo: p.motivo, explicacao: p.explicacao })),

    clientes: contas.length,
    porSituacao: [...porSituacaoMapa.entries()].map(([situacao, total]) => ({ situacao, total })),
    marcos: [...marcoTotal.entries()].map(([marco, contasComOMarco]) => ({
      marco,
      contas: contasComOMarco,
      exemplo: marcoExemplo.get(marco) ?? null,
    })),
    risco: [...faixas.entries()].map(([rotulo, contasNaFaixa]) => ({ rotulo, contas: contasNaFaixa })),
    riscoNaoMedido,
    reguaDoPosVenda: REGUA_DO_POS_VENDA,
    reguaDeChurn: REGUA_DE_CHURN,
    sinaisDeChurn: SINAIS_DE_CHURN.map((s) => ({ codigo: s.codigo, peso: s.peso, descricao: s.descricao })),

    indicadores,
    listaDeClientes,
    listaCortada,
    faixasDeSaude,
    saudeNaoMedida,

    naoMedido,
  };
}
