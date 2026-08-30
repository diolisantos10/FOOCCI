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
 *
 * ─── ⚠️ E A TRAVA É ALLOWLIST, DEPOIS DE UM ACHADO QUE DOEU (B-3) ───────────
 *
 * Na primeira versão isto era uma **denylist de treze nomes exatos**, e o
 * comentário aqui prometia recusa nomeada. O auditor passou, com HTTP 200,
 * `restaurant_id`, `RestaurantId`, `restaurantid`, `tenantId`, `userId`,
 * `orderNumber` e `email` — todos ignorados em silêncio, exatamente o que este
 * texto jurava não acontecer. Não havia efeito a jusante (`corpo` só é lido em
 * `route.ts` e nada fora do `PedidoConferido` viaja), então era defeito de
 * AFIRMAÇÃO, não furo explorável. Continua sendo o defeito que importa: uma
 * denylist promete pela lista dos que ela conhece e mente sobre todo o resto.
 *
 * O conserto não foi caçar mais nomes — caçar nomes é a mesma denylist, só que
 * mais comprida, e a próxima variante vizinha (`restaurant-id`, `RESTAURANTID`,
 * `restauranteID`) entraria igual. **Agora o corpo é uma allowlist**: o que não
 * é um dos campos que esta porta consome é recusado, com o nome do campo no
 * motivo. A denylist continua viva, mas só para dar uma mensagem ESPECÍFICA aos
 * nomes do domínio operacional — não é mais ela que decide o que passa.
 */

import {
  AGENTES_PERMITIDOS,
  AGENTE_DO_PILOTO,
  GERENTE_DO_PRODUTO,
  PRODUTO_ID,
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

/**
 * ⭐ OS ÚNICOS CAMPOS QUE ESTA PORTA CONSOME. O resto é recusa nomeada.
 *
 * Esta lista é o contrato inteiro, e ela existe para não haver a terceira
 * categoria — "campo que chegou, não é conhecido e foi ignorado sem ninguém
 * ficar sabendo". Um campo aqui é lido; um campo fora daqui é recusado. Não há
 * meio-termo, e é por isso que a promessa do cabeçalho deste arquivo passa a ser
 * verdade em vez de intenção.
 *
 * ⚠️ Acrescentar um nome aqui é acrescentar entrada à porta corporativa: só se
 * faz junto com o código que lê o campo e o teste que prova as duas metades.
 */
export const CAMPOS_ACEITOS = [
  "modo",
  "sintetico",
  "acao",
  "de",
  "para",
  "agente",
  "fio",
  "mensagem",
  "assunto",
  "cenarios",
] as const;

/**
 * ⭐ A FORMA DO FIO — porque ele vira coluna do banco (achado B-5).
 *
 * O `fio` não é texto do chamador: é um identificador que ESTA PORTA cunhou, em
 * `iniciar`, e devolveu. Quem responde devolve o que recebeu. Então ele tem uma
 * forma exata, e o que não tem essa forma não é um fio.
 *
 * Sem isto, o auditor mandou `fio: "../../etc/passwd"` e recebeu 200, e mandou
 * um fio de 100.000 caracteres que foi escrito na coluna `seed` (`String?`, sem
 * limite no schema). Nenhum dos dois tinha efeito conhecido a jusante — o `seed`
 * é comparado com `startsWith` e nunca vira caminho de arquivo — mas "hoje não
 * tem efeito" não é trava, e coluna de banco não é caixa de entrada de texto
 * livre. Aceitar forma errada também abriria a porta para alguém CUNHAR um fio
 * escolhido a dedo em vez de continuar um fio que existe.
 */
export const PREFIXO_DO_FIO = `connect:${PRODUTO_ID}:` as const;
export const FORMA_DO_FIO = new RegExp(
  `^connect:${PRODUTO_ID}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`,
);
export const MAX_TAMANHO_DO_FIO = PREFIXO_DO_FIO.length + 36;

/** O fio novo, cunhado por esta porta a partir de um UUID. */
export function fioNovo(uuid: string): string {
  return `${PREFIXO_DO_FIO}${uuid}`;
}

/**
 * Tetos do texto livre — os DOIS campos que viajam para os metadados da rodada
 * e, de lá, para a coluna `metadata` do banco. Mesma doutrina do `cenarios`:
 * acima do teto é recusa nomeada, nunca corte silencioso, porque cortar faria a
 * porta gravar uma mensagem diferente da que foi mandada sem dizer a ninguém.
 */
export const MAX_MENSAGEM = 4_000;
export const MAX_ASSUNTO = 300;

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

/** Teto do que um motivo de recusa devolve do que o chamador mandou. */
export const MAX_ECO = 200;

/**
 * ⚠️ O ECO DE VOLTA TAMBÉM TEM TETO — variante vizinha do achado B-5.
 *
 * Toda recusa desta porta cita o valor recebido, e citar é bom: é o que faz a
 * recusa ser NOMEADA em vez de um "400" mudo. Mas o valor recebido é do
 * chamador, e sem teto um `modo` de 100.000 caracteres volta inteiro dentro do
 * motivo — a mesma doença do fio sem tamanho, só que na saída. O eco é cortado,
 * e o corte se declara, para ninguém ler o valor cortado como o valor enviado.
 */
function eco(valor: unknown): string {
  let texto: string;
  try {
    texto = JSON.stringify(valor ?? null) ?? String(valor);
  } catch {
    texto = "<valor que não se deixa serializar>";
  }
  return texto.length <= MAX_ECO ? texto : `${texto.slice(0, MAX_ECO)}…(cortado, ${texto.length} caracteres)`;
}

/**
 * A conferência do corpo. Fail-closed em cada campo: o que não é exatamente o
 * que se espera vira recusa com o motivo dito em português.
 */
export function conferirPedido(corpo: PedidoDeDespacho): Conferencia {
  // ── Trava 0: o corpo é um objeto de campos. Nem lista, nem texto, nem nulo. ─
  //
  // Sem isto a allowlist de baixo leria os índices de um array como se fossem
  // nomes de campo, e um corpo `[]` atravessaria a varredura sem nada a varrer.
  if (corpo === null || typeof corpo !== "object" || Array.isArray(corpo)) {
    return {
      ok: false,
      motivo:
        `corpo inválido: esta porta espera um objeto JSON de campos e recebi ${
          Array.isArray(corpo) ? "uma lista" : JSON.stringify(corpo ?? null)
        }.`,
    };
  }

  // ── Trava 1: o modo. Literal, sem padrão, sem coerção. ───────────────────
  if (corpo.modo !== MODO_EXIGIDO) {
    return {
      ok: false,
      motivo:
        `modo inválido: recebi ${eco(corpo.modo)} e esta porta só abre com ` +
        `"${MODO_EXIGIDO}". Aqui não há normalização: campo ausente não ganha o valor seguro, é recusado.`,
    };
  }

  // ── Trava 2: sintético. O booleano `true`, não a string, não o número. ───
  if (corpo.sintetico !== true) {
    return {
      ok: false,
      motivo:
        `sintetico inválido: recebi ${eco(corpo.sintetico)} e esta porta exige o ` +
        `booleano true. Dado real não entra em ensaio — e "true" em texto não é true.`,
    };
  }

  // ── ⭐ Trava 3: ALLOWLIST. O que esta porta não consome, ela recusa. ──────
  //
  // A varredura é sobre as chaves que CHEGARAM, não sobre uma lista de nomes
  // suspeitos: é isso que faz a recusa valer para a variante vizinha que ninguém
  // pensou em escrever (`restaurant_id`, `RestaurantId`, `tenantId`, `email`…).
  //
  // A denylist do domínio operacional continua aqui, mas mudou de papel: ela não
  // decide mais o que passa — decide só QUE MOTIVO o chamador lê, porque mandar
  // `restaurantId` merece a explicação inteira, e mandar `emial` merece "não
  // conheço este campo".
  //
  // A recusa é por campo PRESENTE, não por valor errado: mesmo um id existente e
  // legítimo é recusado, porque o defeito não era o valor — era a porta deixar o
  // chamador amarrar uma execução de homologação a uma linha do mundo real.
  for (const campo of Object.keys(corpo)) {
    if ((CAMPOS_ACEITOS as readonly string[]).includes(campo)) continue;
    const enviado = (corpo as Record<string, unknown>)[campo];
    if ((CAMPOS_DO_DOMINIO_PROIBIDOS as readonly string[]).includes(campo)) {
      return {
        ok: false,
        motivo:
          `"${campo}" não é entrada desta porta — recebi ${eco(enviado)} e recusei. O Dioli Connect ` +
          `não toca o domínio operacional do Foocci: nada de pedido, WhatsApp de cliente, cobrança ou CRM. ` +
          `Esta porta roda o agente contra catálogo sintético, num laboratório que nunca escreve em tabela de ` +
          `negócio. Remova "${campo}" do corpo: o que o chamador não escolhe, ele não força.`,
      };
    }
    return {
      ok: false,
      motivo:
        `"${campo}" não é entrada desta porta — recebi ${eco(enviado)} e recusei. Esta porta lê ` +
        `exatamente ${CAMPOS_ACEITOS.map((c) => `"${c}"`).join(", ")} e mais nada: campo desconhecido é ` +
        `recusado, nunca ignorado em silêncio. Ignorar deixaria você achando que escolheu alguma coisa — e o ` +
        `campo que a porta não lê é o campo que ninguém audita. Remova "${campo}" do corpo.`,
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
        `autoridade recusada: "de" veio como ${eco(corpo.de)} e esta porta só aceita ` +
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
        `destinatário recusado: "para" veio como ${eco(corpo.para)} e esta porta endereça ` +
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
        `agente ${eco(agentePedido)} recusado: esta porta está presa a ` +
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
        `acao ${eco(acaoPedida)} recusada: esta porta conhece ` +
        `${ACOES.map((a) => `"${a}"`).join(", ")} e nada mais. Não há padrão: escolher o verbo por omissão ` +
        `seria a porta decidindo se está recebendo, respondendo ou iniciando conversa no lugar de quem chama.`,
    };
  }
  const acao = acaoPedida as AcaoDoConnect;

  const fio = texto(corpo.fio);
  const mensagem = texto(corpo.mensagem);
  const assunto = texto(corpo.assunto);

  // ── ⭐ Trava 8: o fio tem FORMA e TAMANHO, porque ele vira coluna. ────────
  //
  // O tamanho é conferido antes da forma para que um fio de 100.000 caracteres
  // receba o motivo certo ("grande demais") em vez de um genérico "forma
  // inválida" com cem mil caracteres ecoados dentro dele.
  if (fio !== null) {
    if (fio.length > MAX_TAMANHO_DO_FIO) {
      return {
        ok: false,
        motivo:
          `fio grande demais: recebi ${fio.length} caracteres e o máximo é ${MAX_TAMANHO_DO_FIO}. O fio não é ` +
          "texto livre do chamador — é o identificador que esta porta cunhou e devolveu, e ele vira coluna " +
          "consultável do banco. Devolva o fio como você o recebeu.",
      };
    }
    // A FORMA só é cobrada de quem continua um fio. Em `iniciar`, mandar fio é
    // errado de qualquer forma — inclusive com a forma certa — e a trava 10 diz
    // isso melhor do que "forma inválida" diria.
    if (acao !== "iniciar" && !FORMA_DO_FIO.test(fio)) {
      return {
        ok: false,
        motivo:
          `fio com forma inválida: recebi ${eco(fio)} e esta porta só conhece fios no formato ` +
          `"${PREFIXO_DO_FIO}<uuid>", que é o que ela mesma cunha em "iniciar". Fio não é campo de texto ` +
          "livre: ele é gravado numa coluna do banco e é por ele que o histórico de uma conversa é achado. " +
          'Para abrir conversa nova, a ação é "iniciar" — ela devolve o fio pronto.',
      };
    }
  }

  // ── Trava 9: o texto livre tem teto — e estourar o teto é recusa. ────────
  //
  // `mensagem` e `assunto` são os dois campos que viajam para os metadados da
  // rodada e de lá para o banco. Cortar em silêncio faria a porta gravar coisa
  // diferente da que foi mandada; por isso, recusa nomeada, como em `cenarios`.
  for (const [nome, valor, teto] of [
    ["mensagem", mensagem, MAX_MENSAGEM],
    ["assunto", assunto, MAX_ASSUNTO],
  ] as const) {
    if (valor !== null && valor.length > teto) {
      return {
        ok: false,
        motivo:
          `${nome} grande demais: recebi ${valor.length} caracteres e o máximo é ${teto}. Este campo é gravado ` +
          "nos metadados da rodada, e o corte silencioso faria a porta registrar um texto diferente do que foi " +
          "mandado sem dizer a ninguém.",
      };
    }
  }

  // ── Trava 10: cada verbo tem a sua forma, e ela é conferida. ────────────
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
          `acao "iniciar" não aceita "fio" — recebi ${eco(corpo.fio)}. Iniciar é ABRIR um fio, e ` +
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
      return { ok: false, motivo: `cenarios deve ser um inteiro — recebi ${eco(corpo.cenarios)}` };
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
