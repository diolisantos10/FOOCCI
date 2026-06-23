import { NextResponse } from "next/server";
import { getModule, roman } from "@/lib/ancord/modules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────────────
// Tutor de IA da prova ANCORD.
//
// Provider flexível (via fetch, sem SDK novo):
//   1) ANTHROPIC_API_KEY  → Claude (preferido)
//   2) OPENAI_API_KEY     → OpenAI (já configurado neste projeto)
//   3) nenhum             → resposta "offline" amigável (app continua útil)
//
// O tutor é ancorado nos resumos já validados de cada capítulo para reduzir
// alucinação em pontos sensíveis de legislação.
// ─────────────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_BASE = [
  "Você é um tutor especialista na prova ANCORD (certificação de Assessor de Investimento, ex-AAI, no Brasil).",
  "Seu aluno tem TDAH. Por isso: explique CURTO e DIRETO, uma ideia por vez, com analogias simples do dia a dia, tom encorajador e leve.",
  "Foque no que realmente cai na prova. Quando ajudar, dê macetes/mnemônicos e termine com uma frase-resumo em negrito.",
  "Se pedirem questões, gere de múltipla escolha com 4 alternativas (A-D), indicando o gabarito e uma explicação curta.",
  "Responda SEMPRE em português do Brasil. Se a conversa fugir do escopo da prova, traga de volta com gentileza.",
  "NUNCA invente números, alíquotas, prazos ou valores. Se não tiver certeza de um dado específico, diga que vale confirmar na apostila/edital.",
].join(" ");

function buildSystem(moduleId?: number): string {
  if (!moduleId) return SYSTEM_BASE;
  const m = getModule(moduleId);
  if (!m) return SYSTEM_BASE;
  return [
    SYSTEM_BASE,
    `\n\nContexto: o aluno está estudando o Capítulo ${roman(m.id)} — ${m.title}.`,
    `Tópicos: ${m.topics.join("; ")}.`,
    `Resumo de referência (use como base confiável): ${m.summary}`,
  ].join(" ");
}

async function callAnthropic(system: string, messages: ChatMessage[]): Promise<string> {
  const model = process.env.ANCORD_TUTOR_MODEL || "claude-sonnet-4-6";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY as string,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model, max_tokens: 1024, system, messages }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}`);
  const data = await res.json();
  const text = Array.isArray(data?.content)
    ? data.content.filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("\n")
    : "";
  return text || "Desculpe, não consegui formular a resposta agora.";
}

async function callOpenAI(system: string, messages: ChatMessage[]): Promise<string> {
  const model = process.env.ANCORD_TUTOR_MODEL_OPENAI || "gpt-4o-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY as string}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      temperature: 0.4,
      messages: [{ role: "system", content: system }, ...messages],
    }),
  });
  if (!res.ok) throw new Error(`openai ${res.status}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || "Desculpe, não consegui formular a resposta agora.";
}

const OFFLINE_REPLY =
  "🤖 O tutor de IA ainda não está conectado. Para ativá-lo, configure uma chave de API no servidor " +
  "(ANTHROPIC_API_KEY para usar o Claude, ou OPENAI_API_KEY). " +
  "Enquanto isso, todo o resto do app — questões, simulados e flashcards com explicações — funciona normalmente. 💪";

export async function POST(req: Request) {
  let body: { messages?: ChatMessage[]; moduleId?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ reply: "Requisição inválida." }, { status: 400 });
  }

  const raw = Array.isArray(body.messages) ? body.messages : [];
  // Sanitiza e limita o histórico (anti-abuso e custo).
  const messages: ChatMessage[] = raw
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }))
    .slice(-12);

  if (messages.length === 0) {
    return NextResponse.json({ reply: "Mande sua dúvida que eu te ajudo. 😊" });
  }

  const system = buildSystem(body.moduleId);

  try {
    if (process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ reply: await callAnthropic(system, messages), provider: "claude" });
    }
    if (process.env.OPENAI_API_KEY) {
      return NextResponse.json({ reply: await callOpenAI(system, messages), provider: "openai" });
    }
    return NextResponse.json({ reply: OFFLINE_REPLY, offline: true });
  } catch {
    return NextResponse.json({
      reply: "Tive um problema para responder agora. Tente de novo em instantes. 🙏",
      error: true,
    });
  }
}
