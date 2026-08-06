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
 * A COR DA LOJA QUANDO O RESTAURANTE NÃO ESCOLHEU NENHUMA.
 *
 * O `DESIGN.md` §1 declara o padrão das superfícies do cliente final como o verde
 * `#25d366` — a estética de conversa. **Não é o laranja da Foocci**, que é a marca
 * do painel do lojista e não tem o que fazer numa loja white-label.
 *
 * POR QUE ISTO VIROU UMA CONSTANTE (06/08/2026): a reserva estava escrita à mão em
 * três lugares e discordava entre eles — `/pedido` usava o verde declarado,
 * enquanto o cardápio da mesa (`/qr`) e a prévia da tela Marca usavam o laranja da
 * Foocci. Duas telas irmãs, o mesmo restaurante sem cor cadastrada, e a marca
 * errada aparecendo numa delas.
 *
 * Enquanto era um detalhe de botão, ninguém via. A capa do cardápio transformou a
 * reserva numa **faixa larga no topo** — e o desvio virou a primeira coisa que o
 * cliente enxerga. A correção é apagar a cópia, não sincronizar as três.
 *
 * A prévia da tela Marca lê daqui pelo mesmo motivo: prévia que mostra uma cor
 * diferente da que o cliente vê não é prévia, é informação errada.
 */
export const COR_PADRAO_DA_LOJA = "#25d366";

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

/**
 * Escurece um hex — usado só para INVENTAR a segunda ponta do degradê quando o
 * restaurante não escolheu cor secundária.
 *
 * Por que existe: sem isto, primária e secundária ficam iguais e a "capa vazia"
 * vira um bloco chapado de cor — que é justamente o que o estado vazio não pode
 * ser. Com a ponta escura, a mesma cor única já lê como faixa desenhada.
 *
 * Entrada inválida devolve a própria entrada: capa é enfeite, nunca pode
 * derrubar o cardápio por causa de um campo de cor mal preenchido no painel.
 */
export function escurecerCor(hex: string, fator = 0.42): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;

  const bruto = m[1]!;
  const cheio = bruto.length === 3 ? bruto.split("").map((c) => c + c).join("") : bruto;
  const k = Math.min(1, Math.max(0, 1 - fator));

  const canal = (i: number) =>
    Math.round(parseInt(cheio.slice(i, i + 2), 16) * k)
      .toString(16)
      .padStart(2, "0");

  return `#${canal(0)}${canal(2)}${canal(4)}`;
}

/** As iniciais que aparecem na capa quando o restaurante não tem logo. */
export function iniciaisDoNome(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "•";
  const letras = partes.slice(0, 2).map((p) => [...p][0] ?? "");
  return letras.join("").toUpperCase();
}
