/**
 * ⭐ O CRM 360 DO LEAD — a ficha completa de uma pessoa e da casa dela (tela 04).
 *
 * ── O BURACO QUE ISTO FECHA ─────────────────────────────────────────────────
 *
 * As entidades da jornada (`Empresa`, `Contato`, `Oportunidade`) existem no
 * banco e são escritas por `jornadaComercial.ts` desde que a reestruturação
 * começou. Nenhuma tela as lia. O decisor descoberto, o gatekeeper
 * classificado, a oportunidade aberta e a proposta enviada estavam gravados e
 * invisíveis — e dado que ninguém vê é dado que ninguém confere.
 *
 * ── O QUE ESTA FICHA REÚNE, E DE ONDE ───────────────────────────────────────
 *
 *   · a pessoa e a conversa            → `SiteLead`
 *   · a empresa e como ela vende hoje  → `Empresa` (jornadaComercial)
 *   · contatos, decisor e gatekeeper   → `Contato` (jornadaComercial)
 *   · a oportunidade                   → `Oportunidade` (jornadaComercial)
 *   · as propostas                     → `lerPropostasDoLead` (propostas.ts)
 *   · a linha do tempo                 → `lerLinhaDoTempo` (linhaDoTempo.ts)
 *   · o estado de follow-up            → `classificarLead` (crm/estadoDeFollowUp)
 *
 * Nenhum desses números é calculado aqui. Esta função **junta**.
 *
 * ── ⚠️ ELA NÃO PROTEGE NADA SOZINHA ─────────────────────────────────────────
 *
 * Igual a `lerLinhaDoTempo`: o alcance é de quem chama. Quem abrir esta ficha
 * numa rota nova tem de passar antes pela mesma regra que `podeVerOLead` aplica,
 * senão um id na URL vira a ficha de qualquer prospecto da base. Está escrito
 * aqui para ninguém usá-la achando que ela filtra por quem perguntou.
 *
 * ── E A REGRA DE SEMPRE ─────────────────────────────────────────────────────
 *
 * Cada bloco que pode faltar volta como `null` explícito — `empresa: null`,
 * `oportunidade: null` — e nunca como um objeto vazio com zeros dentro. A tela é
 * obrigada a escrever "não medido" com o motivo, porque "esta empresa não tem
 * unidades cadastradas" e "esta empresa tem zero unidades" são frases
 * diferentes, e só uma delas manda alguém ir apurar.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { lerPropostasDoLead, type PropostaNaTela } from "./propostas";
import { lerLinhaDoTempo, type EventoDaFicha } from "./linhaDoTempo";
import {
  classificarLead,
  type Classificacao,
  type FichaParaClassificar,
} from "./crm/estadoDeFollowUp";

type Cliente = PrismaClient | Prisma.TransactionClient;

// ─────────────────────────────────────────────────────────────────────────────
// O QUE A FICHA DEVOLVE
// ─────────────────────────────────────────────────────────────────────────────

export interface PessoaDaFicha {
  leadId: string;
  nome: string;
  whatsapp: string;
  email: string | null;
  restaurante: string | null;
  cidade: string | null;
  tipo: string | null;
  stage: string;
  /** `null` = ninguém pontuou. NUNCA zero por omissão. */
  score: number | null;
  temperatura: string | null;
  atendidoPor: string;
  prioritario: boolean;
  tags: string[];
  origem: string | null;
  criadoEm: string;
  /** `null` = nunca pediu silêncio. Com data, é bloqueio. */
  optOutEm: string | null;
  consentimentoEm: string | null;
  proximaAcaoEm: string | null;
  proximaAcaoNota: string | null;
}

export interface EmpresaDaFicha {
  id: string;
  nome: string;
  categoria: string | null;
  cidade: string | null;
  estado: string | null;
  bairro: string | null;
  cnpj: string | null;
  site: string | null;
  instagram: string | null;
  whatsappPublicado: string | null;
  telefone: string | null;
  email: string | null;
  /** `null` = ninguém apurou. Diferente de `false` ("apurado, não tem"). */
  deliveryProprio: boolean | null;
  marketplaces: string[];
  /** `null` até alguém apurar marketplace. Sem isto, lista vazia é ambígua. */
  apuradoMarketplaceEm: string | null;
  cardapioProprio: boolean | null;
  numeroDeUnidades: number | null;
  sistemaIdentificado: string | null;
  ticketEstimadoCents: number | null;
  /** `null` = ninguém mediu o ICP. Zero significa "medido e não qualifica". */
  scoreIcp: number | null;
  prioridade: string | null;
  estagio: string;
  estagioMudouEm: string;
  fonteDaDescoberta: string;
}

export interface ContatoDaFicha {
  id: string;
  nome: string;
  cargo: string | null;
  canal: string | null;
  telefone: string | null;
  email: string | null;
  ehDecisor: boolean;
  ehGatekeeper: boolean;
  /** Só quando `ehGatekeeper`. É ele que muda a estratégia do SDR. */
  tipoDeGatekeeper: string | null;
  confianca: string;
  comoFoiDescoberto: string | null;
  fonte: string | null;
}

export interface OportunidadeDaFicha {
  id: string;
  estagio: string;
  estagioMudouEm: string;
  valorPotencialCents: number | null;
  produtoDeInteresse: string | null;
  probabilidade: number | null;
  dorIdentificada: string | null;
  objecoes: string[];
  previsaoDeFechamento: string | null;
  fechadaEm: string | null;
}

export interface FichaDoLead {
  agora: string;
  pessoa: PessoaDaFicha;
  /** `null` quando o lead ainda não foi ligado a uma empresa da jornada. */
  empresa: EmpresaDaFicha | null;
  /** Vazio quando a empresa não tem contatos — ou quando não há empresa. */
  contatos: ContatoDaFicha[];
  /** O primeiro contato com `ehDecisor`. `null` quando ninguém achou o decisor. */
  decisor: ContatoDaFicha | null;
  /** Os porteiros detectados. Vazio NÃO quer dizer "não há" — quer dizer "não classificado". */
  gatekeepers: ContatoDaFicha[];
  /** A oportunidade ABERTA. `null` quando não há negócio em aberto. */
  oportunidade: OportunidadeDaFicha | null;
  /** Todas, inclusive as fechadas — a empresa pode ter perdido em março e voltado. */
  oportunidades: OportunidadeDaFicha[];
  propostas: PropostaNaTela[];
  linhaDoTempo: EventoDaFicha[];
  /** O estado de follow-up e o PORQUÊ dele. */
  followUp: { ficha: FichaParaClassificar; classificacao: Classificacao } | null;
}

export type ResultadoDaFicha =
  | { achou: true; ficha: FichaDoLead }
  /** O lead não existe. Não é erro: é a resposta certa para um id que não bate. */
  | { achou: false; motivo: "leadInexistente" };

const ABERTAS = ["GANHA", "PERDIDA"];

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

/**
 * Lê a ficha inteira de um lead.
 *
 * A ordem não é livre: o lead vem primeiro porque é ele que diz QUAL empresa
 * carregar. As outras quatro leituras são independentes entre si e correm
 * juntas — uma ficha que abre em quatro idas ao banco enfileiradas é uma ficha
 * que o vendedor aprende a não abrir.
 */
export async function lerFichaDoLead(
  db: Cliente,
  params: { leadId: string; agora?: Date; limiteDaLinha?: number },
): Promise<ResultadoDaFicha> {
  const agora = params.agora ?? new Date();

  const lead = (await db.siteLead.findUnique({
    where: { id: params.leadId },
    select: {
      id: true, nome: true, whatsapp: true, email: true, restaurante: true,
      cidade: true, tipo: true, stage: true, score: true, temperatura: true,
      atendidoPor: true, prioritario: true, tags: true, origem: true,
      createdAt: true, optOutAt: true, consentAt: true,
      proximaAcaoEm: true, proximaAcaoNota: true, empresaId: true,
    },
  })) as unknown as {
    id: string; nome: string; whatsapp: string; email: string | null;
    restaurante: string | null; cidade: string | null; tipo: string | null;
    stage: string; score: number | null; temperatura: string | null;
    atendidoPor: string; prioritario: boolean; tags: string[]; origem: string | null;
    createdAt: Date; optOutAt: Date | null; consentAt: Date | null;
    proximaAcaoEm: Date | null; proximaAcaoNota: string | null;
    empresaId: string | null;
  } | null;

  if (!lead) return { achou: false, motivo: "leadInexistente" };

  const [empresaBruta, contatosBrutos, oportunidadesBrutas, propostas, linhaDoTempo, followUp] =
    await Promise.all([
      lead.empresaId
        ? db.empresa.findUnique({ where: { id: lead.empresaId } })
        : Promise.resolve(null),
      lead.empresaId
        ? db.contato.findMany({ where: { empresaId: lead.empresaId }, orderBy: { criadoEm: "asc" } })
        : Promise.resolve([]),
      // As oportunidades DESTE lead. Não as da empresa inteira: a ficha é do
      // lead, e a segunda unidade do mesmo grupo é outra conversa.
      db.oportunidade.findMany({ where: { leadId: lead.id }, orderBy: { criadoEm: "desc" } }),
      lerPropostasDoLead(db, { leadId: lead.id, agora }),
      lerLinhaDoTempo(db as never, { leadId: lead.id, limite: params.limiteDaLinha }),
      classificarLead(db, lead.id, agora),
    ]);

  const contatos = (contatosBrutos as unknown as Array<Record<string, never>>).map(comoContato);
  const oportunidades = (oportunidadesBrutas as unknown as Array<Record<string, never>>).map(
    comoOportunidade,
  );

  return {
    achou: true,
    ficha: {
      agora: agora.toISOString(),
      pessoa: {
        leadId: lead.id,
        nome: lead.nome,
        whatsapp: lead.whatsapp,
        email: lead.email,
        restaurante: lead.restaurante,
        cidade: lead.cidade,
        tipo: lead.tipo,
        stage: lead.stage,
        score: lead.score,
        temperatura: lead.temperatura,
        atendidoPor: lead.atendidoPor,
        prioritario: lead.prioritario,
        tags: lead.tags ?? [],
        origem: lead.origem,
        criadoEm: lead.createdAt.toISOString(),
        optOutEm: iso(lead.optOutAt),
        consentimentoEm: iso(lead.consentAt),
        proximaAcaoEm: iso(lead.proximaAcaoEm),
        proximaAcaoNota: lead.proximaAcaoNota,
      },
      empresa: empresaBruta ? comoEmpresa(empresaBruta as unknown as Record<string, never>) : null,
      contatos,
      decisor: contatos.find((c) => c.ehDecisor) ?? null,
      gatekeepers: contatos.filter((c) => c.ehGatekeeper),
      oportunidade: oportunidades.find((o) => !ABERTAS.includes(o.estagio)) ?? null,
      oportunidades,
      propostas,
      linhaDoTempo,
      followUp,
    },
  };
}

// ── Tradutores. Só renomeiam e formatam data; nenhum deles decide nada. ──────

function comoEmpresa(e: Record<string, never>): EmpresaDaFicha {
  const v = e as unknown as Record<string, unknown>;
  return {
    id: String(v.id),
    nome: String(v.nome),
    categoria: (v.categoria as string) ?? null,
    cidade: (v.cidade as string) ?? null,
    estado: (v.estado as string) ?? null,
    bairro: (v.bairro as string) ?? null,
    cnpj: (v.cnpj as string) ?? null,
    site: (v.site as string) ?? null,
    instagram: (v.instagram as string) ?? null,
    whatsappPublicado: (v.whatsappPublicado as string) ?? null,
    telefone: (v.telefone as string) ?? null,
    email: (v.email as string) ?? null,
    deliveryProprio: (v.deliveryProprio as boolean | null) ?? null,
    marketplaces: (v.marketplaces as string[]) ?? [],
    apuradoMarketplaceEm: iso(v.apuradoMarketplaceEm as Date | null),
    cardapioProprio: (v.cardapioProprio as boolean | null) ?? null,
    numeroDeUnidades: (v.numeroDeUnidades as number | null) ?? null,
    sistemaIdentificado: (v.sistemaIdentificado as string) ?? null,
    ticketEstimadoCents: (v.ticketEstimadoCents as number | null) ?? null,
    scoreIcp: (v.scoreIcp as number | null) ?? null,
    prioridade: (v.prioridade as string) ?? null,
    estagio: String(v.estagio),
    estagioMudouEm: (v.estagioMudouEm as Date).toISOString(),
    fonteDaDescoberta: String(v.fonteDaDescoberta),
  };
}

function comoContato(c: Record<string, never>): ContatoDaFicha {
  const v = c as unknown as Record<string, unknown>;
  return {
    id: String(v.id),
    nome: String(v.nome),
    cargo: (v.cargo as string) ?? null,
    canal: (v.canal as string) ?? null,
    telefone: (v.telefone as string) ?? null,
    email: (v.email as string) ?? null,
    ehDecisor: Boolean(v.ehDecisor),
    ehGatekeeper: Boolean(v.ehGatekeeper),
    tipoDeGatekeeper: (v.tipoDeGatekeeper as string) ?? null,
    confianca: String(v.confianca ?? "MEDIA"),
    comoFoiDescoberto: (v.comoFoiDescoberto as string) ?? null,
    fonte: (v.fonte as string) ?? null,
  };
}

function comoOportunidade(o: Record<string, never>): OportunidadeDaFicha {
  const v = o as unknown as Record<string, unknown>;
  return {
    id: String(v.id),
    estagio: String(v.estagio),
    estagioMudouEm: (v.estagioMudouEm as Date).toISOString(),
    valorPotencialCents: (v.valorPotencialCents as number | null) ?? null,
    produtoDeInteresse: (v.produtoDeInteresse as string) ?? null,
    probabilidade: (v.probabilidade as number | null) ?? null,
    dorIdentificada: (v.dorIdentificada as string) ?? null,
    objecoes: (v.objecoes as string[]) ?? [],
    previsaoDeFechamento: iso(v.previsaoDeFechamento as Date | null),
    fechadaEm: iso(v.fechadaEm as Date | null),
  };
}
