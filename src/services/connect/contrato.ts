/**
 * O CONTRATO DA PORTA DO DIOLI CONNECT NO FOOCCI — o que entra, e o que é recusado.
 *
 * ─── POR QUE ESTE ARQUIVO É SEPARADO DA ROTA ────────────────────────────────
 *
 * A rota HTTP é casca: autentica, lê o corpo, monta as dependências e responde.
 * TODA a decisão — o que passa, o que é recusado e com que motivo — mora aqui,
 * em código puro, sem Prisma e sem rede. Portão que só existe dentro de uma rota
 * Next não é testável nas duas metades (o que barra E o que deixa passar), e
 * portão sem as duas metades é enfeite.
 *
 * ─── ⚠️ AQUI O PADRÃO DA CASA É O OPOSTO DO QUE ESTA PORTA PRECISA ──────────
 *
 * O Foocci normaliza entrada: `normalizeMode` pega lixo e devolve o valor seguro,
 * e isso é certo no domínio operacional — um cliente não pode perder o pedido
 * porque digitou errado. **Numa porta corporativa é o contrário.** Normalizar
 * silenciosamente significa que quem esqueceu de mandar `modo` recebe o modo que
 * o código escolheu, e ninguém fica sabendo. Se um dia o valor seguro mudar, a
 * porta abre em outro lugar sem que uma linha de chamada tenha mudado.
 *
 * Então aqui **não existe padrão silencioso**: `modo` tem que ser a string
 * `"homologacao"` e `sintetico` tem que ser o booleano `true`. Ausente, nulo,
 * `"true"` em texto, `1` — recusa NOMEADA. É a diferença entre um contrato e uma
 * sugestão.
 *
 * ─── ⭐ O DOMÍNIO OPERACIONAL NÃO ENTRA POR AQUI, NEM DE CARONA ─────────────
 *
 * A ordem é explícita: esta obra **não altera o domínio operacional do produto**
 * — nada de pedido, WhatsApp de cliente, cobrança ou CRM. A forma barata de
 * cumprir isso seria "não escrever código que mexa nisso". Não basta: bastaria
 * um `restaurantId` no corpo para a execução de homologação nascer grudada num
 * restaurante real no rastro, para sempre — o "id aceito sem conferir de quem é".
 *
 * Então a trava é de ENTRADA: os identificadores do mundo real não são campos
 * ignorados, são campos **recusados**. Ignorar deixaria quem chama achando que
 * escolheu; recusar diz na cara que essa escolha não existe. Sem entrada, não há
 * o que forçar.
 */

import {
  AGENTES_PERMITIDOS,
  AGENTE_DO_PILOTO,
  GERENTE_DO_PRODUTO,
  QUEM_PODE_DESPACHAR,
} from "./cadastro";

/** O modo é literal e único. Não existe padrão. */
export const MODO_EXIGIDO = "homologacao" as const;

/** Os três verbos da conversa. Lista fechada, e sem padrão. */
export const ACOES = ["receber", "responder", "iniciar"] as const;
export type AcaoDoConnect = (typeof ACOES)[number];

/**
 * ⛔ OS CAMPOS DO MUNDO REAL QUE ESTA PORTA RECUSA.
 *
 * Cada um é uma porta de entrada para o domínio operacional: o restaurante, o
 * pedido, o cliente, a conversa de WhatsApp, a cobrança. Presente no corpo — com
 * qualquer valor, inclusive um valor impecável — é recusa nomeada.
 */
export const CAMPOS_DO_DOMINIO_PROIBIDOS = [
  "restaurantId",
  "restauranteId",
  "orderId",
  "pedidoId",
  "customerId",
  "clienteId",
  "conversationId",
  "conversaId",
  "phone",
  "telefone",
  "whatsapp",
  "paymentId",
  "cobrancaId",
] as const;

/** Teto de cenários por rodada. Acima disso é recusa, não corte silencioso. */
export const MAX_CENARIOS = 10;
export const CENARIOS_PADRAO = 6;

/** O pedido como ele chega. Tudo `unknown` — nada é confiado. */
export interface PedidoDeDespacho {
  modo?: unknown;
  sintetico?: unknown;
  acao?: unknown;
  /** Em nome de quem a Control Room fala. */
  de?: unknown;
  /** A quem a mensagem é endereçada dentro do produto. */
  para?: unknown;
  /** O agente a executar. Ausente vale pelo único permitido. */
  agente?: unknown;
  /** O fio da conversa. Obrigatório em `responder`, proibido em `iniciar`. */
  fio?: unknown;
  /** A mensagem recebida. Obrigatória em `receber`/`responder`, proibida em `iniciar`. */
  mensagem?: unknown;
  /** O assunto de uma conversa nova. Obrigatório em `iniciar`. */
  assunto?: unknown;
  /** Quantos cenários sintéticos rodar. Opcional. */
  cenarios?: unknown;
}

/** O pedido depois de conferido — só existe se passou por todas as travas. */
export interface PedidoConferido {
  modo: typeof MODO_EXIGIDO;
  sintetico: true;
  acao: AcaoDoConnect;
  de: string;
  para: string;
  agente: string;
  fio: string | null;
  mensagem: string | null;
  assunto: string | null;
  cenarios: number;
}

export type Conferencia = { ok: true; pedido: PedidoConferido } | { ok: false; motivo: string };

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() ? valor.trim() : null;
}

/**
 * A conferência do corpo. Fail-closed em cada campo: o que não é exatamente o
 * que se espera vira recusa com o motivo dito em português.
 */
export function conferirPedido(corpo: PedidoDeDespacho): Conferencia {
  // ── Trava 1: o modo. Literal, sem padrão, sem coerção. ───────────────────
  if (corpo.modo !== MODO_EXIGIDO) {
    return {
      ok: false,
      motivo:
        `modo inválido: recebi ${JSON.stringify(corpo.modo ?? null)} e esta porta só abre com ` +
        `"${MODO_EXIGIDO}". Aqui não há normalização: campo ausente não ganha o valor seguro, é recusado.`,
    };
  }

  // ── Trava 2: sintético. O booleano `true`, não a string, não o número. ───
  if (corpo.sintetico !== true) {
    return {
      ok: false,
      motivo:
        `sintetico inválido: recebi ${JSON.stringify(corpo.sintetico ?? null)} e esta porta exige o ` +
        `booleano true. Dado real não entra em ensaio — e "true" em texto não é true.`,
    };
  }

  // ── ⭐ Trava 3: o domínio operacional não tem entrada aqui. ───────────────
  //
  // A recusa é por campo PRESENTE, não por valor errado: mesmo um id existente e
  // legítimo é recusado, porque o defeito não era o valor — era a porta deixar o
  // chamador amarrar uma execução de homologação a uma linha do mundo real.
  for (const campo of CAMPOS_DO_DOMINIO_PROIBIDOS) {
    const enviado = (corpo as Record<string, unknown>)[campo];
    if (enviado === undefined) continue;
    return {
      ok: false,
      motivo:
        `"${campo}" não é entrada desta porta — recebi ${JSON.stringify(enviado)} e recusei. O Dioli Connect ` +
        `não toca o domínio operacional do Foocci: nada de pedido, WhatsApp de cliente, cobrança ou CRM. ` +
        `Esta porta roda o agente contra catálogo sintético, num laboratório que nunca escreve em tabela de ` +
        `negócio. Remova "${campo}" do corpo: o que o chamador não escolhe, ele não força.`,
    };
  }

  // ── Trava 4: a autoridade. Lista fechada de quem pode despachar. ─────────
  //
  // O segredo prova que quem chama é a Control Room; este campo diz em nome de
  // QUEM ela fala. Sem padrão: falar sem se identificar não é falar.
  const de = texto(corpo.de);
  if (!de || !QUEM_PODE_DESPACHAR.includes(de)) {
    return {
      ok: false,
      motivo:
        `autoridade recusada: "de" veio como ${JSON.stringify(corpo.de ?? null)} e esta porta só aceita ` +
        `${QUEM_PODE_DESPACHAR.map((p) => `"${p}"`).join(" ou ")}. O segredo prova que quem chama é a Control ` +
        `Room; "de" diz em nome de quem — e um papel fora da lista não passa nem com o segredo certo.`,
    };
  }

  // ── Trava 5: o destinatário é o gerente registrado, e mais ninguém. ──────
  const para = texto(corpo.para);
  if (!para || para !== GERENTE_DO_PRODUTO) {
    return {
      ok: false,
      motivo:
        `destinatário recusado: "para" veio como ${JSON.stringify(corpo.para ?? null)} e esta porta endereça ` +
        `exclusivamente "${GERENTE_DO_PRODUTO}" — o Agente Gerente do departamento que governa o agente ` +
        `acionado. Endereçar ficha não cadastrada é despachar para ninguém.`,
    };
  }

  // ── Trava 6: o agente é uma lista de um. ────────────────────────────────
  //
  // Ausente cai no único permitido, e isso NÃO é padrão silencioso: quando a
  // lista tem um item só, "não escolher" e "escolher o único" são a mesma coisa.
  // O que não é possível é escolher OUTRO.
  const agentePedido = corpo.agente === undefined || corpo.agente === null ? AGENTE_DO_PILOTO : corpo.agente;
  if (typeof agentePedido !== "string" || !AGENTES_PERMITIDOS.includes(agentePedido)) {
    return {
      ok: false,
      motivo:
        `agente ${JSON.stringify(agentePedido)} recusado: esta porta está presa a ` +
        `${AGENTES_PERMITIDOS.map((a) => `"${a}"`).join(", ")} e não aciona nenhum outro. É o único agente ` +
        `deste produto que executa sem gastar chave de IA, e o piloto foi aprovado só para ele.`,
    };
  }
  const agente = agentePedido;

  // ── Trava 7: a ação. Lista fechada de três, e sem padrão. ───────────────
  const acaoPedida = corpo.acao;
  if (typeof acaoPedida !== "string" || !(ACOES as readonly string[]).includes(acaoPedida)) {
    return {
      ok: false,
      motivo:
        `acao ${JSON.stringify(acaoPedida ?? null)} recusada: esta porta conhece ` +
        `${ACOES.map((a) => `"${a}"`).join(", ")} e nada mais. Não há padrão: escolher o verbo por omissão ` +
        `seria a porta decidindo se está recebendo, respondendo ou iniciando conversa no lugar de quem chama.`,
    };
  }
  const acao = acaoPedida as AcaoDoConnect;

  const fio = texto(corpo.fio);
  const mensagem = texto(corpo.mensagem);
  const assunto = texto(corpo.assunto);

  // ── Trava 8: cada verbo tem a sua forma, e ela é conferida. ─────────────
  if (acao === "receber") {
    if (!mensagem) {
      return { ok: false, motivo: 'acao "receber" exige "mensagem" — receber um silêncio não é receber' };
    }
  }

  if (acao === "responder") {
    if (!mensagem) {
      return { ok: false, motivo: 'acao "responder" exige "mensagem" — responder sem o que foi dito não é responder' };
    }
    if (!fio) {
      return {
        ok: false,
        motivo:
          'acao "responder" exige "fio": só se responde dentro de uma conversa que já existe. Sem o fio, o ' +
          'turno nasceria órfão e o histórico se perderia — que é justamente o que este kit existe para ' +
          'preservar. Para abrir conversa nova, a ação é "iniciar".',
      };
    }
  }

  if (acao === "iniciar") {
    if (!assunto) {
      return { ok: false, motivo: 'acao "iniciar" exige "assunto" — conversa nova sem assunto não tem por que existir' };
    }
    if (corpo.fio !== undefined && corpo.fio !== null) {
      return {
        ok: false,
        motivo:
          `acao "iniciar" não aceita "fio" — recebi ${JSON.stringify(corpo.fio)}. Iniciar é ABRIR um fio, e ` +
          'quem manda um fio está continuando outro. Reaproveitar fio em "iniciar" faria dois começos ' +
          'disputarem o mesmo histórico. Para continuar, a ação é "responder".',
      };
    }
    if (corpo.mensagem !== undefined && corpo.mensagem !== null) {
      return {
        ok: false,
        motivo:
          'acao "iniciar" não aceita "mensagem": quem inicia não está respondendo ninguém. O que a conversa ' +
          'nova carrega é "assunto".',
      };
    }
  }

  // ── O teto de cenários: recusa, não corte silencioso. ───────────────────
  let cenarios = CENARIOS_PADRAO;
  if (corpo.cenarios !== undefined && corpo.cenarios !== null) {
    if (typeof corpo.cenarios !== "number" || !Number.isInteger(corpo.cenarios)) {
      return { ok: false, motivo: `cenarios deve ser um inteiro — recebi ${JSON.stringify(corpo.cenarios)}` };
    }
    if (corpo.cenarios < 1 || corpo.cenarios > MAX_CENARIOS) {
      return {
        ok: false,
        motivo: `cenarios fora da faixa: recebi ${corpo.cenarios} e o permitido é de 1 a ${MAX_CENARIOS}. ` +
          "Cortar em silêncio faria a porta rodar um ensaio diferente do pedido sem dizer.",
      };
    }
    cenarios = corpo.cenarios;
  }

  return {
    ok: true,
    pedido: {
      modo: MODO_EXIGIDO,
      sintetico: true,
      acao,
      de,
      para,
      agente,
      fio: acao === "iniciar" ? null : fio,
      mensagem,
      assunto,
      cenarios,
    },
  };
}
