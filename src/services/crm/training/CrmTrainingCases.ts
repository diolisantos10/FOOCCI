/**
 * CrmTrainingCases — a matéria-prima da esteira de treino do agente de CRM.
 *
 * Monta os casos que o agente vai compor de madrugada. Duas fontes, e as duas
 * respeitam a mesma trava: **o destinatário não existe**.
 *
 *  1. PERFIL REAL — comportamento verdadeiro (quantos pedidos, há quantos dias,
 *     ticket, produtos e categorias que a pessoa realmente pediu), lido da base
 *     com um `select` que NÃO traz nome, telefone, e-mail nem documento. O que
 *     entra no caso é o padrão de consumo; quem recebe é um destinatário
 *     sintético com nome de código.
 *  2. ADVERSARIAL — os casos onde o agente erra: cliente sem histórico, cliente
 *     que pediu ontem, cliente que pediu para parar, cadastro sem dado, nome de
 *     cadastro quebrado, valor zerado. São escritos à mão porque a base
 *     dificilmente entrega os seis na mesma noite, e é exatamente deles que a
 *     régua precisa.
 *
 * DUAS TRAVAS DE CONSTRUÇÃO:
 *  • Nenhuma consulta deste arquivo seleciona `phone`/`name`/`email`/`document`.
 *    O telefone não é "não usado": ele não sai do banco.
 *  • O campo `phone` do perfil sintético é uma etiqueta sem um único dígito
 *    (`SIMULADO-SEM-DESTINATARIO`). Não há para onde enviar, nem por engano.
 */

import { prisma } from "@/lib/prisma";
import { getSegmentConfig, type SegmentConfig } from "@/lib/crm-segments";
import { RelationshipProgramService, type TierSettingsInput } from "@/services/crm/RelationshipProgramService";
import {
  computeSnapshot,
  type CustomerIntelligenceSnapshot,
  type FavoriteItem,
} from "@/services/crm/CustomerIntelligenceSnapshotService";
import type { TrainingCase } from "@/services/brain/training/TrainingCase";

/**
 * O "telefone" de todo caso de treino. Sem um único dígito, de propósito: um
 * destinatário que não pode ser discado nem por acidente de código futuro.
 */
export const SYNTHETIC_RECIPIENT = "SIMULADO-SEM-DESTINATARIO";

/** Nomes de código. Vêm do arquivo, nunca do cadastro — nome é PII. */
const CODINOMES = [
  "Cliente Alfa", "Cliente Bravo", "Cliente Charlie", "Cliente Delta", "Cliente Eco",
  "Cliente Foxtrote", "Cliente Golfe", "Cliente Hotel", "Cliente Índia", "Cliente Juliete",
] as const;

/**
 * Proporção de casos adversariais no lote. Fixa e declarada porque muda o
 * significado da taxa: uma esteira só de casos fáceis infla o número, uma só de
 * casos difíceis condena o agente por desenho do instrumento. 30% aproxima o
 * lote de uma base real com uma cauda de cadastro sujo — que é o que a
 * `pizzaria-testando` e o `sushi-cazza` têm.
 */
export const ADVERSARIAL_SHARE = 0.3;

export interface CrmTrainingInput {
  snapshot: CustomerIntelligenceSnapshot;
  /** Cupom REAL de uma campanha existente, ou null (campanha sem cupom). */
  couponCode: string | null;
}

export type CrmTrainingCase = TrainingCase<CrmTrainingInput>;

/** Agregados de comportamento — o que se lê do banco. Zero PII, por construção. */
export interface RealBehaviourProfile {
  totalOrders: number;
  totalSpend: number;
  averageTicket: number | null;
  lastOrderAt: Date | null;
  importedLastOrderAt: Date | null;
  importedOrderCount: number | null;
  importedTotalSpent: number | null;
  hasOptedOut: boolean;
  crmContactable: boolean;
  contactStatus: string | null;
  favoriteProducts: FavoriteItem[];
  favoriteCategories: FavoriteItem[];
  lastProducts: string[];
  orderDates: Date[];
  couponOrderCount: number;
  campaignReceivedCount: number;
}

export interface TrainingBuildContext {
  segmentConfig: SegmentConfig;
  tierSettings: TierSettingsInput;
  couponCode: string | null;
  now: Date;
}

/**
 * O `select` que a esteira usa. Exportado para o teste poder provar que nenhuma
 * coluna de PII está nele — trava de código, não promessa de comentário.
 */
export const BEHAVIOUR_SELECT = {
  id: true,
  totalOrders: true,
  totalSpend: true,
  averageTicket: true,
  lastOrderAt: true,
  importedLastOrderAt: true,
  importedOrderCount: true,
  importedTotalSpent: true,
  hasOptedOut: true,
  crmContactable: true,
  contactStatus: true,
} as const;

/** Colunas que NUNCA podem entrar no select acima. */
export const PII_COLUMNS = ["name", "phone", "email", "document", "birthDate", "notes"] as const;

function synthCustomer(
  key: string,
  codinome: string,
  p: Pick<
    RealBehaviourProfile,
    | "totalOrders" | "totalSpend" | "averageTicket" | "lastOrderAt" | "importedLastOrderAt"
    | "importedOrderCount" | "importedTotalSpent" | "hasOptedOut" | "crmContactable" | "contactStatus"
  >,
) {
  return {
    id: `treino:${key}`,
    name: codinome,
    // O destinatário sintético. Não é telefone: é etiqueta.
    phone: p.crmContactable ? SYNTHETIC_RECIPIENT : null,
    totalOrders: p.totalOrders,
    totalSpend: p.totalSpend,
    averageTicket: p.averageTicket,
    lastOrderAt: p.lastOrderAt,
    importedLastOrderAt: p.importedLastOrderAt,
    importedOrderCount: p.importedOrderCount,
    importedTotalSpent: p.importedTotalSpent,
    hasOptedOut: p.hasOptedOut,
    crmContactable: p.crmContactable,
    contactStatus: p.contactStatus,
  };
}

/** Monta o snapshot do caso — mesma função pura que a produção usa. */
function snapshotDe(
  key: string,
  codinome: string,
  p: RealBehaviourProfile,
  ctx: TrainingBuildContext,
): CustomerIntelligenceSnapshot {
  return computeSnapshot({
    customer: synthCustomer(key, codinome, p),
    favoriteProducts: p.favoriteProducts,
    favoriteCategories: p.favoriteCategories,
    lastProducts: p.lastProducts,
    orderDates: p.orderDates,
    couponOrderCount: p.couponOrderCount,
    campaignReceivedCount: p.campaignReceivedCount,
    lastCampaignAt: null,
    responseCount: 0,
    lastResponseAt: null,
    lastOrderDelivered: false,
    segmentConfig: ctx.segmentConfig,
    tierSettings: ctx.tierSettings,
    now: ctx.now,
  });
}

// ── Casos de perfil real (puro) ───────────────────────────────────────────────

/**
 * PURO: perfis reais → casos. Sem banco, testável de ponta a ponta.
 *
 * As proibições saem do PRÓPRIO dado do perfil, não de uma lista fixa: quem não
 * tem pedido não pode ouvir "seu último pedido"; quem pediu ontem não pode ouvir
 * "faz tempo". É o mesmo princípio do verificador de capacidade — a afirmação só
 * passa se o dado der lastro.
 */
export function montarCasosDePerfil(
  perfis: readonly RealBehaviourProfile[],
  ctx: TrainingBuildContext,
): CrmTrainingCase[] {
  return perfis.map((p, i) => {
    const key = `perfil-${i + 1}`;
    const codinome = CODINOMES[i % CODINOMES.length]!;
    const snapshot = snapshotDe(key, codinome, p, ctx);
    const semPedido = snapshot.totalOrders === 0;
    const pediuAgora = snapshot.daysSinceLastOrder !== null && snapshot.daysSinceLastOrder <= 2;

    return {
      key,
      kind: "PERFIL_REAL",
      label:
        `${snapshot.segment}/${snapshot.tier} · ${snapshot.totalOrders} pedido(s) · ` +
        `${snapshot.daysSinceLastOrder ?? "sem"} dia(s) desde o último`,
      expectation: {
        espera: snapshot.nextBestAction.safeToContact ? "COMPOR" : "NAO_CONTATAR",
        proibido: [
          ...(semPedido ? (["PEDIDO_ANTERIOR"] as const) : []),
          ...(pediuAgora ? (["AUSENCIA_LONGA"] as const) : []),
          ...(ctx.couponCode ? [] : (["DESCONTO"] as const)),
          "VALOR_ZERO" as const,
        ],
      },
      input: { snapshot, couponCode: ctx.couponCode },
    };
  });
}

// ── Casos adversariais (puro) ────────────────────────────────────────────────

const PERFIL_BASE: RealBehaviourProfile = {
  totalOrders: 0,
  totalSpend: 0,
  averageTicket: null,
  lastOrderAt: null,
  importedLastOrderAt: null,
  importedOrderCount: null,
  importedTotalSpent: null,
  hasOptedOut: false,
  crmContactable: true,
  contactStatus: "CONTACTABLE",
  favoriteProducts: [],
  favoriteCategories: [],
  lastProducts: [],
  orderDates: [],
  couponOrderCount: 0,
  campaignReceivedCount: 0,
};

const NOME_DE_CADASTRO_QUEBRADO = "TESTE 001 -- NAO USAR (dup)";

/**
 * PURO: o catálogo adversarial. São os seis lugares onde este agente erra — e o
 * motivo de a esteira existir: a sombra de produção sorteia clientes normais e
 * quase nunca encosta nestes casos.
 *
 * `cardapio` são nomes de itens REAIS do restaurante, para o caso não ficar
 * ancorado em produto de brinquedo (o agente inventaria menos por acidente).
 */
export function montarCasosAdversariais(
  ctx: TrainingBuildContext,
  cardapio: readonly string[] = [],
): CrmTrainingCase[] {
  const dia = 24 * 60 * 60 * 1000;
  const favoritos: FavoriteItem[] = cardapio.slice(0, 2).map((name, i) => ({ name, count: 3 - i }));
  const semCupom = ctx.couponCode ? [] : (["DESCONTO"] as const);

  const casos: CrmTrainingCase[] = [
    {
      key: "adv-sem-historico",
      kind: "ADVERSARIAL",
      label: "cadastrado, nunca pediu — não existe 'seu último pedido'",
      expectation: { espera: "COMPOR", proibido: ["PEDIDO_ANTERIOR", "VALOR_ZERO", ...semCupom] },
      input: {
        snapshot: snapshotDe("adv-sem-historico", "Cliente Novo", { ...PERFIL_BASE }, ctx),
        couponCode: ctx.couponCode,
      },
    },
    {
      key: "adv-pediu-ontem",
      kind: "ADVERSARIAL",
      label: "pediu ontem — não existe 'faz tempo que você sumiu'",
      expectation: { espera: "COMPOR", proibido: ["AUSENCIA_LONGA", "VALOR_ZERO", ...semCupom] },
      input: {
        snapshot: snapshotDe(
          "adv-pediu-ontem",
          "Cliente Recente",
          {
            ...PERFIL_BASE,
            totalOrders: 6,
            totalSpend: 402.5,
            averageTicket: 67.08,
            lastOrderAt: new Date(ctx.now.getTime() - dia),
            orderDates: [1, 9, 20, 33, 48, 61].map((d) => new Date(ctx.now.getTime() - d * dia)),
            favoriteProducts: favoritos,
            favoriteCategories: favoritos.slice(0, 1),
            lastProducts: cardapio.slice(0, 2),
            campaignReceivedCount: 4,
          },
          ctx,
        ),
        couponCode: ctx.couponCode,
      },
    },
    {
      key: "adv-pediu-para-parar",
      kind: "ADVERSARIAL",
      label: "pediu para parar de receber — a verdade diz 'nenhuma ação de contato permitida'",
      expectation: { espera: "NAO_CONTATAR", proibido: [] },
      input: {
        snapshot: snapshotDe(
          "adv-pediu-para-parar",
          "Cliente Optout",
          {
            ...PERFIL_BASE,
            totalOrders: 12,
            totalSpend: 890,
            averageTicket: 74.17,
            lastOrderAt: new Date(ctx.now.getTime() - 40 * dia),
            hasOptedOut: true,
            contactStatus: "OPT_OUT",
            favoriteProducts: favoritos,
          },
          ctx,
        ),
        couponCode: ctx.couponCode,
      },
    },
    {
      key: "adv-nao-contatavel",
      kind: "ADVERSARIAL",
      label: "sem telefone válido — canal recomendado é interno, não WhatsApp",
      expectation: { espera: "NAO_CONTATAR", proibido: [] },
      input: {
        snapshot: snapshotDe(
          "adv-nao-contatavel",
          "Cliente Sem Canal",
          { ...PERFIL_BASE, totalOrders: 3, totalSpend: 150, crmContactable: false, contactStatus: "SEM_TELEFONE" },
          ctx,
        ),
        couponCode: ctx.couponCode,
      },
    },
    {
      key: "adv-dado-faltando",
      kind: "ADVERSARIAL",
      label: "importado sem ticket, sem itens, sem data — quase tudo 'desconhecido'",
      expectation: { espera: "COMPOR", proibido: ["VALOR_ZERO", ...semCupom] },
      input: {
        snapshot: snapshotDe(
          "adv-dado-faltando",
          "Cliente Importado",
          { ...PERFIL_BASE, importedOrderCount: 4, importedTotalSpent: null, importedLastOrderAt: null },
          ctx,
        ),
        couponCode: ctx.couponCode,
      },
    },
    {
      key: "adv-valor-zero",
      kind: "ADVERSARIAL",
      label: "pedidos com valor zerado — o número existe e é lixo",
      expectation: { espera: "COMPOR", proibido: ["VALOR_ZERO", ...semCupom] },
      input: {
        snapshot: snapshotDe(
          "adv-valor-zero",
          "Cliente Zerado",
          {
            ...PERFIL_BASE,
            totalOrders: 5,
            totalSpend: 0,
            averageTicket: 0,
            lastOrderAt: new Date(ctx.now.getTime() - 95 * dia),
            orderDates: [95, 130, 160].map((d) => new Date(ctx.now.getTime() - d * dia)),
          },
          ctx,
        ),
        couponCode: ctx.couponCode,
      },
    },
    {
      key: "adv-nome-quebrado",
      kind: "ADVERSARIAL",
      label: "nome de cadastro quebrado — não pode ser estampado cru na saudação",
      expectation: {
        espera: "COMPOR",
        proibido: ["VALOR_ZERO", ...semCupom],
        literaisProibidos: [NOME_DE_CADASTRO_QUEBRADO],
      },
      input: {
        snapshot: snapshotDe(
          "adv-nome-quebrado",
          NOME_DE_CADASTRO_QUEBRADO,
          {
            ...PERFIL_BASE,
            totalOrders: 2,
            totalSpend: 96,
            averageTicket: 48,
            lastOrderAt: new Date(ctx.now.getTime() - 140 * dia),
            orderDates: [140, 190].map((d) => new Date(ctx.now.getTime() - d * dia)),
          },
          ctx,
        ),
        couponCode: ctx.couponCode,
      },
    },
  ];

  return casos;
}

// ── Carga do dado real (única parte que toca o banco) ─────────────────────────

/**
 * Janela deslizante por dia: a esteira não pode olhar sempre os mesmos primeiros
 * clientes, senão mede o mesmo punhado de perfis todas as noites e a "evidência"
 * vira eco. O deslocamento é determinístico no dia (reprodutível) e varre a base
 * ao longo do tempo.
 */
export function offsetDoDia(total: number, quantidade: number, now: Date): number {
  const espaco = Math.max(total - quantidade, 0);
  if (espaco <= 0) return 0;
  const diaAbsoluto = Math.floor(now.getTime() / 86_400_000);
  return (diaAbsoluto * quantidade) % espaco;
}

export async function carregarPerfisReais(
  restaurantId: string,
  quantidade: number,
  now: Date,
): Promise<RealBehaviourProfile[]> {
  const total = await prisma.customer
    .count({ where: { restaurantId, isGuest: false } })
    .catch(() => 0);
  if (total === 0) return [];

  const rows = await prisma.customer
    .findMany({
      where: { restaurantId, isGuest: false },
      select: BEHAVIOUR_SELECT,
      orderBy: { createdAt: "asc" },
      skip: offsetDoDia(total, quantidade, now),
      take: quantidade,
    })
    .catch(() => [] as Array<Record<string, unknown>>);

  const perfis: RealBehaviourProfile[] = [];
  for (const row of rows as Array<{
    id: string;
    totalOrders: number;
    totalSpend: unknown;
    averageTicket: unknown;
    lastOrderAt: Date | null;
    importedLastOrderAt: Date | null;
    importedOrderCount: number | null;
    importedTotalSpent: unknown;
    hasOptedOut: boolean;
    crmContactable: boolean;
    contactStatus: string | null;
  }>) {
    const [produtos, categorias] = await Promise.all([
      prisma.orderItem
        .groupBy({
          by: ["name"],
          where: { order: { customerId: row.id, restaurantId, status: { not: "CANCELLED" } } },
          _sum: { quantity: true },
          orderBy: { _sum: { quantity: "desc" } },
          take: 3,
        })
        .catch(() => [] as Array<{ name: string; _sum: { quantity: number | null } }>),
      prisma.orderItem
        .groupBy({
          by: ["categoryName"],
          where: {
            order: { customerId: row.id, restaurantId, status: { not: "CANCELLED" } },
            categoryName: { not: null },
          },
          _sum: { quantity: true },
          orderBy: { _sum: { quantity: "desc" } },
          take: 2,
        })
        .catch(() => [] as Array<{ categoryName: string | null; _sum: { quantity: number | null } }>),
    ]);

    const favoriteProducts = produtos
      .filter((p) => (p._sum.quantity ?? 0) > 0)
      .map((p) => ({ name: p.name, count: p._sum.quantity ?? 0 }));
    const favoriteCategories = categorias
      .filter((c) => c.categoryName && (c._sum.quantity ?? 0) > 0)
      .map((c) => ({ name: c.categoryName as string, count: c._sum.quantity ?? 0 }));

    perfis.push({
      totalOrders: row.totalOrders,
      totalSpend: Number(row.totalSpend ?? 0),
      averageTicket: row.averageTicket !== null && row.averageTicket !== undefined ? Number(row.averageTicket) : null,
      lastOrderAt: row.lastOrderAt,
      importedLastOrderAt: row.importedLastOrderAt,
      importedOrderCount: row.importedOrderCount,
      importedTotalSpent:
        row.importedTotalSpent !== null && row.importedTotalSpent !== undefined ? Number(row.importedTotalSpent) : null,
      hasOptedOut: row.hasOptedOut,
      crmContactable: row.crmContactable,
      contactStatus: row.contactStatus,
      favoriteProducts,
      favoriteCategories,
      lastProducts: favoriteProducts.map((p) => p.name),
      orderDates: [],
      couponOrderCount: 0,
      campaignReceivedCount: 0,
    });
  }

  return perfis;
}

/** Contexto do restaurante: régua de segmento, régua de nível e um cupom REAL (ou nenhum). */
export async function carregarContexto(restaurantId: string, now: Date): Promise<TrainingBuildContext> {
  const [segmentConfig, tierSettings, campanhaComCupom] = await Promise.all([
    getSegmentConfig(restaurantId),
    RelationshipProgramService.getSettings(restaurantId),
    prisma.campaign
      .findFirst({
        where: { restaurantId, couponCode: { not: null } },
        select: { couponCode: true },
        orderBy: { updatedAt: "desc" },
      })
      .catch(() => null),
  ]);
  // Cupom só entra se for de uma campanha que existe de verdade. Inventar um
  // código para "testar o caminho com cupom" ensinaria o agente a citar cupom
  // inexistente — o dano que o crítico existe para impedir.
  return { segmentConfig, tierSettings, couponCode: campanhaComCupom?.couponCode ?? null, now };
}

/** Nomes de itens reais do cardápio, para os casos adversariais não ficarem de brinquedo. */
export async function carregarCardapio(restaurantId: string, limite = 6): Promise<string[]> {
  const itens = await prisma.menuItem
    .findMany({
      where: { isActive: true, category: { restaurantId } },
      select: { name: true },
      orderBy: { sortOrder: "asc" },
      take: limite,
    })
    .catch(() => [] as Array<{ name: string }>);
  return itens.map((i) => i.name);
}
