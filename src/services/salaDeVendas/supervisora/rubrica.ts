/**
 * A RUBRICA — a régua que torna o parecer da Supervisora AUDITÁVEL.
 *
 * ── O PROBLEMA QUE ESTE ARQUIVO RESOLVE ──────────────────────────────────────
 *
 * Até aqui, o veredito da Supervisora nascia inteiro dentro de um prompt: o
 * modelo devolvia `{veredito, motivos, detalhe}` e pronto. Isso funciona, mas
 * tem dois furos que só aparecem quando um humano vai conferir:
 *
 *   1. **Não é reprodutível.** Dois avaliadores (ou a mesma chamada duas vezes)
 *      podem discordar sobre a mesma mensagem, e não há como dizer qual está
 *      certo — não existe critério escrito fora do julgamento.
 *   2. **Não é testável.** Um teste que prova "mensagem ruim é barrada" teria
 *      de chamar um modelo de verdade. Teste que depende de modelo ou vira
 *      mock que sempre passa (régua verde sobre o componente errado), ou vira
 *      suíte instável.
 *
 * A rubrica abaixo é a parte do julgamento que **não precisa de modelo**: os
 * defeitos de FORMA e de FRASE PROIBIDA, que se leem no texto e só nele. Cada
 * achado tem `codigo` (nomeado, não "achei ruim"), `severidade` e `evidencia`
 * — o trecho literal que disparou. Um humano que nunca leu o prompt consegue
 * refazer a conta.
 *
 * ── O QUE A RUBRICA NÃO FAZ, DE PROPÓSITO ────────────────────────────────────
 *
 * Ela **não substitui** a camada rápida nem a profunda. Julgamento de
 * CONTEXTO — "esse pitch bate com a dor que o lead contou?", "isso é
 * insistência depois da recusa?" — continua sendo do modelo, porque depende de
 * ler a conversa, e não há regex para isso.
 *
 * A divisão é: **a rubrica pega o que se vê no texto; o modelo pega o que só se
 * vê na conversa.** Onde as duas falam, a MAIS SEVERA vence — uma régua que
 * afrouxa por causa de um segundo parecer não é régua.
 *
 * Também **não repete** `ta/verificador.ts`: preço fora da tabela, prazo
 * prometido, garantia de resultado, integração inventada, link fora da lista e
 * placeholder vazado já foram barrados, deterministicamente, antes de a
 * mensagem chegar aqui. Nada abaixo re-testa nenhum deles.
 *
 * ── ⚠️ VERDADE DO PRODUTO NÃO MORA AQUI ──────────────────────────────────────
 *
 * Nenhuma regra deste arquivo afirma nada sobre preço, capacidade, prazo ou
 * política comercial do Foocci. Isso continua vindo da configuração publicada
 * do TA (`ContextoDaRevisao.regrasComerciais` / `tomDaMarca`).
 */

import type { MotivoDaSupervisora, VeredictoDaSupervisora } from "@prisma/client";

/**
 * Os quatro degraus, com o critério escrito ao lado — é esta tabela que faz
 * dois avaliadores chegarem à mesma conclusão.
 *
 * VERDE    — nenhum achado. Sai como está.
 * AMARELO  — só achados LEVES. O defeito é de forma e a reescrita resolve sem
 *            mudar o que a mensagem quer dizer.
 * VERMELHO — pelo menos um achado GRAVE, ou três ou mais achados LEVES. O
 *            defeito é de conteúdo/postura: reescrever seria maquiar.
 * CRITICO  — pelo menos um achado de severidade CRITICA: a mensagem fere a
 *            pessoa do outro lado ou a marca (insistência sobre quem pediu
 *            para parar, fingir-se de cliente, pressão com medo/culpa).
 *            Além de reter, a conversa vai para uma pessoa.
 */
export type SeveridadeDoAchado = "LEVE" | "GRAVE" | "CRITICA";

/** Quantos achados LEVES somados já deixam de ser "pequeno ajuste". */
export const LEVES_QUE_VIRAM_GRAVE = 3;

export interface AchadoDaRubrica {
  /** Nome estável do defeito — é por ele que se audita, não pela frase. */
  codigo: string;
  severidade: SeveridadeDoAchado;
  /** O motivo do schema com que este achado se reporta. */
  motivo: MotivoDaSupervisora;
  /** Uma frase que explica o defeito a quem nunca leu este arquivo. */
  explicacao: string;
  /** O trecho literal do texto que disparou a regra. Vazio quando o defeito é
   *  de estrutura (contagem de linhas, por exemplo) e não de um trecho. */
  evidencia: string;
}

export interface ParecerDaRubrica {
  veredito: VeredictoDaSupervisora;
  achados: AchadoDaRubrica[];
  /** Os motivos do schema, sem repetição, prontos para gravar. */
  motivos: MotivoDaSupervisora[];
  /** Linha única, auditável: código + evidência de cada achado. */
  detalhe: string;
}

// ── AS MEDIDAS ───────────────────────────────────────────────────────────────
// Números, não impressões. Cada um com o porquê ao lado, porque um limite sem
// justificativa é um palpite que ninguém pode contestar depois.

/** Acima disto, a mensagem deixou de ser fala de WhatsApp e virou panfleto.
 *  Escolhido observando o padrão que o CEO nomeou: o bloco de 9 linhas. Seis
 *  linhas ainda são uma explicação; sete já é folheto colado no chat. */
export const MAX_LINHAS = 6;

/** Caracteres. Uma fala de WhatsApp que passa disto é leitura, não conversa. */
export const MAX_CARACTERES = 900;

/** Emojis somados na mensagem inteira. Dois ainda é tom; três é decoração. */
export const MAX_EMOJIS = 2;

/** Marcadores de lista (✅ ✔ • - no começo da linha). Duas linhas de lista
 *  ainda é organização; três é catálogo. */
export const MAX_ITENS_DE_LISTA = 2;

/** Perguntas com "?" na mesma mensagem. A doutrina é UMA pergunta principal. */
export const MAX_PERGUNTAS = 1;

const REGEX_EMOJI =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2705}\u{274C}\u{2714}]/gu;

const REGEX_ITEM_DE_LISTA = /^\s*(?:[✅✔☑▪●•➡→👉]|[-*+]\s|\d+[.)]\s)/u;

function normalizar(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function linhasUteis(texto: string): string[] {
  return texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/**
 * As regras de FRASE — cada uma é um padrão que, aparecendo, já nomeia o
 * defeito sozinho, sem depender de contexto nenhum.
 *
 * ⚠️ Toda regra aqui é de forma ou de postura. Nenhuma afirma fato sobre o
 * produto.
 */
interface RegraDeFrase {
  codigo: string;
  severidade: SeveridadeDoAchado;
  motivo: MotivoDaSupervisora;
  explicacao: string;
  teste: RegExp;
}

const REGRAS_DE_FRASE: readonly RegraDeFrase[] = [
  // ── FRENTE 6: persuasão ética. A fronteira, em código. ────────────────────
  {
    codigo: "URGENCIA_INVENTADA",
    severidade: "GRAVE",
    motivo: "PRESSAO_COMERCIAL",
    explicacao:
      "urgência fabricada: prazo, 'última chance' ou 'só hoje' que não vem de uma condição comercial publicada",
    teste:
      /\b(so (hoje|ate hoje|essa semana|amanha)|ultima chance|ultimo dia|corre que (vai )?acaba|acaba (hoje|amanha|essa semana)|por tempo limitado|promocao relampago|nao perca (essa|a) (chance|oportunidade)|imperdivel)\b/,
  },
  {
    codigo: "ESCASSEZ_FALSA",
    severidade: "GRAVE",
    motivo: "PRESSAO_COMERCIAL",
    explicacao:
      "escassez inventada: vagas, unidades ou condições 'restantes' que a marca não publicou",
    teste:
      /\b((ultim[ao]s?|so restam|restam (apenas|so)?) ?\d* ?(vagas?|unidades?|lugares?)|poucas vagas|vagas limitadas|estamos fechando (as )?(ultimas|vagas)|so (temos|tem) (mais )?\d+ (vagas?|lugares?))\b/,
  },
  {
    codigo: "MEDO_OU_CULPA",
    severidade: "CRITICA",
    motivo: "PRESSAO_COMERCIAL",
    explicacao:
      "vender por medo ou culpa: prever ruína, acusar o lead de perder dinheiro ou de não se importar com o próprio negócio",
    teste:
      /\b(voce (vai|esta) (perdendo|perder) (dinheiro|clientes)|(seu|o) (negocio|restaurante) vai (quebrar|fechar|morrer)|vai ficar para tras|seus concorrentes (ja|estao) (te )?(passando|na frente) e voce|se voce (nao|nao ) ?(agir|fizer) (agora|nada)|voce nao se importa)\b/,
  },
  {
    codigo: "PROMESSA_DE_RESULTADO",
    severidade: "GRAVE",
    motivo: "PROMESSA_INCORRETA",
    explicacao:
      "promete resultado ao cliente — resultado não se garante, e a verdade comercial publicada não autoriza",
    teste:
      /\b(garanto que|eu garanto|garantimos que|com certeza voce vai (vender|faturar|lucrar)|vai (dobrar|triplicar) (seu|o) (faturamento|lucro|movimento)|resultado garantido|sem risco nenhum)\b/,
  },

  // ── FRENTE 2: porteiro. A mentira proibida, em código. ────────────────────
  {
    codigo: "FINGIR_SE_DE_CLIENTE",
    severidade: "CRITICA",
    motivo: "OUTRO",
    explicacao:
      "fingir-se de cliente para furar o porteiro — proibido: queima a marca no primeiro cliente que descobre",
    teste:
      /\b((quero|queria|gostaria de|vou|posso) (fazer|pedir) (um |uns |uma )?(pedido|sushi|lanche|pizza|delivery)|queria (ver|pedir) o cardapio para (pedir|comprar)|sou cliente (de voces|daqui)|pode me mandar o cardapio que (eu )?(quero|vou) pedir)\b/,
  },
  {
    codigo: "NEGAR_SER_AGENTE",
    severidade: "CRITICA",
    motivo: "OUTRO",
    explicacao: "nega ser um agente quando perguntado — a casa não mente sobre quem está falando",
    teste: /\b(nao sou (um )?(rob[oô]|bot|ia|inteligencia artificial)|sou (uma )?pessoa de verdade|pode ficar tranquilo,? sou humano)\b/,
  },

  // ── FRENTE 7: cadência. Parar quando mandaram parar. ──────────────────────
  {
    codigo: "INSISTE_APOS_PEDIDO_DE_PARAR",
    severidade: "CRITICA",
    motivo: "INSISTENCIA_APOS_RECUSA",
    explicacao:
      "reabre o assunto logo depois de um 'não' ou de um pedido de parar, em vez de encerrar com respeito",
    teste:
      /\b(so (mais )?(uma|1) (coisinha|perguntinha|ultima)|mas antes de voce (ir|sair)|sei que voce disse que nao,? mas|so nao quero que voce (perca|deixe)|deixa eu (so )?insistir|mesmo assim,? (vou|deixo))\b/,
  },

  // ── FRENTE 1 e 5: abordagem fria e passo prematuro. ──────────────────────
  {
    codigo: "FECHAMENTO_PREMATURO",
    severidade: "GRAVE",
    motivo: "TIMING_RUIM",
    explicacao:
      "pede o passo grande (agendar, assinar, cartão) na abertura, antes de qualquer sinal de interesse",
    teste:
      /\b(ja (posso|vou) (agendar|marcar|deixar) (a|uma|sua)? ?(demonstracao|reuniao|apresentacao|call)|vamos fechar (hoje|agora)|posso (ja )?(mandar|gerar) (o|um) (contrato|link de pagamento)|qual (o )?melhor (dia|horario) para (a|essa) (demonstracao|reuniao)\?)/,
  },
  {
    codigo: "PEDIDO_DE_PERMISSAO_VAZIO",
    severidade: "LEVE",
    motivo: "TOM_ROBOTICO",
    explicacao:
      "fecha com a pergunta-clichê de folheto ('posso te mostrar como funciona?'), que não avança nada e serve a qualquer empresa",
    teste:
      /\b(posso (te )?(mostrar|explicar|apresentar) como funciona\??|quer (que eu )?(te )?(mostre|explique) como funciona\??|posso (te )?(mandar|enviar) mais (informacoes|detalhes)\??|tem interesse\??)/,
  },
  {
    codigo: "ABERTURA_SEM_IDENTIFICACAO",
    severidade: "LEVE",
    motivo: "TOM_ROBOTICO",
    explicacao:
      "abre com saudação genérica e nada mais — não diz quem fala, de onde, nem por que procurou justo esta casa",
    teste: /^\s*(ola|oi|bom dia|boa tarde|boa noite|e ai)[\s!,.]*(tudo bem\??|tudo bom\??)?[\s!,.]*$/,
  },
  {
    codigo: "AUTOELOGIO_VAZIO",
    severidade: "LEVE",
    motivo: "TOM_ROBOTICO",
    explicacao:
      "superlativo sobre si mesmo no lugar de um fato verificável ('a melhor', 'a mais completa', 'revolucionário')",
    teste:
      /\b(a (melhor|maior|mais completa) (plataforma|solucao|ferramenta)|somos (lideres|referencia) (de|no|em) mercado|revoluciona\w*|solucao definitiva|a unica (plataforma|solucao) que)\b/,
  },
];

// ── O FATO JURÍDICO: CONSENTIMENTO É DE CANAL, NÃO DE PESSOA ────────────────
//
// Esta é a única regra deste arquivo que NÃO se lê só no texto: ela precisa de
// um fato de cadastro — a que canal a pessoa consentiu. Ele entra por
// parâmetro, medido por quem tem o dado (`ContextoDaRevisao.consentimentoDeCanal`,
// vindo de `siteLead.consentimentoCanal`), nunca adivinhado do tom da mensagem.
//
// ⚠️ POR QUE ISTO NÃO É "PRESSÃO COMERCIAL". Uma oferta enviada por um canal
// sem base legal própria é irregular mesmo quando é educada, curta e sem
// urgência nenhuma — e continua irregular mesmo que o texto seja impecável.
// Julgar isto por tom é o erro que deixou passar uma oferta por WhatsApp
// autorizada só para e-mail: a régua viu uma mensagem ruim e não viu o fato.
// Consentimento para e-mail NÃO autoriza WhatsApp. É LGPD (art. 8º, §5º:
// consentimento para finalidade/canal específico) e é risco de banimento da
// conta na Meta. Por isso CRÍTICO: retém e vai para uma pessoa.
//
// A regra NÃO dispara quando a mensagem reconhece a ausência de consentimento e
// se ABSTÉM de abordar — essa é exatamente a conduta certa, e puni-la ensinaria
// o agente a não escrever o que se deve escrever.

export interface ConsentimentoDeCanal {
  /** O canal por onde esta mensagem sairia — "whatsapp", "email", "sms". */
  canalDaMensagem: string;
  /** Os canais com consentimento PRÓPRIO registrado para este contato. Vazio = nenhum. */
  canaisComConsentimento: string[];
}

/** Conteúdo comercial: oferta, condição, plano, proposta, apresentação do produto.
 *  É o que transforma "mandar mensagem" em "abordagem comercial" — e é isso que
 *  exige base legal própria para o canal. */
const REGEX_CONTEUDO_COMERCIAL =
  /\b(oferta|ofertas|promocao|promocoes|desconto|cupom|condicao (especial|do mes|comercial)|melhor (condicao|preco|oferta)|proposta( comercial)?|planos?( que| a partir| comercial)?|tabela de precos|te apresentar|apresentar (o|a) \w+|conversa comercial|abordagem comercial|orcamento (em anexo|que voce pediu))\b/;

/** A conduta CERTA quando falta consentimento para o canal: reconhecer e parar.
 *  Uma mensagem assim fala de oferta justamente para dizer que NÃO vai mandar. */
const REGEX_ABSTENCAO =
  /\b(nao vou (enviar|mandar|iniciar|abordar|fazer)|nao posso (enviar|mandar|iniciar|abordar)|nao enviarei|nao vamos (enviar|abordar)|sem consentimento|falta (de )?consentimento|antes de (qualquer|uma) (abordagem|contato|conversa)|confirmar (o canal|o consentimento|a autorizacao)|sinalizando para (confirmar|confirmacao))\b/;

function canalNormalizado(valor: string): string {
  return normalizar(valor).replace(/[^a-z]/g, "");
}

/**
 * PURA. Devolve o achado CRÍTICO quando, e só quando, as três coisas valem ao
 * mesmo tempo:
 *   1. existe fato de consentimento medido para este contato;
 *   2. o canal desta mensagem NÃO está entre os canais consentidos;
 *   3. a mensagem leva conteúdo comercial por esse canal, em vez de se abster.
 */
export function acharDefeitoDeConsentimentoDeCanal(
  texto: string,
  consentimento: ConsentimentoDeCanal | null | undefined,
): AchadoDaRubrica[] {
  if (!consentimento) return [];

  const canal = canalNormalizado(consentimento.canalDaMensagem);
  if (!canal) return [];

  const consentidos = consentimento.canaisComConsentimento.map(canalNormalizado).filter(Boolean);
  if (consentidos.includes(canal)) return [];

  const t = normalizar(texto);
  if (REGEX_ABSTENCAO.test(t)) return [];

  const m = t.match(REGEX_CONTEUDO_COMERCIAL);
  if (!m) return [];

  const consentidosLegivel = consentimento.canaisComConsentimento.length
    ? consentimento.canaisComConsentimento.join(", ")
    : "nenhum canal";

  return [
    {
      codigo: "CONTATO_SEM_CONSENTIMENTO_DO_CANAL",
      severidade: "CRITICA",
      motivo: "OUTRO",
      explicacao:
        `abordagem comercial por ${consentimento.canalDaMensagem} para um contato cujo consentimento registrado ` +
        `é de outro canal (${consentidosLegivel}) — consentimento é de CANAL, não de pessoa, e sem base legal ` +
        "própria para este canal a mensagem não sai, por mais educada que seja",
      evidencia: m[0].trim(),
    },
  ];
}

// ── AS REGRAS DE FORMA ───────────────────────────────────────────────────────

function acharDefeitosDeForma(texto: string): AchadoDaRubrica[] {
  const achados: AchadoDaRubrica[] = [];
  const linhas = linhasUteis(texto);

  if (linhas.length > MAX_LINHAS) {
    achados.push({
      codigo: "PANFLETO",
      severidade: "GRAVE",
      motivo: "SEQUENCIA_DE_MENSAGENS",
      explicacao: `${linhas.length} linhas numa mensagem só (o teto é ${MAX_LINHAS}) — isso é folheto colado no chat, não fala de WhatsApp`,
      evidencia: "",
    });
  }

  if (texto.length > MAX_CARACTERES) {
    achados.push({
      codigo: "TEXTO_LONGO_DEMAIS",
      severidade: "LEVE",
      motivo: "SEQUENCIA_DE_MENSAGENS",
      explicacao: `${texto.length} caracteres (o teto é ${MAX_CARACTERES}) — leitura, não conversa`,
      evidencia: "",
    });
  }

  const emojis = texto.match(REGEX_EMOJI) ?? [];
  if (emojis.length > MAX_EMOJIS) {
    achados.push({
      codigo: "EXCESSO_DE_EMOJI",
      severidade: "LEVE",
      motivo: "TOM_ROBOTICO",
      explicacao: `${emojis.length} emojis (o teto é ${MAX_EMOJIS}) — decoração de anúncio, não tom de pessoa`,
      evidencia: emojis.slice(0, 6).join(" "),
    });
  }

  const itens = linhas.filter((l) => REGEX_ITEM_DE_LISTA.test(l));
  if (itens.length > MAX_ITENS_DE_LISTA) {
    achados.push({
      codigo: "LISTA_DE_BENEFICIOS",
      severidade: "GRAVE",
      motivo: "PITCH_ERRADO",
      explicacao: `${itens.length} linhas de lista (o teto é ${MAX_ITENS_DE_LISTA}) — despejo de catálogo antes de saber o que a pessoa precisa`,
      evidencia: itens.slice(0, 3).join(" | "),
    });
  }

  const perguntas = (texto.match(/\?/g) ?? []).length;
  if (perguntas > MAX_PERGUNTAS) {
    achados.push({
      codigo: "MAIS_DE_UMA_PERGUNTA",
      severidade: "LEVE",
      motivo: "INTERROGATORIO",
      explicacao: `${perguntas} perguntas na mesma mensagem (a doutrina é UMA pergunta principal por mensagem)`,
      evidencia: "",
    });
  }

  return achados;
}

function acharDefeitosDeFrase(texto: string): AchadoDaRubrica[] {
  const t = normalizar(texto);
  const achados: AchadoDaRubrica[] = [];

  for (const regra of REGRAS_DE_FRASE) {
    const m = t.match(regra.teste);
    if (!m) continue;
    achados.push({
      codigo: regra.codigo,
      severidade: regra.severidade,
      motivo: regra.motivo,
      explicacao: regra.explicacao,
      evidencia: m[0].trim(),
    });
  }

  return achados;
}

/**
 * A régua — pura, sem banco, sem modelo, sem relógio. Mesma entrada, mesma
 * saída, sempre. É isto que faz o parecer ser auditável por gente.
 */
export function avaliarPelaRubrica(
  texto: string,
  consentimento?: ConsentimentoDeCanal | null,
): ParecerDaRubrica {
  const bruto = (texto ?? "").trim();
  if (!bruto) {
    return { veredito: "VERDE", achados: [], motivos: [], detalhe: "sem texto para avaliar" };
  }

  const achados = [
    ...acharDefeitosDeForma(bruto),
    ...acharDefeitosDeFrase(bruto),
    ...acharDefeitoDeConsentimentoDeCanal(bruto, consentimento),
  ];

  return {
    veredito: vereditoDosAchados(achados),
    achados,
    motivos: [...new Set(achados.map((a) => a.motivo))],
    detalhe: achados.length
      ? achados.map((a) => `${a.codigo}: ${a.explicacao}${a.evidencia ? ` ["${a.evidencia}"]` : ""}`).join(" | ")
      : "nenhum defeito de forma ou de frase proibida",
  };
}

/** A tabela da rubrica, aplicada. Separada para poder ser testada sozinha. */
export function vereditoDosAchados(achados: readonly AchadoDaRubrica[]): VeredictoDaSupervisora {
  if (achados.some((a) => a.severidade === "CRITICA")) return "CRITICO";
  if (achados.some((a) => a.severidade === "GRAVE")) return "VERMELHO";
  const leves = achados.filter((a) => a.severidade === "LEVE").length;
  if (leves >= LEVES_QUE_VIRAM_GRAVE) return "VERMELHO";
  if (leves > 0) return "AMARELO";
  return "VERDE";
}

const ORDEM: Record<VeredictoDaSupervisora, number> = {
  VERDE: 0,
  AMARELO: 1,
  VERMELHO: 2,
  CRITICO: 3,
};

/**
 * Quando a rubrica e o modelo divergem, a MAIS SEVERA vence.
 *
 * Não é desconfiança do modelo: é que os dois olham coisas diferentes (forma
 * vs. contexto), então "um viu e o outro não" quase sempre significa que o
 * defeito estava fora do campo de visão do segundo — não que o primeiro se
 * enganou. Uma régua que afrouxa diante de um segundo parecer não é régua.
 */
export function vereditoMaisSevero(
  a: VeredictoDaSupervisora,
  b: VeredictoDaSupervisora,
): VeredictoDaSupervisora {
  return ORDEM[a] >= ORDEM[b] ? a : b;
}

/**
 * O bloco que entra no prompt das duas camadas: a rubrica ESCRITA, para o
 * modelo julgar pelo mesmo critério que o código aplica — e não por um segundo
 * critério paralelo que ninguém conciliou.
 */
export function rubricaParaPrompt(): string {
  return [
    "RUBRICA — O CRITÉRIO DE VEREDITO (o mesmo que o código aplica):",
    `- VERDE: nenhum defeito. A mensagem sai como está.`,
    `- AMARELO: só defeitos LEVES (até ${LEVES_QUE_VIRAM_GRAVE - 1}) e todos de FORMA — excesso de emoji, mensagem comprida, mais de uma pergunta, clichê de folheto, autoelogio vazio. Reescrever resolve sem mudar o que a mensagem quer dizer. AMARELO SEMPRE vem com o texto reescrito.`,
    `- VERMELHO: pelo menos um defeito GRAVE — panfleto (mais de ${MAX_LINHAS} linhas), lista de benefícios (mais de ${MAX_ITENS_DE_LISTA} itens), urgência inventada, escassez falsa, promessa de resultado, fechamento prematuro — ou ${LEVES_QUE_VIRAM_GRAVE}+ defeitos leves somados. Reescrever seria maquiar: a mensagem não deve sair assim.`,
    "- CRITICO: fere a pessoa ou a marca — insistir depois de um pedido de parar, fingir-se de cliente, negar ser um agente, vender por medo ou culpa. Além de reter, a conversa vai para uma pessoa AGORA.",
    "- CRITICO também, e por FATO JURÍDICO e não por tom: abordagem comercial por um canal para o qual NÃO há consentimento próprio registrado. Consentimento é de CANAL, não de pessoa — autorização para e-mail não autoriza WhatsApp (LGPD, e risco de banimento da conta). Vale mesmo que a mensagem seja curta, educada e sem nenhuma pressão. Reconhecer a falta de consentimento e NÃO abordar é a conduta CERTA, e é VERDE.",
    "",
    "⛔ TODO veredito diferente de VERDE precisa NOMEAR o defeito e CITAR o trecho que o disparou. Parecer sem trecho citado é 'achei ruim', e isso não é auditável.",
    "",
    "MEDIDAS OBJETIVAS (são contagens, não impressões):",
    `- no máximo ${MAX_LINHAS} linhas e ${MAX_CARACTERES} caracteres por mensagem;`,
    `- no máximo ${MAX_EMOJIS} emojis;`,
    `- no máximo ${MAX_ITENS_DE_LISTA} linhas de lista/marcador;`,
    `- no máximo ${MAX_PERGUNTAS} pergunta por mensagem.`,
  ].join("\n");
}

/** O bloco que descreve, ao modelo, o que a régua determinística JÁ encontrou —
 *  para ele não repetir o achado como se fosse novidade, e para ele não
 *  contradizer uma contagem. */
export function achadosParaPrompt(parecer: ParecerDaRubrica): string {
  if (!parecer.achados.length) return "";
  return [
    "A RÉGUA DETERMINÍSTICA JÁ ENCONTROU ISTO NESTA MENSAGEM (não conteste as contagens, elas foram medidas):",
    ...parecer.achados.map((a) => `- ${a.codigo} (${a.severidade}): ${a.explicacao}${a.evidencia ? ` — trecho: "${a.evidencia}"` : ""}`),
    `Piso de veredito pela régua: ${parecer.veredito}. Você pode AGRAVAR pelo contexto, nunca afrouxar.`,
  ].join("\n");
}
