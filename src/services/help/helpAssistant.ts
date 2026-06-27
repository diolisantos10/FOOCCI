/**
 * Help assistant — answers lojista questions grounded on the Operational Manual.
 *
 * Mirrors the project's OpenAI usage (shared client in @/lib/openai, gpt-4o-mini,
 * try/catch with a graceful fallback). The system prompt is strict: answer ONLY
 * from the retrieved manual excerpts and, when the answer isn't there, tell the
 * user honestly and point them at "Falar com a FOOD" (human, last resort).
 */

import { openai } from "@/lib/openai";
import {
  retrieveRelevantChapters,
  buildManualContext,
  type RetrievedChapter,
} from "./manualRetrieval";

export interface HelpHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface HelpAnswer {
  answer: string;
  sources: Array<{ slug: string; title: string }>;
  grounded: boolean;
}

const MODEL = "gpt-4o-mini";

const FALLBACK =
  "Não consegui acessar o assistente agora. Tente de novo em instantes — ou toque em “Falar com a FOOD” para falar direto com a nossa equipe.";

function buildSystemPrompt(context: string, restaurantName?: string): string {
  const who = restaurantName ? ` do restaurante ${restaurantName}` : "";
  return [
    `Você é o assistente do Foocci, a plataforma que ajuda o dono${who} a operar o restaurante: cardápio, pedidos, atendimento no WhatsApp, CRM, pagamentos e integrações.`,
    "Responda SEMPRE em português do Brasil, de forma curta, acolhedora e prática. Quando fizer sentido, dê um passo a passo numerado.",
    "Use SOMENTE as informações do MANUAL abaixo. Nunca invente telas, botões, menus, preços ou funcionalidades que não estejam no manual.",
    'Se a resposta não estiver no manual, seja honesto: diga que não tem essa informação por aqui e oriente a pessoa a tocar em "Falar com a FOOD" para falar com a equipe Foocci.',
    "Não cite trechos pelo número nem diga \"segundo o manual\"; apenas responda com naturalidade.",
    "",
    context
      ? `MANUAL (trechos relevantes):\n${context}`
      : "MANUAL: nenhum trecho relevante foi encontrado para esta pergunta.",
  ].join("\n");
}

/**
 * Answer a single help question. Always grounded: retrieves manual chapters,
 * builds the context block, and constrains the model to it.
 */
export async function answerHelpQuestion(params: {
  question: string;
  history?: HelpHistoryMessage[];
  restaurantName?: string;
}): Promise<HelpAnswer> {
  const { question, history = [], restaurantName } = params;

  let chapters: RetrievedChapter[] = [];
  try {
    chapters = await retrieveRelevantChapters(question, 4);
  } catch (err) {
    console.error("[helpAssistant] retrieval error:", err);
  }

  const context = buildManualContext(chapters);
  const sources = chapters.map((c) => ({ slug: c.slug, title: c.title }));

  const messages = [
    { role: "system" as const, content: buildSystemPrompt(context, restaurantName) },
    ...history.slice(-6).map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: question },
  ];

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.2,
      max_tokens: 600,
      messages,
    });
    const answer = (completion.choices[0]?.message?.content ?? "").trim();
    return {
      answer: answer || FALLBACK,
      sources,
      grounded: chapters.length > 0,
    };
  } catch (err) {
    console.error("[helpAssistant] OpenAI error:", err);
    return { answer: FALLBACK, sources, grounded: false };
  }
}
