/**
 * LearningAnalysis — pure card generation (manager language) + cross-conversation
 * dedup. No DB, no I/O.
 */

import { describe, it, expect } from "vitest";
import { analyzeIssue, buildLearningQueue } from "../learningAnalysis";
import type { DetectedIssue } from "../conversationReview";

const issue = (over: Partial<DetectedIssue>): DetectedIssue => ({
  kind: "ERRO_DE_PAGAMENTO", customerMessage: "posso pagar com pix?", agentReply: "link...", customerIntent: "PAYMENT_INFO", ...over,
});

// Technical jargon that must NEVER appear in manager-facing card fields.
const TECH_TERMS = /\b(intent|host|classifier|runtime|UNKNOWN|branch|P0|P1|P2|LINK_CARDAPIO|SAFE_MENU|webhook)\b/;

describe("analyzeIssue — card claro em linguagem humana", () => {
  it("gera um card completo para pagamento", () => {
    const c = analyzeIssue(issue({}));
    expect(c.title).toMatch(/pagamento/i);
    expect(c.customerWanted).toBeTruthy();
    expect(c.problem).toBeTruthy();
    expect(c.idealAnswer).toBeTruthy();        // (10) mostra resposta ideal
    expect(c.learningRule).toBeTruthy();
    expect(c.salesImpact).toBeTruthy();
    expect(c.severity).toBe("P0");
  });

  it("nenhum campo voltado ao gestor contém jargão técnico", () => {
    for (const kind of ["ERRO_DE_PAGAMENTO", "ERRO_DE_ENDERECO", "ERRO_DE_RESPOSTA", "ERRO_DE_PRODUTO", "LOOP", "PERGUNTA_NAO_RESPONDIDA", "OPORTUNIDADE_DE_VENDA_PERDIDA"] as const) {
      const c = analyzeIssue(issue({ kind }));
      const managerText = [c.title, c.customerWanted, c.problem, c.idealAnswer, c.learningRule, c.salesImpact].join(" ");
      expect(managerText).not.toMatch(TECH_TERMS);
    }
  });

  it("resposta ideal de pagamento responde pagamento antes de vender", () => {
    const c = analyzeIssue(issue({ kind: "ERRO_DE_PAGAMENTO" }));
    expect(c.idealAnswer.toLowerCase()).toMatch(/pix|pagamento/);
  });

  it("(PART8.7) card de LOOP propõe saída segura (escolha simples / atendente)", () => {
    const c = analyzeIssue(issue({ kind: "LOOP" }));
    expect(c.idealAnswer.toLowerCase()).toMatch(/atendente|1️⃣|escolha/);
    expect(c.learningRule.toLowerCase()).toMatch(/atendente|resumir|escolha/);
  });
});

describe("buildLearningQueue — dedup", () => {
  it("colapsa o mesmo problema de várias conversas em 1 card com occurrences", () => {
    const q = buildLearningQueue([
      { conversationId: "c1", issues: [issue({})] },
      { conversationId: "c2", issues: [issue({})] },
      { conversationId: "c3", issues: [issue({})] },
    ]);
    expect(q).toHaveLength(1);
    expect(q[0].occurrences).toBe(3);
    expect(q[0].exampleConversationIds).toEqual(["c1", "c2", "c3"]);
  });

  it("mesma assinatura repetida numa única conversa conta só 1 ocorrência", () => {
    const q = buildLearningQueue([
      { conversationId: "c1", issues: [issue({}), issue({})] },
    ]);
    expect(q[0].occurrences).toBe(1);
  });

  it("problemas distintos viram cards distintos, ordenados por severidade", () => {
    const q = buildLearningQueue([
      { conversationId: "c1", issues: [issue({ kind: "OPORTUNIDADE_DE_VENDA_PERDIDA" })] },
      { conversationId: "c2", issues: [issue({ kind: "ERRO_DE_PAGAMENTO" })] },
    ]);
    expect(q).toHaveLength(2);
    expect(q[0].card.severity).toBe("P0"); // pagamento (P0) antes da oportunidade (P2)
  });

  it("limita exampleConversationIds a 5", () => {
    const q = buildLearningQueue(
      Array.from({ length: 8 }, (_, i) => ({ conversationId: `c${i}`, issues: [issue({})] })),
    );
    expect(q[0].occurrences).toBe(8);
    expect(q[0].exampleConversationIds).toHaveLength(5);
  });
});
