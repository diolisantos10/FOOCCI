/**
 * AS PORTAS DE ENTRADA — quem nos procurou, e a chave da recepção.
 *
 * ── POR QUE ISTO MORA SOZINHO, LONGE DA RODADA ──────────────────────────────
 *
 * A rodada (`recepcaoDeLeads.ts`) importa `abordarLead`, e `abordarLead` é o
 * caminho por onde uma mensagem SAI. A porta de leitura do estado da corrente
 * precisa destas mesmas constantes e **não pode**, sob contrato, conhecer
 * nenhum caminho de envio.
 *
 * Duas saídas eram possíveis: copiar a lista para o lado da leitura, ou separar
 * a definição. Copiar produziria duas listas de "quem nos procurou" que um dia
 * divergem — e a que diverge é sempre a que ninguém lembra de atualizar. Então
 * a definição mora aqui, sozinha, sem dependência nenhuma, e os dois lados a
 * importam.
 */

import type { SiteLeadSource } from "@prisma/client";

/**
 * As portas por onde uma pessoa CHEGA ATÉ NÓS.
 *
 * Quem entra por uma destas nos procurou: preencheu formulário, marcou horário,
 * escreveu no WhatsApp, clicou num anúncio nosso, veio por indicação. Responder
 * a essa pessoa não é prospecção fria — é atendimento, e a demora nele é o
 * defeito que esta entrega conserta.
 */
export const FONTES_QUE_NOS_PROCURARAM: readonly SiteLeadSource[] = [
  "FORMULARIO_DEMONSTRACAO",
  "AGENDAMENTO",
  "WHATSAPP_DIRETO",
  "INDICACAO",
  "INSTAGRAM",
  "FACEBOOK",
  "CAMPANHA_PAGA",
];

/**
 * ⛔ A CHAVE DESTA RODADA, e por que ela é PRÓPRIA.
 *
 * `FOOCCI_SDR_SEND_ENABLED` é a chave do CANAL: ela decide se qualquer mensagem
 * desta casa chega a alguém. Esta aqui decide se a RECEPÇÃO AUTOMÁTICA existe —
 * se a casa passa a falar com quem chega sem ninguém clicar.
 *
 * São decisões de tamanhos diferentes e por isso não podem ser a mesma chave:
 * quem liga o canal para responder um cliente que escreveu não está, com o
 * mesmo gesto, autorizando a casa a abrir conversa com milhares de contatos
 * antigos que nunca foram abordados. Ausência da variável = **desligada**.
 * Nunca aberta por omissão.
 */
export const VARIAVEL_DA_RECEPCAO = "FOOCCI_RECEPCAO_LIGADA";

export function recepcaoLigada(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env[VARIAVEL_DA_RECEPCAO] ?? "").trim().toLowerCase() === "true";
}
