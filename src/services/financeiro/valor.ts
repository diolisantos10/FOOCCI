/**
 * DINHEIRO — a unidade, a leitura do que se digita e a escrita do que se mostra.
 *
 * MÓDULO PURO: nenhum import de prisma, de rede ou de env. Ele é o único arquivo
 * do financeiro que a TELA pode importar — `gastoManual.ts` fala com o banco, e
 * importá-lo de um componente levaria o serviço de gravação inteiro para dentro
 * do pacote que vai ao navegador.
 *
 * ── A UNIDADE ───────────────────────────────────────────────────────────────
 *
 * **Centavo inteiro**, sempre. Nenhum valor monetário existe como ponto
 * flutuante em nenhum ponto do financeiro. `0.1 + 0.2` não dá `0.3` em ponto
 * flutuante, e uma conta de gastos que erra no terceiro decimal deixa de fechar
 * com a fatura por um motivo que ninguém encontra olhando a tela.
 *
 * O gasto de IA tem uma unidade a mais — o **microdólar** —, e a razão está em
 * `gastoDiario.ts`: mil tokens de gpt-4o-mini custam 0,015 centavo, e arredondar
 * cada chamada para centavo zeraria a conta inteira.
 */

/** Microdólares em um centavo de dólar. */
export const MICRO_POR_CENTAVO = 10_000;

/**
 * O que a pessoa digitou vira centavos inteiros — sem passar por float.
 *
 * ── ⚠️ POR QUE NÃO `Math.round(Number(texto) * 100)` ────────────────────────
 *
 * Porque `Number("49.90") * 100` é `4989.999999999999`. Com `Math.round` isso
 * até salva o caso de hoje, mas o padrão erra sozinho mais adiante: o mesmo
 * caminho aplicado a `"8.115"` (um valor em dólar com três casas) devolve o
 * centavo errado, e ninguém confere um número que parece certo.
 *
 * Aqui as casas são separadas como TEXTO e concatenadas: "49" + "90" = 4990. A
 * aritmética de ponto flutuante nunca entra.
 *
 * Devolve `null` — e não zero — para o que não é valor. Zero é um valor
 * legítimo (uma linha de R$ 0,00 registrada de propósito), então usá-lo como
 * "não entendi" apagaria a diferença entre as duas coisas.
 */
export function centavosDoTexto(texto: unknown): number | null {
  if (typeof texto !== "string") return null;

  const limpo = texto.trim().replace(/\s|R\$|US\$|\$/g, "");
  if (limpo === "") return null;

  // Separador decimal brasileiro OU americano. Milhar com ponto ("1.234,56") é
  // desfeito antes: quem cola um valor do extrato cola com ele.
  const semMilhar = limpo.includes(",")
    ? limpo.replace(/\./g, "").replace(",", ".")
    : limpo;

  if (!/^\d+(\.\d{1,2})?$/.test(semMilhar)) return null;

  const [inteiros, decimais = ""] = semMilhar.split(".");
  return Number(`${inteiros}${decimais.padEnd(2, "0")}`);
}

/** Centavos inteiros viram o texto da moeda. A divisão por 100 acontece só aqui. */
export function valorEscrito(centavos: number, moeda: "BRL" | "USD"): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: moeda });
}

/**
 * O gasto de IA, escrito.
 *
 * ── ⚠️ A REGRA QUE ESTA FUNÇÃO CARREGA ──────────────────────────────────────
 *
 * Ela **nunca** escreve "US$ 0,00" sobre um gasto que existe. Abaixo de um
 * centavo ela abre casas decimais até o número aparecer, porque um zero escrito
 * onde houve gasto é a mentira mais fácil de cometer e a mais difícil de notar —
 * e é exatamente o formato do gasto de IA: miúdo, constante e somado aos
 * milhares.
 *
 * Zero de verdade — e só ele — sai como "US$ 0,00". E mesmo aí, quem decide se
 * essa frase pode aparecer é o ESTADO do balde, não este formatador.
 */
export function dolaresEscritos(microUsd: number): string {
  const dolares = microUsd / 1_000_000;
  const casas = microUsd !== 0 && Math.abs(dolares) < 0.01 ? 6 : 2;
  return `US$ ${dolares.toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  })}`;
}
