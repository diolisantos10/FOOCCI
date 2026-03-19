/**
 * POST /api/chat-sim
 *
 * Stateless endpoint that powers the in-app chat simulation.
 * Receives the full conversation history on each request (client holds state),
 * loads the restaurant menu + brand config, builds a system prompt, and
 * returns a single OpenAI completion.
 *
 * No DB conversation / message records are created — this is purely a
 * validation sandbox for testing the AI ordering flow before connecting
 * a real WhatsApp number.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { openai } from "@/lib/openai";
import { ok, badRequest, unauthorized, serverError } from "@/lib/api-response";
import type OpenAI from "openai";

interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatSimRequest {
  message: string;
  history: HistoryMessage[];
}

function buildSystemPrompt(
  restaurantName: string,
  categories: Array<{
    name: string;
    description: string | null;
    items: Array<{ name: string; price: unknown; description: string | null }>;
  }>,
  tone: string,
  emojiUsage: string
): string {
  const menuLines = categories
    .filter((c) => c.items.length > 0)
    .map((cat) => {
      const header = cat.description
        ? `📂 ${cat.name} — ${cat.description}`
        : `📂 ${cat.name}`;
      const items = cat.items
        .map(
          (item) =>
            `  • ${item.name} — R$ ${Number(item.price).toFixed(2)}` +
            (item.description ? `\n    ${item.description}` : "")
        )
        .join("\n");
      return `${header}\n${items}`;
    })
    .join("\n\n");

  const toneDesc =
    tone === "professional"
      ? "profissional e cortês"
      : tone === "casual"
      ? "descontraído e informal"
      : "amigável e acolhedor";

  const emojiRule =
    emojiUsage === "none"
      ? "Não use emojis."
      : emojiUsage === "expressive"
      ? "Use emojis com frequência para tornar a conversa animada."
      : emojiUsage === "minimal"
      ? "Use emojis raramente, apenas quando muito adequado."
      : "Use emojis moderadamente para tornar a conversa mais agradável.";

  return `Você é o assistente virtual do *${restaurantName}*, atendendo clientes pelo WhatsApp.
Seu tom deve ser ${toneDesc}. ${emojiRule}

---

## CARDÁPIO COMPLETO

${menuLines || "Cardápio não disponível no momento."}

---

## INSTRUÇÕES

- Cumprimente o cliente com simpatia quando iniciar a conversa.
- Quando o cliente pedir o cardápio, apresente as categorias e itens de forma organizada.
- Ajude o cliente a escolher itens; responda dúvidas sobre ingredientes e descrições.
- Informe os preços com exatidão — use apenas os valores listados acima.
- Quando o cliente escolher os itens, resuma o pedido e pergunte sobre entrega ou retirada.
- Se o pedido for confirmado, agradeça e informe que está sendo processado.
- Se a pergunta for fora do escopo (reclamações, suporte técnico, etc.), ofereça transferir para um atendente humano.
- Nunca invente itens ou preços que não estão no cardápio acima.
- Responda sempre em português brasileiro.

⚠️ AMBIENTE DE SIMULAÇÃO: Esta é uma conversa de teste para validar o fluxo de atendimento.`;
}

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    let body: ChatSimRequest;
    try {
      body = await req.json();
    } catch {
      return badRequest("Invalid JSON body.");
    }

    const { message, history } = body;
    if (!message?.trim()) return badRequest("message is required.");
    if (!Array.isArray(history)) return badRequest("history must be an array.");

    // Load restaurant info, active menu, and brand config in parallel
    const [restaurant, categories, brandConfig] = await Promise.all([
      prisma.restaurant.findUnique({
        where: { id: ctx.restaurantId },
        select: { name: true },
      }),
      prisma.menuCategory.findMany({
        where: { restaurantId: ctx.restaurantId, isActive: true },
        orderBy: { sortOrder: "asc" },
        include: {
          items: {
            where: { isActive: true },
            orderBy: { sortOrder: "asc" },
            select: { name: true, price: true, description: true },
          },
        },
      }),
      prisma.restaurantBrandConfig.findUnique({
        where: { restaurantId: ctx.restaurantId },
        select: {
          tone: true,
          emojiUsage: true,
          aiModel: true,
          maxHistoryMessages: true,
        },
      }),
    ]);

    const restaurantName = restaurant?.name ?? "Restaurante";
    const tone = brandConfig?.tone ?? "friendly";
    const emojiUsage = brandConfig?.emojiUsage ?? "moderate";
    const aiModel = brandConfig?.aiModel ?? "gpt-4o-mini";
    const maxHistory = brandConfig?.maxHistoryMessages ?? 20;

    const systemPrompt = buildSystemPrompt(
      restaurantName,
      categories,
      tone,
      emojiUsage
    );

    // Cap history to avoid token bloat
    const cappedHistory = history.slice(-maxHistory);

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...cappedHistory.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: message.trim() },
    ];

    const completion = await openai.chat.completions.create({
      model: aiModel,
      messages,
      max_tokens: 600,
      temperature: 0.7,
    });

    const reply =
      completion.choices[0]?.message?.content?.trim() ??
      "Desculpe, não consegui processar sua mensagem no momento. 😅";

    return ok({ reply });
  } catch (err) {
    console.error("[POST /api/chat-sim]", err);
    return serverError("Erro interno ao processar mensagem.");
  }
}
