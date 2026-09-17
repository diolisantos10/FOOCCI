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
/**
 * ⛔⛔ A PORTA DO ADMIN NÃO É A PORTA DO COMERCIAL — regressão de 10/09/2026.
 *
 * Em 10/09 (#232, commit 5125e40) o CEO pediu para não cair mais no organograma
 * vazio ao entrar, e `destinoDe` passou a devolver `ROTAS.painel` — que é
 * `/comercial/painel` — para MASTER_CEO e DIRETOR_FOOCCI. Só que este arquivo
 * serve às DUAS portas: `/comercial/entrar` e `/admin/login` chamam a MESMA rota
 * (`/api/admin/session/interna`). Resultado medido: quem entrava pelo Admin era
 * cuspido no Comercial — *"quando a gente acessa FOOCCI Admin, ele entra no
 * Foocci comercial"*.
 *
 * O destino agora depende de POR ONDE a pessoa entrou, e não só de quem ela é.
 * Quem entra pelo Comercial continua indo exatamente para onde ia (nada abaixo
 * mudou); quem entra pelo Admin cai numa tela DO ADMIN que o papel dele alcança.
 */

/**
 * Onde o Admin abre para quem alcança o Admin inteiro.
 *
 * É a mesma tela para onde `/admin` já redireciona (`admin/(area)/page.tsx`) —
 * e **não** `/admin/departamentos`, o organograma vazio que o CEO mandou parar
 * de ver em 10/09/2026.
 */
export const ENTRADA_DO_ADMIN = "/admin/restaurants";

/**
 * A porta do Admin que este papel alcança — a estrutura, para gerente e
 * auditoria, que é o primeiro item do menu deles em `AdminSidebar`.
 */
const ENTRADA_DA_ESTRUTURA = "/admin/departamentos";

/**
 * Este papel tem alguma porta no Admin?
 *
 * ⚠️ Isto NÃO é autorização — é a mesma conveniência que o menu faz. Quem
 * autoriza continua sendo cada rota, no servidor. A lista espelha
 * `MENU_POR_PAPEL` de `admin/(area)/AdminSidebar.tsx`: quem não tem nenhum item
 * lá não tem o que fazer no Admin.
 */
export function temAcessoAoAdmin(papel: InternalRole): boolean {
  switch (papel) {
    case "MASTER_CEO":
    case "DIRETOR_FOOCCI":
    case "GERENTE_DEPARTAMENTO":
    case "AUDITOR_QA":
      return true;
    default:
      // AGENTE_HUMANO (o SDR) é a Sala de Vendas e nada mais do Admin —
      // critério 6 do CEO. AGENTE_IA não faz login.
      return false;
  }
}

/**
 * Para onde vai quem entrou PELO ADMIN (`/admin/login`).
 *
 * - alcança o Admin → uma tela do Admin;
 * - só tem o Comercial (o SDR) → o Comercial, que é a casa dele de verdade;
 * - não tem nem um nem outro → a tela de entrar. Nunca uma sala de menus que
 *   não abrem: sala cheia de porta fechada ensina que o sistema está quebrado.
 */
export function destinoDoAdmin(papel: InternalRole): string {
  switch (papel) {
    case "MASTER_CEO":
    case "DIRETOR_FOOCCI":
      return ENTRADA_DO_ADMIN;
    case "GERENTE_DEPARTAMENTO":
    case "AUDITOR_QA":
      return ENTRADA_DA_ESTRUTURA;
    case "AGENTE_HUMANO":
      return destinoDe(papel);
    default:
      return ENTRADA_DO_LOGIN_DO_ADMIN;
  }
}

/** A tela de entrar do Admin. */
export const ENTRADA_DO_LOGIN_DO_ADMIN = "/admin/login";

/**
 * Para onde vai quem entrou PELO COMERCIAL (`/comercial/entrar`).
 *
 * ⚠️ Nada aqui mudou com a correção de 17/09/2026 — de propósito. A área
 * comercial continua funcionando exatamente como funcionava.
 */
export function destinoDe(papel: InternalRole): string {
  switch (papel) {
    case "AGENTE_HUMANO":
      return ROTAS.conversas;
    case "GERENTE_DEPARTAMENTO":
    case "AUDITOR_QA":
      return ROTAS.painel;
    /**
     * ⚠️ O CEO E O DIRETOR ENTRAM PELA SALA DE VENDAS — ordem do CEO, 10/09/2026.
     *
     * Até hoje caíam em `/admin/departamentos`, uma tela que dizia, com todas as
     * letras, "a estrutura ainda não foi montada — nada depende disto para
     * funcionar". Primeira coisa que o dono via ao entrar: um painel de zeros
     * sobre um organograma que só existe no documento. E apertava voltar.
     *
     * *"Enquanto isso não estiver de pé rodando e vendendo a gente não vai fazer
     * mais nenhum projeto."* A porta de entrada tem de ser o lugar onde a
     * companhia decide se vive: o painel comercial. Quando a prioridade mudar,
     * esta linha muda com ela — e é por isso que ela está aqui, com data, e não
     * espalhada em três `router.replace`.
     */
    case "MASTER_CEO":
    case "DIRETOR_FOOCCI":
      return ROTAS.painel;
    default:
      return "/admin/departamentos";
  }
}
