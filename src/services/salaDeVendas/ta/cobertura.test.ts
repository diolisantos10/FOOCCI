/**
 * A COBERTURA — o TA responde as perguntas que um dono de restaurante FAZ?
 *
 * ── POR QUE ESTE ARQUIVO EXISTE ─────────────────────────────────────────────
 *
 * Os outros testes provam que ele não mente. Nenhum prova que ele **sabe**.
 * São coisas diferentes, e um agente pode passar em todos os outros sendo
 * inútil: basta responder "não sei" a tudo.
 *
 * O pedido do CEO foi explícito — *"que conheça cem por cento de todas as
 * características, benefícios e vantagens, e consiga responder qualquer pergunta
 * sobre o Foocci que os clientes fizerem"*. Isto aqui é esse pedido em forma de
 * portão: uma lista de perguntas de venda de verdade, medida contra as duas
 * bases.
 *
 * ── ⚠️ E POR QUE DUAS PERGUNTAS FICAM DE FORA, DE PROPÓSITO ─────────────────
 *
 * Nem toda lacuna é defeito. Duas perguntas desta lista **devem** cair no "não
 * sei", e enchê-las seria o erro:
 *
 *   · **prazo de implantação** — não existe prazo publicado. Prometer um é o
 *     primeiro item da lista de proibidos da ficha;
 *   · **formato de operação específico** (self service e afins) — não há fato
 *     publicado sobre quais formatos são atendidos. Inventar um "sim" fecha
 *     negócio e explode na implantação.
 *
 * ⚠️ *Bar* saiu desta lista em 28/08/2026, e a diferença entre os dois casos é
 * a regra inteira desta casa: bar deixou de ser palpite porque o CEO afirmou o
 * público ("restaurantes, bares e afins") e o fato foi **publicado** no FAQ.
 * Self service continua fora porque ninguém afirmou nada — e a ausência de
 * informação não é informação.
 *
 * Elas estão na lista com a ausência DECLARADA. Um teste que só medisse o número
 * cheio empurraria alguém a preencher esses dois buracos com um palpite — que é
 * exatamente o comportamento que o resto deste diretório existe para impedir.
 */

import { describe, it, expect } from "vitest";
import { buscarNaVerdade } from "./verdade";
import { buscarNoConhecimento } from "./conhecimento";

/** Perguntas reais de uma conversa de venda. */
const PRECISA_SABER = [
  "quanto custa",
  "qual o valor do plano",
  "tem desconto",
  "como funciona o pagamento",
  "aceita pix",
  "tem taxa de setup",
  "tem fidelidade ou contrato",
  "vocês integram com ifood",
  "funciona com meu pdv",
  "emite nota fiscal",
  "como funciona o cardápio digital",
  "o cliente pede pelo whatsapp",
  "consigo fazer promoção",
  "manda mensagem de aniversário",
  "consigo ver relatório de vendas",
  "quantos clientes recompram",
  "tem cupom de desconto",
  "funciona para pizzaria",
  // ⭐ Entrou em 28/08/2026, e medindo: até esse dia voltava VAZIA. O CEO define
  // o atendimento como "restaurantes, bares e afins", mas o site dizia
  // "restaurante" nove vezes e bar nenhuma — então o TA não tinha o que
  // afirmar sobre metade do próprio público, e a primeira pergunta de um dono
  // de bar recebia "vou confirmar". A correção foi publicar o fato no FAQ.
  "vocês atendem bar",
  "vocês atendem bares",
  "tenho duas lojas, funciona",
  "quem coloca meu cardápio no sistema",
  "preciso comprar equipamento",
  "funciona no celular",
  "e se eu quiser cancelar",
  "vocês cobram comissão por pedido",
  "quanto o ifood cobra de comissão",
  "meu cliente precisa se cadastrar",
  "dá para imprimir o pedido na cozinha",
  "tem suporte",
  "posso testar antes",
];

/** O que ele NÃO sabe, e não deve saber. A ausência é a resposta certa. */
const NAO_DEVE_CHUTAR = [
  { pergunta: "quanto tempo demora para instalar", porque: "não existe prazo publicado" },
  { pergunta: "e para self service", porque: "não há fato publicado sobre tipos atendidos" },
];

function temMaterial(p: string): boolean {
  return buscarNaVerdade(p).length > 0 || buscarNoConhecimento(p).length > 0;
}

describe("o TA sabe responder o que perguntam numa venda", () => {
  it("⭐ toda pergunta da lista tem material atrás", () => {
    const vazias = PRECISA_SABER.filter((p) => !temMaterial(p));

    expect(
      vazias,
      `o TA ficou sem material para: ${vazias.join(" | ")}.\n` +
        "Se a pergunta passou a ser legítima e a fonte sumiu, a correção é trazer " +
        "a fonte de volta — nunca escrever a resposta à mão neste diretório.",
    ).toEqual([]);
  });

  it("as perguntas de PREÇO caem na base de afirmação, não na de explicação", () => {
    // Preço é a única coisa que ele repete palavra por palavra. Se cair só no
    // conhecimento, o modelo redige o número com as palavras dele — e é assim que
    // um preço vira aproximação.
    for (const p of ["quanto custa", "qual o valor do plano", "tem desconto"]) {
      expect(buscarNaVerdade(p).length, `"${p}" não achou preço afirmável`).toBeGreaterThan(0);
    }
  });

  it("⭐ e as duas que ele NÃO deve saber continuam sem material", () => {
    // A metade que impede o número de virar meta. Um teste que só contasse
    // perguntas respondidas empurraria alguém a preencher estes dois buracos com
    // um palpite — o comportamento que o resto do diretório existe para impedir.
    for (const { pergunta, porque } of NAO_DEVE_CHUTAR) {
      expect(
        temMaterial(pergunta),
        `"${pergunta}" ganhou resposta, e não devia: ${porque}`,
      ).toBe(false);
    }
  });
});
