import { describe, it, expect, beforeEach, vi } from "vitest";

// Hoisted mocks so the vi.mock factories can reference them safely.
const { createMock, retrieveMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  retrieveMock: vi.fn(),
}));

vi.mock("@/lib/openai", () => ({
  openai: { chat: { completions: { create: createMock } } },
}));

vi.mock("./manualRetrieval", () => ({
  retrieveRelevantChapters: retrieveMock,
  buildManualContext: () => "CTX",
}));

import { answerHelpQuestion } from "./helpAssistant";

const chapter = {
  id: "1",
  slug: "cardapio",
  title: "Cardápio",
  area: "GENERAL",
  content: "como cadastrar",
  score: 10,
};

beforeEach(() => {
  createMock.mockReset();
  retrieveMock.mockReset();
});

describe("answerHelpQuestion", () => {
  it("returns the model answer and the retrieved sources when grounded", async () => {
    retrieveMock.mockResolvedValue([chapter]);
    createMock.mockResolvedValue({
      choices: [{ message: { content: "Para cadastrar um produto, vá em Cardápio." } }],
    });

    const r = await answerHelpQuestion({ question: "como cadastro um produto" });

    expect(r.answer).toBe("Para cadastrar um produto, vá em Cardápio.");
    expect(r.grounded).toBe(true);
    expect(r.sources).toEqual([{ slug: "cardapio", title: "Cardápio" }]);
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("is not grounded and has no sources when the manual has no match", async () => {
    retrieveMock.mockResolvedValue([]);
    createMock.mockResolvedValue({
      choices: [{ message: { content: "Não tenho essa informação aqui." } }],
    });

    const r = await answerHelpQuestion({ question: "pergunta obscura" });

    expect(r.grounded).toBe(false);
    expect(r.sources).toEqual([]);
  });

  it("falls back gracefully when OpenAI throws", async () => {
    retrieveMock.mockResolvedValue([]);
    createMock.mockRejectedValue(new Error("boom"));

    const r = await answerHelpQuestion({ question: "qualquer coisa" });

    expect(r.answer).toContain("Falar com a FOOD");
    expect(r.grounded).toBe(false);
  });
});
