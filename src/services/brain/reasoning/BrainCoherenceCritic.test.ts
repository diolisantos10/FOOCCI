import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const db = vi.hoisted(() => ({ brainEngineRouting: { findMany: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const ai = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/lib/openai", () => ({ openai: { chat: { completions: { create: ai.create } } } }));

import { judgeReply } from "./BrainCoherenceCritic";

const OLD_KEY = process.env.OPENAI_API_KEY;
const baseInput = {
  agentId: "whatsapp",
  businessId: "r1",
  customerMessage: "quanto custa o combo?",
  candidateReply: "O combo sai por R$ 59,90!",
  snapshot: { truthSources: { products: [{ nome: "Combo", preco: 59.9 }] }, missingContext: [] },
};

beforeEach(() => {
  vi.clearAllMocks();
  db.brainEngineRouting.findMany.mockResolvedValue([]);
});

afterEach(() => {
  if (OLD_KEY === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = OLD_KEY;
});

describe("BrainCoherenceCritic — o LLM-judge por cima do piso determinístico", () => {
  it("reprovação EXPLÍCITA do judge → fail-closed (approved=false)", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    ai.create.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ approved: false, reason: "preço não confere" }) } }],
    });
    const v = await judgeReply(baseInput);
    expect(v.mode).toBe("JUDGED");
    expect(v.approved).toBe(false);
    expect(v.reason).toMatch(/preço/);
  });

  it("aprovação do judge → segue", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    ai.create.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ approved: true, reason: "coerente com a base" }) } }],
    });
    const v = await judgeReply(baseInput);
    expect(v.approved).toBe(true);
    expect(v.mode).toBe("JUDGED");
  });

  it("sem piloto configurado → SKIPPED aprovado (o judge é reforço, não ponto único de falha)", async () => {
    delete process.env.OPENAI_API_KEY;
    const v = await judgeReply(baseInput);
    expect(v.approved).toBe(true);
    expect(v.mode).toBe("SKIPPED");
    expect(ai.create).not.toHaveBeenCalled();
  });

  it("erro/JSON inválido do judge → fail-open com nota (SKIPPED)", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    ai.create.mockResolvedValue({ choices: [{ message: { content: "não é json" } }] });
    const v = await judgeReply(baseInput);
    expect(v.approved).toBe(true);
    expect(v.mode).toBe("SKIPPED");
  });
});
