/**
 * A régua que decide se o Q&A do lojista responde a pergunta do cliente.
 *
 * Ela morava dentro de `RestaurantKnowledgeService` (que importa prisma), e por
 * isso só o agente do WhatsApp conseguia usá-la. O Garçom do cardápio é puro e
 * ficou de fora — foi assim que o mesmo restaurante passou a responder duas
 * coisas diferentes conforme a porta pela qual o cliente entrou.
 *
 * O teste do plural não é preciosismo: "rodízios" com S foi exatamente a
 * primeira mensagem da Júlia no sushi-cazza (05/08, 14:57), e o Q&A cadastrado
 * diz "rodízio". Q&A que existe e não é encontrado é o silêncio parecendo
 * sucesso.
 */

import { describe, it, expect } from "vitest";

import { matchKnowledgeItems, tokenize, type MatchableKnowledgeItem } from "./knowledgeMatch";

const RODIZIO: MatchableKnowledgeItem = {
  title:            "Tem rodízio?",
  category:         "RODIZIO_INFO",
  questionPatterns: ["rodizio", "rodízio", "tem rodízio"],
  answer:           "Rodízio todos os dias das 18h às 23h, no salão.",
};

const ENTREGA: MatchableKnowledgeItem = {
  title:            "Vocês entregam no Centro?",
  category:         "DELIVERY_INFO",
  questionPatterns: ["entregam no centro", "centro"],
  answer:           "Entregamos no Centro, taxa R$ 6,00.",
};

describe("o Q&A do lojista chega ao cliente", () => {
  it("REGRESSÃO: o plural do cliente casa com o singular do cadastro", () => {
    expect(matchKnowledgeItems([RODIZIO], "vocês tem rodízios")?.answer).toContain("18h às 23h");
    expect(matchKnowledgeItems([RODIZIO], "vcs tem rodízio")?.answer).toContain("18h às 23h");
  });

  it("o acento do cliente não decide nada", () => {
    expect(matchKnowledgeItems([RODIZIO], "tem rodizio?")).not.toBeNull();
    expect(matchKnowledgeItems([RODIZIO], "tem RODÍZIO?")).not.toBeNull();
  });

  it("escolhe o item certo entre vários", () => {
    expect(matchKnowledgeItems([RODIZIO, ENTREGA], "vocês entregam no centro?")?.category).toBe("DELIVERY_INFO");
    expect(matchKnowledgeItems([RODIZIO, ENTREGA], "tem rodízio?")?.category).toBe("RODIZIO_INFO");
  });
});

describe("o que a régua NÃO pode fazer", () => {
  it("pergunta sem relação nenhuma não casa", () => {
    expect(matchKnowledgeItems([RODIZIO, ENTREGA], "quero um temaki de salmão")).toBeNull();
    expect(matchKnowledgeItems([RODIZIO], "boa noite")).toBeNull();
  });

  it("gap sem resposta nunca é usado como resposta", () => {
    const gap: MatchableKnowledgeItem = {
      title: "Gap", category: "UNKNOWN_GAP",
      questionPatterns: ["rodizio"], answer: "",
    };
    expect(matchKnowledgeItems([gap], "tem rodízio?")).toBeNull();
  });

  it("item ATIVO com resposta vazia também não vira resposta vazia", () => {
    // Silêncio parecendo sucesso: devolver isto entregaria uma bolha em branco.
    const vazio: MatchableKnowledgeItem = {
      title: "Rodízio", category: "RODIZIO_INFO",
      questionPatterns: ["rodizio"], answer: "   ",
    };
    expect(matchKnowledgeItems([vazio], "tem rodízio?")).toBeNull();
  });

  it("lista vazia e mensagem vazia não explodem", () => {
    expect(matchKnowledgeItems([], "tem rodízio?")).toBeNull();
    expect(matchKnowledgeItems([RODIZIO], "")).toBeNull();
    expect(matchKnowledgeItems([RODIZIO], "   ")).toBeNull();
  });

  it("a dobra de plural é simétrica e não come palavra curta", () => {
    expect(tokenize("rodízios")).toEqual(["rodizio"]);
    expect(tokenize("rodízio")).toEqual(["rodizio"]);
    // Palavra de 3 letras não entra, e a dobra nunca encurta abaixo disso.
    expect(tokenize("tem uma")).toEqual([]);
    expect(tokenize("bebidas geladas")).toEqual(["bebida", "gelada"]);
  });
});
