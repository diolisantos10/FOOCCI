/**
 * O ESTADO DA CORRENTE — do lead que entra até o plano vendido, numa chamada.
 *
 * ── POR QUE ESTA LEITURA PRECISOU EXISTIR ───────────────────────────────────
 *
 * A pergunta do CEO é uma só: *"o lead que entrou foi abordado e alguém vendeu
 * um plano pra ele?"*. Responder exigia saber (a) se os interruptores estão
 * ligados e (b) onde a corrente parou. Nenhuma das duas era legível:
 *
 *   · **os interruptores** moram em variáveis de ambiente do Railway, e os
 *     valores vêm OCULTOS — ninguém desta casa consegue lê-los na tela. Ler o
 *     arquivo que define a chave diz o NOME dela, nunca o VALOR em produção.
 *     Só de dentro do processo se sabe. Esta rota é esse "de dentro".
 *   · **a corrente** só existia como número solto em telas diferentes, e
 *     nenhuma delas somava até fechar.
 *
 * ── ⚠️ ELA SÓ LÊ ────────────────────────────────────────────────────────────
 *
 * Não envia, não agenda, não escreve, não muda estágio nem dono. Isso é MEDIDO
 * pelo teste de contrato que lê este fonte (`contrato.test.ts`), no mesmo molde
 * do raio-x das conversas.
 *
 * ── ⚠️ E ELA NUNCA ESCREVE ZERO NO LUGAR DE "NÃO SEI" ───────────────────────
 *
 * Todo número que não pôde ser medido sai como `null` acompanhado do MOTIVO,
 * e o motivo entra também na lista `naoMedido`. Zero e "não medido" produzem
 * telas idênticas e decisões opostas — foi assim que a fila de SLA estourado
 * passou semanas devolvendo um tranquilizador zero para uma coluna que ninguém
 * jamais escreveu.
 */

import type { Prisma, PrismaClient, SiteLeadStage, SiteLeadSource } from "@prisma/client";
import { escolherAgente } from "../quemAtende";
import {
  FONTES_QUE_NOS_PROCURARAM,
  VARIAVEL_DA_RECEPCAO,
  recepcaoLigada,
} from "../recepcao/portasDeEntrada";
import { MINUTOS_PARA_A_PRIMEIRA_RESPOSTA } from "../recepcao/prazoDaPrimeiraResposta";
import { COLD_GREETING_TEMPLATES } from "@/services/sales/coldContactDiscovery";
import { ESTAGIO_2_TEMPLATES } from "@/services/sales/estagio2Templates";
import { MODELOS_DO_PRIMEIRO_CONTATO } from "@/services/foocci-sdr/modelosDoPrimeiroContato";

type Cliente = PrismaClient | Prisma.TransactionClient;

/**
 * ⚠️ OS NOMES DAS CHAVES DO CANAL, LIDOS AQUI.
 *
 * Elas são definidas em `foocci-sdr/FoocciSalesChannel.ts`, e este arquivo NÃO
 * o importa de propósito: importar o módulo de envio para dentro de uma rota de
 * leitura traria junto o caminho que manda mensagem, e o contrato desta pasta é
 * "nenhum caminho de envio existe aqui".
 *
 * O preço dessa separação é uma cópia do NOME (nunca da decisão), e o preço é
 * pago por teste: `contrato.test.ts` lê o fonte do canal e exige que os dois
 * nomes ainda sejam exatamente estes. Se alguém renomear a chave lá, o teste
 * quebra aqui — que é o único jeito honesto de manter duas leituras casadas.
 */
export const VARIAVEL_DE_ENVIO = "FOOCCI_SDR_SEND_ENABLED";
export const VARIAVEL_DA_IA_SOZINHA = "FOOCCI_SDR_IA_RESPONDE_SOZINHA";

function ligada(env: NodeJS.ProcessEnv, nome: string): boolean {
  return (env[nome] ?? "").trim().toLowerCase() === "true";
}

export interface Interruptores {
  /** Do BANCO (`SdrIaConfig.ligado`), não do ambiente. */
  taLigado: boolean | null;
  /** Sem versão publicada o TA fica calado mesmo ligado. */
  taTemVersaoPublicada: boolean | null;
  taJanelaHoras: { inicio: number; fim: number } | null;
  /** `null` = não existe a linha `sdr_ia_config` do TA. Não é "desligado". */
  motivoDoTaDesconhecido: string | null;
  /** Ambiente: a IA pode responder sozinha? */
  iaRespondeSozinha: boolean;
  /** Ambiente: a entrega está ativa? Desligada, a mensagem fica PENDENTE. */
  envioAtivo: boolean;
  /** Ambiente: a recepção automática do lead que chega sozinho. */
  recepcaoAutomatica: boolean;
  /** Existe pelo menos um agente comercial ativo para assinar uma mensagem? */
  temAgenteParaAssinar: boolean;
  /**
   * O estado EFETIVO, combinando tudo: uma mensagem nossa chega hoje a um lead
   * que acabou de entrar sozinho? É a resposta que o CEO pediu, em um booleano.
   */
  oLeadQueChegaSozinhoEAtendido: boolean;
  /** Por que não, quando não. Vazio quando a resposta acima é `true`. */
  oQueFaltaLigar: string[];
}

async function lerInterruptores(db: Cliente, env: NodeJS.ProcessEnv): Promise<Interruptores> {
  const config = await db.sdrIaConfig.findUnique({
    where: { slug: "ta" },
    select: { ligado: true, versaoAtivaId: true, horaInicio: true, horaFim: true },
  });

  const agente = await escolherAgente(db);

  const iaRespondeSozinha = ligada(env, VARIAVEL_DA_IA_SOZINHA);
  const envioAtivo = ligada(env, VARIAVEL_DE_ENVIO);
  const recepcaoAutomatica = recepcaoLigada(env);
  const temAgenteParaAssinar = agente !== null;

  const oQueFaltaLigar: string[] = [];
  if (!config) {
    oQueFaltaLigar.push("a linha `SdrIaConfig` do TA não existe no banco — o TA não tem como estar ligado");
  } else {
    if (!config.ligado) oQueFaltaLigar.push("o TA está DESLIGADO no banco (SdrIaConfig.ligado = false)");
    if (!config.versaoAtivaId) oQueFaltaLigar.push("o TA não tem versão publicada — ligado sem versão, ele fica calado");
  }
  if (!recepcaoAutomatica) {
    oQueFaltaLigar.push(`${VARIAVEL_DA_RECEPCAO} não está em "true" — ninguém fala com o lead que chega sozinho`);
  }
  if (!envioAtivo) {
    oQueFaltaLigar.push(`${VARIAVEL_DE_ENVIO} não está em "true" — a mensagem é composta e fica PENDENTE`);
  }
  if (!temAgenteParaAssinar) {
    oQueFaltaLigar.push("nenhum agente comercial ativo no banco — não há quem assine a mensagem");
  }

  return {
    taLigado: config?.ligado ?? null,
    taTemVersaoPublicada: config ? Boolean(config.versaoAtivaId) : null,
    taJanelaHoras: config ? { inicio: config.horaInicio, fim: config.horaFim } : null,
    motivoDoTaDesconhecido: config ? null : "não existe linha `SdrIaConfig` com slug \"ta\" no banco",
    iaRespondeSozinha,
    envioAtivo,
    recepcaoAutomatica,
    temAgenteParaAssinar,
    oLeadQueChegaSozinhoEAtendido: oQueFaltaLigar.length === 0,
    oQueFaltaLigar,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// QUEM CHEGOU, E QUEM FALOU COM ELE
// ─────────────────────────────────────────────────────────────────────────────

export interface JanelaDeEntrada {
  rotulo: "24h" | "7d";
  desde: string;
  chegaram: number;
  /** Os que NÓS procuramos não entram: esta conta é de quem chegou sozinho. */
  chegaramSozinhos: number;
  atendidosPelaIA: number;
  esperandoGente: number;
  comHumano: number;
  /** ⚠️ O número do CEO: entrou e ninguém assumiu. */
  semNinguem: number;
  /**
   * ⭐ O número que passou a importar depois de D-0E4: chegou, tem dono no
   * papel, e **ninguém falou com ele**. É este que mede o abandono agora.
   */
  ninguemFalouComEle: number;
  /** Quantos desses já receberam ao menos uma mensagem nossa. */
  jaReceberamMensagemNossa: number;
}

async function lerJanela(
  db: Cliente,
  rotulo: JanelaDeEntrada["rotulo"],
  desde: Date,
): Promise<JanelaDeEntrada> {
  const janela = { createdAt: { gte: desde } };
  const sozinhos = { ...janela, fonte: { in: [...FONTES_QUE_NOS_PROCURARAM] } };

  const [chegaram, chegaramSozinhos, ia, esperando, humano, ninguem, contatados, mudos] = await Promise.all([
    db.siteLead.count({ where: janela }),
    db.siteLead.count({ where: sozinhos }),
    db.siteLead.count({ where: { ...sozinhos, atendidoPor: "IA" } }),
    db.siteLead.count({ where: { ...sozinhos, atendidoPor: "AGUARDANDO_HUMANO" } }),
    db.siteLead.count({ where: { ...sozinhos, atendidoPor: "HUMANO" } }),
    db.siteLead.count({ where: { ...sozinhos, atendidoPor: "NINGUEM" } }),
    db.siteLead.count({ where: { ...sozinhos, lastContactedAt: { not: null } } }),
    db.siteLead.count({ where: { ...sozinhos, lastContactedAt: null, optOutAt: null } }),
  ]);

  return {
    rotulo,
    desde: desde.toISOString(),
    chegaram,
    chegaramSozinhos,
    atendidosPelaIA: ia,
    esperandoGente: esperando,
    comHumano: humano,
    semNinguem: ninguem,
    jaReceberamMensagemNossa: contatados,
    ninguemFalouComEle: mudos,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// O TEMPO ATÉ A PRIMEIRA RESPOSTA NOSSA
// ─────────────────────────────────────────────────────────────────────────────

/** Teto de leads examinados por janela. A conta é de amostra, e ela diz isso. */
export const TETO_DA_AMOSTRA_DE_TEMPO = 500;

export interface TempoAteFalarmos {
  /** Quantos leads da janela entraram na conta. */
  medidos: number;
  /** Quantos ficaram de fora — e nunca contam como zero. */
  naoMedidos: number;
  motivoDoNaoMedido: string | null;
  medianaMinutos: number | null;
  piorMinutos: number | null;
  dentroDoPrazo: number | null;
  foraDoPrazo: number | null;
  prazoEmMinutos: number;
  /** `true` quando a janela tinha mais leads que o teto da amostra. */
  amostraTruncada: boolean;
}

async function lerTempoAteFalarmos(db: Cliente, desde: Date): Promise<TempoAteFalarmos> {
  const leads = await db.siteLead.findMany({
    where: { createdAt: { gte: desde }, fonte: { in: [...FONTES_QUE_NOS_PROCURARAM] } },
    orderBy: { createdAt: "desc" },
    take: TETO_DA_AMOSTRA_DE_TEMPO + 1,
    select: { id: true, createdAt: true },
  });

  const amostraTruncada = leads.length > TETO_DA_AMOSTRA_DE_TEMPO;
  const daAmostra = leads.slice(0, TETO_DA_AMOSTRA_DE_TEMPO);

  const base: TempoAteFalarmos = {
    medidos: 0,
    naoMedidos: daAmostra.length,
    motivoDoNaoMedido: null,
    medianaMinutos: null,
    piorMinutos: null,
    dentroDoPrazo: null,
    foraDoPrazo: null,
    prazoEmMinutos: MINUTOS_PARA_A_PRIMEIRA_RESPOSTA,
    amostraTruncada,
  };

  if (daAmostra.length === 0) {
    return { ...base, motivoDoNaoMedido: "nenhum lead chegou sozinho nesta janela" };
  }

  const primeiras = await db.leadMensagem.groupBy({
    by: ["leadId"],
    where: { leadId: { in: daAmostra.map((l) => l.id) }, direcao: "SAIDA" },
    _min: { ocorreuEm: true },
  });

  const quando = new Map<string, Date>();
  for (const linha of primeiras) {
    if (linha._min.ocorreuEm) quando.set(linha.leadId, linha._min.ocorreuEm);
  }

  const minutos: number[] = [];
  for (const lead of daAmostra) {
    const falamos = quando.get(lead.id);
    if (!falamos) continue;
    minutos.push(Math.max(0, Math.floor((falamos.getTime() - lead.createdAt.getTime()) / 60_000)));
  }

  if (minutos.length === 0) {
    return {
      ...base,
      motivoDoNaoMedido:
        "nenhum dos leads desta janela recebeu mensagem nossa — não há tempo de primeira resposta a medir, " +
        "e isso NÃO é tempo zero: é ninguém tendo falado",
    };
  }

  minutos.sort((a, b) => a - b);
  const meio = Math.floor(minutos.length / 2);
  const mediana =
    minutos.length % 2 === 1 ? minutos[meio]! : Math.round((minutos[meio - 1]! + minutos[meio]!) / 2);

  return {
    ...base,
    medidos: minutos.length,
    naoMedidos: daAmostra.length - minutos.length,
    motivoDoNaoMedido:
      daAmostra.length - minutos.length > 0
        ? "estes leads nunca receberam mensagem nossa — sem primeira resposta, não há tempo a medir"
        : null,
    medianaMinutos: mediana,
    piorMinutos: minutos[minutos.length - 1]!,
    dentroDoPrazo: minutos.filter((m) => m <= MINUTOS_PARA_A_PRIMEIRA_RESPOSTA).length,
    foraDoPrazo: minutos.filter((m) => m > MINUTOS_PARA_A_PRIMEIRA_RESPOSTA).length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// O RELÓGIO E OS LARGADOS
// ─────────────────────────────────────────────────────────────────────────────

export interface EstadoDoRelogio {
  comPrazo: number;
  semPrazo: number;
  vencidoSemNinguemTerFalado: number;
  observacao: string;
}

export interface OsLargados {
  semDono: number;
  semDonoQueNosProcuraram: number;
  maisAntigoEm: string | null;
  maisAntigoHaDias: number | null;
  motivoDoNaoMedido: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// A CORRENTE, ELO POR ELO — e a soma que fecha
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A ordem do caminho, do "chegou" ao "pagou".
 *
 * Todo estágio do enum aparece exatamente uma vez, e é isso que faz a soma
 * fechar com o total de leads. Um estágio esquecido aqui sumiria da conta sem
 * que ninguém percebesse — a soma bateria menos que o total e pareceria só um
 * arredondamento.
 */
export const ORDEM_DA_CORRENTE: readonly SiteLeadStage[] = [
  "NOVO",
  "DISPONIVEL_PARA_PROSPECCAO",
  "PRIMEIRO_CONTATO",
  "RESPONDEU",
  "EM_QUALIFICACAO",
  "QUALIFICADO",
  "DEMO_AGENDADA",
  "DEMO_REALIZADA",
  "PROPOSTA_ENVIADA",
  "EM_NEGOCIACAO",
  "GANHO",
  "PERDIDO",
  "NUTRICAO",
];

export interface EloDaCorrente {
  ordem: number;
  estagio: SiteLeadStage;
  quantos: number;
}

export interface ACorrente {
  elos: EloDaCorrente[];
  total: number;
  somaDosElos: number;
  /** `true` quando a soma dos elos bate com o total. Falso é defeito, não ruído. */
  somaFecha: boolean;
  propostasPorSituacao: Record<string, number>;
  /** Leads que chegaram a GANHO — o "vendeu um plano" da pergunta do CEO. */
  ganhos: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// O LEAD MAIS RECENTE PARADO, COM O MOTIVO NOMEADO
// ─────────────────────────────────────────────────────────────────────────────

export interface ContextoDoParado {
  temTelefone: boolean;
  temConsentimento: boolean;
  pediuSilencio: boolean;
  fonteReconhecida: boolean;
  interruptores: Interruptores;
}

export type MotivoDoParado =
  | "pediuSilencio"
  | "semTelefone"
  | "semConsentimentoRegistrado"
  | "fonteNaoReconhecida"
  | "recepcaoDesligada"
  | "taDesligado"
  | "taSemVersaoPublicada"
  | "envioDesligado"
  | "semAgenteParaAssinar"
  | "naoHaMotivoConhecido";

/**
 * POR QUE ESTE LEAD NÃO FOI ATENDIDO — em uma palavra e uma frase.
 *
 * Função PURA, e a ordem das perguntas é a ordem em que a corrente barra de
 * verdade: primeiro o que é do DESTINATÁRIO (silêncio, telefone,
 * consentimento, origem), depois o que é NOSSO (as chaves e o time). Inverter
 * responderia "o envio está desligado" para alguém que pediu silêncio — e aí o
 * dono ligaria uma chave que não mudaria nada para aquele lead.
 *
 * `naoHaMotivoConhecido` é honesto de propósito: tudo aparentemente de pé e o
 * lead parado assim mesmo é um achado que merece investigação, nunca um motivo
 * inventado para a tela ficar bonita.
 */
export function motivoDeNaoTerSidoAtendido(
  ctx: ContextoDoParado,
): { motivo: MotivoDoParado; detalhe: string } {
  if (ctx.pediuSilencio) {
    return { motivo: "pediuSilencio", detalhe: "esta pessoa pediu para não receber mensagens — e isso é terminal" };
  }
  if (!ctx.temTelefone) {
    return { motivo: "semTelefone", detalhe: "o contato não tem WhatsApp utilizável — não há por onde falar" };
  }
  if (!ctx.temConsentimento) {
    return {
      motivo: "semConsentimentoRegistrado",
      detalhe: "`consentAt` está vazio e o portão trata vazio como bloqueio — nunca como presunção",
    };
  }
  if (!ctx.fonteReconhecida) {
    return {
      motivo: "fonteNaoReconhecida",
      detalhe: "a fonte deste lead não está na lista das portas por onde alguém nos procura — a recepção não o toma",
    };
  }
  if (!ctx.interruptores.recepcaoAutomatica) {
    return {
      motivo: "recepcaoDesligada",
      detalhe: `${VARIAVEL_DA_RECEPCAO} não está em "true" — nenhuma rodada fala com quem chega sozinho`,
    };
  }
  if (!ctx.interruptores.temAgenteParaAssinar) {
    return {
      motivo: "semAgenteParaAssinar",
      detalhe: "não há agente comercial ativo no banco, e a casa não manda mensagem anônima",
    };
  }
  if (ctx.interruptores.taLigado === false || ctx.interruptores.taLigado === null) {
    return { motivo: "taDesligado", detalhe: "o TA não está ligado no banco — ele não responde quando a pessoa escrever de volta" };
  }
  if (ctx.interruptores.taTemVersaoPublicada === false) {
    return { motivo: "taSemVersaoPublicada", detalhe: "o TA está ligado sem versão publicada, e nesse estado ele fica calado" };
  }
  if (!ctx.interruptores.envioAtivo) {
    return {
      motivo: "envioDesligado",
      detalhe: `${VARIAVEL_DE_ENVIO} não está em "true" — a mensagem é composta e fica PENDENTE, ninguém recebe`,
    };
  }
  return {
    motivo: "naoHaMotivoConhecido",
    detalhe: "todas as travas conhecidas estão de pé e este lead continua parado — isto é achado, e pede investigação",
  };
}

export interface OParadoMaisRecente {
  leadId: string;
  chegouEm: string;
  esperandoHaMinutos: number;
  fonte: SiteLeadSource;
  estagio: SiteLeadStage;
  motivo: MotivoDoParado;
  detalhe: string;
}


// ─────────────────────────────────────────────────────────────────────────────
// OS MODELOS DA CASA — o que existe, em que estágio, e quem entra no sorteio
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ⭐ A LISTA DOS MODELOS, NA PORTA DE LEITURA.
 *
 * Até aqui, para saber quais textos a casa tem e quais deles podem sair, era
 * preciso abrir a tela da Meta e a tela do app e casar as duas na cabeça. Duas
 * telas que ninguém casa é como o panfleto de nove linhas ficou meses no
 * sorteio do primeiro contato sem ninguém conseguir apontar o responsável.
 *
 * ── ⚠️ ELA SÓ LÊ, E NÃO SUBMETE NADA ───────────────────────────────────────
 *
 * Criar modelo na Meta é escrita, e escrita não mora nesta pasta. O único
 * caminho de criação continua sendo `POST /api/admin/sala-de-vendas/whatsapp/
 * templates-frios`. Aqui se lê o CATÁLOGO da casa (que é código) cruzado com o
 * espelho local da Meta (`ModeloDeVendas`), e nada mais.
 *
 * ── ⚠️ "NÃO SEI" NUNCA VIRA "NÃO APROVADO" ─────────────────────────────────
 *
 * `situacao: null` significa que o espelho não tem linha para este nome — pode
 * ser modelo nunca submetido, ou sincronização que não rodou. As duas coisas
 * são "não medido", e `motivoDoNaoMedido` diz qual. Escrever "REJECTED" aí
 * faria alguém reescrever um texto que a Meta nunca viu.
 */
export interface ModeloDaCasa {
  nome: string;
  /** 1 = número frio (atravessar o porteiro). 2 = conversa com quem decide. */
  estagio: 1 | 2;
  corpo: string;
  categoria: string;
  /** Quantas `{{n}}` o corpo tem, contadas do texto da casa. */
  variaveis: number;
  /** A coluna de origem de cada variável, na ordem. Vazio no estágio 1. */
  fontesDasVariaveis: string[];
  /** APPROVED, PENDING, REJECTED… do espelho local. `null` = não medido. */
  situacao: string | null;
  motivoDaRecusa: string | null;
  /**
   * ⭐ Entra no sorteio do PRIMEIRO CONTATO? Só os três do estágio 1 entram —
   * e é este fechamento que tirou o panfleto do ar. O estágio 2 é sempre
   * `false`: ele não se sorteia, ele é escolhido pelo momento da conversa.
   */
  noSorteioDoPrimeiroContato: boolean;
  motivoDoNaoMedido: string | null;
}

function contarVariaveis(corpo: string): number {
  return new Set([...corpo.matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1])).size;
}

async function lerModelos(db: Cliente): Promise<ModeloDaCasa[]> {
  /**
   * ⚠️ SEM `select` DE PROPÓSITO, e o motivo é o contrato desta pasta.
   *
   * `contrato.test.ts` proíbe `nome: true` em qualquer select deste arquivo —
   * a trava que impede o nome de uma PESSOA de sair por uma porta de leitura.
   * A coluna `nome` de `ModeloDeVendas` é o nome de um MODELO, não de gente,
   * mas afrouxar a regra para acomodar a exceção é como a trava deixa de valer
   * para o caso que ela existe para pegar. A régua fica; a consulta é que muda.
   *
   * `ModeloDeVendas` não guarda pessoa nenhuma — é catálogo de texto da casa —
   * e só três campos saem daqui, escolhidos abaixo, um a um.
   */
  const espelho = await db.modeloDeVendas.findMany();
  const porNome = new Map(
    espelho.map((m) => [m.nome, { situacao: m.situacao, motivoDaRecusa: m.motivoDaRecusa }]),
  );
  const noSorteio = new Set<string>(MODELOS_DO_PRIMEIRO_CONTATO as readonly string[]);

  const montar = (
    nome: string,
    estagio: 1 | 2,
    corpo: string,
    categoria: string,
    fontes: string[],
  ): ModeloDaCasa => {
    const doEspelho = porNome.get(nome) ?? null;
    return {
      nome,
      estagio,
      corpo,
      categoria,
      variaveis: contarVariaveis(corpo),
      fontesDasVariaveis: fontes,
      situacao: doEspelho?.situacao ?? null,
      motivoDaRecusa: doEspelho?.motivoDaRecusa ?? null,
      noSorteioDoPrimeiroContato: noSorteio.has(nome),
      motivoDoNaoMedido: doEspelho
        ? null
        : "não há linha deste nome no espelho local da Meta — pode ser modelo nunca submetido ou sincronização que não rodou. NÃO é reprovação.",
    };
  };

  return [
    ...COLD_GREETING_TEMPLATES.map((t) =>
      montar(t.name, 1, t.body, t.category, t.restaurantNameParam ? ["SiteLead.restaurante"] : []),
    ),
    ...ESTAGIO_2_TEMPLATES.map((m) =>
      montar(
        m.name,
        2,
        m.body,
        m.category,
        [...m.variaveis].sort((a, b) => a.posicao - b.posicao).map((v) => v.fonte),
      ),
    ),
  ];
}

// ─────────────────────────────────────────────────────────────────────────────

export interface EstadoDaCorrente {
  agora: string;
  interruptores: Interruptores;
  entrada: JanelaDeEntrada[];
  tempoAteFalarmos: { em24h: TempoAteFalarmos; em7d: TempoAteFalarmos };
  relogio: EstadoDoRelogio;
  largados: OsLargados;
  corrente: ACorrente;
  paradoMaisRecente: OParadoMaisRecente | null;
  /** O catálogo de textos da casa, por estágio, cruzado com o espelho da Meta. */
  modelos: ModeloDaCasa[];
  /** Tudo que esta leitura NÃO conseguiu medir, com o motivo. Nunca zero. */
  naoMedido: string[];
}

export async function estadoDaCorrente(
  db: Cliente,
  params: { agora: Date; env?: NodeJS.ProcessEnv },
): Promise<EstadoDaCorrente> {
  const env = params.env ?? process.env;
  const agora = params.agora;
  const ha24h = new Date(agora.getTime() - 24 * 3_600_000);
  const ha7d = new Date(agora.getTime() - 7 * 24 * 3_600_000);

  const interruptores = await lerInterruptores(db, env);
  const modelos = await lerModelos(db);

  const [j24, j7] = await Promise.all([lerJanela(db, "24h", ha24h), lerJanela(db, "7d", ha7d)]);
  const [t24, t7] = await Promise.all([lerTempoAteFalarmos(db, ha24h), lerTempoAteFalarmos(db, ha7d)]);

  const [comPrazo, semPrazo, vencidos] = await Promise.all([
    db.siteLead.count({ where: { slaVenceEm: { not: null } } }),
    db.siteLead.count({ where: { slaVenceEm: null } }),
    db.siteLead.count({ where: { slaVenceEm: { not: null, lt: agora }, lastContactedAt: null } }),
  ]);

  const [semDono, semDonoSozinhos, maisAntigo] = await Promise.all([
    db.siteLead.count({ where: { atendidoPor: "NINGUEM" } }),
    db.siteLead.count({
      where: { atendidoPor: "NINGUEM", fonte: { in: [...FONTES_QUE_NOS_PROCURARAM] } },
    }),
    db.siteLead.findMany({
      where: { atendidoPor: "NINGUEM" },
      orderBy: { createdAt: "asc" },
      take: 1,
      select: { createdAt: true },
    }),
  ]);

  const antigo = maisAntigo[0]?.createdAt ?? null;

  const porEstagio = await db.siteLead.groupBy({ by: ["stage"], _count: { _all: true } });
  const contagem = new Map<string, number>();
  for (const linha of porEstagio) contagem.set(linha.stage, linha._count._all);

  const elos: EloDaCorrente[] = ORDEM_DA_CORRENTE.map((estagio, i) => ({
    ordem: i + 1,
    estagio,
    quantos: contagem.get(estagio) ?? 0,
  }));
  const somaDosElos = elos.reduce((s, e) => s + e.quantos, 0);
  const total = await db.siteLead.count();

  const porSituacao = await db.leadProposta.groupBy({ by: ["situacao"], _count: { _all: true } });
  const propostasPorSituacao: Record<string, number> = {};
  for (const linha of porSituacao) propostasPorSituacao[linha.situacao] = linha._count._all;

  // O lead mais recente que chegou sozinho e continua sem ninguém. É o
  // "Fantástico Magic" da tela do CEO, com o motivo escrito ao lado.
  const parados = await db.siteLead.findMany({
    where: {
      fonte: { in: [...FONTES_QUE_NOS_PROCURARAM] },
      // ⭐ D-0E4: "parado" deixou de ser "sem dono". A IA passou a assumir na
      // chegada, então o lead esquecido de hoje aparece como `IA` e mudo. O que
      // define o abandono é **ninguém ter falado com ele**, nunca o rótulo.
      atendidoPor: { in: ["NINGUEM", "IA"] },
      lastContactedAt: null,
      optOutAt: null,
    },
    orderBy: { createdAt: "desc" },
    take: 1,
    select: {
      id: true,
      createdAt: true,
      fonte: true,
      stage: true,
      whatsapp: true,
      whatsappDigits: true,
      consentAt: true,
      optOutAt: true,
    },
  });

  const p = parados[0] ?? null;
  const paradoMaisRecente: OParadoMaisRecente | null = p
    ? (() => {
        const porque = motivoDeNaoTerSidoAtendido({
          temTelefone: Boolean((p.whatsappDigits ?? p.whatsapp ?? "").trim()),
          temConsentimento: p.consentAt !== null,
          pediuSilencio: p.optOutAt !== null,
          fonteReconhecida: FONTES_QUE_NOS_PROCURARAM.includes(p.fonte),
          interruptores,
        });
        return {
          leadId: p.id,
          chegouEm: p.createdAt.toISOString(),
          esperandoHaMinutos: Math.max(0, Math.floor((agora.getTime() - p.createdAt.getTime()) / 60_000)),
          fonte: p.fonte,
          estagio: p.stage,
          motivo: porque.motivo,
          detalhe: porque.detalhe,
        };
      })()
    : null;

  const naoMedido: string[] = [];
  const semEspelho = modelos.filter((m) => m.situacao === null).map((m) => m.nome);
  if (semEspelho.length > 0) {
    naoMedido.push(
      `${semEspelho.length} modelo(s) do catálogo sem linha no espelho da Meta (${semEspelho.join(", ")}) — ` +
        "situação NÃO MEDIDA, e isso não é reprovação: pode ser modelo nunca submetido.",
    );
  }
  const estagio2Aprovados = modelos.filter((m) => m.estagio === 2 && m.situacao === "APPROVED").length;
  if (estagio2Aprovados === 0) {
    naoMedido.push(
      "nenhum modelo do ESTÁGIO 2 consta como APPROVED — fora da janela de 24h a casa não tem como abrir " +
        "conversa com quem decide, e isso é achado, não ruído.",
    );
  }
  if (t24.motivoDoNaoMedido) naoMedido.push(`tempo até falarmos (24h): ${t24.motivoDoNaoMedido}`);
  if (t7.motivoDoNaoMedido) naoMedido.push(`tempo até falarmos (7d): ${t7.motivoDoNaoMedido}`);
  if (semPrazo > 0) {
    naoMedido.push(
      `${semPrazo} leads sem \`slaVenceEm\` — nasceram antes de 18/09/2026, quando nada da casa escrevia essa ` +
        "coluna. Para eles não existe atraso medido; existe atraso NÃO MEDIDO.",
    );
  }
  if (!antigo) naoMedido.push("não há lead sem dono — ou a consulta não alcançou nenhum");
  if (somaDosElos !== total) {
    naoMedido.push(
      `a soma dos elos (${somaDosElos}) não fecha com o total de leads (${total}) — falta estágio em ORDEM_DA_CORRENTE`,
    );
  }
  if (interruptores.motivoDoTaDesconhecido) naoMedido.push(`estado do TA: ${interruptores.motivoDoTaDesconhecido}`);
  naoMedido.push(
    "propostas, demos e vendas são contadas pelo estágio do lead e pela tabela de propostas; " +
      "nada aqui mede receita paga — isso mora no Mercado Pago e não é lido por esta porta",
  );

  return {
    agora: agora.toISOString(),
    interruptores,
    entrada: [j24, j7],
    tempoAteFalarmos: { em24h: t24, em7d: t7 },
    relogio: {
      comPrazo,
      semPrazo,
      vencidoSemNinguemTerFalado: vencidos,
      observacao:
        "`slaVenceEm` passou a ser escrita na chegada do lead em 18/09/2026. Leads anteriores continuam sem prazo " +
        "e por isso NÃO aparecem como atrasados — ausência de prazo não é ausência de atraso.",
    },
    largados: {
      semDono,
      semDonoQueNosProcuraram: semDonoSozinhos,
      maisAntigoEm: antigo?.toISOString() ?? null,
      maisAntigoHaDias: antigo ? Math.floor((agora.getTime() - antigo.getTime()) / 86_400_000) : null,
      motivoDoNaoMedido: antigo ? null : "nenhum lead sem dono encontrado",
    },
    corrente: {
      elos,
      total,
      somaDosElos,
      somaFecha: somaDosElos === total,
      propostasPorSituacao,
      ganhos: contagem.get("GANHO") ?? 0,
    },
    paradoMaisRecente,
    modelos,
    naoMedido,
  };
}
