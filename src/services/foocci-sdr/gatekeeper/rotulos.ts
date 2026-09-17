/**
 * OS RÓTULOS DOS TIPOS DE PORTEIRO — só nome, nenhum número.
 *
 * ── POR QUE UM ARQUIVO SÓ PARA ISTO ─────────────────────────────────────────
 *
 * `classificacao.ts` decide QUAL é o tipo; ele não deve também decidir como o
 * tipo se escreve numa tela. A Central SDR precisa listar os nove tipos
 * inclusive os que não apareceram nenhuma vez — um balde que some quando zera
 * faz o operador achar que o tipo não existe. Para listar os nove, a tela
 * precisa da lista dos nove em algum lugar, e o lugar é aqui.
 *
 * ⚠️ Este arquivo NÃO produz contagem, estimativa nem valor. Rótulo não é dado:
 * os números da tela vêm todos do raio-X e da fila do SDR. Se um tipo novo
 * entrar no enum do banco, o compilador cobra a linha aqui — o `Record`
 * completo é de propósito.
 */

import type { TipoDeGatekeeper } from "@prisma/client";

/** A ordem em que a tela lista os tipos: o que é máquina antes do que é gente. */
export const TIPOS_DE_GATEKEEPER: readonly TipoDeGatekeeper[] = [
  "BOT_DE_PEDIDOS",
  "FORMULARIO",
  "CENTRAL_TELEFONICA",
  "WHATSAPP_GERAL",
  "RECEPCIONISTA",
  "ATENDENTE",
  "SAC",
  "CAIXA",
  "OUTRO",
] as const;

export const ROTULO_DO_TIPO: Readonly<Record<TipoDeGatekeeper, string>> = {
  BOT_DE_PEDIDOS: "Bot de pedidos",
  FORMULARIO: "Formulário",
  CENTRAL_TELEFONICA: "Central telefônica",
  WHATSAPP_GERAL: "WhatsApp geral",
  RECEPCIONISTA: "Recepcionista",
  ATENDENTE: "Atendente",
  SAC: "SAC",
  CAIXA: "Caixa",
  OUTRO: "Outro",
};

/**
 * Dá para insistir com gente; não dá para insistir com um menu.
 *
 * Mesma régua de `prospeccao/filaDoSdr.ts` (`PORTEIRO_HUMANO`), escrita aqui
 * para a tela poder separar as duas colunas sem importar um detalhe privado
 * daquele arquivo. As duas listas concordarem é MEDIDO por teste.
 */
export const PORTEIRO_DE_CARNE_E_OSSO: readonly TipoDeGatekeeper[] = [
  "RECEPCIONISTA",
  "ATENDENTE",
  "SAC",
  "CAIXA",
] as const;

export function ehPorteiroHumano(tipo: TipoDeGatekeeper): boolean {
  return PORTEIRO_DE_CARNE_E_OSSO.includes(tipo);
}
