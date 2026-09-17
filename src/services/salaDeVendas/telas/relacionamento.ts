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

  naoMedido: string[];
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

  const naoMedido: string[] = [];
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

    naoMedido,
  };
}
