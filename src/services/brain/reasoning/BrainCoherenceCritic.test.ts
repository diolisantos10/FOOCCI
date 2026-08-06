import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const db = vi.hoisted(() => ({ brainEngineRouting: { findMany: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const ai = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/lib/openai", () => ({ openai: { chat: { completions: { create: ai.create } } } }));

import { judgeReply, formatTruthForJudge } from "./BrainCoherenceCritic";

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

/**
 * O bug de 06/08/2026: a ficha ganhou `loja`/`entrega`/`local` no PR #111, a
 * tabela de prioridade DAQUI não acompanhou, as três caíam no fim da fila e o
 * corte de 15.000 caracteres as apagava — atrás do cardápio. O agente sabia que
 * a loja estava fechada; o juiz que aprova a frase, não.
 *
 * Cardápio de 250 itens ≈ o de um restaurante real: mais de 15.000 caracteres
 * só de produtos, que é o que torna a ordem da fila decisiva.
 */
const cardapioGrande = Array.from({ length: 250 }, (_, i) => ({
  nome: `Item numero ${i} do cardapio da casa`,
  categoria: "Pratos principais da casa",
  canais: "ES",
  preco: 40 + i,
}));
const fichaReal = {
  products: cardapioGrande,
  policies: [{ tone: "friendly", nome: "Sushi Cazza" }],
  payments: { pix: true, cartao: true, dinheiro: false },
  hours: [{ dia: "terça", abre: "18:00", fecha: "23:00" }],
  loja: { aceitaPedido: false, motivo: "fora do horário", reabreEm: "terça 18:00" },
  entrega: { taxa: "R$ 8,00", raioKm: 7, minimo: "R$ 30,00" },
  local: { endereco: "Rua das Flores, 100" },
  materials: [{ librarySources: 3 }],
  evidence: [{ approved: 12 }],
};

describe("formatTruthForJudge — o juiz precisa ver o estado da loja, não o cardápio inteiro", () => {
  it("com cardápio grande, o corte é REAL — sem isso o teste não prova nada", () => {
    // A metade que impede o teste de virar carimbo: se o cardápio coubesse,
    // qualquer ordem passaria e o teste abaixo não estaria medindo nada.
    expect(JSON.stringify(cardapioGrande).length).toBeGreaterThan(15000);
    expect(formatTruthForJudge(fichaReal)).toContain("…(cortado)");
  });

  it("o estado da loja AGORA chega INTEIRO ao juiz", () => {
    const texto = formatTruthForJudge(fichaReal);
    expect(texto).toContain("Estado da loja AGORA");
    expect(texto).toContain("fora do horário");
    expect(texto).toContain("terça 18:00");
    // e vem antes do cardápio, não depois
    expect(texto.indexOf("Estado da loja AGORA")).toBeLessThan(texto.indexOf("Produtos"));
  });

  it("entrega, endereço, preços, pagamentos e horários também sobrevivem ao corte", () => {
    const texto = formatTruthForJudge(fichaReal);
    for (const esperado of ["Entrega (taxa", "R$ 8,00", "Endereço do restaurante", "Rua das Flores", "Pagamentos", "Horários/atendimento"]) {
      expect(texto, `sumiu do julgamento: ${esperado}`).toContain(esperado);
    }
  });

  it("o cardápio continua chegando — o corte apara a cauda, não amputa a fonte", () => {
    // A outra metade: um detector que salva a loja jogando o cardápio fora
    // faria o juiz reprovar todo preço legítimo. Produtos entram, e entram cedo
    // o bastante para conter os primeiros itens.
    const texto = formatTruthForJudge(fichaReal);
    expect(texto).toContain("Produtos");
    expect(texto).toContain("Item numero 0 do cardapio da casa");
  });

  it("fonte NOVA, que ninguém rotulou, não é apagada pelo cardápio", () => {
    const texto = formatTruthForJudge({ ...fichaReal, fidelidade: { nivel: "ouro", desconto: "10%" } });
    expect(texto).toContain("fidelidade");
    expect(texto).toContain("ouro");
  });

  it("respeita o orçamento de caracteres pedido", () => {
    const texto = formatTruthForJudge(fichaReal, 2000);
    expect(texto.length).toBeLessThanOrEqual(2000 + 32); // +sufixo "…(cortado)"
    expect(texto).toContain("Estado da loja AGORA");
  });
});
