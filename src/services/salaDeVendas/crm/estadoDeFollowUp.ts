/**
 * O ESTADO DE FOLLOW-UP — porque "não respondeu" não é um diagnóstico.
 *
 * ── O QUE O DOCUMENTO EXIGE, LITERALMENTE ───────────────────────────────────
 *
 * Item 9: *"O sistema precisa saber diferenciar: cliente pensando; cliente que
 * sumiu; carrinho abandonado; pagamento abandonado; lead sem perfil; venda
 * perdida; oportunidade futura."* Mais adiante o mesmo documento cobra
 * **proposta sem retorno** e **reunião** como filas próprias.
 *
 * São nove situações que hoje a casa trata como uma só: "faz X dias que ele não
 * responde". E elas pedem tratamentos opostos. Quem está **pensando** precisa de
 * silêncio e de um prazo; quem **sumiu** precisa de um toque diferente do
 * anterior; quem **abandonou o pagamento** precisa de link, não de argumento;
 * quem **não tem perfil** não precisa de nada, e cobrá-lo gasta o teto diário
 * de quem precisaria.
 *
 * Um `if (diasSemResposta > 3)` responde a todos com a mesma frase. É por isso
 * que este arquivo existe: **uma regra escrita por estado**, e o estado sai com
 * o **porquê** ao lado.
 *
 * ── A ORDEM DAS REGRAS É PARTE DA REGRA ─────────────────────────────────────
 *
 * As regras são avaliadas na ordem em que estão escritas, e a primeira que casa
 * vence. A ordem não é estética: quem pediu silêncio precisa ser reconhecido
 * ANTES de qualquer coisa, e quem virou cliente precisa sair do funil comercial
 * antes de ser contado como "proposta sem retorno". Trocar a ordem muda o
 * resultado — por isso cada regra carrega um `codigo` estável, e o teste
 * confere a ordem, não só o conjunto.
 *
 * ── NUNCA CHUTAR ────────────────────────────────────────────────────────────
 *
 * Quando os dados não permitem decidir, o estado é `NAO_MEDIDO`. Não existe
 * "FRIO por omissão" aqui, pela mesma razão que `SiteLead.temperatura` é
 * anulável: classificar sem medir esconde a fila de quem ninguém olhou.
 *
 * ── O QUE ESTE ARQUIVO NÃO FAZ ──────────────────────────────────────────────
 *
 * Não manda mensagem, não cria tarefa e não decide se PODE falar. Quem autoriza
 * um toque continua sendo `LeadContactSafety` + `freioDeRitmo`, no instante de
 * sair. Aqui só se diz **o que está acontecendo com este contato**.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import type { SiteLeadStage, LeadTemperatura } from "@prisma/client";
import { registrarNaTrilha, type Autoria } from "../jornadaComercial";

type Cliente = PrismaClient | Prisma.TransactionClient;

// ─────────────────────────────────────────────────────────────────────────────
// OS ESTADOS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * As situações que o documento manda distinguir, mais as três que ele cobra
 * depois (proposta parada, reunião pendente) e as duas que a base exige para
 * não mentir (`NAO_ABORDADO`, `NAO_MEDIDO`).
 */
export type EstadoDeFollowUp =
  /** Pediu para parar. Não é fila de follow-up: é fila de ninguém. */
  | "PEDIU_SILENCIO"
  /** Virou cliente. Sai daqui e entra na jornada de pós-venda. */
  | "VIROU_CLIENTE"
  /** Venda perdida, com motivo. Só volta por campanha, nunca por cadência. */
  | "VENDA_PERDIDA"
  /** Não é agora, mas pode ser depois. Tem data de retomada — não é sumiço. */
  | "OPORTUNIDADE_FUTURA"
  /** Medido e não qualifica. Cobrar este gasta o teto de quem qualifica. */
  | "LEAD_SEM_PERFIL"
  /** Disse sim e não pagou. Precisa de link, não de argumento. */
  | "PAGAMENTO_ABANDONADO"
  /** Montou o pedido e não fechou. A proposta existe e nunca saiu. */
  | "CARRINHO_ABANDONADO"
  /** A proposta saiu e ninguém respondeu. */
  | "PROPOSTA_PARADA"
  /** Tem reunião marcada sem confirmação, ou faltou e ninguém remarcou. */
  | "REUNIAO_PENDENTE"
  /** Falava com a gente e parou. É o sumiço de verdade. */
  | "CLIENTE_SUMIU"
  /** Respondeu há pouco e ainda está decidindo. Precisa de prazo, não de cobrança. */
  | "PENSANDO"
  /** Abordado e nunca disse uma palavra. Diferente de sumir. */
  | "NUNCA_RESPONDEU"
  /** Ninguém falou com ele ainda. */
  | "NAO_ABORDADO"
  /** Falta dado para decidir. Nunca se chuta um estado no lugar deste. */
  | "NAO_MEDIDO";

/**
 * A régua, em um lugar só, para a discussão sobre os números não virar uma
 * caçada a constantes espalhadas pelo código.
 *
 * Os valores saem do item 9 (*"30 min / 2 h / 24 h / X dias"*) traduzidos para
 * os prazos que a operação da Foocci realmente usa. Mudar um número aqui muda
 * a classificação da base inteira — de propósito.
 */
export const REGUA = {
  /** Depois disto, um rascunho de proposta parado é carrinho abandonado. */
  horasParaCarrinhoAbandonado: 2,
  /** Depois disto, um "sim" sem pagamento é pagamento abandonado. */
  horasParaPagamentoAbandonado: 24,
  /** Depois disto, proposta enviada e sem resposta é proposta parada. */
  diasParaPropostaParada: 3,
  /** Reunião que começa dentro desta janela e não foi confirmada é pendência. */
  horasParaConfirmarReuniao: 48,
  /** Silêncio de quem já falava conosco. Acima disto, sumiu. */
  diasParaSumico: 7,
  /**
   * Fração do prazo de sumiço a partir da qual quem está "pensando" já conta
   * como **esfriando** no plano do dia. Não é outro estado: é o mesmo estado
   * perto de virar sumiço, e o plano precisa dessa fila separada.
   */
  fracaoDeEsfriamento: 0.5,
  /**
   * Piso de score para ter perfil. ⚠️ Só se aplica a score **medido**:
   * `score === null` significa "ninguém avaliou" e NUNCA vira sem perfil.
   */
  pisoDePerfil: 30,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// A FICHA — o retrato do contato no instante da classificação
// ─────────────────────────────────────────────────────────────────────────────

/** A proposta, reduzida ao que decide o estado. */
export interface PropostaNaFicha {
  situacao: "RASCUNHO" | "ENVIADA" | "EM_NEGOCIACAO" | "ACEITA" | "RECUSADA" | "EXPIRADA";
  valorMensalCent: number | null;
  enviadaEm: Date | null;
  respondidaEm: Date | null;
  atualizadaEm: Date;
}

/** O compromisso, reduzido ao que decide o estado. */
export interface CompromissoNaFicha {
  situacao: "AGENDADO" | "CONFIRMADO" | "REALIZADO" | "NAO_COMPARECEU" | "REAGENDADO" | "CANCELADO";
  comecaEm: Date;
  confirmadoEm: Date | null;
  remarcadoParaId: string | null;
}

export interface FichaParaClassificar {
  leadId: string;
  nome: string;
  stage: SiteLeadStage;
  temperatura: LeadTemperatura | null;
  score: number | null;
  optOutAt: Date | null;
  lastContactedAt: Date | null;
  /** Quando a pessoa respondeu pela primeira vez. `null` = nunca respondeu. */
  primeiraRespostaEm: Date | null;
  /** Última mensagem do lead PARA a gente. `null` = nunca chegou nada dele. */
  ultimaEntradaEm: Date | null;
  propostas: PropostaNaFicha[];
  compromissos: CompromissoNaFicha[];
  /** Existe uma oportunidade GANHA amarrada a este lead? */
  temOportunidadeGanha: boolean;
  /** Valor potencial da oportunidade aberta, em centavos. `null` = não estimado. */
  valorPotencialCents: number | null;
}

export interface Classificacao {
  estado: EstadoDeFollowUp;
  /** O código estável da regra que decidiu. É o que o teste ancora. */
  regra: string;
  /** O porquê, em linguagem de quem opera. Vai para a trilha junto do estado. */
  porque: string;
  /**
   * `true` quando o estado saiu de dado observado. `false` só em `NAO_MEDIDO` —
   * e é o que impede a tela de somar "não sei" dentro de um número.
   */
  medido: boolean;
  /** Minutos parados na situação atual. `null` quando não há relógio confiável. */
  minutosParado: number | null;
}

const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

function minutosEntre(de: Date | null | undefined, ate: Date): number | null {
  if (!de) return null;
  return Math.floor((ate.getTime() - de.getTime()) / MIN);
}

/**
 * O relógio do silêncio: desde quando esta conversa não anda.
 *
 * Usa o mais recente entre "ele falou" e "nós falamos". Usar só a entrada faria
 * um lead que recebeu três toques hoje aparecer parado há duas semanas.
 */
function paradoDesde(f: FichaParaClassificar): Date | null {
  const marcos = [f.ultimaEntradaEm, f.lastContactedAt].filter((d): d is Date => !!d);
  if (!marcos.length) return null;
  return marcos.reduce((a, b) => (a.getTime() > b.getTime() ? a : b));
}

// ─────────────────────────────────────────────────────────────────────────────
// AS REGRAS — uma por estado, na ordem em que valem
// ─────────────────────────────────────────────────────────────────────────────

/** As etapas em que ainda NÃO existe relógio para medir — e não ter é normal. */
const ETAPAS_DE_ENTRADA: readonly SiteLeadStage[] = ["NOVO", "DISPONIVEL_PARA_PROSPECCAO"];

interface Regra {
  codigo: string;
  estado: EstadoDeFollowUp;
  /** Devolve o porquê quando casa; `null` quando não é este o caso. */
  aplicar: (f: FichaParaClassificar, agora: Date) => string | null;
}

/**
 * ⚠️ A ORDEM É NORMATIVA. Ler de cima para baixo é ler a doutrina de
 * follow-up da casa.
 */
export const REGRAS: readonly Regra[] = [
  {
    codigo: "silencio",
    estado: "PEDIU_SILENCIO",
    aplicar: (f) =>
      f.optOutAt
        ? `pediu para parar de receber contato em ${f.optOutAt.toISOString()} — nenhuma cadência alcança este contato`
        : null,
  },
  {
    codigo: "virou-cliente",
    estado: "VIROU_CLIENTE",
    aplicar: (f) =>
      f.stage === "GANHO" || f.temOportunidadeGanha
        ? "a venda foi fechada — este contato sai do follow-up comercial e entra na jornada de pós-venda"
        : null,
  },
  {
    codigo: "perdido",
    estado: "VENDA_PERDIDA",
    aplicar: (f) =>
      f.stage === "PERDIDO"
        ? "venda perdida com motivo registrado — volta por campanha de reativação, nunca por cadência de follow-up"
        : null,
  },
  {
    codigo: "futura",
    estado: "OPORTUNIDADE_FUTURA",
    aplicar: (f) =>
      f.stage === "NUTRICAO" || f.temperatura === "NUTRICAO"
        ? "marcado como oportunidade futura — o silêncio aqui é a decisão, não o descuido"
        : null,
  },
  {
    codigo: "sem-perfil",
    estado: "LEAD_SEM_PERFIL",
    aplicar: (f) => {
      if (f.temperatura === "DESQUALIFICADO") {
        return "classificado como desqualificado — cobrar este contato gasta o teto diário de quem tem perfil";
      }
      // ⚠️ `score === null` é "ninguém mediu", e nunca cai aqui.
      if (f.score !== null && f.score < REGUA.pisoDePerfil) {
        return `score medido em ${f.score}, abaixo do piso de ${REGUA.pisoDePerfil} — sem perfil para consumir cadência`;
      }
      return null;
    },
  },
  {
    codigo: "pagamento-abandonado",
    estado: "PAGAMENTO_ABANDONADO",
    aplicar: (f, agora) => {
      const aceita = f.propostas.find((p) => p.situacao === "ACEITA");
      if (!aceita || f.temOportunidadeGanha) return null;
      const desde = aceita.respondidaEm ?? aceita.atualizadaEm;
      const horas = (agora.getTime() - desde.getTime()) / HORA;
      if (horas < REGUA.horasParaPagamentoAbandonado) return null;
      return `aceitou a proposta há ${Math.floor(horas)}h e o pagamento não entrou — falta o link, não o argumento`;
    },
  },
  {
    codigo: "carrinho-abandonado",
    estado: "CARRINHO_ABANDONADO",
    aplicar: (f, agora) => {
      // Rascunho COM valor é pedido montado. Rascunho sem valor é uma proposta
      // que nem existe ainda — chamar aquilo de carrinho infla a fila com nada.
      const rascunho = f.propostas.find(
        (p) => p.situacao === "RASCUNHO" && p.valorMensalCent !== null && !p.enviadaEm,
      );
      if (!rascunho) return null;
      const horas = (agora.getTime() - rascunho.atualizadaEm.getTime()) / HORA;
      if (horas < REGUA.horasParaCarrinhoAbandonado) return null;
      return `proposta montada com valor e parada há ${Math.floor(horas)}h sem sair — o pedido existe e não foi fechado`;
    },
  },
  {
    codigo: "proposta-parada",
    estado: "PROPOSTA_PARADA",
    aplicar: (f, agora) => {
      const enviada = f.propostas.find(
        (p) => (p.situacao === "ENVIADA" || p.situacao === "EM_NEGOCIACAO") && p.enviadaEm && !p.respondidaEm,
      );
      if (!enviada) return null;
      const dias = (agora.getTime() - enviada.enviadaEm!.getTime()) / DIA;
      if (dias < REGUA.diasParaPropostaParada) return null;
      return `proposta enviada há ${Math.floor(dias)} dias e sem resposta registrada`;
    },
  },
  {
    codigo: "reuniao-pendente",
    estado: "REUNIAO_PENDENTE",
    aplicar: (f, agora) => {
      const faltou = f.compromissos.find((c) => c.situacao === "NAO_COMPARECEU" && !c.remarcadoParaId);
      if (faltou) return "faltou à reunião e ninguém remarcou — a agenda ficou sem próximo encontro";

      const porConfirmar = f.compromissos.find(
        (c) =>
          (c.situacao === "AGENDADO" || c.situacao === "REAGENDADO") &&
          !c.confirmadoEm &&
          c.comecaEm.getTime() > agora.getTime() &&
          c.comecaEm.getTime() - agora.getTime() <= REGUA.horasParaConfirmarReuniao * HORA,
      );
      if (porConfirmar) {
        const horas = Math.floor((porConfirmar.comecaEm.getTime() - agora.getTime()) / HORA);
        return `reunião em ${horas}h sem confirmação — reunião não confirmada é reunião que não acontece`;
      }
      return null;
    },
  },
  {
    /**
     * ⚠️ A REGRA QUE IMPEDE O CHUTE, E ELA VEM ANTES DAS DE TEMPO.
     *
     * Um lead que já andou no funil (foi abordado, respondeu, virou proposta)
     * mas não tem NENHUM relógio gravado é dado inconsistente — e existe de
     * verdade nesta base: a primeira safra entrou sem `lastContactedAt`. As
     * regras de tempo abaixo mediriam o silêncio dele a partir do nada, e ele
     * cairia em `NAO_ABORDADO` junto com quem chegou hoje. São coisas
     * diferentes: uma é "ninguém falou com ele"; a outra é "não dá para saber".
     */
    codigo: "sem-relogio",
    estado: "NAO_MEDIDO",
    aplicar: (f) => {
      const jaAndou = !ETAPAS_DE_ENTRADA.includes(f.stage);
      const semRelogio = !f.lastContactedAt && !f.primeiraRespostaEm && !f.ultimaEntradaEm;
      if (!jaAndou || !semRelogio) return null;
      return `está em ${f.stage} e não tem nenhuma data de contato ou de resposta gravada — não dá para medir o silêncio, e chutar aqui o misturaria com quem nunca foi abordado`;
    },
  },
  {
    codigo: "sumiu",
    estado: "CLIENTE_SUMIU",
    aplicar: (f, agora) => {
      // Só some quem já falou. Quem nunca respondeu tem outro estado, e outro
      // tratamento: com ele o problema é a abordagem, não o esfriamento.
      if (!f.primeiraRespostaEm && !f.ultimaEntradaEm) return null;
      const desde = paradoDesde(f);
      if (!desde) return null;
      const dias = (agora.getTime() - desde.getTime()) / DIA;
      if (dias < REGUA.diasParaSumico) return null;
      return `conversava conosco e está em silêncio há ${Math.floor(dias)} dias — passou do limite de ${REGUA.diasParaSumico}`;
    },
  },
  {
    codigo: "pensando",
    estado: "PENSANDO",
    aplicar: (f, agora) => {
      if (!f.primeiraRespostaEm && !f.ultimaEntradaEm) return null;
      const desde = paradoDesde(f);
      if (!desde) return null;
      const dias = (agora.getTime() - desde.getTime()) / DIA;
      return `respondeu e está decidindo há ${Math.floor(dias)} dia(s) — dentro da janela de ${REGUA.diasParaSumico} dias, precisa de prazo e não de cobrança`;
    },
  },
  {
    codigo: "nunca-respondeu",
    estado: "NUNCA_RESPONDEU",
    aplicar: (f, agora) => {
      if (!f.lastContactedAt) return null;
      const dias = Math.floor((agora.getTime() - f.lastContactedAt.getTime()) / DIA);
      return `abordado há ${dias} dia(s) e nunca respondeu — aqui o que falha é a abordagem, não o interesse`;
    },
  },
  {
    codigo: "nao-abordado",
    estado: "NAO_ABORDADO",
    aplicar: (f) => (f.lastContactedAt ? null : "ninguém falou com este contato ainda"),
  },
];

/**
 * Classifica um contato. Função **pura**: mesmo retrato, mesmo estado.
 *
 * O `NAO_MEDIDO` do fim não é defensividade decorativa — é o contrato escrito
 * no cabeçalho: se nenhuma regra casar, o sistema diz que não sabe, em vez de
 * empurrar o contato para a fila mais próxima.
 */
export function classificarFollowUp(f: FichaParaClassificar, agora: Date): Classificacao {
  for (const regra of REGRAS) {
    const porque = regra.aplicar(f, agora);
    if (porque) {
      return {
        estado: regra.estado,
        regra: regra.codigo,
        porque,
        // `NAO_MEDIDO` é o único estado que sai com `medido: false` — é o que
        // impede a tela de somar "não sei" dentro de um número.
        medido: regra.estado !== "NAO_MEDIDO",
        minutosParado: minutosEntre(paradoDesde(f), agora),
      };
    }
  }

  return {
    estado: "NAO_MEDIDO",
    regra: "sem-regra",
    porque: "nenhuma regra de follow-up casou com este retrato — falta dado para decidir, e chutar aqui esconderia o buraco",
    medido: false,
    minutosParado: minutosEntre(paradoDesde(f), agora),
  };
}

/**
 * Está esfriando? É `PENSANDO` que já passou da metade da janela de sumiço.
 *
 * Fila separada no plano do dia de propósito: é a única em que agir cedo ainda
 * muda o resultado. Depois que sumiu, o toque é outro.
 */
export function estaEsfriando(c: Classificacao): boolean {
  if (c.estado !== "PENSANDO" || c.minutosParado === null) return false;
  const limiteEmMinutos = (REGUA.diasParaSumico * DIA * REGUA.fracaoDeEsfriamento) / MIN;
  return c.minutosParado >= limiteEmMinutos;
}

/**
 * Os estados que **pedem ação** da CRM IA hoje.
 *
 * `PENSANDO`, `OPORTUNIDADE_FUTURA`, `VIROU_CLIENTE`, `PEDIU_SILENCIO`,
 * `LEAD_SEM_PERFIL` e `NAO_MEDIDO` ficam de fora — cada um por um motivo
 * diferente, todos escritos na regra que os produz.
 */
export const ESTADOS_QUE_PEDEM_ACAO: readonly EstadoDeFollowUp[] = [
  "PAGAMENTO_ABANDONADO",
  "CARRINHO_ABANDONADO",
  "PROPOSTA_PARADA",
  "REUNIAO_PENDENTE",
  "CLIENTE_SUMIU",
  "NUNCA_RESPONDEU",
  "NAO_ABORDADO",
];

export function pedeAcao(c: Classificacao): boolean {
  return ESTADOS_QUE_PEDEM_ACAO.includes(c.estado);
}

// ─────────────────────────────────────────────────────────────────────────────
// LEITURA DO BANCO
// ─────────────────────────────────────────────────────────────────────────────

/** O `select` mínimo. Separado para o plano do dia reusar sem divergir. */
export const SELECT_PARA_CLASSIFICAR = {
  id: true,
  nome: true,
  stage: true,
  temperatura: true,
  score: true,
  optOutAt: true,
  lastContactedAt: true,
  primeiraRespostaEm: true,
  ultimaMensagemEm: true,
  ultimaMensagemDeQuem: true,
  propostas: {
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      situacao: true,
      valorMensalCent: true,
      enviadaEm: true,
      respondidaEm: true,
      updatedAt: true,
    },
  },
  compromissos: {
    orderBy: { comecaEm: "desc" },
    take: 5,
    select: { situacao: true, comecaEm: true, confirmadoEm: true, remarcadoParaId: true },
  },
  oportunidades: {
    select: { estagio: true, valorPotencialCents: true },
  },
} as const;

type LinhaDoLead = {
  id: string;
  nome: string;
  stage: SiteLeadStage;
  temperatura: LeadTemperatura | null;
  score: number | null;
  optOutAt: Date | null;
  lastContactedAt: Date | null;
  primeiraRespostaEm: Date | null;
  ultimaMensagemEm: Date | null;
  ultimaMensagemDeQuem: "ENTRADA" | "SAIDA" | null;
  propostas: {
    situacao: PropostaNaFicha["situacao"];
    valorMensalCent: number | null;
    enviadaEm: Date | null;
    respondidaEm: Date | null;
    updatedAt: Date;
  }[];
  compromissos: {
    situacao: CompromissoNaFicha["situacao"];
    comecaEm: Date;
    confirmadoEm: Date | null;
    remarcadoParaId: string | null;
  }[];
  oportunidades: { estagio: string; valorPotencialCents: number | null }[];
};

/**
 * Traduz a linha do banco para a ficha.
 *
 * ⚠️ `ultimaEntradaEm` só é preenchida quando a última mensagem foi DELE. O
 * espelho `ultimaMensagemEm` guarda a última de qualquer lado; ler o espelho sem
 * conferir a direção faria toda abordagem nossa contar como resposta dele — e o
 * lead sumido apareceria eternamente como lead ativo.
 */
export function fichaDaLinha(l: LinhaDoLead): FichaParaClassificar {
  const ultimaEntradaEm =
    l.ultimaMensagemDeQuem === "ENTRADA" ? l.ultimaMensagemEm : (l.primeiraRespostaEm ?? null);

  const aberta = l.oportunidades.find((o) => o.estagio !== "GANHA" && o.estagio !== "PERDIDA");

  return {
    leadId: l.id,
    nome: l.nome,
    stage: l.stage,
    temperatura: l.temperatura,
    score: l.score,
    optOutAt: l.optOutAt,
    lastContactedAt: l.lastContactedAt,
    primeiraRespostaEm: l.primeiraRespostaEm,
    ultimaEntradaEm,
    propostas: l.propostas.map((p) => ({
      situacao: p.situacao,
      valorMensalCent: p.valorMensalCent,
      enviadaEm: p.enviadaEm,
      respondidaEm: p.respondidaEm,
      atualizadaEm: p.updatedAt,
    })),
    compromissos: l.compromissos.map((c) => ({
      situacao: c.situacao,
      comecaEm: c.comecaEm,
      confirmadoEm: c.confirmadoEm,
      remarcadoParaId: c.remarcadoParaId,
    })),
    temOportunidadeGanha: l.oportunidades.some((o) => o.estagio === "GANHA"),
    valorPotencialCents: aberta?.valorPotencialCents ?? null,
  };
}

/** Carrega e classifica um contato. `null` quando o lead não existe. */
export async function classificarLead(
  db: Cliente,
  leadId: string,
  agora: Date = new Date(),
): Promise<{ ficha: FichaParaClassificar; classificacao: Classificacao } | null> {
  const linha = (await db.siteLead.findUnique({
    where: { id: leadId },
    select: SELECT_PARA_CLASSIFICAR as unknown as Prisma.SiteLeadSelect,
  })) as LinhaDoLead | null;

  if (!linha) return null;
  const ficha = fichaDaLinha(linha);
  return { ficha, classificacao: classificarFollowUp(ficha, agora) };
}

// ─────────────────────────────────────────────────────────────────────────────
// A TRILHA — o estado E o porquê ficam gravados
// ─────────────────────────────────────────────────────────────────────────────

/** O texto que vai para a trilha. Formato fixo para a leitura ser rasteável. */
export function notaDaClassificacao(c: Classificacao): string {
  return `follow-up: ${c.estado} (regra "${c.regra}") — ${c.porque}`;
}

/**
 * A chave que faz reclassificar o mesmo contato, no mesmo estado, no mesmo dia
 * ser um `no-op`.
 *
 * Inclui o DIA de propósito: um contato que segue sumido por três semanas não
 * precisa de vinte e uma linhas iguais na trilha, mas precisa de uma por dia —
 * é ela que responde "desde quando ele está assim" sem varrer mensagem.
 */
export function chaveDaClassificacao(leadId: string, c: Classificacao, agora: Date): string {
  const dia = agora.toISOString().slice(0, 10);
  return `followup:estado:${leadId}:${c.estado}:${dia}`;
}

export interface ResultadoDoRegistro {
  /** `true` se gravou agora; `false` se a mesma classificação já estava lá. */
  gravou: boolean;
  /** `true` quando a trilha da jornada (empresa/oportunidade) também recebeu. */
  naJornada: boolean;
}

/**
 * Grava o estado e o porquê.
 *
 * ── POR QUE DOIS LUGARES, E NÃO UM ──────────────────────────────────────────
 *
 * `EventoDaJornada` só aceita EMPRESA, CONTATO, OPORTUNIDADE ou CLIENTE — e a
 * maioria dos leads da casa (Meta Ads, formulário) **não tem empresa**. Gravar
 * só lá perderia a classificação justamente de quem mais recebe follow-up.
 *
 * Então: `SiteLeadInteraction` é o registro que SEMPRE acontece, porque é onde
 * a história do lead mora; e, quando o lead tem empresa ou oportunidade, o
 * mesmo fato entra também na trilha da jornada, com chave de idempotência.
 * Não são dois sistemas: é o mesmo fato em duas linhas do tempo que já existem.
 */
export async function registrarClassificacao(
  db: Cliente,
  params: {
    leadId: string;
    classificacao: Classificacao;
    autoria: Autoria;
    empresaId?: string | null;
    contatoId?: string | null;
    oportunidadeId?: string | null;
    agora?: Date;
  },
): Promise<ResultadoDoRegistro> {
  const agora = params.agora ?? new Date();
  const nota = notaDaClassificacao(params.classificacao);
  const chave = chaveDaClassificacao(params.leadId, params.classificacao, agora);

  // O dia começa à meia-noite UTC, o mesmo corte usado na chave — para as duas
  // linhas do tempo concordarem sobre o que é "hoje".
  const inicioDoDia = new Date(`${agora.toISOString().slice(0, 10)}T00:00:00.000Z`);

  const jaTem = await db.siteLeadInteraction.findFirst({
    where: { leadId: params.leadId, tipo: "NOTA_INTERNA", nota, createdAt: { gte: inicioDoDia } },
    select: { id: true },
  });

  let gravou = false;
  if (!jaTem) {
    await db.siteLeadInteraction.create({
      data: {
        leadId: params.leadId,
        tipo: "NOTA_INTERNA",
        actor: params.autoria.label ?? params.autoria.autor,
        nota,
        interna: true,
      },
    });
    gravou = true;
  }

  let naJornada = false;
  if (params.oportunidadeId || params.empresaId || params.contatoId) {
    naJornada = await registrarNaTrilha(db, {
      entidade: params.oportunidadeId ? "OPORTUNIDADE" : params.empresaId ? "EMPRESA" : "CONTATO",
      entidadeId: (params.oportunidadeId ?? params.empresaId ?? params.contatoId)!,
      empresaId: params.empresaId ?? null,
      contatoId: params.contatoId ?? null,
      oportunidadeId: params.oportunidadeId ?? null,
      leadId: params.leadId,
      tipo: "NOTA",
      autoria: params.autoria,
      motivo: params.classificacao.estado,
      nota,
      fonte: "crm-ia",
      chaveDeIdempotencia: chave,
    });
  }

  return { gravou, naJornada };
}
