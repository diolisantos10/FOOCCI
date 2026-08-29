/**
 * DINHEIRO — o inteiro que entra e o texto que sai.
 *
 * O que estes testes protegem, em uma frase: que nenhum centavo se perca entre o
 * teclado e o banco, e que nenhum zero seja escrito sobre um gasto que existe.
 *
 * ── AS DUAS METADES, SEMPRE ─────────────────────────────────────────────────
 *
 * Cada regra aparece recusando o que não é valor E aceitando o que é. Um arquivo
 * só com a primeira metade ficaria verde contra um `centavosDoTexto` que
 * devolvesse `null` para tudo — e nenhum gasto seria lançado nunca, com a tela
 * parecendo rigorosa.
 *
 * ── OS DOIS DEFEITOS QUE DOEM MAIS ──────────────────────────────────────────
 *
 *   · **Passar o valor por ponto flutuante.** `Number("49.90") * 100` é
 *     4989,999999999999. Meio centavo por linha faz a conta parar de fechar com
 *     a fatura, e ninguém encontra o motivo olhando a tela.
 *   · **Escrever "US$ 0,00" sobre um gasto que existe.** Mil tokens de
 *     gpt-4o-mini custam 0,015 centavo. Arredondando para duas casas, dez mil
 *     chamadas viram zero — o zero mais caro possível.
 */

import { describe, it, expect } from "vitest";
import { MICRO_POR_CENTAVO, centavosDoTexto, dolaresEscritos, valorEscrito } from "./valor";

// ═══════════════════════════════════════════════════════════════════════════
// O QUE A PESSOA DIGITA
// ═══════════════════════════════════════════════════════════════════════════

describe("⭐ o valor digitado vira centavos inteiros, sem passar por float", () => {
  it("⭐ 49,90 são 4990 centavos — exatos, e não 4989,999…", () => {
    // O caso que carrega este arquivo. `Number("49.90") * 100` devolve
    // 4989.999999999999 em JavaScript; a conversão aqui é feita como TEXTO
    // ("49" + "90"), então a aritmética de ponto flutuante nunca entra.
    const c = centavosDoTexto("49,90");

    expect(c).toBe(4990);
    expect(Number.isInteger(c)).toBe(true);
  });

  it("os dois separadores decimais funcionam — vírgula e ponto", () => {
    // A metade que passa. Quem cola de uma fatura em dólar cola com ponto; quem
    // digita no Brasil digita com vírgula. Recusar um dos dois faria metade dos
    // lançamentos serem rejeitados por um motivo que ninguém entende.
    expect(centavosDoTexto("49,90")).toBe(4990);
    expect(centavosDoTexto("49.90")).toBe(4990);
  });

  it("valor sem casas decimais é aceito, e não vira centavo solto", () => {
    // "50" é cinquenta reais, e não cinquenta centavos. Ler o inteiro como
    // centavo dividiria toda a conta por cem.
    expect(centavosDoTexto("50")).toBe(5000);
    expect(centavosDoTexto("0")).toBe(0);
  });

  it("uma casa decimal completa a segunda, e não a descarta", () => {
    // "49,9" são R$ 49,90 — não R$ 49,09 nem R$ 4,99.
    expect(centavosDoTexto("49,9")).toBe(4990);
  });

  it("ponto de milhar do extrato não vira separador decimal", () => {
    // Colar "1.234,56" de um extrato é o caso comum. Lido como decimal, viraria
    // R$ 1,23 — e um gasto de mil e duzentos reais entraria como um. A vírgula
    // presente é o que diz que os pontos são milhar.
    expect(centavosDoTexto("1.234,56")).toBe(123456);
    expect(centavosDoTexto("12.345,00")).toBe(1234500);
  });

  it("⭐ “1.234”, que é ambíguo, é RECUSADO — e não chutado", () => {
    /*
      ── O CASO EM QUE ADIVINHAR SERIA PIOR QUE RECUSAR ──────────────────────

      Sem vírgula, `1.234` tem duas leituras defensáveis e mil vezes de
      diferença entre elas: mil duzentos e trinta e quatro reais (ponto de
      milhar brasileiro) ou um real e vinte e três (três casas decimais, que não
      existem em centavo).

      Qualquer escolha automática aqui estaria certa metade das vezes e erraria
      a conta por 100.000% na outra metade — em silêncio, porque o número
      resultante é plausível nos dois casos.

      Então este é o único valor que a leitura devolve `null`: quem digitou
      escreve `1234` ou `1.234,00`, e as duas formas são inequívocas. Guardrail
      1 — ausência de informação não vira informação, nem quando a informação
      que falta é uma vírgula.
    */
    expect(centavosDoTexto("1.234")).toBeNull();

    // As duas formas sem ambiguidade continuam passando — é o que torna a
    // recusa acima um caminho, e não um beco.
    expect(centavosDoTexto("1234")).toBe(123400);
    expect(centavosDoTexto("1.234,00")).toBe(123400);
  });

  it("símbolo de moeda e espaço colados junto não atrapalham", () => {
    expect(centavosDoTexto(" R$ 49,90 ")).toBe(4990);
    expect(centavosDoTexto("US$ 20.00")).toBe(2000);
  });

  it("⭐ o que não é valor devolve null — e null NÃO é zero", () => {
    // Zero é um valor legítimo (uma linha de R$ 0,00 registrada de propósito).
    // Usar zero como "não entendi" apagaria a diferença entre as duas coisas, e
    // um campo digitado errado entraria na conta como um gasto sem valor.
    for (const v of ["", "  ", "abc", "-49,90", "49,905", "1e3", null, 49.9, undefined]) {
      expect(centavosDoTexto(v), String(v)).toBeNull();
    }
  });

  it("⭐ valor negativo digitado é recusado aqui também", () => {
    // A trava de verdade é do serviço e do CHECK do banco. Esta é a terceira, e
    // ela existe porque um "-500" digitado por engano viraria um abatimento
    // silencioso na conta de gastos — a direção errada de errar.
    expect(centavosDoTexto("-500")).toBeNull();
    expect(centavosDoTexto("-0,01")).toBeNull();
  });

  it("mais de duas casas decimais é recusado, e não truncado em silêncio", () => {
    // Truncar "49,905" para 4990 jogaria meio centavo fora sem avisar. Recusar
    // devolve a decisão a quem digitou.
    expect(centavosDoTexto("49,905")).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// O QUE A TELA ESCREVE
// ═══════════════════════════════════════════════════════════════════════════

describe("centavos viram texto de moeda", () => {
  it("real e dólar saem com o símbolo certo", () => {
    expect(valorEscrito(4990, "BRL")).toContain("49,90");
    expect(valorEscrito(4990, "BRL")).toContain("R$");
    expect(valorEscrito(2000, "USD")).toContain("20,00");
  });

  it("a divisão por 100 acontece só na escrita, e o inteiro não é tocado", () => {
    // A garantia de que ninguém foi tentado a guardar reais: o argumento é
    // centavo e continua sendo centavo em todo o resto do sistema.
    expect(valorEscrito(1, "BRL")).toContain("0,01");
    expect(valorEscrito(100_000, "BRL")).toContain("1.000,00");
  });
});

describe("⭐ o gasto de IA nunca é escrito como zero quando existe", () => {
  it("⭐ meio centavo de dólar aparece com casas suficientes para ser lido", () => {
    /*
      O defeito que esta função existe para impedir, e ele é o mais fácil de
      cometer: `(micro / 1e6).toFixed(2)` sobre 750 microdólares escreve
      "US$ 0,00" — e a tela passa a dizer que não se gastou nada exatamente no
      formato de gasto que a Foocci mais tem, o miúdo e constante.
    */
    const escrito = dolaresEscritos(750); // US$ 0,00075

    expect(escrito).not.toBe("US$ 0,00");
    expect(escrito).toContain("0,000750");
  });

  it("acima de um centavo sai com duas casas, como qualquer valor", () => {
    // A metade que passa: abrir seis casas em todo valor deixaria a tela
    // ilegível justamente quando o gasto ficasse grande.
    expect(dolaresEscritos(30_000)).toBe("US$ 0,03");
    expect(dolaresEscritos(12_500_000)).toBe("US$ 12,50");
  });

  it("zero de verdade — e só ele — sai como US$ 0,00", () => {
    // Quem decide se essa frase PODE aparecer é o estado do balde, não este
    // formatador. Aqui o contrato é só: zero escreve zero.
    expect(dolaresEscritos(0)).toBe("US$ 0,00");
  });

  it("o centavo de dólar tem dez mil microdólares", () => {
    // A constante que amarra as duas unidades. Se ela mudar, o valor em centavos
    // de toda a tela muda junto — e é por isso que ela é uma constante e não um
    // `10000` digitado em três lugares.
    expect(MICRO_POR_CENTAVO).toBe(10_000);
    expect(dolaresEscritos(MICRO_POR_CENTAVO)).toBe("US$ 0,01");
  });
});
