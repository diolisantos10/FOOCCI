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

/**
 * ⭐⭐ OS DOIS MODOS — E A SEPARAÇÃO QUE PRECISA FICAR ESCRITA EM VOZ ALTA.
 *
 * ─── A ORDEM QUE ABRIU `producao` (30/08/2026) ──────────────────────────────
 *
 * Até hoje esta porta tinha um modo só, `homologacao`, e ele fazia **duas**
 * coisas ao mesmo tempo — o que fazia as duas parecerem uma:
 *
 *   1. declarava que a operação é ensaio e **não vale**;
 *   2. junto com a recusa nomeada dos campos de identificação, garantia que
 *      **nada do mundo real atravessa**.
 *
 * O CEO mandou ligar a porta "pra valer". Isso é (1).
 *
 * ─── ⛔ E AQUI ESTÁ O AVISO PARA O DIA EM QUE ALGUÉM QUISER (2) DE GRAÇA ────
 *
 * **`modo: "producao"` NÃO é, por si só, licença para mandar o que se quiser
 * por esta porta. Os dois assuntos são independentes, e nenhum implica o outro.**
 *
 * Está escrito aqui porque a tentação de amanhã tem forma conhecida: alguém vai
 * dizer "mas a porta já está em produção, então mandar o `restaurantId` é só a
 * consequência natural". **Não é.** Não é consequência de nada. Foi assim que
 * quatro portas desta casa ganharam o mesmo defeito no mesmo dia — uma trava
 * caiu, e a vizinha caiu de carona porque ninguém tinha escrito que elas eram
 * independentes.
 *
 * O que mudou com `producao` está listado, item a item, em `CAMPOS_ACEITOS` e em
 * `CASO_DO_LEAD_POR_QUE_ELE_PASSA`. O que **não** mudou continua recusado pelo
 * nome, nos dois modos: `CAMPOS_DO_DOMINIO_PROIBIDOS`.
 *
 * ─── O QUE CADA MODO EXIGE, E POR QUE `sintetico` NÃO TEM PADRÃO EM NENHUM ──
 *
 *   homologacao → `sintetico: true`  (ensaio: não vale, não conta, não obriga)
 *   producao    → `sintetico: false` (vale: fica no rastro como operação real)
 *
 * O booleano continua **obrigatório e literal nos dois**. Deixá-lo cair por
 * omissão no valor do modo seria devolver o padrão silencioso pela porta dos
 * fundos: quem esquecesse o campo passaria a declarar "isto vale" sem ter
 * escrito isso em lugar nenhum.
 */
export const MODO_DE_ENSAIO = "homologacao" as const;
export const MODO_DE_PRODUCAO = "producao" as const;

/** Mantido com o nome antigo para quem já importava daqui. */
export const MODO_EXIGIDO = MODO_DE_ENSAIO;

export const MODOS_ACEITOS = [MODO_DE_ENSAIO, MODO_DE_PRODUCAO] as const;
export type ModoDoConnect = (typeof MODOS_ACEITOS)[number];

/** O `sintetico` que cada modo exige. Literal, e sem padrão em nenhum dos dois. */
export const SINTETICO_EXIGIDO: Record<ModoDoConnect, boolean> = {
  [MODO_DE_ENSAIO]: true,
  [MODO_DE_PRODUCAO]: false,
};

/** Os três verbos da conversa. Lista fechada, e sem padrão. */
export const ACOES = ["receber", "responder", "iniciar"] as const;
export type AcaoDoConnect = (typeof ACOES)[number];

/**
 * ⛔ OS CAMPOS DO DOMÍNIO OPERACIONAL QUE ESTA PORTA RECUSA — NOS DOIS MODOS.
 *
 * Cada um é uma porta de entrada para o domínio operacional do produto vendido:
 * o restaurante, o pedido, o consumidor final, a conversa de WhatsApp dele, a
 * cobrança. Presente no corpo — com qualquer valor, inclusive um valor impecável
 * — é recusa nomeada, **em homologação e em produção igualmente**.
 *
 * ⚠️ E repare no que saiu desta lista em 30/08/2026, porque a diferença é a
 * coisa toda: `customerId`, `clienteId`, `phone`, `telefone` e `whatsapp`
 * continuam aqui porque falam do **consumidor do restaurante** — gente que nunca
 * escreveu para a Foocci e cujos dados o Connect não tem por que ver.
 *
 * O que passou a atravessar é outra coisa inteiramente: **o caso do LEAD da
 * própria Foocci**, e ele entra por um campo com nome e forma próprios (`caso`),
 * não por afrouxamento desta lista. Ver `CASO_DO_LEAD_POR_QUE_ELE_PASSA`.
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

/**
 * ⭐ POR QUE O CASO DO LEAD ATRAVESSA — e por que isso NÃO é a trava caindo.
 *
 * ─── A CORREÇÃO DE 30/08/2026, COM OS FATOS ────────────────────────────────
 *
 * A primeira versão desta porta recusava tudo o que cheirasse a pessoa, e estava
 * certa **para o que ela era naquele dia**: um piloto em auditoria, cuja regra
 * era não encostar em cliente real enquanto as portas não fossem medidas.
 *
 * Aplicar aquela regra a uma operação legítima é outra coisa, e o resultado
 * medido foi ruim: o agente comercial mandaria ao gerente uma pergunta capenga
 * — "um cliente quer um volume alto, podemos?" — sobre um lead que a casa
 * conhece pelo nome, com o briefing dele guardado no próprio banco. Pedir
 * decisão no escuro não protege ninguém; só atrasa o orçamento.
 *
 * Os fatos que mudam o enquadramento:
 *
 *   · o lead **procurou a Foocci** e preencheu o formulário por conta própria;
 *   · deu nome, e-mail, telefone e briefing **para receber um orçamento**;
 *   · usar isso internamente para PRODUZIR o orçamento é exatamente a
 *     finalidade para a qual ele forneceu o dado — não é uma finalidade nova.
 *
 * ─── A LINHA, DITA COM PRECISÃO ────────────────────────────────────────────
 *
 * Passa: **o caso do lead da própria casa**, para a finalidade pela qual ele o
 * forneceu — decidir a proposta dele. Num campo nomeado, com forma conferida, e
 * só quando `modo: "producao"`, porque num ensaio não há proposta a decidir e
 * dado de gente real não tem o que fazer num ensaio.
 *
 * Não passa, e continua não passando: o **domínio operacional do produto** —
 * restaurante, pedido, consumidor final, cobrança. Ver a lista acima. Nada disso
 * é necessário para o gerente decidir uma proposta comercial, e "a porta já está
 * em produção" não é argumento para nenhum deles.
 */
export const CASO_DO_LEAD_POR_QUE_ELE_PASSA =
  "o Connect carrega o caso do lead da própria casa, para a finalidade pela qual o lead o forneceu: ele " +
  "procurou a Foocci, preencheu o formulário por conta própria e deu contato e briefing para receber um " +
  "orçamento. Usar isso internamente para produzir o orçamento é a mesma finalidade, não uma nova. O que " +
  "continua recusado pelo nome, nos dois modos, é o domínio operacional do produto — restaurante, pedido, " +
  "consumidor final do restaurante, cobrança —, que nada acrescenta a uma decisão de proposta comercial.";

/** Tetos dos textos do caso. Estourar é recusa nomeada, nunca corte silencioso. */
export const MAX_CAMPO_DO_CASO = 4_000;
export const MAX_TURNOS_DO_CASO = 40;

/**
 * O caso do lead, como ele viaja. Todo campo é opcional **menos** `resumo`:
 * mandar um caso sem o caso dentro seria o mesmo pedido no escuro, só que com
 * um campo a mais.
 */
export interface CasoDoLead {
  /** O identificador do lead na base da Foocci — para o gerente achar a conversa. */
  leadId?: string | null;
  nome?: string | null;
  email?: string | null;
  telefone?: string | null;
  /** O que o lead pediu, nas palavras dele. Obrigatório. */
  resumo: string;
  /** O briefing que ele preencheu no formulário. */
  briefing?: string | null;
  /** O que trava — por que o agente não pode responder sozinho. */
  oQueTrava?: string | null;
  /** A conversa até aqui, do mais antigo para o mais novo. */
  historico?: Array<{ deQuem: string; texto: string }>;
}

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
  /**
   * ⭐ O caso do lead. Aceito **só em `producao`** — ver
   * `CASO_DO_LEAD_POR_QUE_ELE_PASSA`. Em `homologacao` a presença dele é recusa
   * nomeada: ensaio não decide proposta nenhuma, então dado de gente real não
   * tem o que fazer lá dentro.
   */
  "caso",
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
  /** O caso do lead. Só em `producao`. */
  caso?: unknown;
}

/** O pedido depois de conferido — só existe se passou por todas as travas. */
export interface PedidoConferido {
  modo: ModoDoConnect;
  sintetico: boolean;
  caso: CasoDoLead | null;
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

type ConferenciaDoCaso = { ok: true; caso: CasoDoLead | null } | { ok: false; motivo: string };

/**
 * ⭐ A CONFERÊNCIA DO CASO DO LEAD — fail-closed, campo a campo.
 *
 * Ela é uma função à parte porque é a única entrada desta porta que carrega
 * dado de gente, e uma trava que importa não deve estar diluída no meio de dez
 * outras: quem for auditar isto amanhã lê uma função, não um trecho.
 *
 * Três coisas que ela faz, e que valem ser lidas devagar:
 *
 *   1. **Só em `producao`.** Em ensaio, mandar o caso é recusa nomeada — não
 *      porque o dado seja proibido, mas porque um ensaio não decide proposta
 *      nenhuma e dado de gente real não tem o que fazer lá dentro.
 *   2. **`resumo` é obrigatório.** Um caso sem o caso dentro é a mesma pergunta
 *      no escuro que originou este trabalho, só que com um campo a mais.
 *   3. **Tetos com recusa, nunca corte.** Mesma doutrina de `mensagem` e
 *      `assunto`: cortar faria a porta gravar um caso diferente do enviado sem
 *      dizer a ninguém, e é sobre esse texto que o gerente vai decidir.
 */
function conferirCaso(bruto: unknown, modo: ModoDoConnect): ConferenciaDoCaso {
  if (bruto === undefined || bruto === null) return { ok: true, caso: null };

  if (modo !== MODO_DE_PRODUCAO) {
    return {
      ok: false,
      motivo:
        `"caso" não entra em modo "${modo}": o caso de um lead real só viaja quando o despacho é operação ` +
        `real (modo "${MODO_DE_PRODUCAO}"). Ensaio não decide proposta de ninguém, então dado de gente não ` +
        "tem o que fazer dentro dele. Para rodar o ensaio, remova \"caso\"; para levar o caso, o modo é " +
        `"${MODO_DE_PRODUCAO}".`,
    };
  }

  if (typeof bruto !== "object" || Array.isArray(bruto)) {
    return {
      ok: false,
      motivo: `"caso" inválido: esperava um objeto de campos e recebi ${eco(bruto)}.`,
    };
  }

  const c = bruto as Record<string, unknown>;

  const CAMPOS_DO_CASO = ["leadId", "nome", "email", "telefone", "resumo", "briefing", "oQueTrava", "historico"];
  for (const campo of Object.keys(c)) {
    if (!CAMPOS_DO_CASO.includes(campo)) {
      return {
        ok: false,
        motivo:
          `"caso.${campo}" não é entrada desta porta — recebi ${eco(c[campo])} e recusei. O caso lê exatamente ` +
          `${CAMPOS_DO_CASO.map((x) => `"${x}"`).join(", ")} e mais nada. A allowlist vale aqui dentro pelo ` +
          "mesmo motivo que vale lá fora: campo que a porta não lê é campo que ninguém audita.",
      };
    }
  }

  const resumo = texto(c.resumo);
  if (!resumo) {
    return {
      ok: false,
      motivo:
        `"caso.resumo" é obrigatório — recebi ${eco(c.resumo)}. Um caso sem o caso dentro faz o gerente ` +
        "decidir no escuro, que é exatamente o defeito que este campo existe para fechar.",
    };
  }

  for (const nome of ["leadId", "nome", "email", "telefone", "resumo", "briefing", "oQueTrava"]) {
    const valor = c[nome];
    if (valor === undefined || valor === null) continue;
    if (typeof valor !== "string") {
      return { ok: false, motivo: `"caso.${nome}" deve ser texto — recebi ${eco(valor)}.` };
    }
    if (valor.length > MAX_CAMPO_DO_CASO) {
      return {
        ok: false,
        motivo:
          `"caso.${nome}" grande demais: recebi ${valor.length} caracteres e o máximo é ${MAX_CAMPO_DO_CASO}. ` +
          "O corte silencioso faria a porta gravar um caso diferente do que foi mandado — e é sobre este " +
          "texto que o gerente decide.",
      };
    }
  }

  let historico: CasoDoLead["historico"];
  if (c.historico !== undefined && c.historico !== null) {
    if (!Array.isArray(c.historico)) {
      return { ok: false, motivo: `"caso.historico" deve ser uma lista de turnos — recebi ${eco(c.historico)}.` };
    }
    if (c.historico.length > MAX_TURNOS_DO_CASO) {
      return {
        ok: false,
        motivo:
          `"caso.historico" tem ${c.historico.length} turnos e o máximo é ${MAX_TURNOS_DO_CASO}. Recusa, e ` +
          "não corte: um histórico truncado em silêncio faz o gerente decidir sobre metade da conversa " +
          "achando que viu a conversa inteira.",
      };
    }
    historico = [];
    for (const [i, turno] of c.historico.entries()) {
      const t = turno as Record<string, unknown> | null;
      const deQuem = t && typeof t === "object" ? texto(t.deQuem) : null;
      const texto_ = t && typeof t === "object" ? texto(t.texto) : null;
      if (!deQuem || !texto_) {
        return {
          ok: false,
          motivo:
            `"caso.historico[${i}]" inválido: cada turno precisa de "deQuem" e "texto" preenchidos — recebi ` +
            `${eco(turno)}. Turno sem autor é fala sem dono, e o gerente não tem como saber quem disse o quê.`,
        };
      }
      if (texto_.length > MAX_CAMPO_DO_CASO) {
        return {
          ok: false,
          motivo: `"caso.historico[${i}].texto" grande demais: ${texto_.length} caracteres, máximo ${MAX_CAMPO_DO_CASO}.`,
        };
      }
      historico.push({ deQuem, texto: texto_ });
    }
  }

  return {
    ok: true,
    caso: {
      leadId: texto(c.leadId),
      nome: texto(c.nome),
      email: texto(c.email),
      telefone: texto(c.telefone),
      resumo,
      briefing: texto(c.briefing),
      oQueTrava: texto(c.oQueTrava),
      ...(historico ? { historico } : {}),
    },
  };
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
  //
  // São dois agora, e continuam sendo literais: `"homologacao"` (ensaio, não
  // vale) e `"producao"` (vale, e fica no rastro como real). Nenhum é padrão —
  // campo ausente não ganha o valor seguro, é recusado.
  if (typeof corpo.modo !== "string" || !(MODOS_ACEITOS as readonly string[]).includes(corpo.modo)) {
    return {
      ok: false,
      motivo:
        `modo inválido: recebi ${eco(corpo.modo)} e esta porta só abre com ` +
        `${MODOS_ACEITOS.map((m) => `"${m}"`).join(" ou ")}. Aqui não há normalização: campo ausente não ` +
        "ganha o valor seguro, é recusado.",
    };
  }
  const modo = corpo.modo as ModoDoConnect;

  // ── Trava 2: sintético. O booleano exato que o MODO exige. ───────────────
  //
  // ⚠️ Continua obrigatório e literal nos dois modos. Deixá-lo cair por omissão
  // no valor do modo seria o padrão silencioso voltando pela porta dos fundos:
  // quem esquecesse o campo declararia "isto vale" sem ter escrito isso.
  const sinteticoExigido = SINTETICO_EXIGIDO[modo];
  if (corpo.sintetico !== sinteticoExigido) {
    return {
      ok: false,
      motivo:
        `sintetico inválido: recebi ${eco(corpo.sintetico)} e o modo "${modo}" exige o booleano ` +
        `${sinteticoExigido}. ${
          modo === MODO_DE_ENSAIO
            ? "Ensaio é ensaio: nada do que sai dele vale, e por isso ele se declara sintético."
            : "Produção é operação real, e ela se declara real — um despacho que vale não se registra como ensaio."
        } Aqui não há coerção: "${sinteticoExigido}" em texto não é ${sinteticoExigido}.`,
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

  // ── ⭐ Trava 11: o caso do lead. Forma conferida, e SÓ em produção. ───────
  const conferenciaDoCaso = conferirCaso(corpo.caso, modo);
  if (!conferenciaDoCaso.ok) return { ok: false, motivo: conferenciaDoCaso.motivo };

  return {
    ok: true,
    pedido: {
      modo,
      sintetico: sinteticoExigido,
      caso: conferenciaDoCaso.caso,
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
