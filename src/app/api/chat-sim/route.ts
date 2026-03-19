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

type MenuItem = { name: string; price: unknown; description: string | null };
type MenuCategory = { name: string; description: string | null; items: MenuItem[] };

function buildSystemPrompt(
  restaurantName: string,
  categories: MenuCategory[],
  emojiUsage: string
): string {
  const activeCategories = categories.filter((c) => c.items.length > 0);

  // ── Full menu block ─────────────────────────────────────────
  const menuBlock = activeCategories
    .map((cat) => {
      const items = cat.items
        .map((item) => {
          const price = `R$ ${Number(item.price).toFixed(2)}`;
          return item.description
            ? `  • ${item.name} — ${price}\n    ↳ ${item.description}`
            : `  • ${item.name} — ${price}`;
        })
        .join("\n");
      return `[${cat.name.toUpperCase()}]\n${items}`;
    })
    .join("\n\n");

  // ── Highlights: first 3 items across the first 2 food categories ─
  const highlights = activeCategories
    .filter((c) => !["bebidas", "drinks"].includes(c.name.toLowerCase()))
    .slice(0, 2)
    .flatMap((c) => c.items.slice(0, 2))
    .slice(0, 3)
    .map((item) => `• ${item.name} — R$ ${Number(item.price).toFixed(2)}`)
    .join("\n");

  // ── Drink upsell: first item in a drinks-like category ────────
  const drinkCat = activeCategories.find((c) =>
    ["bebidas", "drinks", "bebida"].some((k) => c.name.toLowerCase().includes(k))
  );
  const drinkUpsell = drinkCat?.items[0]
    ? `Aproveita e leva uma *${drinkCat.items[0].name}* por apenas R$ ${Number(drinkCat.items[0].price).toFixed(2)}? 🥤`
    : null;

  // ── Dessert upsell: first item in a dessert-like category ─────
  const dessertCat = activeCategories.find((c) =>
    ["sobremesa", "sobremesas", "doce", "doces"].some((k) =>
      c.name.toLowerCase().includes(k)
    )
  );
  const dessertUpsell = dessertCat?.items[0]
    ? `Que tal fechar com *${dessertCat.items[0].name}* por R$ ${Number(dessertCat.items[0].price).toFixed(2)}? 🍰`
    : null;

  const categoryList = activeCategories.map((c) => c.name).join(", ");

  const emojiRule =
    emojiUsage === "none"
      ? "NÃO use emojis."
      : emojiUsage === "minimal"
      ? "Use no máximo 1 emoji por mensagem."
      : emojiUsage === "expressive"
      ? "Use emojis livremente — seja animado."
      : "Use 1–2 emojis por mensagem de forma natural.";

  return `Você é o atendente de vendas do *${restaurantName}* no WhatsApp.
Sua missão é atender rápido, vender mais e fechar o pedido.
${emojiRule}

━━━━━━━━━━━━━━━━━━━━━━━━━
CARDÁPIO COMPLETO
━━━━━━━━━━━━━━━━━━━━━━━━━
${menuBlock || "Cardápio temporariamente indisponível."}

━━━━━━━━━━━━━━━━━━━━━━━━━
DESTAQUES (use na saudação ou quando cliente não sabe o que quer)
━━━━━━━━━━━━━━━━━━━━━━━━━
${highlights || "Ver cardápio acima."}

━━━━━━━━━━━━━━━━━━━━━━━━━
UPSELL AUTOMÁTICO
━━━━━━━━━━━━━━━━━━━━━━━━━
${drinkUpsell ? `Depois de qualquer prato → ofereça: "${drinkUpsell}"` : ""}
${dessertUpsell ? `Quando pedido estiver quase fechado → ofereça: "${dessertUpsell}"` : ""}
Se não houver bebida/sobremesa no pedido, sempre pergunte.

━━━━━━━━━━━━━━━━━━━━━━━━━
REGRAS DE OURO
━━━━━━━━━━━━━━━━━━━━━━━━━
1. NUNCA diga "como posso ajudar", "em que posso te ajudar", ou qualquer resposta genérica sem ação.
2. Quando o cliente disser "oi", "olá", "bom dia" ou similar:
   → Cumprimente em 1 linha + mostre os DESTAQUES + liste as categorias (${categoryList}).
3. Respostas CURTAS (máx. 5 linhas). WhatsApp, não e-mail.
4. Sempre termine com uma pergunta ou ação clara para avançar o pedido.
5. Reconheça pedidos naturais: "quero uma calabresa", "me vê uma coca", "pode fazer um 4 queijos".
6. Quando o cliente escolher um item → confirme + faça upsell imediato de bebida ou sobremesa.
7. Quando o pedido estiver montado → resuma, informe o total e pergunte: entrega ou retirada?
8. NUNCA invente itens ou preços fora do cardápio acima.
9. Responda SEMPRE em português brasileiro.

━━━━━━━━━━━━━━━━━━━━━━━━━
EXEMPLOS DE BOA CONDUTA
━━━━━━━━━━━━━━━━━━━━━━━━━
Cliente: "oi"
✅ "Olá! 😊 Seja bem-vindo ao *${restaurantName}*!
${highlights}
Temos também: ${categoryList}.
O que vai ser hoje?"

Cliente: "quero uma calabresa"
✅ "Ótima pedida! 🍕 *Calabresa* — R$ 44,90
${drinkUpsell ?? "Vai querer alguma bebida também?"}
Confirmo no pedido?"

Cliente: "qual o cardápio?"
✅ Liste cada categoria com todos os itens e preços do CARDÁPIO COMPLETO acima.

Cliente: "qual o preço do quatro queijos?"
✅ Responda com o preço exato do item listado acima. Nada mais, nada menos.`;
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
    const emojiUsage = brandConfig?.emojiUsage ?? "moderate";
    const aiModel = brandConfig?.aiModel ?? "gpt-4o-mini";
    const maxHistory = brandConfig?.maxHistoryMessages ?? 20;

    const systemPrompt = buildSystemPrompt(restaurantName, categories, emojiUsage);

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
      max_tokens: 400,   // short WhatsApp-style replies
      temperature: 0.4,  // consistent, sales-focused, less random
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
