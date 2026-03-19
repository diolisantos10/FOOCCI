/**
 * /api/chat-sim
 *
 * GET  — returns active category names for the UI chip bar.
 * POST — stateless AI endpoint. Receives full conversation history,
 *        loads menu + brand config, builds a two-phase system prompt,
 *        and returns a single OpenAI completion.
 *
 * No DB conversation / message records are created — purely a sandbox
 * for validating the guided-selling flow before connecting WhatsApp.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { openai } from "@/lib/openai";
import { ok, badRequest, unauthorized, serverError } from "@/lib/api-response";
import type OpenAI from "openai";

// ─── shared types ─────────────────────────────────────────────

interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatSimRequest {
  message: string;
  history: HistoryMessage[];
}

type MenuItem    = { name: string; price: unknown; description: string | null };
type MenuCategory = { name: string; description: string | null; items: MenuItem[] };

// ─── system prompt ────────────────────────────────────────────

function buildSystemPrompt(
  restaurantName: string,
  categories: MenuCategory[],
  emojiUsage: string
): string {
  const active = categories.filter((c) => c.items.length > 0);

  // Full menu — each category labelled, items with optional description
  const menuBlock = active
    .map((cat) => {
      const rows = cat.items
        .map((item) => {
          const price = `R$ ${Number(item.price).toFixed(2)}`;
          return item.description
            ? `  • ${item.name} — ${price} (${item.description})`
            : `  • ${item.name} — ${price}`;
        })
        .join("\n");
      return `[${cat.name.toUpperCase()}]\n${rows}`;
    })
    .join("\n\n");

  const categoryList = active.map((c) => c.name).join(", ");

  // Drink & dessert categories detected by name for Phase-2 upsell hints
  const drinkCat = active.find((c) =>
    ["bebidas", "drinks", "bebida"].some((k) => c.name.toLowerCase().includes(k))
  );
  const dessertCat = active.find((c) =>
    ["sobremesa", "sobremesas", "doce", "doces"].some((k) =>
      c.name.toLowerCase().includes(k)
    )
  );

  const drinkExample = drinkCat?.items[0]
    ? `${drinkCat.name} (ex: ${drinkCat.items[0].name} — R$ ${Number(drinkCat.items[0].price).toFixed(2)})`
    : null;
  const dessertExample = dessertCat?.items[0]
    ? `${dessertCat.name} (ex: ${dessertCat.items[0].name} — R$ ${Number(dessertCat.items[0].price).toFixed(2)})`
    : null;

  const emojiRule =
    emojiUsage === "none"    ? "NÃO use emojis." :
    emojiUsage === "minimal" ? "Máx. 1 emoji por mensagem." :
    emojiUsage === "expressive" ? "Use emojis livremente." :
    "Use 1–2 emojis por mensagem.";

  return `Você é o atendente de vendas do *${restaurantName}* no WhatsApp.
Missão: guiar o cliente pelo cardápio e fechar o pedido rapidamente.
${emojiRule}

━━━━━━━━━━━━━━━━━━━━━━━━━
CARDÁPIO COMPLETO
━━━━━━━━━━━━━━━━━━━━━━━━━
${menuBlock || "Cardápio temporariamente indisponível."}

━━━━━━━━━━━━━━━━━━━━━━━━━
FASE 1 — EXPLORAÇÃO GUIADA  (fase padrão)
━━━━━━━━━━━━━━━━━━━━━━━━━
Na SAUDAÇÃO (início da conversa):
  Diga em no máximo 2 linhas: cumprimento curto + lista as categorias disponíveis.
  Exemplo: "Olá! 😊 No *${restaurantName}* temos: ${categoryList}. Por onde quer começar?"
  PROIBIDO: "como posso ajudar?", "em que posso te ajudar?", perguntas abertas sem opção.

Quando o cliente PEDE UMA CATEGORIA (ex: "ver pizzas", "o que tem nas bebidas?"):
  → Liste TODOS os itens daquela categoria com preços.
  → Ao final pergunte apenas: "Quer pedir algo daqui ou ver outra categoria?"

Quando o cliente FAZ UM PEDIDO (ex: "quero uma calabresa", "me vê uma coca"):
  → Confirme o item em 1 linha. Ex: "Anotei! 🍕 Calabresa — R$ 44,90."
  → Pergunte em seguida: "Mais alguma coisa ou posso finalizar?"
  → NÃO faça upsell ainda nesta fase.

Permaneça na Fase 1 enquanto o cliente estiver explorando.

━━━━━━━━━━━━━━━━━━━━━━━━━
TRANSIÇÃO → FASE 2
━━━━━━━━━━━━━━━━━━━━━━━━━
Ative a Fase 2 IMEDIATAMENTE quando o cliente disser QUALQUER um destes:
"só isso" | "é isso" | "pode fechar" | "finalizar" | "já escolhi" |
"pode confirmar" | "tô bem" | "acabei" | "mais nada" | "isso mesmo"

━━━━━━━━━━━━━━━━━━━━━━━━━
FASE 2 — UPSELL INTELIGENTE
━━━━━━━━━━━━━━━━━━━━━━━━━
Ao entrar na Fase 2:
1. Leia o histórico e identifique quais categorias já têm itens pedidos.
2. Liste internamente as categorias SEM nenhum item no pedido.
3. Para a PRIMEIRA categoria ausente, ofereça brevemente:
   "Perfeito! Quer incluir algo de [categoria]? Temos [1–2 opções rápidas]."
   ${drinkExample   ? `Exemplo de bebida:  "Que tal uma ${drinkExample}?"` : ""}
   ${dessertExample ? `Exemplo de sobremesa: "Posso incluir um ${dessertExample}?"` : ""}
4. Se o cliente ACEITAR → anote o item, passe para a próxima categoria ausente.
5. Se o cliente RECUSAR (ex: "não", "tô bem", "só isso") → passe para a próxima categoria ausente, SEM insistir.
6. Ofereça UMA categoria de cada vez. Nunca duas ao mesmo tempo.
7. Quando todas as categorias ausentes forem cobertas ou recusadas:
   → Exiba o resumo do pedido: cada item com preço e quantidade.
   → Informe o total.
   → Pergunte: "Vai ser entrega ou retirada?"

━━━━━━━━━━━━━━━━━━━━━━━━━
REGRAS ABSOLUTAS
━━━━━━━━━━━━━━━━━━━━━━━━━
• NUNCA diga "como posso ajudar" ou qualquer variação.
• Fase 1: sem upsell — apenas explorar e anotar pedidos.
• Fase 2: UMA sugestão por vez, sem insistência.
• NUNCA invente itens, nomes ou preços fora do cardápio acima.
• Respostas CURTAS — máximo 6 linhas.
• Sempre em português brasileiro.`;
}

// ─── GET /api/chat-sim ────────────────────────────────────────
// Returns active category names so the UI can render category chips.

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const categories = await prisma.menuCategory.findMany({
      where: { restaurantId: ctx.restaurantId, isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { name: true },
    });

    return ok({ categories: categories.map((c) => c.name) });
  } catch (err) {
    console.error("[GET /api/chat-sim]", err);
    return serverError();
  }
}

// ─── POST /api/chat-sim ───────────────────────────────────────

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
    if (!message?.trim())       return badRequest("message is required.");
    if (!Array.isArray(history)) return badRequest("history must be an array.");

    // Load restaurant info, menu, and brand config in parallel
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
        select: { emojiUsage: true, aiModel: true, maxHistoryMessages: true },
      }),
    ]);

    const restaurantName = restaurant?.name ?? "Restaurante";
    const emojiUsage     = brandConfig?.emojiUsage        ?? "moderate";
    const aiModel        = brandConfig?.aiModel           ?? "gpt-4o-mini";
    const maxHistory     = brandConfig?.maxHistoryMessages ?? 20;

    const systemPrompt = buildSystemPrompt(restaurantName, categories, emojiUsage);

    const cappedHistory = history.slice(-maxHistory);

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...cappedHistory.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: message.trim() },
    ];

    const completion = await openai.chat.completions.create({
      model: aiModel,
      messages,
      max_tokens: 400,
      temperature: 0.3, // tight = consistent phase discipline
    });

    const reply =
      completion.choices[0]?.message?.content?.trim() ??
      "Desculpe, não consegui processar sua mensagem. 😅";

    return ok({ reply });
  } catch (err) {
    console.error("[POST /api/chat-sim]", err);
    return serverError("Erro interno ao processar mensagem.");
  }
}
