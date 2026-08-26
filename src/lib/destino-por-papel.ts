/**
 * A porta de entrada de cada papel.
 *
 * ── POR QUE ISTO NÃO MORA NA ROTA ───────────────────────────────────────────
 *
 * Morava, e o `next build` recusou: um arquivo `route.ts` só pode exportar os
 * métodos HTTP e um punhado de configurações. Qualquer outro export é erro de
 * compilação — e o `tsc` não pega, porque é regra do Next, não do TypeScript.
 *
 * Aqui fora ele também fica testável sem subir rota.
 */

import type { InternalRole } from "@prisma/client";
import { ROTAS } from "@/lib/sala/rotas";

/**
 * Para onde a pessoa vai depois de entrar.
 *
 * O SDR cai direto no ATENDIMENTO, e não na lista de filas: a fila é o índice, o
 * atendimento é o trabalho. Mandá-lo para `/admin/restaurants` — o destino de
 * todo mundo até 25/08/2026 — o jogava numa tela que ele não pode ver, e a
 * primeira coisa que ele veria do sistema seria uma recusa.
 *
 * O destino é decidido no SERVIDOR e viaja junto com a sessão. Decidido no
 * cliente, seria um destino que o navegador pode trocar.
 */
export function destinoDe(papel: InternalRole): string {
  switch (papel) {
    case "AGENTE_HUMANO":
      return ROTAS.conversas;
    case "GERENTE_DEPARTAMENTO":
    case "AUDITOR_QA":
      return ROTAS.painel;
    default:
      return "/admin/departamentos";
  }
}
