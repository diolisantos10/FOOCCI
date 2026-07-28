/**
 * Reescritor — a única parte da Oficina que gasta IA.
 *
 * Recebe a ficha reprovada + as ordens do crítico e devolve a ficha corrigida.
 * Passa pelo AIEngineRouter como todo o resto do Brain (nunca importa provider
 * direto), então herda roteamento, fallback e a escolha de engine por agente.
 *
 * TRAVA IMPORTANTE: o reescritor só pode mexer nos campos de REDAÇÃO. Ele
 * jamais toca em `verdade` (senão inventaria fato para passar no crítico) nem
 * em `eixos` (senão furaria o anti-mesmice). Isso é imposto aqui e de novo no
 * OficinaService — duas fechaduras, porque o custo de errar é alto.
 */

import { selectEngine } from "../engines/AIEngineRouter";
import { callStructuredJson } from "../engines/OpenAIEngineAdapter";
import type { Ficha, Nota } from "./OficinaTypes";

/** Só isto o reescritor pode alterar. */
type CamposEditaveis = Pick<Ficha, "objetivo" | "publico" | "tom" | "formato" | "proibicoes">;

const SYSTEM = `Você é o revisor de briefing de uma agência. Recebe uma FICHA e as ORDENS de correção do editor.

Devolva a ficha corrigida em JSON, com exatamente estas chaves:
{"objetivo": string, "publico": string, "tom": string, "formato": string, "proibicoes": string[]}

Regras:
- Cumpra TODAS as ordens. Cada ordem é obrigatória.
- NUNCA invente fato. Você não tem acesso à verdade do negócio e não deve citar dados.
- Seja concreto: "quem pediu nos últimos 60 dias" e não "nossos clientes".
- Não escreva a peça. Você corrige o BRIEFING, não produz o conteúdo.
- Responda só o JSON, sem comentário.`;

function extrairCampos(bruto: string, atual: Ficha): CamposEditaveis {
  let dados: Record<string, unknown>;
  try {
    dados = JSON.parse(bruto) as Record<string, unknown>;
  } catch {
    return { objetivo: atual.objetivo, publico: atual.publico, tom: atual.tom, formato: atual.formato, proibicoes: atual.proibicoes };
  }

  const texto = (chave: keyof CamposEditaveis, padrao: string): string => {
    const valor = dados[chave];
    return typeof valor === "string" && valor.trim() ? valor.trim() : padrao;
  };

  const proibicoes = Array.isArray(dados.proibicoes)
    ? dados.proibicoes.filter((p): p is string => typeof p === "string")
    : atual.proibicoes;

  return {
    objetivo: texto("objetivo", atual.objetivo),
    publico:  texto("publico",  atual.publico),
    tom:      texto("tom",      atual.tom),
    formato:  texto("formato",  atual.formato),
    // as proibições do domínio nunca podem ser removidas pelo reescritor
    proibicoes: [...new Set([...proibicoes, ...atual.proibicoes])],
  };
}

/**
 * Monta o reescritor de um agente. Falhou a IA? Devolve a ficha intacta — o
 * crítico reprova de novo e a esteira segue o teto de voltas. Um soluço de API
 * não vira peça publicada às pressas.
 */
export function criarReescritor(agentId: string): (ficha: Ficha, nota: Nota) => Promise<Ficha> {
  return async (ficha, nota) => {
    try {
      const selection = selectEngine(agentId);
      const bruto = await callStructuredJson({
        selection,
        systemPrompt: SYSTEM,
        userContent: JSON.stringify({
          ficha: {
            objetivo: ficha.objetivo,
            publico:  ficha.publico,
            tom:      ficha.tom,
            formato:  ficha.formato,
            proibicoes: ficha.proibicoes,
          },
          ordens: nota.motivos,
        }),
        temperature: 0.4,
        maxTokens: 700,
        responseFormat: "json",
      });
      // verdade, eixos e assinatura vêm do original — o reescritor não alcança.
      return { ...ficha, ...extrairCampos(bruto, ficha) };
    } catch {
      return ficha;
    }
  };
}
