/**
 * O RAIO-X DAS CONVERSAS DE PROSPECÇÃO — só leitura.
 *
 * ── POR QUE ESTE ARQUIVO EXISTE ─────────────────────────────────────────────
 *
 * O CEO quer reabordar quem já foi contactado e não deu em nada, e capturar o
 * telefone do responsável comercial. Antes de reabordar é preciso VER o que já
 * aconteceu — e hoje ninguém fora do sistema vê: o banco de produção não é
 * alcançável de fora e a senha não é legível nem por ferramenta. A única saída
 * honesta é uma porta de leitura dentro do próprio produto.
 *
 * ── O QUE ELE **NÃO** FAZ, E É A REGRA PRINCIPAL ────────────────────────────
 *
 * Não envia mensagem, não agenda envio, não muda estágio, não escreve no banco.
 * Nenhuma função daqui importa canal, `entregarMensagem`, `registrarSaida`,
 * `abordar` ou qualquer coisa do `ta/`. Isso não é promessa de comentário: é
 * medido por teste de contrato que lê ESTE fonte
 * (`raioXDasConversas.contrato.test.ts`), no molde que a casa já usa no
 * copiloto da Sala de Vendas.
 *
 * ── DADO NÃO MEDIDO NUNCA VIRA ZERO ─────────────────────────────────────────
 *
 * Mesma doutrina de `painel.ts`: cada bloco devolve `{ medido: true, … }` ou
 * `{ medido: false, motivo }`. Zero é uma afirmação ("medimos, e deu zero") e é
 * indistinguível de "ninguém mediu" — e só um dos dois merece ação. Quando uma
 * contagem depende de um dado que a base não tem (por exemplo: a classificação
 * de porteiro mora em `Contato`, que pende de `Empresa`, e a maioria dos leads
 * antigos não tem empresa), ela sai como NÃO MEDIDA, com o motivo.
 *
 * ── MULTI-TENANT: ISTO É O COMERCIAL DA FOOCCI, NÃO O CRM DO RESTAURANTE ────
 *
 * `SiteLead`, `LeadMensagem`, `Empresa`, `Contato` e `Oportunidade` são o
 * comercial da FOOCCI (a Foocci vendendo para donos de restaurante). O CRM do
 * produto — o restaurante falando com os clientes DELE — mora em
 * `src/services/crm/` e em models com `restaurantId`. Nenhuma consulta daqui
 * toca esses models, e o teste de contrato proíbe a palavra `restaurantId`
 * neste arquivo: uma junção errada aqui vazaria conversa de cliente do cliente.
 */

import type {
  Prisma,
  PrismaClient,
  SiteLeadStage,
  TipoDeGatekeeper,
  EstagioDaEmpresa,
  DirecaoDaMensagem,
  AutorDaMensagem,
} from "@prisma/client";
import { taxa, type Taxa } from "../painel";

type Cliente = PrismaClient | Prisma.TransactionClient;

// ─────────────────────────────────────────────────────────────────────────────
// TETOS — e por que existem
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Quantas mensagens esta rota varre antes de desistir de medir.
 *
 * A apuração de "quem respondeu" e "onde a conversa morreu" precisa da PRIMEIRA
 * saída e da PRIMEIRA entrada de cada lead — coisa que nenhum `count` responde.
 * Então ela lê as mensagens da janela e agrega em memória. Isso é honesto até
 * certo volume; acima dele, o certo não é devolver um número pela metade: é
 * dizer NÃO MEDIDO e pedir uma janela menor.
 */
export const TETO_DE_MENSAGENS_VARRIDAS = 200_000;

/** Tamanho do lote nas buscas por `in` — `in` com 50 mil ids derruba o banco. */
const LOTE = 500;

export const AMOSTRA_PADRAO = 20;
export const AMOSTRA_MAXIMA = 200;
export const POR_PAGINA_PADRAO = 50;
export const POR_PAGINA_MAXIMA = 500;

/**
 * Quando o módulo de Gatekeeper entrou em produção.
 *
 * Serve a UMA pergunta e só a ela: conversa cuja última resposta é anterior a
 * esta data **não podia** ter sido classificada, e por isso sai como
 * `NAO_CLASSIFICADO` com a causa "anterior ao módulo" — nunca forçada para uma
 * categoria. Carimbar "atendente" em quem ninguém leu é inventar dado.
 */
export const MODULO_GATEKEEPER_DESDE = new Date("2026-09-17T00:00:00.000Z");

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS DA RESPOSTA
// ─────────────────────────────────────────────────────────────────────────────

export type Medida<T> = { medido: true; valor: T } | { medido: false; motivo: string };

function medido<T>(valor: T): Medida<T> {
  return { medido: true, valor };
}
function naoMedido<T>(motivo: string): Medida<T> {
  return { medido: false, motivo };
}

/**
 * A escada de "até onde a conversa chegou". Ordem é regra: quem alcançou o
 * degrau mais alto conta só nele, senão a mesma conversa apareceria em cinco
 * linhas e a soma não fecharia com o total de abordados.
 */
export const ESCADA: readonly EtapaAlcancada[] = [
  "SO_PRIMEIRA_MENSAGEM",
  "RESPONDEU_E_PAROU",
  "GATEKEEPER",
  "DECISOR_IDENTIFICADO",
  "REUNIAO",
  "VENDA",
] as const;

export type EtapaAlcancada =
  | "SO_PRIMEIRA_MENSAGEM"
  | "RESPONDEU_E_PAROU"
  | "GATEKEEPER"
  | "DECISOR_IDENTIFICADO"
  | "REUNIAO"
  | "VENDA";

export const ROTULO_DA_ETAPA: Readonly<Record<EtapaAlcancada, string>> = {
  SO_PRIMEIRA_MENSAGEM: "só saiu a nossa mensagem — nunca respondeu",
  RESPONDEU_E_PAROU: "respondeu e a conversa parou",
  GATEKEEPER: "caiu em porteiro (bot, recepção, SAC…)",
  DECISOR_IDENTIFICADO: "o decisor foi identificado",
  REUNIAO: "chegou a demo, proposta ou negociação",
  VENDA: "virou venda",
};

/** Os estágios do lead que provam que a conversa passou da identificação. */
const ESTAGIOS_DE_REUNIAO: readonly SiteLeadStage[] = [
  "DEMO_AGENDADA",
  "DEMO_REALIZADA",
  "PROPOSTA_ENVIADA",
  "EM_NEGOCIACAO",
];

const ESTAGIOS_DE_EMPRESA_COM_DECISOR: readonly EstagioDaEmpresa[] = [
  "DECISOR_ENCONTRADO",
  "QUALIFICADA",
];

export interface MensagemDaAmostra {
  quem: "LEAD" | "FOOCCI";
  autor: AutorDaMensagem | null;
  quando: Date;
  texto: string | null;
  status: string;
  templateNome: string | null;
  /**
   * ⚠️ O MOTIVO DA FALHA, DITO PELO PROVEDOR — aberto em 18/09/2026.
   *
   * Naquele dia 659 abordagens saíram e **as 200 conferidas falharam, todas**.
   * O texto estava certo, o envio respondeu 200 com `wamid`, e a recusa vinha
   * depois, pelo aviso de status da Meta. O motivo estava gravado em
   * `LeadMensagem.erro` desde sempre e **nenhuma porta o mostrava** — então a
   * tela dizia "FALHOU" e ninguém conseguia dizer por quê.
   *
   * Contar falha sem poder ler a causa é o mesmo defeito que este raio-X
   * existe para matar: número sem explicação não é medição, é susto.
   */
  erro: string | null;
}

export interface ConversaDaAmostra {
  leadId: string;
  nome: string;
  empresa: string | null;
  telefone: string | null;
  cidade: string | null;
  estado: SiteLeadStage;
  etapaAlcancada: EtapaAlcancada;
  primeiraAbordagemEm: Date | null;
  ultimaMensagemEm: Date | null;
  optOutEm: Date | null;
  mensagens: MensagemDaAmostra[];
}

export interface PistaDeDecisor {
  empresaId: string | null;
  empresa: string | null;
  nome: string;
  cargo: string | null;
  canal: string | null;
  telefone: string | null;
  temTelefone: boolean;
  confianca: string;
  comoFoiDescoberto: string | null;
}

export interface LinhaDeReabordagem {
  leadId: string;
  nome: string;
  empresa: string | null;
  telefone: string | null;
  estado: SiteLeadStage;
  etapaAlcancada: EtapaAlcancada;
  ultimaAbordagemEm: Date | null;
  respondeuAlgumaVez: boolean;
}

export interface RaioXDasConversas {
  janela: { desde: Date | null; ate: Date | null; agora: Date };
  telefoneCompleto: boolean;
  mensagensNaJanela: number;

  /**
   * Leads que receberam mensagem nossa e cuja linha não existe mais em
   * `SiteLead`. Declarado em vez de somido: a diferença entre "abordamos 900" e
   * "abordamos 900, e 3 fichas sumiram" é a diferença entre um total e um total
   * que se pode conferir.
   */
  abordadosSemFicha: number;

  abordagem: Medida<{
    abordados: number;
    responderam: number;
    nuncaResponderam: number;
    taxaDeResposta: Taxa;
    porDia: Array<{ dia: string; abordados: number }>;
    porSemana: Array<{ semana: string; abordados: number }>;
  }>;

  ondeMorreu: Medida<Array<{ etapa: EtapaAlcancada; rotulo: string; quantos: number }>>;

  gatekeepers: Medida<{
    classificados: number;
    porTipo: Array<{ tipo: TipoDeGatekeeper; quantos: number }>;
    naoClassificados: {
      total: number;
      anterioresAoModulo: number;
      posterioresAoModuloSemSinal: number;
      observacao: string;
    };
  }>;

  decisores: Medida<{
    comTelefone: number;
    semTelefone: number;
    pistasSemTelefone: PistaDeDecisor[];
  }>;

  amostra: ConversaDaAmostra[];

  reabordagem: Medida<{
    total: number;
    pagina: number;
    porPagina: number;
    lista: LinhaDeReabordagem[];
    criterio: string;
  }>;
}

export interface PedidoDoRaioX {
  agora: Date;
  desde?: Date | null;
  ate?: Date | null;
  amostra?: number;
  pagina?: number;
  porPagina?: number;
  telefoneCompleto?: boolean;
  /** A função que formata telefone. Injetada para o contrato ter um dono só. */
  formatarTelefone: (valor: string | null | undefined, completo: boolean) => string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// AUXILIARES PUROS
// ─────────────────────────────────────────────────────────────────────────────

function emLotes<T>(itens: T[]): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += LOTE) lotes.push(itens.slice(i, i + LOTE));
  return lotes;
}

/** `2026-09-17`, em UTC — a mesma âncora para todos os cortes do relatório. */
export function diaDe(data: Date): string {
  return data.toISOString().slice(0, 10);
}

/**
 * `2026-W38` — semana ISO. Existe porque "por semana" com semanas que começam
 * em dias diferentes a cada relatório é um gráfico que ninguém consegue
 * comparar com o da semana passada.
 */
export function semanaDe(data: Date): string {
  const d = new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()));
  const diaDaSemana = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - diaDaSemana);
  const inicioDoAno = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const semana = Math.ceil(((d.getTime() - inicioDoAno.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(semana).padStart(2, "0")}`;
}

interface ResumoDoLead {
  saidas: number;
  entradas: number;
  primeiraSaida: Date | null;
  ultimaSaida: Date | null;
  primeiraEntrada: Date | null;
  ultimaEntrada: Date | null;
}

function resumoVazio(): ResumoDoLead {
  return {
    saidas: 0,
    entradas: 0,
    primeiraSaida: null,
    ultimaSaida: null,
    primeiraEntrada: null,
    ultimaEntrada: null,
  };
}

/**
 * Onde a conversa chegou, decidido SÓ por fato registrado.
 *
 * Note o que NÃO entra: nada é inferido do texto da mensagem, e nada é inferido
 * de silêncio. Lead sem empresa não é "sem gatekeeper" — é lead sobre o qual a
 * pergunta do porteiro não tem resposta, e isso aparece no bloco de não medidos.
 */
export function etapaAlcancada(entrada: {
  estado: SiteLeadStage;
  respondeu: boolean;
  temDecisor: boolean;
  temGatekeeper: boolean;
  estagioDaEmpresa: EstagioDaEmpresa | null;
  temOportunidadeGanha: boolean;
}): EtapaAlcancada {
  if (entrada.estado === "GANHO" || entrada.temOportunidadeGanha) return "VENDA";
  if (ESTAGIOS_DE_REUNIAO.includes(entrada.estado)) return "REUNIAO";
  if (
    entrada.temDecisor ||
    (entrada.estagioDaEmpresa !== null &&
      ESTAGIOS_DE_EMPRESA_COM_DECISOR.includes(entrada.estagioDaEmpresa))
  ) {
    return "DECISOR_IDENTIFICADO";
  }
  if (entrada.temGatekeeper || entrada.estagioDaEmpresa === "GATEKEEPER") return "GATEKEEPER";
  if (entrada.respondeu) return "RESPONDEU_E_PAROU";
  return "SO_PRIMEIRA_MENSAGEM";
}

/** As etapas que valem reabordagem: tocado, sem decisor, e a conversa parou. */
const ETAPAS_REABORDAVEIS: readonly EtapaAlcancada[] = [
  "SO_PRIMEIRA_MENSAGEM",
  "RESPONDEU_E_PAROU",
  "GATEKEEPER",
];

export const CRITERIO_DE_REABORDAGEM =
  "já recebeu ao menos uma mensagem nossa; NÃO pediu opt-out; ainda não tem decisor capturado; " +
  "e a conversa parou em 'só a nossa mensagem', 'respondeu e parou' ou 'porteiro'. " +
  "Quem chegou a demo/proposta/negociação/venda fica fora — esse não é reabordagem, é continuação.";

// ─────────────────────────────────────────────────────────────────────────────
// A APURAÇÃO
// ─────────────────────────────────────────────────────────────────────────────

export async function raioXDasConversas(
  db: Cliente,
  pedido: PedidoDoRaioX,
): Promise<RaioXDasConversas> {
  const desde = pedido.desde ?? null;
  const ate = pedido.ate ?? null;
  const completo = pedido.telefoneCompleto === true;
  const tel = (v: string | null | undefined) => pedido.formatarTelefone(v, completo);

  const amostraPedida = Math.min(
    Math.max(Math.trunc(pedido.amostra ?? AMOSTRA_PADRAO), 0),
    AMOSTRA_MAXIMA,
  );
  const pagina = Math.max(Math.trunc(pedido.pagina ?? 1), 1);
  const porPagina = Math.min(
    Math.max(Math.trunc(pedido.porPagina ?? POR_PAGINA_PADRAO), 1),
    POR_PAGINA_MAXIMA,
  );

  const janelaDaMensagem =
    desde || ate
      ? { ocorreuEm: { ...(desde ? { gte: desde } : {}), ...(ate ? { lt: ate } : {}) } }
      : {};

  const mensagensNaJanela = await db.leadMensagem.count({ where: janelaDaMensagem });

  const vazio: RaioXDasConversas = {
    janela: { desde, ate, agora: pedido.agora },
    telefoneCompleto: completo,
    mensagensNaJanela,
    abordadosSemFicha: 0,
    abordagem: naoMedido("apuração não executada"),
    ondeMorreu: naoMedido("apuração não executada"),
    gatekeepers: naoMedido("apuração não executada"),
    decisores: naoMedido("apuração não executada"),
    amostra: [],
    reabordagem: naoMedido("apuração não executada"),
  };

  // ── O teto: acima dele, NÃO MEDIDO — nunca um número pela metade ──
  if (mensagensNaJanela > TETO_DE_MENSAGENS_VARRIDAS) {
    const motivo =
      `a janela tem ${mensagensNaJanela} mensagens, acima do teto de varredura ` +
      `(${TETO_DE_MENSAGENS_VARRIDAS}). Peça uma janela menor com ?desde= e ?ate= — ` +
      "medir pela metade e chamar de total seria pior que não medir.";
    return {
      ...vazio,
      abordagem: naoMedido(motivo),
      ondeMorreu: naoMedido(motivo),
      gatekeepers: naoMedido(motivo),
      decisores: naoMedido(motivo),
      reabordagem: naoMedido(motivo),
    };
  }

  const mensagens = (await db.leadMensagem.findMany({
    where: janelaDaMensagem,
    select: { leadId: true, direcao: true, ocorreuEm: true },
    orderBy: { ocorreuEm: "asc" },
  })) as Array<{ leadId: string; direcao: DirecaoDaMensagem; ocorreuEm: Date }>;

  const porLead = new Map<string, ResumoDoLead>();
  for (const m of mensagens) {
    const r = porLead.get(m.leadId) ?? resumoVazio();
    if (m.direcao === "SAIDA") {
      r.saidas += 1;
      if (!r.primeiraSaida || m.ocorreuEm < r.primeiraSaida) r.primeiraSaida = m.ocorreuEm;
      if (!r.ultimaSaida || m.ocorreuEm > r.ultimaSaida) r.ultimaSaida = m.ocorreuEm;
    } else {
      r.entradas += 1;
      if (!r.primeiraEntrada || m.ocorreuEm < r.primeiraEntrada) r.primeiraEntrada = m.ocorreuEm;
      if (!r.ultimaEntrada || m.ocorreuEm > r.ultimaEntrada) r.ultimaEntrada = m.ocorreuEm;
    }
    porLead.set(m.leadId, r);
  }

  /** ABORDADO = recebeu ao menos uma mensagem NOSSA. Quem só escreveu (inbound
   * puro, ex.: formulário do site) não foi abordado por nós, e contá-lo como
   * tal inflaria a base de reabordagem com quem procurou a Foocci sozinho. */
  const idsAbordados = [...porLead.entries()]
    .filter(([, r]) => r.saidas > 0)
    .map(([id]) => id);

  if (idsAbordados.length === 0) {
    const motivo =
      "nenhuma mensagem de SAÍDA na janela — não há conversa de prospecção para radiografar. " +
      "Isto não é zero abordagens no histórico: é zero DENTRO desta janela.";
    return {
      ...vazio,
      abordagem: naoMedido(motivo),
      ondeMorreu: naoMedido(motivo),
      gatekeepers: naoMedido(motivo),
      decisores: naoMedido(motivo),
      reabordagem: naoMedido(motivo),
    };
  }

  // ── Os leads ──
  const leads: Array<{
    id: string;
    nome: string;
    whatsapp: string | null;
    restaurante: string | null;
    cidade: string | null;
    stage: SiteLeadStage;
    optOutAt: Date | null;
    empresaId: string | null;
    ultimaMensagemEm: Date | null;
  }> = [];
  for (const lote of emLotes(idsAbordados)) {
    const achados = (await db.siteLead.findMany({
      where: { id: { in: lote } },
      select: {
        id: true,
        nome: true,
        whatsapp: true,
        restaurante: true,
        cidade: true,
        stage: true,
        optOutAt: true,
        empresaId: true,
        ultimaMensagemEm: true,
      },
    })) as typeof leads;
    leads.push(...achados);
  }

  const empresaIds = [...new Set(leads.map((l) => l.empresaId).filter((x): x is string => !!x))];

  // ── As empresas e seus contatos (onde mora a classificação do porteiro) ──
  const empresas: Array<{ id: string; nome: string; estagio: EstagioDaEmpresa }> = [];
  const contatos: Array<{
    id: string;
    empresaId: string;
    nome: string;
    cargo: string | null;
    canal: string | null;
    telefone: string | null;
    telefoneDigits: string | null;
    ehDecisor: boolean;
    ehGatekeeper: boolean;
    tipoDeGatekeeper: TipoDeGatekeeper | null;
    confianca: string;
    comoFoiDescoberto: string | null;
  }> = [];
  const oportunidades: Array<{ empresaId: string; estagio: string }> = [];

  for (const lote of emLotes(empresaIds)) {
    empresas.push(
      ...((await db.empresa.findMany({
        where: { id: { in: lote } },
        select: { id: true, nome: true, estagio: true },
      })) as typeof empresas),
    );
    contatos.push(
      ...((await db.contato.findMany({
        where: { empresaId: { in: lote } },
        select: {
          id: true,
          empresaId: true,
          nome: true,
          cargo: true,
          canal: true,
          telefone: true,
          telefoneDigits: true,
          ehDecisor: true,
          ehGatekeeper: true,
          tipoDeGatekeeper: true,
          confianca: true,
          comoFoiDescoberto: true,
        },
      })) as typeof contatos),
    );
    oportunidades.push(
      ...((await db.oportunidade.findMany({
        where: { empresaId: { in: lote } },
        select: { empresaId: true, estagio: true },
      })) as typeof oportunidades),
    );
  }

  const empresaPorId = new Map(empresas.map((e) => [e.id, e]));
  const contatosPorEmpresa = new Map<string, typeof contatos>();
  for (const c of contatos) {
    const lista = contatosPorEmpresa.get(c.empresaId) ?? [];
    lista.push(c);
    contatosPorEmpresa.set(c.empresaId, lista);
  }
  const empresasComVenda = new Set(
    oportunidades.filter((o) => o.estagio === "GANHA").map((o) => o.empresaId),
  );

  // ── A ficha por lead ──
  interface Ficha {
    lead: (typeof leads)[number];
    resumo: ResumoDoLead;
    etapa: EtapaAlcancada;
    temDecisor: boolean;
  }
  const fichas: Ficha[] = leads.map((lead) => {
    const resumo = porLead.get(lead.id) ?? resumoVazio();
    const doLead = lead.empresaId ? (contatosPorEmpresa.get(lead.empresaId) ?? []) : [];
    const temDecisor = doLead.some((c) => c.ehDecisor);
    const temGatekeeper = doLead.some((c) => c.ehGatekeeper);
    const empresa = lead.empresaId ? (empresaPorId.get(lead.empresaId) ?? null) : null;
    return {
      lead,
      resumo,
      temDecisor,
      etapa: etapaAlcancada({
        estado: lead.stage,
        respondeu: resumo.entradas > 0,
        temDecisor,
        temGatekeeper,
        estagioDaEmpresa: empresa?.estagio ?? null,
        temOportunidadeGanha: lead.empresaId ? empresasComVenda.has(lead.empresaId) : false,
      }),
    };
  });

  // ── 1 e 2: abordados, responderam, por dia e por semana ──
  const responderam = fichas.filter((f) => f.resumo.entradas > 0).length;
  const porDia = new Map<string, number>();
  const porSemana = new Map<string, number>();
  for (const f of fichas) {
    const quando = f.resumo.primeiraSaida;
    if (!quando) continue;
    porDia.set(diaDe(quando), (porDia.get(diaDe(quando)) ?? 0) + 1);
    porSemana.set(semanaDe(quando), (porSemana.get(semanaDe(quando)) ?? 0) + 1);
  }

  const abordagem = medido({
    abordados: fichas.length,
    responderam,
    nuncaResponderam: fichas.length - responderam,
    taxaDeResposta: taxa(responderam, fichas.length),
    porDia: [...porDia.entries()]
      .map(([dia, abordados]) => ({ dia, abordados }))
      .sort((a, b) => a.dia.localeCompare(b.dia)),
    porSemana: [...porSemana.entries()]
      .map(([semana, abordados]) => ({ semana, abordados }))
      .sort((a, b) => a.semana.localeCompare(b.semana)),
  });

  // ⚠️ Lead abordado cuja linha sumiu de `SiteLead` (apagado depois da
  // mensagem) não vira zero silencioso: fica declarado.
  const abordadosSemFicha = idsAbordados.length - leads.length;

  // ── 3: onde a conversa morreu ──
  const contagemPorEtapa = new Map<EtapaAlcancada, number>();
  for (const e of ESCADA) contagemPorEtapa.set(e, 0);
  for (const f of fichas) contagemPorEtapa.set(f.etapa, (contagemPorEtapa.get(f.etapa) ?? 0) + 1);
  const ondeMorreu = medido(
    ESCADA.map((etapa) => ({
      etapa,
      rotulo: ROTULO_DA_ETAPA[etapa],
      quantos: contagemPorEtapa.get(etapa) ?? 0,
    })),
  );

  // ── 4: gatekeepers, por tipo, e os NÃO CLASSIFICADOS ──
  const gatekeepers = (() => {
    if (empresaIds.length === 0) {
      return naoMedido<{
        classificados: number;
        porTipo: Array<{ tipo: TipoDeGatekeeper; quantos: number }>;
        naoClassificados: {
          total: number;
          anterioresAoModulo: number;
          posterioresAoModuloSemSinal: number;
          observacao: string;
        };
      }>(
        `nenhum dos ${fichas.length} leads abordados nesta janela tem Empresa ligada, e a ` +
          "classificação de porteiro mora em `Contato`, que pende de `Empresa`. Não é zero " +
          "porteiro: é uma pergunta que esta base ainda não sabe responder para estes leads.",
      );
    }

    const doRecorte = contatos.filter((c) => c.ehGatekeeper);
    const tipos = new Map<TipoDeGatekeeper, number>();
    let semTipo = 0;
    for (const c of doRecorte) {
      if (c.tipoDeGatekeeper) tipos.set(c.tipoDeGatekeeper, (tipos.get(c.tipoDeGatekeeper) ?? 0) + 1);
      else semTipo += 1;
    }

    /** Respondeu, mas ninguém classificou quem respondeu. Separado em dois
     * porque a causa é diferente: um não PODIA ter sido classificado (a
     * conversa é anterior ao módulo), o outro podia e não foi. */
    let anteriores = 0;
    let posteriores = 0;
    for (const f of fichas) {
      if (f.resumo.entradas === 0) continue;
      const doLead = f.lead.empresaId ? (contatosPorEmpresa.get(f.lead.empresaId) ?? []) : [];
      if (doLead.some((c) => c.ehGatekeeper || c.ehDecisor)) continue;
      const ultima = f.resumo.ultimaEntrada;
      if (!ultima || ultima < MODULO_GATEKEEPER_DESDE) anteriores += 1;
      else posteriores += 1;
    }

    return medido({
      classificados: doRecorte.length,
      porTipo: [...tipos.entries()]
        .map(([tipo, quantos]) => ({ tipo, quantos }))
        .sort((a, b) => b.quantos - a.quantos),
      naoClassificados: {
        total: anteriores + posteriores + semTipo,
        anterioresAoModulo: anteriores,
        posterioresAoModuloSemSinal: posteriores + semTipo,
        observacao:
          "NÃO CLASSIFICADO é resposta legítima. Conversa anterior a " +
          `${MODULO_GATEKEEPER_DESDE.toISOString().slice(0, 10)} não passou pelo módulo de ` +
          "Gatekeeper e não pode ser carimbada retroativamente: carimbar 'atendente' em quem " +
          "era o dono queima o dono.",
      },
    });
  })();

  // ── 5: decisores capturados e as PISTAS que não viraram telefone ──
  const decisores = (() => {
    if (empresaIds.length === 0) {
      return naoMedido<{
        comTelefone: number;
        semTelefone: number;
        pistasSemTelefone: PistaDeDecisor[];
      }>(
        "nenhum lead abordado nesta janela tem Empresa ligada, e o decisor mora em `Contato`. " +
          "A captura de decisor não é medível para este recorte.",
      );
    }
    const doRecorte = contatos.filter((c) => c.ehDecisor);
    const comTelefone = doRecorte.filter((c) => !!c.telefoneDigits?.trim()).length;
    const pistas = doRecorte
      .filter((c) => !c.telefoneDigits?.trim())
      .map((c) => ({
        empresaId: c.empresaId,
        empresa: empresaPorId.get(c.empresaId)?.nome ?? null,
        nome: c.nome,
        cargo: c.cargo,
        canal: c.canal,
        telefone: null,
        temTelefone: false,
        confianca: c.confianca,
        comoFoiDescoberto: c.comoFoiDescoberto,
      }));
    return medido({
      comTelefone,
      semTelefone: pistas.length,
      pistasSemTelefone: pistas,
    });
  })();

  // ── 6: a amostra, para LER o que o lead respondeu ──
  const amostraDeFichas = [...fichas]
    .sort((a, b) => {
      const va = (a.resumo.ultimaEntrada ?? a.resumo.ultimaSaida)?.getTime() ?? 0;
      const vb = (b.resumo.ultimaEntrada ?? b.resumo.ultimaSaida)?.getTime() ?? 0;
      return vb - va;
    })
    .slice(0, amostraPedida);

  const amostra: ConversaDaAmostra[] = [];
  for (const lote of emLotes(amostraDeFichas.map((f) => f.lead.id))) {
    const msgs = (await db.leadMensagem.findMany({
      where: { leadId: { in: lote }, ...janelaDaMensagem },
      select: {
        leadId: true,
        direcao: true,
        autor: true,
        ocorreuEm: true,
        texto: true,
        legenda: true,
        status: true,
        templateNome: true,
        erro: true,
      },
      orderBy: { ocorreuEm: "asc" },
    })) as Array<{
      leadId: string;
      direcao: DirecaoDaMensagem;
      autor: AutorDaMensagem | null;
      ocorreuEm: Date;
      texto: string | null;
      legenda: string | null;
      status: string;
      templateNome: string | null;
      erro: string | null;
    }>;

    for (const f of amostraDeFichas.filter((x) => lote.includes(x.lead.id))) {
      amostra.push({
        leadId: f.lead.id,
        nome: f.lead.nome,
        empresa:
          f.lead.restaurante ??
          (f.lead.empresaId ? (empresaPorId.get(f.lead.empresaId)?.nome ?? null) : null),
        telefone: tel(f.lead.whatsapp),
        cidade: f.lead.cidade,
        estado: f.lead.stage,
        etapaAlcancada: f.etapa,
        primeiraAbordagemEm: f.resumo.primeiraSaida,
        ultimaMensagemEm: f.lead.ultimaMensagemEm,
        optOutEm: f.lead.optOutAt,
        mensagens: msgs
          .filter((m) => m.leadId === f.lead.id)
          .map((m) => ({
            quem: m.direcao === "ENTRADA" ? ("LEAD" as const) : ("FOOCCI" as const),
            autor: m.autor,
            quando: m.ocorreuEm,
            texto: m.texto ?? m.legenda ?? null,
            status: m.status,
            templateNome: m.templateNome,
            erro: m.erro,
          })),
      });
    }
  }
  amostra.sort(
    (a, b) =>
      (b.primeiraAbordagemEm?.getTime() ?? 0) - (a.primeiraAbordagemEm?.getTime() ?? 0),
  );

  // ── 7: os elegíveis para reabordagem ──
  const elegiveis = fichas
    .filter(
      (f) =>
        !f.lead.optOutAt && !f.temDecisor && ETAPAS_REABORDAVEIS.includes(f.etapa),
    )
    .sort(
      (a, b) => (a.resumo.ultimaSaida?.getTime() ?? 0) - (b.resumo.ultimaSaida?.getTime() ?? 0),
    );

  const reabordagem = medido({
    total: elegiveis.length,
    pagina,
    porPagina,
    criterio: CRITERIO_DE_REABORDAGEM,
    lista: elegiveis.slice((pagina - 1) * porPagina, pagina * porPagina).map((f) => ({
      leadId: f.lead.id,
      nome: f.lead.nome,
      empresa:
        f.lead.restaurante ??
        (f.lead.empresaId ? (empresaPorId.get(f.lead.empresaId)?.nome ?? null) : null),
      telefone: tel(f.lead.whatsapp),
      estado: f.lead.stage,
      etapaAlcancada: f.etapa,
      ultimaAbordagemEm: f.resumo.ultimaSaida,
      respondeuAlgumaVez: f.resumo.entradas > 0,
    })),
  });

  return {
    janela: { desde, ate, agora: pedido.agora },
    telefoneCompleto: completo,
    mensagensNaJanela,
    abordadosSemFicha,
    abordagem,
    ondeMorreu,
    gatekeepers,
    decisores,
    amostra,
    reabordagem,
  };
}
