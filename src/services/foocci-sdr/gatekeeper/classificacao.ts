/**
 * GATEKEEPER INTELLIGENCE — quem está do outro lado?
 *
 * O documento do CEO nomeia o módulo e nomeia os interlocutores que a prospecção
 * encontra: bot de pedidos, recepcionista, atendente, SAC, caixa, formulário,
 * WhatsApp geral, central telefônica — e o próprio decisor.
 *
 * ── POR QUE ISTO É DETERMINÍSTICO ───────────────────────────────────────────
 * Mesma doutrina de `WhatsappBotGate.analisarAutomacaoWhatsapp`: classificar com
 * modelo custaria uma ida e volta por mensagem, milhares de vezes por dia, para
 * decidir algo que se lê em palavras. E o padrão é `INDEFINIDO`: sem sinal, não
 * se carimba ninguém. Carimbar "atendente" em quem é dono queima o dono.
 *
 * ── O QUE ESTE ARQUIVO NÃO FAZ ──────────────────────────────────────────────
 * Não escreve no banco, não manda mensagem, não decide envio. Só lê texto.
 */

import type { ConfiancaDaInformacao, TipoDeGatekeeper } from "@prisma/client";

export type PapelDoInterlocutor = "DECISOR" | "GATEKEEPER" | "INDEFINIDO";

export interface Classificacao {
  papel: PapelDoInterlocutor;
  /** Só preenchido quando `papel === "GATEKEEPER"`. */
  tipoDeGatekeeper: TipoDeGatekeeper | null;
  confianca: ConfiancaDaInformacao;
  /** A frase que explica o carimbo. Vai para a trilha, e é lida por gente. */
  motivo: string;
}

function normalizar(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A ordem é regra, não estilo: um menu que diz "1 - Fazer pedido / 3 - Falar com
 * atendente" é BOT_DE_PEDIDOS, não ATENDENTE. O específico vem antes do geral, e
 * o que a máquina É vem antes do que ela OFERECE.
 */
const REGRAS: ReadonlyArray<{
  tipo: TipoDeGatekeeper;
  teste: RegExp;
  motivo: string;
}> = [
  {
    tipo: "BOT_DE_PEDIDOS",
    teste:
      /\b(fazer (um )?pedido|fazer seu pedido|acompanhar (o )?pedido|ver (o )?cardapio|cardapio digital|pedir agora|delivery online)\b/,
    motivo: "atendimento automático de pedidos (menu de delivery/cardápio)",
  },
  {
    tipo: "FORMULARIO",
    teste:
      /\b(preench\w+ o formulario|formulario de contato|formulario no site|deixe seus dados no site)\b/,
    motivo: "o canal devolve um formulário, não uma pessoa",
  },
  {
    tipo: "CENTRAL_TELEFONICA",
    teste: /\b(central de atendimento|central telefonica|disque \d|digite o ramal|ramal \d+|nossa central)\b/,
    motivo: "central telefônica / ramal",
  },
  {
    tipo: "SAC",
    teste: /\b(sac|servico de atendimento ao consumidor|ouvidoria)\b/,
    motivo: "canal de SAC/ouvidoria",
  },
  {
    tipo: "RECEPCIONISTA",
    teste: /\b(recepcao|recepcionista)\b/,
    motivo: "recepção",
  },
  {
    tipo: "CAIXA",
    teste: /\b(sou (do|da) caixa|aqui e o caixa|estou no caixa|operador de caixa)\b/,
    motivo: "operação de caixa",
  },
  {
    tipo: "ATENDENTE",
    teste:
      /\b(sou (o |a )?atendente|atendimento ao cliente|sou do atendimento|aqui e o atendimento|sou da equipe de atendimento|falo pelo atendimento)\b/,
    motivo: "atendente de balcão/atendimento",
  },
  {
    tipo: "WHATSAPP_GERAL",
    teste:
      /\b(whatsapp (geral|da loja|do restaurante)|numero (geral|da loja)|esse (numero|whats) e (geral|da loja|do restaurante))\b/,
    motivo: "número geral da casa, sem dono definido",
  },
];

/**
 * Quem declara mandar na casa. Vem ANTES das regras de porteiro de propósito:
 * "sou o dono, mas quem atende o WhatsApp é a recepção" é o dono falando.
 */
const DECISOR_SE_DECLARA =
  /\b(sou (o |a )?(dono|dona|proprietari[oa]|socio|socia|gerente|diretor[a]?)|(dono|dona|proprietari[oa]|gerente) (daqui |do restaurante )?(sou eu|falando)|quem cuida disso sou eu|quem responde pelo comercial sou eu)\b/;

/** Automação genérica, sem tipo reconhecido: porteiro é, mas não se sabe qual. */
const AUTOMACAO_GENERICA =
  /\b(atendimento automatico|assistente virtual|mensagem automatica|sou (um|o|a) (robo|bot)|chatbot|respondemos em horario comercial)\b/;

/**
 * Lê a resposta recebida e diz quem respondeu.
 *
 * ⚠️ `INDEFINIDO` é resposta legítima e é o padrão. Ausência de sinal não é
 * sinal — guardrail 1 da casa aplicado a uma frase de WhatsApp.
 */
export function classificarInterlocutor(texto: string | null | undefined): Classificacao {
  const bruto = (texto ?? "").trim();
  if (!bruto) {
    return {
      papel: "INDEFINIDO",
      tipoDeGatekeeper: null,
      confianca: "BAIXA",
      motivo: "sem texto para classificar",
    };
  }

  const t = normalizar(bruto);

  if (DECISOR_SE_DECLARA.test(t)) {
    return {
      papel: "DECISOR",
      tipoDeGatekeeper: null,
      confianca: "MEDIA",
      motivo: "o interlocutor se declarou dono/gerente da operação",
    };
  }

  for (const regra of REGRAS) {
    if (regra.teste.test(t)) {
      return {
        papel: "GATEKEEPER",
        tipoDeGatekeeper: regra.tipo,
        confianca: "ALTA",
        motivo: regra.motivo,
      };
    }
  }

  if (AUTOMACAO_GENERICA.test(t)) {
    return {
      papel: "GATEKEEPER",
      tipoDeGatekeeper: "OUTRO",
      confianca: "MEDIA",
      motivo: "automação detectada sem tipo reconhecível",
    };
  }

  return {
    papel: "INDEFINIDO",
    tipoDeGatekeeper: null,
    confianca: "BAIXA",
    motivo: "nenhum sinal determinístico de porteiro nem de decisor",
  };
}
