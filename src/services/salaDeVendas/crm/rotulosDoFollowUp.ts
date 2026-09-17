/**
 * OS RÓTULOS DOS 14 ESTADOS DE FOLLOW-UP — só nome, nenhum número.
 *
 * ── POR QUE AQUI E NÃO EM `estadoDeFollowUp.ts` ─────────────────────────────
 *
 * Aquele arquivo é a régua: ele DECIDE o estado, e a ordem das regras dentro
 * dele é normativa. Um mapa de rótulo no meio daquilo convida a próxima pessoa
 * a mexer na régua para "arrumar um texto" — e um texto errado é um texto
 * errado, mas uma régua errada reclassifica a base inteira.
 *
 * ── POR QUE A LISTA COMPLETA, E NÃO SÓ OS QUE APARECEM ──────────────────────
 *
 * A tela da CRM IA mostra os 14 estados sempre, inclusive os que hoje têm zero
 * contato. Balde que desaparece quando zera muda a forma do painel a cada hora
 * e ensina o operador a não procurar o que sumiu. O `Record` completo é de
 * propósito: estado novo no tipo não compila sem a linha aqui.
 *
 * ⚠️ Nenhuma contagem nasce neste arquivo. Os números da tela vêm de
 * `planoDoDia.ts`, que lê o banco.
 */

import type { EstadoDeFollowUp } from "./estadoDeFollowUp";
import type { MarcoDoPosVenda } from "./posVenda";

/**
 * A ordem em que a tela lista: primeiro quem pede ação, depois quem está
 * parado por decisão, e por último os dois estados que são ausência de dado.
 */
export const ESTADOS_DE_FOLLOW_UP: readonly EstadoDeFollowUp[] = [
  "PAGAMENTO_ABANDONADO",
  "CARRINHO_ABANDONADO",
  "PROPOSTA_PARADA",
  "REUNIAO_PENDENTE",
  "CLIENTE_SUMIU",
  "NUNCA_RESPONDEU",
  "PENSANDO",
  "OPORTUNIDADE_FUTURA",
  "VIROU_CLIENTE",
  "VENDA_PERDIDA",
  "LEAD_SEM_PERFIL",
  "PEDIU_SILENCIO",
  "NAO_ABORDADO",
  "NAO_MEDIDO",
] as const;

export const ROTULO_DO_ESTADO: Readonly<Record<EstadoDeFollowUp, string>> = {
  PAGAMENTO_ABANDONADO: "Pagamento abandonado",
  CARRINHO_ABANDONADO: "Carrinho abandonado",
  PROPOSTA_PARADA: "Proposta parada",
  REUNIAO_PENDENTE: "Reunião pendente",
  CLIENTE_SUMIU: "Cliente sumiu",
  NUNCA_RESPONDEU: "Nunca respondeu",
  PENSANDO: "Pensando",
  OPORTUNIDADE_FUTURA: "Oportunidade futura",
  VIROU_CLIENTE: "Virou cliente",
  VENDA_PERDIDA: "Venda perdida",
  LEAD_SEM_PERFIL: "Lead sem perfil",
  PEDIU_SILENCIO: "Pediu silêncio",
  NAO_ABORDADO: "Não abordado",
  NAO_MEDIDO: "Não medido",
};

/** O que cada estado significa, em uma frase, para quem lê a tela. */
export const EXPLICACAO_DO_ESTADO: Readonly<Record<EstadoDeFollowUp, string>> = {
  PAGAMENTO_ABANDONADO: "disse sim e não pagou — precisa de link, não de argumento",
  CARRINHO_ABANDONADO: "montou o pedido e não fechou; a proposta existe e nunca saiu",
  PROPOSTA_PARADA: "a proposta saiu e ninguém respondeu",
  REUNIAO_PENDENTE: "reunião marcada sem confirmação, ou falta sem remarcação",
  CLIENTE_SUMIU: "falava com a gente e parou — é o sumiço de verdade",
  NUNCA_RESPONDEU: "abordado e nunca disse uma palavra; é diferente de sumir",
  PENSANDO: "respondeu há pouco e ainda decide — precisa de prazo, não de cobrança",
  OPORTUNIDADE_FUTURA: "não é agora, mas tem data de retomada; não é sumiço",
  VIROU_CLIENTE: "saiu do follow-up comercial e entrou na jornada de pós-venda",
  VENDA_PERDIDA: "perdida com motivo; só volta por campanha, nunca por cadência",
  LEAD_SEM_PERFIL: "medido e não qualifica — cobrar este gasta o teto de quem qualifica",
  PEDIU_SILENCIO: "pediu para parar; não é fila de follow-up, é fila de ninguém",
  NAO_ABORDADO: "ninguém falou com ele ainda",
  NAO_MEDIDO: "falta dado para decidir — nunca se chuta um estado no lugar deste",
};

/** Os marcos da jornada de pós-venda, na ordem em que acontecem, com rótulo. */
export const ROTULO_DO_MARCO = {
  ATIVACAO: "Ativação",
  ACOMPANHAMENTO: "Acompanhamento",
  SUPORTE: "Suporte",
  NPS: "NPS",
  RECOMPRA: "Recompra",
  CROSS_SELL: "Cross-sell",
  UPSELL: "Upsell",
  REATIVACAO: "Reativação",
} as const satisfies Record<MarcoDoPosVenda, string>;
