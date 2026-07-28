/**
 * PromptCritic — o juiz do COMANDO, antes de gastar IA.
 *
 * É de propósito 100% determinístico: roda em microssegundos, custa zero, e dá
 * o mesmo veredito sempre. O crítico caro (que julga o RESULTADO) vem depois —
 * mas a maior parte do lixo morre aqui, sem nenhuma chamada de IA.
 *
 * Cada motivo é escrito como ORDEM DE REESCRITA, não como relatório: o texto do
 * motivo é o que vai literalmente pro reescritor.
 */

import type { Ficha, Nota } from "./OficinaTypes";
import { violacoes, type Manual } from "./HouseManual";

/** Nota de corte padrão. Abaixo disso a ficha volta pra reescrita. */
export const CORTE_PADRAO = 8;

/**
 * GRAVE reprova sozinho — nota alta não compra passagem. LEVE só desconta.
 * Mesma ideia do p0Count do BrainQualityGate: contar o que é inegociável em
 * separado de quanto a peça está boa.
 */
const PESO_GRAVE = 3;
const PESO_LEVE  = 1;

function vazio(valor: string): boolean {
  return valor.trim().length === 0;
}

/**
 * Julga a ficha contra o manual do domínio.
 *
 * Sem manual = REPROVADO por construção — nunca "passa por não existir",
 * mesma regra do BrainQualityGate.
 */
export function criticar(ficha: Ficha, manual: Manual | null, corte = CORTE_PADRAO): Nota {
  if (!manual) {
    return {
      score: 0,
      graves: 1,
      aprovado: false,
      motivos: ["Não existe manual da casa para este domínio — registre um antes de forjar."],
    };
  }

  const motivos: string[] = [];
  let desconto = 0;
  let graves = 0;

  const grave = (ordem: string) => { motivos.push(ordem); desconto += PESO_GRAVE; graves++; };
  const leve  = (ordem: string) => { motivos.push(ordem); desconto += PESO_LEVE; };

  // 1. O pecado capital: ficha sem verdade. Sem fato do banco, a IA inventa.
  const chavesDaVerdade = Object.keys(ficha.verdade);
  if (chavesDaVerdade.length === 0) {
    grave("Anexe os fatos do banco na verdade — sem eles a IA vai inventar e a peça sai genérica.");
  } else {
    const faltando = manual.verdadeExigida.filter((chave) => !(chave in ficha.verdade));
    if (faltando.length > 0) {
      grave(`Faltam fatos obrigatórios deste domínio na verdade: ${faltando.join(", ")}.`);
    }
  }

  // 2. Clichê: o sotaque de IA que faz todo mundo ficar igual.
  const textoDaFicha = [
    ficha.objetivo,
    ficha.publico,
    ficha.tom,
    ficha.formato,
    ...Object.values(ficha.eixos),
  ].join(" ");
  const clichesUsados = violacoes(textoDaFicha, manual);
  if (clichesUsados.length > 0) {
    grave(`Tire os clichês da lista negra: ${clichesUsados.join(", ")}.`);
  }

  // 3. Campos vagos — é onde nasce o "eu falo uma coisa e ele entende outra".
  const obrigatorios: [keyof Ficha, string][] = [
    ["objetivo", "Diga o objetivo concreto da peça — o que ela precisa fazer acontecer."],
    ["publico",  "Diga pra quem é — público genérico devolve texto genérico."],
    ["tom",      "Defina o tom da casa, com palavras (ex.: direto e caloroso, sem gíria)."],
    ["formato",  "Defina o formato e o limite (canal, tamanho, quebras)."],
  ];
  for (const [campo, ordem] of obrigatorios) {
    if (vazio(String(ficha[campo] ?? ""))) {
      grave(ordem);
    }
  }

  // 4. As proibições padrão do domínio precisam viajar junto com a ficha.
  const ausentes = manual.proibicoesPadrao.filter((p) => !ficha.proibicoes.includes(p));
  if (ausentes.length > 0) {
    leve(`Some as proibições padrão do domínio: ${ausentes.join("; ")}.`);
  }

  // 5. Sem eixo sorteado, toda peça do restaurante sai igual à anterior.
  if (Object.keys(ficha.eixos).length === 0) {
    grave("Rode o Variador — sem eixos, a próxima peça sai igual à última.");
  }

  const score = Math.max(0, 10 - desconto);
  return { score, graves, aprovado: graves === 0 && score >= corte, motivos };
}
