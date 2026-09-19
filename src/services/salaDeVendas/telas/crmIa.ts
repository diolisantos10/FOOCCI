/**
 * A TELA 11 — CRM IA / DEPARTAMENTO DE CRM.
 *
 * ── ⚠️ DE QUAL CRM ESTAMOS FALANDO ──────────────────────────────────────────
 *
 * Deste: **nós vendendo o Foocci para donos de restaurante**. A base lida é a
 * de `SiteLead` e `Cliente` da Sala de Vendas. O CRM do restaurante — o dono
 * falando com os clientes DELE, cliente frio de 60 dias, cupom, recompra — vive
 * em `src/services/crm/**`, tem outro tenant e outra régua, e **nada dele entra
 * aqui**. Misturar os dois faria a saúde da base comercial da Foocci ser
 * calculada com dado de consumidor final.
 *
 * ── O QUE ESTA LEITURA FAZ ──────────────────────────────────────────────────
 *
 * Ela não inventa uma segunda verdade. Monta o plano do dia
 * (`montarPlanoDoDia`), pergunta ao banco quem já está numa cadência ativa e
 * quando é o próximo passo de cada um, lê os interruptores reais da corrente e
 * costura tudo no formato que o desenho 11 do CEO pede.
 *
 * ── ⛔ O QUE ELA NÃO FAZ: MANDAR, INSCREVER, GRAVAR ─────────────────────────
 *
 * Nenhuma escrita. `enfileirarPlano` existe e **não é chamado**. Abrir um
 * painel não pode ser um ato: um GET que enfileira transforma "dar uma olhada"
 * em "mandar mensagem para setecentas pessoas", e ninguém descobre a tempo.
 *
 * ── ⚠️ OS TRÊS BURACOS DO DESENHO, DECLARADOS E NÃO PREENCHIDOS ─────────────
 *
 * 1. **"vs. ontem"** em cada indicador. Não existe fotografia do plano de
 *    ontem gravada em lugar nenhum — o plano é calculado na leitura e morre
 *    nela. Variação sem base é invenção, então ela sai como `null` e a tela
 *    escreve o motivo.
 * 2. **"Aprovado"** como status de linha. No desenho há três estados
 *    (Pendente / Aprovado / Em execução). Aprovação de ação de CRM não existe
 *    no banco: não há coluna, tabela nem ato que a produza. Sobram os dois que
 *    o código sustenta — pendente e em execução — e o terceiro é declarado.
 * 3. **"Janela ideal" por contato.** A casa tem janela comercial
 *    (`janelaComercial.ts`) e ela é da CASA, igual para todo mundo. Uma hora
 *    diferente por contato exigiria histórico de resposta por horário, que
 *    ninguém mede. Sai a janela real, dita como é.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import {
  montarPlanoDoDia,
  proporCampanha,
  CADENCIA_POR_ESTADO,
  type PlanoDoDia,
  type SomaMedida,
  type SegmentoDeCampanha,
} from "../crm/planoDoDia";
import { ROTULO_DO_ESTADO } from "../crm/rotulosDoFollowUp";
import { PARADAS } from "../crm/cadenciaPorComportamento";
import { proximosPassosDoCliente, type FichaDoCliente, type MarcoDoPosVenda } from "../crm/posVenda";
import { SELECT_DO_CLIENTE } from "../crm/planoDoDia";
import { podeAbordarAgora } from "../janelaComercial";
import type { EstadoDeFollowUp } from "../crm/estadoDeFollowUp";

type Cliente = PrismaClient | Prisma.TransactionClient;

// ─────────────────────────────────────────────────────────────────────────────
// OS SEIS INDICADORES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Um indicador do topo.
 *
 * `variacao` é `null` sempre, hoje, e o campo existe assim de propósito: no dia
 * em que houver fotografia do plano de ontem, é só preenchê-lo. Um número
 * inventado no lugar dele não deixaria rastro nenhum de que era invenção.
 */
export interface IndicadorDaCrm {
  chave: string;
  rotulo: string;
  /** `null` = não medido, e o porquê está em `porqueNaoMedido`. */
  valor: number | null;
  /** Centavos, quando o indicador é dinheiro. */
  emCents: boolean;
  variacao: null;
  porqueSemVariacao: string;
  porqueNaoMedido: string | null;
  /** Quantos itens entraram sem estimativa, quando o indicador é dinheiro. */
  semEstimativa: number | null;
}

const SEM_BASE_DE_ONTEM =
  "sem base de ontem para comparar — o plano do dia é calculado na leitura e não " +
  "fica gravado, então não há fotografia de ontem contra a qual medir.";

// ─────────────────────────────────────────────────────────────────────────────
// OS SEGMENTOS / LISTAS DE CRM
// ─────────────────────────────────────────────────────────────────────────────

export type ChaveDeSegmento =
  | "leadsSemResposta"
  | "propostasParadas"
  | "reunioesPosDemo"
  | "clientesParaRecompra"
  | "upsell"
  | "reativacao"
  | "riscoDeChurn";

export interface SegmentoDaCrm {
  chave: ChaveDeSegmento;
  rotulo: string;
  total: number;
  /** A régra, em uma frase, que põe alguém nesta lista. */
  regra: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// O PLANO DO DIA — uma linha por contato
// ─────────────────────────────────────────────────────────────────────────────

export type StatusDaLinha = "PENDENTE" | "EM_EXECUCAO";

export interface LinhaDoPlano {
  leadId: string;
  nome: string;
  segmento: ChaveDeSegmento;
  segmentoRotulo: string;
  estado: EstadoDeFollowUp;
  /** O que a régua faria a seguir. Vem da cadência que atende o estado. */
  proximaAcao: string;
  /** `null` = nenhuma cadência atende este estado — e então não há próxima ação automática. */
  cadenciaSlug: string | null;
  canal: string;
  /** A janela comercial da casa, escrita. Não é predição por contato. */
  janelaIdeal: string;
  /** Centavos. `null` = ninguém estimou. Nunca zero por omissão. */
  potencialCents: number | null;
  status: StatusDaLinha;
  porque: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// A COLUNA DA DIREITA — copiloto, campanha, disparos, interruptores
// ─────────────────────────────────────────────────────────────────────────────

export interface DisparoAgendado {
  leadId: string;
  nome: string;
  cadencia: string;
  quando: Date;
  /** O título do passo que está agendado, quando ele existe. */
  passo: string | null;
}

/**
 * Um interruptor do desenho, com o estado REAL e por que ele não é clicável.
 *
 * ── ⛔ POR QUE NENHUM DELES LIGA NADA DAQUI ──────────────────────────────────
 *
 * Os três são variáveis de ambiente ou linha de configuração do banco, e o
 * envio está **pausado por ordem do CEO**. Um interruptor que a tela pudesse
 * virar seria um botão de ligar disparo em massa a um clique de distância — e a
 * frente inteira existe para que esse clique não exista. Então ele mostra o
 * estado medido e diz, na própria tela, onde se muda.
 */
export interface InterruptorDaCrm {
  chave: string;
  rotulo: string;
  descricao: string;
  /** `null` = não foi possível medir (e isso NÃO é "desligado"). */
  ligado: boolean | null;
  porqueNaoMedido: string | null;
  /** Onde se muda de verdade. A tela não muda. */
  ondeSeMuda: string;
}

export interface OportunidadePorSegmento {
  rotulo: string;
  /** O nome é `valor` porque é o que a peça de colunas do kit consome. */
  valor: number;
}

/** Um bloco da automação em destaque, desenhado como no rodapé do desenho 11. */
export interface BlocoEmDestaque {
  tipo: "GATILHO" | "ESPERA" | "MENSAGEM" | "CONDICAO" | "SAIDA";
  titulo: string;
  detalhe: string;
  /** Quando o bloco é uma bifurcação, o rótulo do ramo ("Sim" / "Não"). */
  ramo?: string;
}

export interface AutomacaoEmDestaque {
  slug: string;
  nome: string;
  ativa: boolean;
  inscritosAtivos: number;
  blocos: BlocoEmDestaque[];
}

// ─────────────────────────────────────────────────────────────────────────────
// O PANORAMA
// ─────────────────────────────────────────────────────────────────────────────

export interface PanoramaDaCrmIa {
  emitidoEm: string;
  indicadores: IndicadorDaCrm[];
  segmentos: SegmentoDaCrm[];
  plano: LinhaDoPlano[];
  /** Os valores possíveis dos filtros, tirados do que existe — não de uma lista fixa. */
  filtros: {
    segmentos: { chave: ChaveDeSegmento; rotulo: string }[];
    canais: string[];
    status: StatusDaLinha[];
  };
  diagnostico: string[];
  campanha: (SegmentoDeCampanha & { porqueNaoDispara: string }) | null;
  porqueSemCampanha: string | null;
  disparos: DisparoAgendado[];
  porqueSemDisparos: string | null;
  interruptores: InterruptorDaCrm[];
  oportunidadesPorSegmento: OportunidadePorSegmento[];
  automacaoEmDestaque: AutomacaoEmDestaque | null;
  porqueSemAutomacao: string | null;
  receitaPotencial: SomaMedida;
  limiteAtingido: boolean;
  naoMedido: string[];
}

const REGRA_DO_SEGMENTO: Record<ChaveDeSegmento, { rotulo: string; regra: string }> = {
  leadsSemResposta: {
    rotulo: "Leads sem resposta",
    regra: "a régua de follow-up classificou o contato num estado que pede ação hoje",
  },
  propostasParadas: {
    rotulo: "Propostas paradas",
    regra: "proposta enviada por escrito e sem resposta dentro do prazo da régua",
  },
  reunioesPosDemo: {
    rotulo: "Reuniões pós-demo",
    regra: "reunião marcada, ainda pendente de confirmação ou de desfecho",
  },
  clientesParaRecompra: {
    rotulo: "Clientes para recompra",
    regra: "conta de cliente com o marco RECOMPRA pendente na régua de pós-venda",
  },
  upsell: {
    rotulo: "Upsell",
    regra: "conta ativa, madura e saudável, sem nenhum upsell — saúde não medida NÃO qualifica",
  },
  reativacao: {
    rotulo: "Reativação",
    regra: "conta que parou de usar e não cancelou",
  },
  riscoDeChurn: {
    rotulo: "Risco de churn",
    regra: "sinais de churn somaram acima do limiar — risco não medido fica fora, e não é risco zero",
  },
};

/** O canal de toque desta casa, lido do passo, não suposto. */
function canalDoPasso(p: { executor: string; templateNome: string | null } | undefined): string {
  if (!p) return "não definido";
  if (p.executor === "HUMANO") return "Tarefa humana";
  return p.templateNome ? "WhatsApp (template)" : "WhatsApp";
}

/**
 * ⭐ O panorama da CRM IA.
 *
 * Uma varredura, nenhuma escrita.
 */
export async function panoramaDaCrmIa(
  db: Cliente,
  params: { agora?: Date; escopo?: Prisma.SiteLeadWhereInput; limite?: number; env?: NodeJS.ProcessEnv } = {},
): Promise<PanoramaDaCrmIa> {
  const agora = params.agora ?? new Date();
  const env = params.env ?? process.env;

  const plano: PlanoDoDia = await montarPlanoDoDia(db, {
    agora,
    escopo: params.escopo,
    limite: params.limite,
  });

  const [contas, cadencias, inscricoes, config] = await Promise.all([
    db.cliente.findMany({
      where: { situacao: { not: "CANCELADO" } },
      select: SELECT_DO_CLIENTE,
    }) as unknown as Promise<FichaDoCliente[]>,
    db.cadencia.findMany({
      orderBy: { slug: "asc" },
      select: {
        slug: true,
        nome: true,
        ativa: true,
        quando: true,
        passos: {
          orderBy: { ordem: "asc" },
          select: { ordem: true, titulo: true, esperaHoras: true, executor: true, templateNome: true, tipo: true },
        },
        _count: { select: { em: true } },
      },
    }),
    db.leadCadencia.findMany({
      where: { situacao: "ATIVA" },
      select: {
        leadId: true,
        passoAtual: true,
        proximoEm: true,
        cadencia: {
          select: {
            slug: true,
            nome: true,
            passos: { orderBy: { ordem: "asc" }, select: { ordem: true, titulo: true } },
          },
        },
        lead: { select: { nome: true } },
      },
    }),
    db.sdrIaConfig.findUnique({
      where: { slug: "ta" },
      select: { ligado: true, versaoAtivaId: true },
    }),
  ]);

  // ── Os segmentos ──────────────────────────────────────────────────────────
  let paraRecompra = 0;
  for (const c of contas) {
    if (proximosPassosDoCliente(c, agora).some((p) => p.marco === ("RECOMPRA" as MarcoDoPosVenda))) {
      paraRecompra += 1;
    }
  }

  const totalDoSegmento: Record<ChaveDeSegmento, number> = {
    leadsSemResposta: plano.filas.precisamDeFollowUp.length,
    propostasParadas: plano.filas.propostasSemRetorno.length,
    reunioesPosDemo: plano.filas.reunioesPendentes.length,
    clientesParaRecompra: paraRecompra,
    upsell: plano.filas.chanceDeUpsell.length,
    reativacao: plano.filas.paraReativar.length,
    riscoDeChurn: plano.filas.riscoDeChurn.length,
  };

  const segmentos: SegmentoDaCrm[] = (Object.keys(REGRA_DO_SEGMENTO) as ChaveDeSegmento[]).map((chave) => ({
    chave,
    rotulo: REGRA_DO_SEGMENTO[chave].rotulo,
    regra: REGRA_DO_SEGMENTO[chave].regra,
    total: totalDoSegmento[chave],
  }));

  // ── Os seis indicadores ───────────────────────────────────────────────────
  const indicadores: IndicadorDaCrm[] = [
    {
      chave: "contatosAnalisados",
      rotulo: "Contatos analisados hoje",
      valor: plano.contatosAnalisados,
      emCents: false,
      variacao: null,
      porqueSemVariacao: SEM_BASE_DE_ONTEM,
      porqueNaoMedido: null,
      semEstimativa: null,
    },
    {
      chave: "followUpsDoDia",
      rotulo: "Follow-ups do dia",
      valor: plano.filas.precisamDeFollowUp.length,
      emCents: false,
      variacao: null,
      porqueSemVariacao: SEM_BASE_DE_ONTEM,
      porqueNaoMedido: null,
      semEstimativa: null,
    },
    {
      chave: "propostasSemRetorno",
      rotulo: "Propostas sem retorno",
      valor: plano.filas.propostasSemRetorno.length,
      emCents: false,
      variacao: null,
      porqueSemVariacao: SEM_BASE_DE_ONTEM,
      porqueNaoMedido: null,
      semEstimativa: null,
    },
    {
      chave: "clientesEmRisco",
      rotulo: "Clientes em risco",
      valor: plano.filas.riscoDeChurn.length,
      emCents: false,
      variacao: null,
      porqueSemVariacao: SEM_BASE_DE_ONTEM,
      porqueNaoMedido: null,
      semEstimativa: null,
    },
    {
      chave: "reativacoes",
      rotulo: "Reativações",
      valor: plano.filas.paraReativar.length,
      emCents: false,
      variacao: null,
      porqueSemVariacao: SEM_BASE_DE_ONTEM,
      porqueNaoMedido: null,
      semEstimativa: null,
    },
    {
      chave: "receitaPotencial",
      rotulo: "Receita potencial",
      valor: plano.receitaPotencial.cents,
      emCents: true,
      variacao: null,
      porqueSemVariacao: SEM_BASE_DE_ONTEM,
      porqueNaoMedido: null,
      semEstimativa: plano.receitaPotencial.semEstimativa,
    },
  ];

  // ── O plano do dia, linha a linha ─────────────────────────────────────────
  const cadenciaPorSlug = new Map(cadencias.map((c) => [c.slug, c]));
  const inscritoPorLead = new Map(inscricoes.map((i) => [i.leadId, i]));

  const janela = podeAbordarAgora(agora, env);
  const janelaEscrita = janela.detalhe;

  /** Cada lead aparece UMA vez, pelo segmento mais específico que o alcança. */
  const linhaPorLead = new Map<string, LinhaDoPlano>();
  const porOrdemDeEspecificidade: [ChaveDeSegmento, typeof plano.filas.precisamDeFollowUp][] = [
    ["leadsSemResposta", plano.filas.precisamDeFollowUp],
    ["reunioesPosDemo", plano.filas.reunioesPendentes],
    ["propostasParadas", plano.filas.propostasSemRetorno],
  ];

  for (const [chave, fila] of porOrdemDeEspecificidade) {
    for (const i of fila) {
      const slug = CADENCIA_POR_ESTADO[i.estado] ?? null;
      const cad = slug ? cadenciaPorSlug.get(slug) : undefined;
      const inscrito = inscritoPorLead.get(i.leadId);
      const passo = cad?.passos[inscrito ? inscrito.passoAtual : 0];

      linhaPorLead.set(i.leadId, {
        leadId: i.leadId,
        nome: i.nome,
        segmento: chave,
        segmentoRotulo: REGRA_DO_SEGMENTO[chave].rotulo,
        estado: i.estado,
        proximaAcao:
          passo?.titulo ??
          (slug
            ? `a cadência "${slug}" atende este estado, mas não está cadastrada no banco`
            : `nenhuma cadência atende ${ROTULO_DO_ESTADO[i.estado]} — a próxima ação é humana`),
        cadenciaSlug: slug,
        canal: canalDoPasso(passo),
        janelaIdeal: janelaEscrita,
        potencialCents: i.valorPotencialCents,
        status: inscrito ? "EM_EXECUCAO" : "PENDENTE",
        porque: i.porque,
      });
    }
  }

  const planoEmLinhas = [...linhaPorLead.values()].sort((a, b) => {
    const va = a.potencialCents ?? -1;
    const vb = b.potencialCents ?? -1;
    return vb - va;
  });

  // ── Os próximos disparos ──────────────────────────────────────────────────
  const disparos: DisparoAgendado[] = inscricoes
    .filter((i) => i.proximoEm !== null)
    .sort((a, b) => (a.proximoEm as Date).getTime() - (b.proximoEm as Date).getTime())
    .slice(0, 12)
    .map((i) => ({
      leadId: i.leadId,
      nome: i.lead.nome,
      cadencia: i.cadencia.nome,
      quando: i.proximoEm as Date,
      passo: i.cadencia.passos[i.passoAtual]?.titulo ?? null,
    }));

  // ── Os interruptores, com o estado real ───────────────────────────────────
  const ligada = (nome: string): boolean => (env[nome] ?? "").trim().toLowerCase() === "true";

  const interruptores: InterruptorDaCrm[] = [
    {
      chave: "followUpAutomatico",
      rotulo: "Follow-up automático",
      descricao: "as cadências avançam sozinhas e o passo de mensagem sai pelo motor de abordagem",
      ligado: ligada("FOOCCI_SDR_SEND_ENABLED"),
      porqueNaoMedido: null,
      ondeSeMuda: "variável de ambiente FOOCCI_SDR_SEND_ENABLED — só o CEO a troca",
    },
    {
      chave: "reativacaoDeInativos",
      rotulo: "Reativação de inativos",
      descricao: "a cadência de retomada por silêncio, quando existe e está ativa no banco",
      ligado: cadenciaPorSlug.get("retomada-sem-resposta")?.ativa ?? null,
      porqueNaoMedido: cadenciaPorSlug.has("retomada-sem-resposta")
        ? null
        : 'a cadência "retomada-sem-resposta" não existe na base — isso não é "desligada", é inexistente',
      ondeSeMuda: "coluna `ativa` da cadência, no banco",
    },
    {
      chave: "alertaDeChurn",
      rotulo: "Alerta de churn",
      descricao: "o TA avisa sobre conta em risco",
      ligado: config ? config.ligado && Boolean(config.versaoAtivaId) : null,
      porqueNaoMedido: config
        ? null
        : 'não existe linha `SdrIaConfig` com slug "ta" no banco — o estado do alerta não pôde ser lido',
      ondeSeMuda: "configuração do TA (`SdrIaConfig`), no banco",
    },
  ];

  // ── Campanha recomendada ──────────────────────────────────────────────────
  //
  // ⚠️ O mapa de objeções vai VAZIO, e isto é medição, não esquecimento: não
  // existe no schema nenhum modelo que registre a objeção de um lead. Com o
  // mapa vazio, `proporCampanha` devolve `objecaoPrincipal: null` e escreve
  // "a objeção deste público não está registrada" — que é a verdade. Inventar
  // uma objeção plausível erraria o argumento em todo mundo do público.
  const campanhaBruta = proporCampanha(plano, new Map());

  // ── Automação em destaque ─────────────────────────────────────────────────
  const destaque = cadenciaPorSlug.get("retomada-sem-resposta") ?? cadencias[0] ?? null;
  const automacaoEmDestaque: AutomacaoEmDestaque | null = destaque
    ? {
        slug: destaque.slug,
        nome: destaque.nome,
        ativa: destaque.ativa,
        inscritosAtivos: inscricoes.filter((i) => i.cadencia.slug === destaque.slug).length,
        blocos: [
          {
            tipo: "GATILHO",
            titulo: "Gatilho",
            detalhe: destaque.quando ?? "sem descrição de gatilho gravada na cadência",
          },
          ...destaque.passos.flatMap((p): BlocoEmDestaque[] => [
            {
              tipo: "ESPERA",
              titulo: "Espera",
              detalhe: `aguardar ${p.esperaHoras}h`,
            },
            {
              tipo: "MENSAGEM",
              titulo: p.executor === "HUMANO" ? "Tarefa humana" : "Mensagem",
              detalhe: p.titulo,
            },
          ]),
          {
            tipo: "CONDICAO",
            titulo: "Condição de parada",
            detalhe: PARADAS.map((p) => p.motivo).join(" · "),
          },
        ],
      }
    : null;

  // ── O diagnóstico do dia — frases medidas, não conselho genérico ──────────
  const diagnostico: string[] = [];
  if (plano.filas.precisamDeFollowUp.length) {
    diagnostico.push(
      `${plano.filas.precisamDeFollowUp.length} contato(s) estão num estado que pede ação hoje.`,
    );
  }
  if (plano.filas.propostasSemRetorno.length) {
    diagnostico.push(
      `${plano.filas.propostasSemRetorno.length} proposta(s) foram enviadas e não voltaram dentro do prazo da régua.`,
    );
  }
  if (plano.filas.riscoDeChurn.length) {
    diagnostico.push(`${plano.filas.riscoDeChurn.length} conta(s) somaram sinais de churn acima do limiar.`);
  }
  const envio = interruptores.find((i) => i.chave === "followUpAutomatico");
  if (envio && !envio.ligado) {
    diagnostico.push(
      "O envio está DESLIGADO: as cadências avançam e a mensagem fica pendente. Nada sai desta tela nem de nenhuma outra enquanto a chave estiver assim.",
    );
  }
  if (!diagnostico.length) {
    diagnostico.push("Nenhuma fila pediu ação nesta leitura. Isso é ausência de pendência, e não é 'tudo certo' — é o que foi medido agora.");
  }

  // ── O não medido ──────────────────────────────────────────────────────────
  const naoMedido: string[] = [SEM_BASE_DE_ONTEM];

  naoMedido.push(
    'O status "Aprovado" do desenho não existe: não há aprovação de ação de CRM no banco — nem coluna, nem tabela, nem ato que a produza. A tela mostra os dois estados que o código sustenta, pendente e em execução.',
  );
  naoMedido.push(
    `A "janela ideal" é a janela comercial da CASA, igual para todos (${janelaEscrita}). Uma hora diferente por contato exigiria histórico de resposta por horário, que ninguém mede aqui.`,
  );

  if (plano.limiteAtingido) {
    naoMedido.push(
      "A varredura bateu no teto de linhas: TODA contagem desta tela é um PISO, e não um total.",
    );
  }
  if (plano.naoMedidos > 0) {
    naoMedido.push(
      `${plano.naoMedidos} contato(s) em NÃO MEDIDO: nenhuma regra casou com o retrato deles. Eles ficam fora das filas de propósito.`,
    );
  }
  if (plano.receitaPotencial.semEstimativa > 0) {
    naoMedido.push(
      `A receita potencial soma apenas ${plano.receitaPotencial.comEstimativa} item(ns) estimado(s); ${plano.receitaPotencial.semEstimativa} entraram sem valor. O número é um piso.`,
    );
  }
  if (!cadencias.length) {
    naoMedido.push(
      "Nenhuma cadência cadastrada no banco: os segmentos acima classificam e nada é acionado. A coluna 'próxima ação' fica sem automação para apontar.",
    );
  }
  naoMedido.push(
    "Objeção por lead não é registrada em lugar nenhum do banco — não há modelo para ela. A campanha recomendada por isso não sabe qual argumento atacar, e diz isso em vez de chutar um.",
  );

  return {
    emitidoEm: agora.toISOString(),
    indicadores,
    segmentos,
    plano: planoEmLinhas,
    filtros: {
      segmentos: segmentos.map((s) => ({ chave: s.chave, rotulo: s.rotulo })),
      canais: [...new Set(planoEmLinhas.map((l) => l.canal))].sort(),
      status: ["PENDENTE", "EM_EXECUCAO"],
    },
    diagnostico,
    campanha: campanhaBruta
      ? {
          ...campanhaBruta,
          porqueNaoDispara:
            "o público está montado e nada é enviado daqui: o envio está pausado por ordem do CEO, e disparar campanha nunca foi ato de tela.",
        }
      : null,
    porqueSemCampanha: campanhaBruta
      ? null
      : "nenhuma proposta sem retorno nesta leitura — a campanha recomendada nasce desse público, e sem ele não há campanha a recomendar.",
    disparos,
    porqueSemDisparos: disparos.length
      ? null
      : "nenhuma inscrição ativa com próximo passo agendado. Sem fila, não há disparo previsto — e isso é ausência de agendamento, não disparo às 00:00.",
    interruptores,
    oportunidadesPorSegmento: segmentos
      .filter((s) => s.chave !== "leadsSemResposta")
      .map((s) => ({ rotulo: s.rotulo, valor: s.total })),
    automacaoEmDestaque,
    porqueSemAutomacao: automacaoEmDestaque
      ? null
      : "nenhuma cadência cadastrada no banco — não há automação real a desenhar em blocos, e desenhar uma de exemplo ensinaria a operação a contar com o que não existe.",
    receitaPotencial: plano.receitaPotencial,
    limiteAtingido: plano.limiteAtingido,
    naoMedido,
  };
}
