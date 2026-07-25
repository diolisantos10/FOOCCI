/**
 * OutputCritic — o juiz do RESULTADO, contra a ficha que o gerou.
 *
 * O PromptCritic garante que a pergunta estava boa. Este aqui garante que a
 * resposta obedeceu. Também determinístico: pega o erro mais caro de todos —
 * número que a IA inventou — sem gastar uma chamada de IA.
 *
 * Limite conhecido e proposital: proibição semântica ("não prometa prazo") não
 * é verificável em código. Este crítico cobre o que É verificável — número
 * inventado, clichê, peça que não citou a verdade, tamanho fora do combinado.
 * O julgamento semântico é uma camada opcional por cima, nunca no lugar desta.
 */

import type { Ficha, Nota } from "./OficinaTypes";
import { normalizar, violacoes, type Manual } from "./HouseManual";
import { CORTE_PADRAO } from "./PromptCritic";

const PESO_GRAVE = 3;
const PESO_LEVE  = 1;

/** Números de 1 dígito são ruído ("1 linha", "2x"): só 2+ dígitos contam. */
const DIGITOS = /\d{2,}/g;

function corridasDeDigitos(texto: string): string[] {
  return texto.match(DIGITOS) ?? [];
}

/**
 * Tudo que a peça tem direito de citar: a verdade do banco MAIS o próprio
 * briefing (formato "4:5", tamanho "2 linhas" e afins vieram da gente, não da
 * imaginação da IA).
 */
function corpusPermitido(ficha: Ficha): string {
  return [
    ...Object.values(ficha.verdade).map((v) => (Array.isArray(v) ? v.join(" ") : String(v))),
    ...Object.values(ficha.eixos),
    ficha.objetivo,
    ficha.publico,
    ficha.tom,
    ficha.formato,
  ].join(" ");
}

/** Quantas linhas o formato pede, quando ele diz. Null = não especificou. */
function linhasPedidas(formato: string): number | null {
  const m = /(\d+)\s*linha/i.exec(formato);
  return m?.[1] ? Number(m[1]) : null;
}

export interface CriticaResultadoOpts {
  corte?: number;
  /** Textos extras que a peça pode citar (ex.: nome de campanha aprovado). */
  permitidoExtra?: string[];
}

/**
 * Julga a saída da IA contra a ficha.
 *
 * Sem manual = REPROVADO por construção, igual ao PromptCritic.
 */
export function criticarResultado(
  saida: string,
  ficha: Ficha,
  manual: Manual | null,
  opts: CriticaResultadoOpts = {},
): Nota {
  const corte = opts.corte ?? CORTE_PADRAO;

  if (!manual) {
    return {
      score: 0,
      graves: 1,
      aprovado: false,
      motivos: ["Não existe manual da casa para julgar este resultado."],
    };
  }

  const motivos: string[] = [];
  let desconto = 0;
  let graves = 0;
  const grave = (ordem: string) => { motivos.push(ordem); desconto += PESO_GRAVE; graves++; };
  const leve  = (ordem: string) => { motivos.push(ordem); desconto += PESO_LEVE; };

  const texto = saida.trim();

  // 1. Vazio: a IA não entregou nada.
  if (texto.length === 0) {
    return { score: 0, graves: 1, aprovado: false, motivos: ["A IA não devolveu conteúdo — refaça."] };
  }

  const permitido = [corpusPermitido(ficha), ...(opts.permitidoExtra ?? [])].join(" ");

  // 2. O erro mais caro: número que não veio da verdade. Preço inventado é
  //    problema de confiança e de lei, não de estilo.
  const permitidos = new Set(corridasDeDigitos(permitido));
  const inventados = [...new Set(corridasDeDigitos(texto))].filter((n) => !permitidos.has(n));
  if (inventados.length > 0) {
    grave(`Tire os números que não estão na verdade: ${inventados.join(", ")}. Use só o que veio do banco.`);
  }

  // 3. Peça que não citou nada da verdade é peça genérica — a doença que a
  //    Oficina existe pra curar.
  const tokensDaVerdade = new Set(
    Object.values(ficha.verdade)
      .flatMap((v) => (Array.isArray(v) ? v : [String(v)]))
      .flatMap((v) => normalizar(String(v)).split(" "))
      .filter((t) => t.length >= 4),
  );
  if (tokensDaVerdade.size > 0) {
    const tokensDaSaida = new Set(normalizar(texto).split(" "));
    const citou = [...tokensDaVerdade].some((t) => tokensDaSaida.has(t));
    if (!citou) {
      grave("A peça não citou nada da verdade do negócio — está genérica. Ancore num fato concreto do banco.");
    }
  }

  // 4. Clichê: o sotaque de IA.
  const cliches = violacoes(texto, manual);
  if (cliches.length > 0) {
    grave(`Reescreva sem os clichês da lista negra: ${cliches.join(", ")}.`);
  }

  // 5. Tamanho combinado.
  const pedidas = linhasPedidas(ficha.formato);
  if (pedidas !== null) {
    const entregues = texto.split(/\n+/).filter((l) => l.trim().length > 0).length;
    if (entregues > pedidas) {
      leve(`Corte para ${pedidas} linha(s) — vieram ${entregues}.`);
    }
  }

  const score = Math.max(0, 10 - desconto);
  return { score, graves, aprovado: graves === 0 && score >= corte, motivos };
}
