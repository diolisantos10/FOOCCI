/**
 * FaqMiner — turns resolved support conversations into FAQ proposals.
 *
 * Reads RESOLVED help threads that got a human (SUPPORT) answer, asks the
 * model to extract generalizable Q&As, and files each one as a PENDING
 * OperationalManualChangeRequest — so the team approves (or rejects) them in
 * /admin/manual-operacional → Solicitações before anything reaches the manual.
 * Nothing is ever published automatically.
 */

import { prisma } from "@/lib/prisma";
import { selectEngineRouted } from "@/services/brain/engines/AIEngineRouter";
import { callStructuredJson } from "@/services/brain/engines/OpenAIEngineAdapter";

interface FaqEntry {
  question: string;
  answer: string;
}

export interface FaqMineResult {
  threadsScanned: number;
  faqsExtracted: number;
  proposed: number;
  skippedDuplicates: number;
}

const MAX_THREADS = 20;
const MAX_TRANSCRIPT_CHARS = 900;

export async function mineFaqFromSupport(days = 30): Promise<FaqMineResult> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const threads = await prisma.helpThread.findMany({
    where: { status: "RESOLVED", updatedAt: { gte: since } },
    orderBy: { updatedAt: "desc" },
    take: MAX_THREADS,
    include: {
      messages: { orderBy: { createdAt: "asc" }, select: { role: true, content: true } },
    },
  });

  // Only conversations where the Foocci team actually answered.
  const withSupport = threads.filter((t) =>
    t.messages.some((m) => m.role === "SUPPORT"),
  );

  const result: FaqMineResult = {
    threadsScanned: withSupport.length,
    faqsExtracted: 0,
    proposed: 0,
    skippedDuplicates: 0,
  };
  if (withSupport.length === 0) return result;

  const transcripts = withSupport
    .map((t, i) => {
      const lines = t.messages
        .filter((m) => m.role === "USER" || m.role === "SUPPORT")
        .map((m) => `${m.role === "USER" ? "Lojista" : "Equipe"}: ${m.content}`)
        .join("\n");
      return `### Conversa ${i + 1}\n${lines.slice(0, MAX_TRANSCRIPT_CHARS)}`;
    })
    .join("\n\n");

  let faqs: FaqEntry[] = [];
  try {
    const selection = await selectEngineRouted("whatsapp", { taskProfile: "GENERATE" });
    const raw = await callStructuredJson({
      selection,
      systemPrompt: [
        "Você extrai FAQs de conversas de suporte do Foocci (plataforma para restaurantes).",
        'Responda APENAS JSON no formato {"faqs":[{"question":"...","answer":"..."}]}.',
        "Regras: só inclua dúvidas GENERALIZÁVEIS (úteis para qualquer restaurante); reescreva a resposta da equipe em tom simples e direto, em PT-BR; NUNCA inclua nomes, telefones ou dados de um restaurante específico; se nada for generalizável, retorne {\"faqs\":[]}.",
      ].join("\n"),
      userContent: transcripts,
      temperature: 0.2,
      maxTokens: 1500,
      responseFormat: "json",
    });
    const parsed = JSON.parse(raw) as { faqs?: FaqEntry[] };
    faqs = (parsed.faqs ?? []).filter(
      (f) => f?.question?.trim() && f?.answer?.trim(),
    );
  } catch (err) {
    console.error("[FaqMiner] OpenAI/parse error:", err);
    return result;
  }

  result.faqsExtracted = faqs.length;

  for (const faq of faqs.slice(0, 15)) {
    const title = `FAQ: ${faq.question.trim()}`.slice(0, 200);
    const existing = await prisma.operationalManualChangeRequest.findFirst({
      where: { title },
      select: { id: true },
    });
    if (existing) {
      result.skippedDuplicates++;
      continue;
    }
    await prisma.operationalManualChangeRequest.create({
      data: {
        title,
        proposedContent: `## ${faq.question.trim()}\n\n${faq.answer.trim()}`,
        reason:
          "Gerado automaticamente a partir de conversas de suporte resolvidas (FaqMiner). Aprovar publica no manual.",
        impactAreas: "GENERAL",
        sourceType: "CHATGPT",
        createdBy: "faq-miner",
      },
    });
    result.proposed++;
  }

  return result;
}
