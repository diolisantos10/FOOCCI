/**
 * As regras da capa do cardápio, separadas do JSX para poderem ser trancadas por
 * teste (o vitest deste projeto roda em `environment: "node"`, sem DOM).
 *
 * O que está aqui é justamente o que não pode regredir: **a faixa da capa existe
 * sempre**. Sem foto, com foto que ainda não chegou ou com foto que quebrou, o
 * que aparece é o degradê da marca do restaurante — nunca um retângulo cinza,
 * nunca o ícone de imagem quebrada, nunca um buraco branco no topo do cardápio.
 */

/**
 * O chão da capa. É o fundo do contêiner, não uma alternativa à foto: a foto
 * entra POR CIMA. Por isso o mesmo valor serve de estado vazio, de placeholder
 * de carregamento e de rede de segurança do erro.
 *
 * Zero cor literal: white-label de verdade tira as duas pontas das variáveis que
 * a página da loja define a partir da marca do restaurante.
 */
export const CAPA_DEGRADE_DA_MARCA =
  "linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-secondary) 100%)";

/** Brilho diagonal — dá volume ao estado vazio para ele não parecer cor chapada. */
export const CAPA_BRILHO =
  "radial-gradient(120% 90% at 20% 0%, rgba(255,255,255,.28) 0%, rgba(255,255,255,0) 60%)";

/** Véu escuro na base — só com foto, para o logo claro não sumir por cima dela. */
export const CAPA_VEU =
  "linear-gradient(to top, rgba(0,0,0,.45) 0%, rgba(0,0,0,0) 100%)";

/**
 * A foto da capa deve ser desenhada?
 *
 * `false` NÃO significa "esconda a faixa" — significa "a faixa fica só com o
 * degradê da marca". Quem lê isto está escolhendo entre duas capas bonitas, não
 * entre capa e nada.
 */
export function capaMostraFoto(coverImageUrl: string | null | undefined, falhou: boolean): boolean {
  if (falhou) return false;
  return typeof coverImageUrl === "string" && coverImageUrl.trim().length > 0;
}
