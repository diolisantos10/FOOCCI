import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  brainChangeRequest: { findMany: vi.fn(), count: vi.fn() },
  waiterTrainingSuggestion: { findMany: vi.fn(), count: vi.fn() },
  agentImprovementProposal: { findMany: vi.fn(), count: vi.fn() },
  agentSimulationExample: { findMany: vi.fn(), count: vi.fn() },
  agentSimulationOpportunity: { findMany: vi.fn(), count: vi.fn() },
  restaurantKnowledgeItem: { findMany: vi.fn(), count: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { getUnifiedInbox } from "./UnifiedApprovalInbox";

function emptyAll() {
  for (const model of Object.values(db)) {
    model.findMany.mockResolvedValue([]);
    model.count.mockResolvedValue(0);
  }
}

const T1 = new Date("2026-07-10T10:00:00Z");
const T2 = new Date("2026-07-10T11:00:00Z");
const T3 = new Date("2026-07-10T12:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  emptyAll();
});

describe("UnifiedApprovalInbox — inbox unificado READ-ONLY", () => {
  it("agrega itens de várias fontes, normaliza o shape e ordena por createdAt desc", async () => {
    db.brainChangeRequest.findMany.mockResolvedValue([
      { id: "cr1", summary: "Mudar regra X", rationale: "Motivo", riskLevel: "HIGH", createdAt: T1, metadata: null },
    ]);
    db.brainChangeRequest.count.mockResolvedValue(1);

    // Uma chamada para WhatsApp learnings, outra para waiter training — distinguidas pelo where.
    db.waiterTrainingSuggestion.findMany.mockImplementation(({ where }: { where: { agentSlug: unknown } }) =>
      Promise.resolve(
        where.agentSlug === "whatsapp-receptionist"
          ? [{ id: "wl1", title: "Aprendizado WhatsApp", situationSummary: "Resumo", riskLevel: "MEDIUM", createdAt: T3, technicalDetails: {} }]
          : [{ id: "wt1", title: "Treino garçom", situationSummary: "Resumo", riskLevel: "LOW", createdAt: T2, technicalDetails: null }],
      ),
    );
    db.waiterTrainingSuggestion.count.mockResolvedValue(1);

    db.restaurantKnowledgeItem.findMany.mockResolvedValue([
      { id: "k1", title: "Horário", answer: "Abrimos às 18h", category: "FAQ", createdAt: T1, createdFromConversationId: null },
    ]);
    db.restaurantKnowledgeItem.count.mockResolvedValue(1);

    const inbox = await getUnifiedInbox();

    expect(inbox.items.map((i) => i.id)).toEqual(["wl1", "wt1", "cr1", "k1"]); // desc por createdAt (empate mantém ordem de prioridade)
    expect(inbox.countsBySource.BRAIN_CHANGE_REQUEST).toBe(1);
    expect(inbox.countsBySource.WHATSAPP_LEARNING).toBe(1);
    expect(inbox.countsBySource.WAITER_TRAINING).toBe(1);
    expect(inbox.countsBySource.KNOWLEDGE_ITEM).toBe(1);
    expect(inbox.countsBySource.AGENT_IMPROVEMENT_PROPOSAL).toBe(0);
    expect(inbox.totalPending).toBe(4);
    expect(inbox.duplicatesCollapsed).toBe(0);

    // Shape normalizado
    const first = inbox.items[0]!;
    expect(first).toMatchObject({ source: "WHATSAPP_LEARNING", title: "Aprendizado WhatsApp", summary: "Resumo" });
    expect(first.createdAt).toBeInstanceOf(Date);

    // READ-ONLY: nenhum write foi chamado (mocks só têm findMany/count)
    expect(db.brainChangeRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "PENDING_APPROVAL" } }),
    );
  });

  it("deduplica pela mesma conversationId entre fontes, mantendo a fonte mais prioritária", async () => {
    const convId = "conv_123";
    db.brainChangeRequest.findMany.mockResolvedValue([
      { id: "cr1", summary: "CR da conversa", rationale: "Motivo", riskLevel: "MEDIUM", createdAt: T1, metadata: { conversationId: convId } },
    ]);
    db.brainChangeRequest.count.mockResolvedValue(1);

    db.waiterTrainingSuggestion.findMany.mockImplementation(({ where }: { where: { agentSlug: unknown } }) =>
      Promise.resolve(
        where.agentSlug === "whatsapp-receptionist"
          ? [{ id: "wl1", title: "Treino da mesma conversa", situationSummary: "Resumo", riskLevel: "LOW", createdAt: T2, technicalDetails: { exampleConversationIds: [convId] } }]
          : [],
      ),
    );
    db.waiterTrainingSuggestion.count.mockImplementation(({ where }: { where: { agentSlug: unknown } }) =>
      Promise.resolve(where.agentSlug === "whatsapp-receptionist" ? 1 : 0),
    );

    db.restaurantKnowledgeItem.findMany.mockResolvedValue([
      { id: "k1", title: "Conhecimento da mesma conversa", answer: "Resposta", category: "FAQ", createdAt: T3, createdFromConversationId: convId },
    ]);
    db.restaurantKnowledgeItem.count.mockResolvedValue(1);

    const inbox = await getUnifiedInbox();

    // 3 itens da mesma conversa → sobra 1, o BrainChangeRequest (prioridade máxima),
    // mesmo sendo o mais antigo.
    expect(inbox.items).toHaveLength(1);
    expect(inbox.items[0]!.id).toBe("cr1");
    expect(inbox.items[0]!.source).toBe("BRAIN_CHANGE_REQUEST");
    expect(inbox.duplicatesCollapsed).toBe(2);
    // Contagens por fonte NÃO são deduplicadas — refletem o pendente real de cada fila.
    expect(inbox.totalPending).toBe(3);
  });

  it("itens sem conversationId nunca são colapsados entre si", async () => {
    db.restaurantKnowledgeItem.findMany.mockResolvedValue([
      { id: "k1", title: "A", answer: "a", category: "FAQ", createdAt: T1, createdFromConversationId: null },
      { id: "k2", title: "B", answer: "b", category: "FAQ", createdAt: T2, createdFromConversationId: null },
    ]);
    db.restaurantKnowledgeItem.count.mockResolvedValue(2);

    const inbox = await getUnifiedInbox();
    expect(inbox.items).toHaveLength(2);
    expect(inbox.duplicatesCollapsed).toBe(0);
  });

  it("fonte com erro vira contagem 0 e NÃO derruba o inbox", async () => {
    db.brainChangeRequest.findMany.mockRejectedValue(new Error("db down"));
    db.brainChangeRequest.count.mockRejectedValue(new Error("db down"));

    db.restaurantKnowledgeItem.findMany.mockResolvedValue([
      { id: "k1", title: "Sobrevivente", answer: "ok", category: "FAQ", createdAt: T1, createdFromConversationId: null },
    ]);
    db.restaurantKnowledgeItem.count.mockResolvedValue(1);

    const inbox = await getUnifiedInbox();

    expect(inbox.countsBySource.BRAIN_CHANGE_REQUEST).toBe(0);
    expect(inbox.countsBySource.KNOWLEDGE_ITEM).toBe(1);
    expect(inbox.items.map((i) => i.id)).toEqual(["k1"]);
    expect(inbox.totalPending).toBe(1);
  });

  it("todas as fontes fora do ar → inbox vazio, nunca lança", async () => {
    for (const model of Object.values(db)) {
      model.findMany.mockRejectedValue(new Error("boom"));
      model.count.mockRejectedValue(new Error("boom"));
    }
    const inbox = await getUnifiedInbox();
    expect(inbox.items).toEqual([]);
    expect(inbox.totalPending).toBe(0);
    expect(inbox.duplicatesCollapsed).toBe(0);
  });

  it("respeita limitPerSource nas consultas", async () => {
    await getUnifiedInbox(5);
    expect(db.brainChangeRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5 }));
    expect(db.restaurantKnowledgeItem.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5 }));
  });
});
