/**
 * A TELA 09 — FOLLOW-UP AUTOMÁTICO.
 *
 * ── ⚠️ DE QUAL FOLLOW-UP ESTAMOS FALANDO ────────────────────────────────────
 *
 * Do NOSSO: as jornadas que a Foocci roda em cima dos leads da Sala de Vendas —
 * donos de restaurante que a gente está vendendo. O follow-up que o restaurante
 * faz com os clientes DELE mora em `src/services/crm/**` e não encosta aqui.
 *
 * ── ⛔ POR QUE NÃO EXISTE CONSTRUTOR QUE SALVA ──────────────────────────────
 *
 * O desenho tem um "Construtor da Jornada" com Salvar e Ativar, e uma paleta de
 * blocos para arrastar. **Medido no schema, e é aqui que ele para:**
 *
 *   - `Cadencia` guarda slug, nome, `ativa` e uma frase de `quando`;
 *   - `CadenciaPasso` guarda ordem, `esperaHoras`, tipo, executor, título e
 *     template. **Não tem coluna de condição, e não tem ramo.**
 *   - A condição de cada passo vive num catálogo TIPADO em código
 *     (`CATALOGO_DE_CONDICOES`, indexado por `slug#ordem`), e o próprio arquivo
 *     declara o custo: *"mudar a condição de um passo exige deploy"*.
 *
 * Ou seja: **uma jornada desenhada na tela não tem onde ser gravada.** Não há
 * onde pôr a bifurcação, não há onde pôr a condição, e o schema desta entrega
 * está fechado. Um construtor que arrasta blocos e não grava nada é a tela
 * mentindo — o operador monta a jornada, aperta Salvar, vê um verde e a jornada
 * não existe.
 *
 * Então esta leitura faz o que a trava manda: **desenha em blocos as jornadas
 * que de fato existem no código e no banco**, passo a passo, com as condições
 * reais de cada passo e a condição de parada real. É o mesmo desenho, com a
 * diferença de que o que está na tela é verdade.
 *
 * O que falta para ele ser editável está em `oQueFaltaParaEditar`, devolvido na
 * própria leitura — para a lacuna chegar a quem decide, e não morrer num commit.
 *
 * ── ⛔ E NADA É ENVIADO DAQUI ───────────────────────────────────────────────
 *
 * Nenhuma escrita, nenhum envio, nenhuma inscrição. Quem envia é `abordar.ts`,
 * e ele está atrás de `FOOCCI_SDR_SEND_ENABLED` — hoje pausado por ordem do CEO.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import {
  PARADAS,
  CATALOGO_DE_CONDICOES,
  chaveDaCondicao,
} from "../crm/cadenciaPorComportamento";
import { CADENCIA_POR_ESTADO } from "../crm/planoDoDia";
import { ROTULO_DO_ESTADO } from "../crm/rotulosDoFollowUp";
import type { EstadoDeFollowUp } from "../crm/estadoDeFollowUp";

type Cliente = PrismaClient | Prisma.TransactionClient;

// ─────────────────────────────────────────────────────────────────────────────
// O BLOCO — a unidade do desenho
// ─────────────────────────────────────────────────────────────────────────────

export type TipoDeBloco =
  | "GATILHO"
  | "CONDICAO"
  | "ESPERA"
  | "TEMPLATE"
  | "TAREFA"
  | "PARADA";

export interface BlocoDaJornada {
  id: string;
  tipo: TipoDeBloco;
  titulo: string;
  detalhe: string;
  /** A condição declarada para este passo, quando há uma. `null` = executa sempre. */
  condicao: string | null;
  /** Os estados em que o passo faz sentido. Vazio = qualquer um. */
  estados: { estado: EstadoDeFollowUp; rotulo: string }[];
}

export interface JornadaEmBlocos {
  slug: string;
  nome: string;
  ativa: boolean;
  /** A frase de `quando` da cadência. `null` = ninguém escreveu o gatilho. */
  quando: string | null;
  /** Os estados de follow-up que fazem alguém entrar nesta jornada. */
  acionadaPor: { estado: EstadoDeFollowUp; rotulo: string }[];
  blocos: BlocoDaJornada[];
  inscritosAtivos: number;
  inscritosPausados: number;
  inscritosConcluidos: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// A TABELA DE AUTOMAÇÕES ATIVAS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Uma linha da tabela do rodapé.
 *
 * ⚠️ O desenho tem, por automação, as colunas **Mensagens enviadas ·
 * Respostas · Recuperações · Vendas (R$)**. Nenhuma delas é medível: não existe
 * no schema nada que ligue uma mensagem enviada, uma resposta recebida ou uma
 * venda fechada **à cadência que a provocou**. `LeadTarefa` aponta para a
 * inscrição, mas tarefa não é mensagem, e mensagem não carrega a atribuição.
 *
 * Por isso os campos saem `null` com o motivo escrito, e não 0. Zero ali diria
 * "esta automação não recuperou ninguém", que é uma afirmação — e ninguém mediu.
 */
export interface AutomacaoNaTabela {
  ordem: number;
  slug: string;
  nome: string;
  gatilho: string;
  ativa: boolean;
  passos: number;
  leadsNoFluxo: number;
  mensagensEnviadas: null;
  respostas: null;
  recuperacoes: null;
  vendasCents: null;
  porqueSemNumeros: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// OS LOGS DE EXECUÇÃO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * O que existe de rastro de execução: a tarefa que um passo de cadência criou.
 *
 * É o registro real e verificável de que uma jornada mexeu em alguém. Não é um
 * log de envio — envio não é registrado por cadência — e a tela diz isso.
 */
export interface LinhaDeLog {
  tarefaId: string;
  leadId: string;
  lead: string;
  cadencia: string | null;
  titulo: string;
  tipo: string;
  situacao: string;
  criadaPor: string;
  venceEm: Date;
  concluidaEm: Date | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// O PANORAMA
// ─────────────────────────────────────────────────────────────────────────────

export interface ResultadosDaJornada {
  mensagensEnviadas: null;
  respostas: null;
  taxaDeResposta: null;
  recuperacoes: null;
  reativacoes: null;
  vendasRecuperadasCents: null;
  porqueNaoMedido: string;
  /** O que É medido no lugar: inscritos por situação. Contagem real. */
  inscritosAtivos: number;
  inscritosPausados: number;
  inscritosConcluidos: number;
  inscritosCancelados: number;
  tarefasAbertas: number;
  tarefasConcluidas: number;
}

export interface PanoramaDoFollowUpAutomatico {
  emitidoEm: string;
  /** As jornadas que existem, desenhadas em blocos. Nenhuma é de exemplo. */
  jornadas: JornadaEmBlocos[];
  porqueSemJornadas: string | null;
  /** Os modelos prontos = as jornadas que o código sabe acionar por estado. */
  modelosProntos: { estado: EstadoDeFollowUp; rotulo: string; slug: string; existeNoBanco: boolean }[];
  tabela: AutomacaoNaTabela[];
  logs: LinhaDeLog[];
  porqueSemLogs: string | null;
  resultados: ResultadosDaJornada;
  paradas: { motivo: string; explicacao: string }[];
  envioAtivo: boolean;
  /** A tela não constrói jornada. Isto é o que falta para que ela pudesse. */
  oQueFaltaParaEditar: string[];
  naoMedido: string[];
}

const SEM_ATRIBUICAO =
  "não existe no schema nada que ligue mensagem enviada, resposta recebida ou venda fechada " +
  "à cadência que a provocou — a atribuição por automação não é medida em lugar nenhum. " +
  "Zero aqui seria uma afirmação que ninguém apurou.";

export const O_QUE_FALTA_PARA_EDITAR: readonly string[] = [
  "`CadenciaPasso` não tem coluna de CONDIÇÃO: a condição de cada passo vive num catálogo tipado em código (`CATALOGO_DE_CONDICOES`), e mudá-la exige deploy.",
  "Não existe modelo de RAMO: a jornada do desenho bifurca em Sim/Não, e o banco só guarda passos numa ordem linear (`@@unique([cadenciaId, ordem])`).",
  "A CONDIÇÃO DE PARADA é código (`PARADAS`, em ordem normativa), não dado — não há onde gravar uma parada diferente por jornada.",
  "Não há rota de escrita de cadência: criar, renomear, ativar ou reordenar passos não tem endpoint, e criar um seria abrir escrita numa frente que é de leitura.",
  "Sem atribuição por cadência, um construtor não teria como mostrar o efeito do que se construiu — editar às cegas é pior que não editar.",
];

/**
 * ⭐ O panorama do follow-up automático. Uma varredura, nenhuma escrita.
 */
export async function panoramaDoFollowUpAutomatico(
  db: Cliente,
  params: { agora?: Date; limiteDeLogs?: number; env?: NodeJS.ProcessEnv } = {},
): Promise<PanoramaDoFollowUpAutomatico> {
  const agora = params.agora ?? new Date();
  const env = params.env ?? process.env;
  const limiteDeLogs = params.limiteDeLogs ?? 50;

  const [cadencias, inscricoes, tarefas] = await Promise.all([
    db.cadencia.findMany({
      orderBy: { slug: "asc" },
      select: {
        slug: true,
        nome: true,
        ativa: true,
        quando: true,
        passos: {
          orderBy: { ordem: "asc" },
          select: {
            id: true,
            ordem: true,
            esperaHoras: true,
            tipo: true,
            executor: true,
            titulo: true,
            templateNome: true,
            roteiro: true,
          },
        },
      },
    }),
    db.leadCadencia.groupBy({
      by: ["cadenciaId", "situacao"],
      _count: { _all: true },
    }) as unknown as Promise<{ cadenciaId: string; situacao: string; _count: { _all: number } }[]>,
    db.leadTarefa.findMany({
      orderBy: { venceEm: "desc" },
      take: limiteDeLogs,
      where: { cadenciaId: { not: null } },
      select: {
        id: true,
        leadId: true,
        titulo: true,
        tipo: true,
        situacao: true,
        criadaPor: true,
        venceEm: true,
        concluidaEm: true,
        lead: { select: { nome: true } },
        cadencia: { select: { cadencia: { select: { nome: true } } } },
      },
    }),
  ]);

  // As contagens por cadência precisam do id, e o `select` acima é por slug —
  // uma segunda leitura enxuta casa os dois sem trazer a tabela inteira.
  const idsDasCadencias = await db.cadencia.findMany({ select: { id: true, slug: true } });
  const slugPorId = new Map(idsDasCadencias.map((c) => [c.id, c.slug]));

  const porSlugESituacao = new Map<string, number>();
  for (const i of inscricoes) {
    const slug = slugPorId.get(i.cadenciaId);
    if (!slug) continue;
    porSlugESituacao.set(`${slug}#${i.situacao}`, i._count._all);
  }
  const contar = (slug: string, situacao: string): number =>
    porSlugESituacao.get(`${slug}#${situacao}`) ?? 0;

  // ── Quais estados acionam qual jornada ────────────────────────────────────
  const acionaPor = new Map<string, EstadoDeFollowUp[]>();
  for (const [estado, slug] of Object.entries(CADENCIA_POR_ESTADO)) {
    if (!slug) continue;
    acionaPor.set(slug, [...(acionaPor.get(slug) ?? []), estado as EstadoDeFollowUp]);
  }

  // ── As jornadas, em blocos ────────────────────────────────────────────────
  const jornadas: JornadaEmBlocos[] = cadencias.map((c) => {
    const gatilhos = acionaPor.get(c.slug) ?? [];

    const blocos: BlocoDaJornada[] = [
      {
        id: `${c.slug}#gatilho`,
        tipo: "GATILHO",
        titulo: "Gatilho",
        detalhe:
          c.quando ??
          (gatilhos.length
            ? `entra quem a régua classificar em ${gatilhos.map((e) => ROTULO_DO_ESTADO[e]).join(" ou ")}`
            : "nenhuma frase de gatilho gravada na cadência, e nenhum estado a aciona"),
        condicao: null,
        estados: gatilhos.map((estado) => ({ estado, rotulo: ROTULO_DO_ESTADO[estado] })),
      },
    ];

    for (const p of c.passos) {
      const cond = CATALOGO_DE_CONDICOES[chaveDaCondicao(c.slug, p.ordem)] ?? null;

      blocos.push({
        id: `${p.id}#espera`,
        tipo: "ESPERA",
        titulo: "Espera",
        detalhe:
          p.esperaHoras === 0
            ? "sem espera — este passo vence na entrada"
            : `aguardar ${p.esperaHoras}h`,
        condicao: null,
        estados: [],
      });

      const ehTemplate = p.executor !== "HUMANO";
      blocos.push({
        id: p.id,
        tipo: ehTemplate ? "TEMPLATE" : "TAREFA",
        titulo: ehTemplate
          ? p.templateNome
            ? `Template WhatsApp · ${p.templateNome}`
            : "Mensagem WhatsApp"
          : "Tarefa humana",
        detalhe: p.roteiro?.trim() ? p.roteiro.trim() : p.titulo,
        condicao: cond ? cond.descricao : null,
        estados: (cond?.estados ?? []).map((estado) => ({ estado, rotulo: ROTULO_DO_ESTADO[estado] })),
      });
    }

    blocos.push({
      id: `${c.slug}#parada`,
      tipo: "PARADA",
      titulo: "Condição de parada",
      detalhe: PARADAS.map((p) => p.explicacao).join(" · "),
      condicao: "a parada é avaliada antes de cada passo, na ordem normativa das regras",
      estados: [],
    });

    return {
      slug: c.slug,
      nome: c.nome,
      ativa: c.ativa,
      quando: c.quando,
      acionadaPor: gatilhos.map((estado) => ({ estado, rotulo: ROTULO_DO_ESTADO[estado] })),
      blocos,
      inscritosAtivos: contar(c.slug, "ATIVA"),
      inscritosPausados: contar(c.slug, "PAUSADA"),
      inscritosConcluidos: contar(c.slug, "CONCLUIDA"),
    };
  });

  // ── A tabela do rodapé ────────────────────────────────────────────────────
  const tabela: AutomacaoNaTabela[] = jornadas.map((j, i) => ({
    ordem: i + 1,
    slug: j.slug,
    nome: j.nome,
    gatilho: j.quando ?? j.acionadaPor.map((g) => g.rotulo).join(" · ") ?? "sem gatilho declarado",
    ativa: j.ativa,
    passos: j.blocos.filter((b) => b.tipo === "TEMPLATE" || b.tipo === "TAREFA").length,
    leadsNoFluxo: j.inscritosAtivos,
    mensagensEnviadas: null,
    respostas: null,
    recuperacoes: null,
    vendasCents: null,
    porqueSemNumeros: SEM_ATRIBUICAO,
  }));

  // ── Os logs ───────────────────────────────────────────────────────────────
  const logs: LinhaDeLog[] = tarefas.map((t) => ({
    tarefaId: t.id,
    leadId: t.leadId,
    lead: t.lead.nome,
    cadencia: t.cadencia?.cadencia.nome ?? null,
    titulo: t.titulo,
    tipo: String(t.tipo),
    situacao: String(t.situacao),
    criadaPor: String(t.criadaPor),
    venceEm: t.venceEm,
    concluidaEm: t.concluidaEm,
  }));

  // ── Os resultados ─────────────────────────────────────────────────────────
  const somar = (situacao: string): number =>
    jornadas.reduce((t, j) => {
      if (situacao === "ATIVA") return t + j.inscritosAtivos;
      if (situacao === "PAUSADA") return t + j.inscritosPausados;
      return t + j.inscritosConcluidos;
    }, 0);

  const cancelados = [...porSlugESituacao.entries()]
    .filter(([k]) => k.endsWith("#CANCELADA"))
    .reduce((t, [, v]) => t + v, 0);

  const resultados: ResultadosDaJornada = {
    mensagensEnviadas: null,
    respostas: null,
    taxaDeResposta: null,
    recuperacoes: null,
    reativacoes: null,
    vendasRecuperadasCents: null,
    porqueNaoMedido: SEM_ATRIBUICAO,
    inscritosAtivos: somar("ATIVA"),
    inscritosPausados: somar("PAUSADA"),
    inscritosConcluidos: somar("CONCLUIDA"),
    inscritosCancelados: cancelados,
    tarefasAbertas: logs.filter((l) => l.situacao === "ABERTA").length,
    tarefasConcluidas: logs.filter((l) => l.concluidaEm !== null).length,
  };

  const envioAtivo = (env.FOOCCI_SDR_SEND_ENABLED ?? "").trim().toLowerCase() === "true";

  // ── Os modelos prontos = o que o código sabe acionar ──────────────────────
  const slugsNoBanco = new Set(cadencias.map((c) => c.slug));
  const modelosProntos = Object.entries(CADENCIA_POR_ESTADO)
    .filter(([, slug]) => Boolean(slug))
    .map(([estado, slug]) => ({
      estado: estado as EstadoDeFollowUp,
      rotulo: ROTULO_DO_ESTADO[estado as EstadoDeFollowUp],
      slug: slug as string,
      existeNoBanco: slugsNoBanco.has(slug as string),
    }));

  // ── O não medido ──────────────────────────────────────────────────────────
  const naoMedido: string[] = [
    `Mensagens enviadas, respostas, recuperações e vendas recuperadas por automação: ${SEM_ATRIBUICAO}`,
    "O Construtor da Jornada é de LEITURA: ele desenha as jornadas que existem no código e no banco. Não há onde gravar uma jornada nova — o motivo está em 'o que falta para editar'.",
  ];

  if (!cadencias.length) {
    naoMedido.push(
      "Nenhuma cadência cadastrada no banco. Não há jornada a desenhar, e desenhar uma de exemplo ensinaria a operação a contar com o que não existe.",
    );
  }
  if (!envioAtivo) {
    naoMedido.push(
      "FOOCCI_SDR_SEND_ENABLED não está em \"true\": as jornadas avançam e o passo de mensagem fica PENDENTE. Nada sai — nem desta tela, nem do motor.",
    );
  }
  const semPassos = cadencias.filter((c) => !c.passos.length);
  if (semPassos.length) {
    naoMedido.push(
      `${semPassos.length} cadência(s) sem nenhum passo cadastrado (${semPassos.map((c) => c.slug).join(", ")}): elas existem e não fazem nada.`,
    );
  }
  const faltando = modelosProntos.filter((m) => !m.existeNoBanco);
  if (faltando.length) {
    naoMedido.push(
      `${faltando.length} estado(s) têm cadência declarada em código que NÃO existe no banco (${faltando.map((m) => m.slug).join(", ")}): quem cair nesses estados não é enfileirado em lugar nenhum.`,
    );
  }

  return {
    emitidoEm: agora.toISOString(),
    jornadas,
    porqueSemJornadas: jornadas.length
      ? null
      : "nenhuma cadência cadastrada no banco — não há jornada real a desenhar em blocos.",
    modelosProntos,
    tabela,
    logs,
    porqueSemLogs: logs.length
      ? null
      : "nenhuma tarefa criada por passo de cadência até agora. É ausência de execução registrada, e não execução com resultado zero.",
    resultados,
    paradas: PARADAS.map((p) => ({ motivo: p.motivo, explicacao: p.explicacao })),
    envioAtivo,
    oQueFaltaParaEditar: [...O_QUE_FALTA_PARA_EDITAR],
    naoMedido,
  };
}
