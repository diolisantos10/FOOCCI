/**
 * WhatsApp Learning Analysis — PURE transformation of a detected issue into a
 * manager-readable "learning card" (PART 2 shape), plus deduplication of many
 * conversations' issues into a small queue of distinct learnings (PART 4).
 *
 * No DB, no GPT, no I/O. The cards use business language only — technical terms
 * (intent/host/classifier/runtime) live in `technicalDetails`, never in the
 * manager-facing fields.
 */

import type { DetectedIssue, IssueKind } from "./conversationReview";

export type LearningSeverity = "P0" | "P1" | "P2";
export type SuggestedAction =
  | "APROVAR_TREINAMENTO"
  | "CORRIGIR_FLUXO"
  | "CHAMAR_HUMANO"
  | "IGNORAR";

export interface LearningCard {
  /** Stable signature used for cross-conversation dedup (one card per kind). */
  signature: IssueKind;
  title: string;
  customerWanted: string;
  agentAnswered: string;
  problem: string;
  idealAnswer: string;
  learningRule: string;
  salesImpact: string;
  severity: LearningSeverity;
  suggestedAction: SuggestedAction;
}

interface CardTemplate {
  title: string;
  customerWanted: string;
  problem: string;
  idealAnswer: string;
  learningRule: string;
  salesImpact: string;
  severity: LearningSeverity;
  suggestedAction: SuggestedAction;
}

const TEMPLATES: Record<IssueKind, CardTemplate> = {
  ERRO_DE_PAGAMENTO: {
    title: "Pergunta sobre pagamento virou link de cardápio",
    customerWanted: "O cliente queria saber a forma de pagamento (ex.: Pix ou cartão).",
    problem: "A IA mandou o link do cardápio em vez de responder a pergunta. Isso cria atrito antes da venda.",
    idealAnswer: "“Sim, aceitamos Pix 😊 Quer fazer seu pedido agora?”",
    learningRule: "Quando o cliente perguntar a forma de pagamento, responder primeiro a forma de pagamento e depois conduzir para o pedido. Nunca mandar link como resposta a pagamento.",
    salesImpact: "Reduz abandono e aumenta a chance de fechamento.",
    severity: "P0",
    suggestedAction: "APROVAR_TREINAMENTO",
  },
  ERRO_DE_ENDERECO: {
    title: "Endereço do cliente virou localização do restaurante",
    customerWanted: "O cliente enviou o próprio endereço para receber a entrega.",
    problem: "A IA respondeu com a localização do restaurante, como se o cliente quisesse ir até a loja.",
    idealAnswer: "“Perfeito! Para calcular a entrega, é só começar o pedido que eu peço o CEP no momento certo 😊”",
    learningRule: "Endereço enviado fora de um pedido não deve receber a localização do restaurante nem handoff automático — orientar o próximo passo do pedido.",
    salesImpact: "Evita confusão e mantém o cliente no caminho da compra.",
    severity: "P0",
    suggestedAction: "APROVAR_TREINAMENTO",
  },
  ERRO_DE_RESPOSTA: {
    title: "Pedido explícito recebeu link em vez de atendimento",
    customerWanted: "O cliente já disse o que queria pedir.",
    problem: "A IA respondeu com um link de cardápio em vez de conduzir o pedido, criando um passo extra.",
    idealAnswer: "“Boa escolha! 😊 Quer adicionar mais alguma coisa ou já posso fechar o pedido?”",
    learningRule: "Quando o cliente faz um pedido explícito, conduzir o pedido — não mandar link como primeira resposta.",
    salesImpact: "Menos atrito no pedido = mais pedidos fechados.",
    severity: "P1",
    suggestedAction: "APROVAR_TREINAMENTO",
  },
  ERRO_DE_PRODUTO: {
    title: "Dúvida simples de produto virou chamada para atendente",
    customerWanted: "O cliente perguntou se um item existe no cardápio.",
    problem: "A IA chamou um atendente em vez de responder uma dúvida simples que ela mesma poderia resolver.",
    idealAnswer: "“Temos sim 😊 Quer que eu te ajude a montar o pedido?”",
    learningRule: "Perguntas sobre itens do cardápio devem ser respondidas pela IA com base no cardápio real, sem handoff desnecessário.",
    salesImpact: "Atendimento mais rápido e menos fila no atendente humano.",
    severity: "P1",
    suggestedAction: "APROVAR_TREINAMENTO",
  },
  LOOP: {
    title: "IA repetiu a mesma resposta (loop)",
    customerWanted: "O cliente ficou confuso e a IA não avançou.",
    problem: "A IA repetiu a mesma resposta sem resolver, o que frustra o cliente.",
    idealAnswer: "“Deixa eu te ajudar de outro jeito 😊 Você quer: 1️⃣ Fazer pedido 2️⃣ Falar com atendente”",
    learningRule: "Se a IA repetir a mesma pergunta/resposta 2 vezes, resumir o que entendeu, oferecer escolha simples e, se persistir, chamar atendente.",
    salesImpact: "Evita perder o cliente por frustração.",
    severity: "P1",
    suggestedAction: "CORRIGIR_FLUXO",
  },
  PERGUNTA_NAO_RESPONDIDA: {
    title: "Pergunta do cliente ficou sem resposta",
    customerWanted: "O cliente fez uma pergunta e não recebeu retorno.",
    problem: "A conversa terminou com uma pergunta do cliente sem resposta da IA.",
    idealAnswer: "Responder a pergunta com base nas informações reais do restaurante e conduzir para o próximo passo.",
    learningRule: "Toda pergunta do cliente deve receber uma resposta; se a IA não souber, oferecer atendente em vez de silêncio.",
    salesImpact: "Pergunta sem resposta = venda perdida quase certa.",
    severity: "P1",
    suggestedAction: "CHAMAR_HUMANO",
  },
  OPORTUNIDADE_DE_VENDA_PERDIDA: {
    title: "Cliente quis pedir mas não fechou",
    customerWanted: "O cliente demonstrou intenção de pedido.",
    problem: "A conversa não evoluiu até o pedido, perdendo uma venda provável.",
    idealAnswer: "Conduzir ativamente: confirmar o item, oferecer fechar o pedido e remover dúvidas.",
    learningRule: "Diante de intenção de compra, conduzir para o fechamento em vez de só responder e parar.",
    salesImpact: "Recupera vendas que estavam quase fechadas.",
    severity: "P2",
    suggestedAction: "APROVAR_TREINAMENTO",
  },
};

/** Builds a manager-readable learning card from a detected issue. Pure. */
export function analyzeIssue(issue: DetectedIssue): LearningCard {
  const t = TEMPLATES[issue.kind];
  return {
    signature: issue.kind,
    title: t.title,
    customerWanted: t.customerWanted,
    agentAnswered: issue.agentReply,
    problem: t.problem,
    idealAnswer: t.idealAnswer,
    learningRule: t.learningRule,
    salesImpact: t.salesImpact,
    severity: t.severity,
    suggestedAction: t.suggestedAction,
  };
}

export interface QueuedLearning {
  card: LearningCard;
  /** How many conversations exhibited this exact learning in the window. */
  occurrences: number;
  /** Up to a few example conversation ids (internal, no PII). */
  exampleConversationIds: string[];
}

/**
 * Collapses many conversations' issues into a small queue of DISTINCT learnings
 * (one per signature), counting occurrences and keeping a few example ids.
 * This is the daily-routine dedup (PART 4): the manager sees one card per
 * problem type with "encontrado em N conversas", not 50 identical cards.
 */
export function buildLearningQueue(
  perConversation: { conversationId: string; issues: DetectedIssue[] }[],
): QueuedLearning[] {
  const bySignature = new Map<IssueKind, QueuedLearning>();

  for (const conv of perConversation) {
    // Within a single conversation, count each signature at most once so a
    // repeated issue in one thread does not inflate the cross-conversation count.
    const seenInConv = new Set<IssueKind>();
    for (const issue of conv.issues) {
      if (seenInConv.has(issue.kind)) continue;
      seenInConv.add(issue.kind);

      const existing = bySignature.get(issue.kind);
      if (existing) {
        existing.occurrences += 1;
        if (existing.exampleConversationIds.length < 5) {
          existing.exampleConversationIds.push(conv.conversationId);
        }
      } else {
        bySignature.set(issue.kind, {
          card: analyzeIssue(issue),
          occurrences: 1,
          exampleConversationIds: [conv.conversationId],
        });
      }
    }
  }

  // Most severe + most frequent first.
  const sevRank: Record<LearningSeverity, number> = { P0: 3, P1: 2, P2: 1 };
  return [...bySignature.values()].sort((a, b) => {
    const s = sevRank[b.card.severity] - sevRank[a.card.severity];
    return s !== 0 ? s : b.occurrences - a.occurrences;
  });
}
