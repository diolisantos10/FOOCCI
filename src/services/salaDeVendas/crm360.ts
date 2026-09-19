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

  // ── O QUE A PEÇA 04 MOSTRA E A FICHA NÃO LIA ─────────────────────────────
  /** Desde quando a etapa atual vale. O "desde 20 de mai." do seletor de status. */
  stageDesde: string;
  /** A porta de entrada (enum `SiteLeadSource`). O "Canal de Origem" do desenho. */
  fonte: string;
  /** A campanha que trouxe a pessoa. `null` = não veio de campanha identificada. */
  campanha: string | null;
  /** O veículo do primeiro toque (instagram, google…). É o mais perto que temos
   *  de "Como nos conheceu?" — ver o comentário de `comoNosConheceu`. */
  utmSource: string | null;
  utmMedium: string | null;
  /**
   * ⚠️ **"Como nos conheceu?" NÃO existe como campo no banco.** O desenho o traz
   * nas Informações do Lead, respondido pela própria pessoa ("Instagram"). Não
   * há nenhuma coluna que guarde essa resposta: o que temos é de onde o clique
   * veio (`utmSource`/`referrer`), que é medição nossa, não resposta dela.
   *
   * O campo volta preenchido com a medição quando há, e sempre acompanhado de
   * `comoNosConheceuEhMedicao: true` — para a tela dizer que está mostrando de
   * onde a pessoa VEIO, e não o que ela RESPONDEU. Tratar um pelo outro é o
   * tipo de troca que faz o time discutir atribuição com o dado errado.
   */
  comoNosConheceu: string | null;
  comoNosConheceuEhMedicao: boolean;
  /** Última interação de qualquer natureza. O "Última atividade" do desenho. */
  ultimaAtividadeEm: string | null;
  /** Quantas mensagens do lead ninguém leu. */
  naoLidas: number;
}

/**
 * O VENDEDOR RESPONSÁVEL do desenho.
 *
 * `null` tem DUAS leituras, e a tela precisa das duas: ninguém assumiu, ou a IA
 * está conduzindo. Quem distingue é `pessoa.atendidoPor`.
 */
export interface VendedorDaFicha {
  id: string;
  nome: string;
  /** Desde quando ele responde por este lead. É o relógio do SLA de handoff. */
  desde: string | null;
}

/**
 * A FICHA QUE O SDR PREENCHE PARA O CLOSER — `LeadQualificacao`, inteira.
 *
 * Ordem do CEO: *quanto mais completa, melhor*. Por isso ela volta campo a
 * campo, com `null` onde ninguém perguntou — e não resumida num texto só, que
 * esconderia exatamente quais perguntas ficaram sem resposta.
 */
export interface QualificacaoDaFicha {
  segmento: string | null;
  unidades: number | null;
  volumeMensal: number | null;
  canaisAtuais: string[];
  sistemaAtual: string | null;
  marketplaceAtual: string | null;
  dorPrincipal: string | null;
  objetivo: string | null;
  planoDeInteresse: string | null;
  urgencia: string | null;
  poderDeDecisao: string | null;
  faixaDeOrcamento: string | null;
  objecoes: string[];
  funcionalidadesDeInteresse: string[];
  pedidoExplicito: string | null;
  /**
   * As observações da ficha. ⚠️ **Sem autor e sem data**: a tabela guarda um
   * texto só, e o desenho pede "Adicionada por Fulano em tal dia". Quem lê
   * precisa saber que a assinatura não existe — ver `docs` do relatório.
   */
  observacoes: string | null;
  pediuHumano: boolean;
  pediuPararSondagem: boolean;
}

/** Uma mensagem, como a aba Conversas e o bloco "Últimas Conversas" a mostram. */
export interface MensagemDaFicha {
  id: string;
  quando: string;
  /** ENTRADA = o lead falou; SAIDA = a Foocci falou. */
  direcao: string;
  tipo: string;
  status: string;
  /** `null` em mídia sem legenda — e aí `tipo` é quem diz o que era. */
  texto: string | null;
  /** HUMANO, IA, SISTEMA… `null` nas mensagens que o lead mandou. */
  autor: string | null;
  autorNome: string | null;
}

/** Uma tarefa da aba Atividades. */
export interface TarefaDaFicha {
  id: string;
  titulo: string;
  tipo: string;
  situacao: string;
  nota: string | null;
  venceEm: string;
  concluidaEm: string | null;
  responsavelNome: string | null;
  /** `true` quando o prazo passou e ninguém fechou. */
  vencida: boolean;
}

/** Um compromisso da aba Atividades. */
export interface CompromissoDaFicha {
  id: string;
  titulo: string;
  situacao: string;
  comecaEm: string;
  duracaoMin: number;
  local: string | null;
  nota: string | null;
  responsavelNome: string | null;
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
  /** `null` quando o lead assumiu ninguém — ou quando a IA está conduzindo. */
  vendedor: VendedorDaFicha | null;
  /** `null` quando ninguém abriu a ficha de qualificação deste lead. */
  qualificacao: QualificacaoDaFicha | null;
  /** As últimas mensagens, da mais recente para a mais antiga. */
  conversas: MensagemDaFicha[];
  /** Quantas mensagens existem ao todo — a aba diz se está vendo um recorte. */
  totalDeMensagens: number;
  tarefas: TarefaDaFicha[];
  compromissos: CompromissoDaFicha[];
  /** O estado de follow-up e o PORQUÊ dele. */
  followUp: { ficha: FichaParaClassificar; classificacao: Classificacao } | null;
}

export type ResultadoDaFicha =
  | { achou: true; ficha: FichaDoLead }
  /** O lead não existe. Não é erro: é a resposta certa para um id que não bate. */
  | { achou: false; motivo: "leadInexistente" };

const ABERTAS = ["GANHA", "PERDIDA"];

/**
 * Quantas mensagens a ficha carrega.
 *
 * A ficha NÃO é a conversa: a conversa inteira tem endereço próprio, e puxar
 * mil mensagens aqui faria a ficha demorar por um bloco que mostra cinco. O
 * total volta junto (`totalDeMensagens`) para a aba poder dizer que está
 * mostrando um recorte — recorte silencioso é o que faz alguém concluir que o
 * lead falou cinco vezes quando falou duzentas.
 */
const LIMITE_DE_MENSAGENS = 30;

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
      stageChangedAt: true, fonte: true, utmCampaign: true, utmSource: true,
      utmMedium: true, referrer: true, lastInteractionAt: true, naoLidas: true,
      atendenteUserId: true, atendenteDesde: true,
      atendente: { select: { id: true, nome: true } },
      qualificacao: true,
    },
  })) as unknown as {
    id: string; nome: string; whatsapp: string; email: string | null;
    restaurante: string | null; cidade: string | null; tipo: string | null;
    stage: string; score: number | null; temperatura: string | null;
    atendidoPor: string; prioritario: boolean; tags: string[]; origem: string | null;
    createdAt: Date; optOutAt: Date | null; consentAt: Date | null;
    proximaAcaoEm: Date | null; proximaAcaoNota: string | null;
    empresaId: string | null;
    stageChangedAt: Date; fonte: string; utmCampaign: string | null;
    utmSource: string | null; utmMedium: string | null; referrer: string | null;
    lastInteractionAt: Date | null; naoLidas: number;
    atendenteUserId: string | null; atendenteDesde: Date | null;
    atendente: { id: string; nome: string } | null;
    qualificacao: Record<string, never> | null;
  } | null;

  if (!lead) return { achou: false, motivo: "leadInexistente" };

  const [
    empresaBruta, contatosBrutos, oportunidadesBrutas, propostas, linhaDoTempo, followUp,
    mensagens, totalDeMensagens, tarefas, compromissos,
  ] = await Promise.all([
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
      // As últimas mensagens, as tarefas e os compromissos: as abas Conversas e
      // Atividades do desenho. Entram no MESMO `Promise.all` de propósito —
      // uma ficha que abre em nove idas ao banco enfileiradas é uma ficha que
      // ninguém abre duas vezes.
      db.leadMensagem.findMany({
        where: { leadId: lead.id },
        orderBy: { ocorreuEm: "desc" },
        take: LIMITE_DE_MENSAGENS,
        select: {
          id: true, ocorreuEm: true, direcao: true, tipo: true, status: true,
          texto: true, legenda: true, autor: true,
          autorUser: { select: { nome: true } },
        },
      }),
      db.leadMensagem.count({ where: { leadId: lead.id } }),
      db.leadTarefa.findMany({
        where: { leadId: lead.id },
        orderBy: { venceEm: "desc" },
        select: {
          id: true, titulo: true, tipo: true, situacao: true, nota: true,
          venceEm: true, concluidaEm: true,
          responsavel: { select: { nome: true } },
        },
      }),
      db.leadCompromisso.findMany({
        where: { leadId: lead.id },
        orderBy: { comecaEm: "desc" },
        select: {
          id: true, titulo: true, situacao: true, comecaEm: true,
          duracaoMin: true, local: true, nota: true,
          responsavel: { select: { nome: true } },
        },
      }),
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
        stageDesde: lead.stageChangedAt.toISOString(),
        fonte: lead.fonte,
        campanha: lead.utmCampaign,
        utmSource: lead.utmSource,
        utmMedium: lead.utmMedium,
        // Ver o comentário do campo: isto é de ONDE a pessoa veio, medido por
        // nós, e não o que ela RESPONDEU. A tela é obrigada a dizer a diferença.
        comoNosConheceu: lead.utmSource ?? lead.referrer ?? null,
        comoNosConheceuEhMedicao: true,
        ultimaAtividadeEm: iso(lead.lastInteractionAt),
        naoLidas: lead.naoLidas,
      },
      vendedor: lead.atendente
        ? {
            id: lead.atendente.id,
            nome: lead.atendente.nome,
            desde: iso(lead.atendenteDesde),
          }
        : null,
      qualificacao: lead.qualificacao ? comoQualificacao(lead.qualificacao) : null,
      conversas: (mensagens as unknown as Array<Record<string, never>>).map(comoMensagem),
      totalDeMensagens,
      tarefas: (tarefas as unknown as Array<Record<string, never>>).map((t) =>
        comoTarefa(t, agora),
      ),
      compromissos: (compromissos as unknown as Array<Record<string, never>>).map(
        comoCompromisso,
      ),
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

// ─── ⚠️ A FECHADURA DA FICHA MORA AQUI, E NÃO NA PÁGINA ─────────────────────
//
// Esta regra nasceu dentro de `app/comercial/(area)/lead/[id]/page.tsx` e o
// build do Next RECUSOU o arquivo: uma página só pode exportar os nomes que o
// framework conhece, e `alcanca` não é um deles. O erro foi bom — a regra de
// quem alcança qual lead é doutrina de domínio, não detalhe de tela, e no
// serviço ela pode ser testada sem renderizar nada.
//
// Mantida deliberadamente separada de `_guarda.podeVerOLead`: aquela devolve
// `NextResponse`, que é linguagem de rota. A REGRA é a mesma, de propósito.
/** Quem enxerga a operação inteira. Espelha `_guarda.vePelaOperacaoToda`. */
const VE_TUDO = new Set<string>([
  "MASTER_CEO",
  "DIRETOR_FOOCCI",
  "GERENTE_DEPARTAMENTO",
  "AUDITOR_QA",
]);

/**
 * O lead está ao alcance desta pessoa?
 *
 * Igual à guarda das rotas: o dele, o de ninguém e o que espera gente. Conversa
 * que outra pessoa está conduzindo não se alcança — nem para ler.
 */
export async function leadAoAlcance(
  db: Pick<PrismaClient, "siteLead">,
  sessao: { userId: string; role: string },
  leadId: string,
): Promise<boolean> {
  if (VE_TUDO.has(sessao.role)) return true;

  const lead = await db.siteLead.findUnique({
    where: { id: leadId },
    select: { atendenteUserId: true, atendidoPor: true },
  });

  return (
    lead !== null &&
    (lead.atendenteUserId === sessao.userId ||
      lead.atendidoPor === "NINGUEM" ||
      lead.atendidoPor === "AGUARDANDO_HUMANO")
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OS TRADUTORES DOS BLOCOS NOVOS
//
// Todos seguem a mesma regra dos que já estavam aqui: campo ausente sai `null`,
// nunca string vazia nem zero. `""` e `null` parecem iguais na tela e são
// perguntas diferentes — uma manda alguém apurar, a outra não.
// ─────────────────────────────────────────────────────────────────────────────

function comoQualificacao(q: Record<string, never>): QualificacaoDaFicha {
  const r = q as unknown as {
    segmento: string | null; unidades: number | null; volumeMensal: number | null;
    canaisAtuais: string[] | null; sistemaAtual: string | null;
    marketplaceAtual: string | null; dorPrincipal: string | null;
    objetivo: string | null; planoDeInteresse: string | null; urgencia: string | null;
    poderDeDecisao: string | null; faixaDeOrcamento: string | null;
    objecoes: string[] | null; funcionalidadesDeInteresse: string[] | null;
    pedidoExplicito: string | null; observacoes: string | null;
    pediuHumano: boolean; pediuPararSondagem: boolean;
  };

  return {
    segmento: r.segmento,
    unidades: r.unidades,
    volumeMensal: r.volumeMensal,
    canaisAtuais: r.canaisAtuais ?? [],
    sistemaAtual: r.sistemaAtual,
    marketplaceAtual: r.marketplaceAtual,
    dorPrincipal: r.dorPrincipal,
    objetivo: r.objetivo,
    planoDeInteresse: r.planoDeInteresse,
    urgencia: r.urgencia,
    poderDeDecisao: r.poderDeDecisao,
    faixaDeOrcamento: r.faixaDeOrcamento,
    objecoes: r.objecoes ?? [],
    funcionalidadesDeInteresse: r.funcionalidadesDeInteresse ?? [],
    pedidoExplicito: r.pedidoExplicito,
    observacoes: r.observacoes,
    pediuHumano: r.pediuHumano,
    pediuPararSondagem: r.pediuPararSondagem,
  };
}

function comoMensagem(m: Record<string, never>): MensagemDaFicha {
  const r = m as unknown as {
    id: string; ocorreuEm: Date; direcao: string; tipo: string; status: string;
    texto: string | null; legenda: string | null; autor: string | null;
    autorUser: { nome: string } | null;
  };
  return {
    id: r.id,
    quando: r.ocorreuEm.toISOString(),
    direcao: String(r.direcao),
    tipo: String(r.tipo),
    status: String(r.status),
    // A legenda da mídia entra como texto quando não há texto: a bolha do
    // desenho precisa de alguma palavra, e "imagem" sozinho não diz nada.
    texto: r.texto ?? r.legenda ?? null,
    autor: r.autor ? String(r.autor) : null,
    autorNome: r.autorUser?.nome ?? null,
  };
}

function comoTarefa(t: Record<string, never>, agora: Date): TarefaDaFicha {
  const r = t as unknown as {
    id: string; titulo: string; tipo: string; situacao: string; nota: string | null;
    venceEm: Date; concluidaEm: Date | null; responsavel: { nome: string } | null;
  };
  return {
    id: r.id,
    titulo: r.titulo,
    tipo: String(r.tipo),
    situacao: String(r.situacao),
    nota: r.nota,
    venceEm: r.venceEm.toISOString(),
    concluidaEm: iso(r.concluidaEm),
    responsavelNome: r.responsavel?.nome ?? null,
    // Vencida é prazo passado E ninguém fechou. Só a data não basta: tarefa
    // concluída ontem com prazo de anteontem não é pendência de ninguém.
    vencida: r.concluidaEm === null && r.venceEm.getTime() < agora.getTime(),
  };
}

function comoCompromisso(c: Record<string, never>): CompromissoDaFicha {
  const r = c as unknown as {
    id: string; titulo: string; situacao: string; comecaEm: Date; duracaoMin: number;
    local: string | null; nota: string | null; responsavel: { nome: string } | null;
  };
  return {
    id: r.id,
    titulo: r.titulo,
    situacao: String(r.situacao),
    comecaEm: r.comecaEm.toISOString(),
    duracaoMin: r.duracaoMin,
    local: r.local,
    nota: r.nota,
    responsavelNome: r.responsavel?.nome ?? null,
  };
}
