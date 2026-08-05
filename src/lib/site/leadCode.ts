/**
 * Código curto do lead do site — o elo entre o formulário e o "oi" no WhatsApp.
 *
 * Ele viaja DENTRO de uma mensagem que um ser humano vê, reescreve à mão quando o
 * link falha e às vezes lê em voz alta. Por isso NÃO reaproveita
 * `generateWaMenuCode` (7 caracteres misturando maiúscula e minúscula) nem
 * `generateUniqueShortCode` (7 minúsculas, e amarrado à tabela `trackingLink`):
 * os dois nasceram para caber em URL, onde ninguém lê o código. Aqui a régua é
 * outra — curto, MAIÚSCULO e sem caractere ambíguo.
 *
 * Alfabeto sem `O 0 I 1 L S 5`: são os pares que se erra ao transcrever. Sobram 29
 * símbolos × 5 posições ≈ 20 milhões de combinações — folga enorme para o volume
 * de um site comercial. A trava real contra colisão é o UNIQUE do banco; isto aqui
 * é só a probabilidade a favor.
 *
 * Puro e sem dependência de banco de propósito: testa sem mock.
 */

import { randomBytes } from "crypto";

/** 29 símbolos. Fora: O, 0, I, 1, L, S, 5 — os confundíveis ao transcrever. */
export const LEAD_CODE_CHARS = "ABCDEFGHJKMNPQRTUVWXYZ2346789";
export const LEAD_CODE_LEN = 5;

/** Maior múltiplo de 29 que cabe em um byte — acima disso o byte é descartado. */
const REJECT_AT = Math.floor(256 / LEAD_CODE_CHARS.length) * LEAD_CODE_CHARS.length;

/**
 * Código aleatório de 5 caracteres (ex.: "A7K2M").
 *
 * `randomBytes` e não `Math.random`: o código aparece numa mensagem que trafega
 * fora do sistema, e adivinhar o de outra pessoa daria acesso ao contexto dela no
 * atendimento. Bytes fora de `REJECT_AT` são descartados em vez de sofrerem
 * módulo — senão as primeiras letras do alfabeto sairiam mais vezes que as
 * últimas, e um código enviesado é um código mais fácil de adivinhar.
 */
export function generateLeadCode(): string {
  let code = "";
  while (code.length < LEAD_CODE_LEN) {
    for (const byte of randomBytes(LEAD_CODE_LEN)) {
      if (byte >= REJECT_AT) continue;
      code += LEAD_CODE_CHARS[byte % LEAD_CODE_CHARS.length];
      if (code.length === LEAD_CODE_LEN) break;
    }
  }
  return code;
}

/**
 * Extrai o código de um texto recebido no WhatsApp (`"Oi! … quero conhecer o
 * Foocci. #A7K2M"`). É a outra metade do contrato: define, em código, como o "oi"
 * volta a apontar para a linha do lead — para que a próxima pessoa que precisar
 * ler esse "oi" não invente uma segunda regra de leitura.
 *
 * **Exige o `#`.** Sem ele, `TARDE` e `MUITO` casariam com o alfabeto e o
 * atendimento seria colado no lead errado — pior do que não achar nenhum.
 * Ignora caixa porque teclado de celular capitaliza sozinho.
 *
 * Devolve `null` quando não encontra. Não achar código não diz nada sobre o lead
 * — é só ausência de código (guardrail 1).
 */
export function extractLeadCode(text: string): string | null {
  const cls = `${LEAD_CODE_CHARS}${LEAD_CODE_CHARS.toLowerCase()}`;
  const m = new RegExp(`#([${cls}]{${LEAD_CODE_LEN}})\\b`).exec(text);
  return m ? m[1]!.toUpperCase() : null;
}
