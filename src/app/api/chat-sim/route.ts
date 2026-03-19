/**
 * /api/chat-sim
 *
 * GET  — returns full active menu (categories + items + prices) for the UI.
 * POST — stateless two-phase AI endpoint.
 *        Receives conversation history + current cart from the client,
 *        builds a cart-aware system prompt, and returns a single completion.
 *
 * Cart context in the prompt lets the AI:
 *  • Know exactly what the customer already ordered (never re-suggest)
 *  • In Phase 2, identify which categories still need upsell
 *  • Show an accurate running total on demand
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { openai } from "@/lib/openai";
import { ok, badRequest, unauthorized, serverError } from "@/lib/api-response";
import type OpenAI from "openai";

// ─── types ────────────────────────────────────────────────────

interface HistoryEntry {
  role: "user" | "assistant";
  content: string;
}

interface CartItem {
  name: string;
  price: number; // number, not Decimal
  qty: number;
}

interface ChatSimRequest {
  message: string;
  history: HistoryEntry[];
  cart?: CartItem[];
}

type DbMenuItem = { name: string; price: unknown; description: string | null };
type DbCategory  = { name: string; description: string | null; items: DbMenuItem[] };

// ─── system prompt ────────────────────────────────────────────

function buildSystemPrompt(
  restaurantName: string,
  categories: DbCategory[],
  emojiUsage: string,
  cart: CartItem[]
): string {
  const active = categories.filter((c) => c.items.length > 0);

  // ── Full menu block ────────────────────────────────────────
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

  const categoryList = active.map((c) => `"${c.name}"`).join(", ");

  // ── Cart context ───────────────────────────────────────────
  let cartBlock: string;
  let categoriesWithItems: string[] = [];
  let categoriesWithout: string[] = [];

  if (cart.length === 0) {
    cartBlock = "PEDIDO ATUAL: Nenhum item adicionado ainda.";
    categoriesWithout = active.map((c) => c.name);
  } else {
    const cartNames = new Set(cart.map((c) => c.name));

    categoriesWithItems = active
      .filter((cat) => cat.items.some((i) => cartNames.has(i.name)))
      .map((c) => c.name);

    categoriesWithout = active
      .filter((cat) => !cat.items.some((i) => cartNames.has(i.name)))
      .map((c) => c.name);

    const cartLines = cart
      .map((i) => `  • ${i.name} × ${i.qty} — R$ ${(i.price * i.qty).toFixed(2)}`)
      .join("\n");
    const total = cart.reduce((s, i) => s + i.price * i.qty, 0);

    cartBlock = [
      `PEDIDO ATUAL:`,
      cartLines,
      `Total parcial: R$ ${total.toFixed(2)}`,
      `Categorias COM itens: ${categoriesWithItems.join(", ") || "nenhuma"}`,
      `Categorias SEM itens: ${categoriesWithout.join(", ") || "nenhuma — pedido completo!"}`,
    ].join("\n");
  }

  // ── Upsell hints for Phase 2 ───────────────────────────────
  const upsellHints = categoriesWithout
    .map((name) => {
      const cat = active.find((c) => c.name === name);
      const examples = cat?.items
        .slice(0, 2)
        .map((i) => `${i.name} (R$ ${Number(i.price).toFixed(2)})`)
        .join(", ");
      return examples ? `  → ${name}: ex. ${examples}` : `  → ${name}`;
    })
    .join("\n");

  const emojiRule =
    emojiUsage === "none"       ? "NÃO use emojis." :
    emojiUsage === "minimal"    ? "Máx. 1 emoji por mensagem." :
    emojiUsage === "expressive" ? "Use emojis livremente." :
    "Use 1–2 emojis por mensagem.";

  return `Você é o atendente de vendas do *${restaurantName}* no WhatsApp.
Missão: guiar o cliente pelo cardápio, etapa por etapa, e fechar o pedido.
${emojiRule}

━━━━━━━━━━━━━━━━━━━━━━━━━
CARDÁPIO COMPLETO
━━━━━━━━━━━━━━━━━━━━━━━━━
${menuBlock || "Cardápio temporariamente indisponível."}

━━━━━━━━━━━━━━━━━━━━━━━━━
${cartBlock}
━━━━━━━━━━━━━━━━━━━━━━━━━

━━━━━━━━━━━━━━━━━━━━━━━━━
FASE 1 — EXPLORAÇÃO GUIADA  ← fase padrão
━━━━━━━━━━━━━━━━━━━━━━━━━
SAUDAÇÃO (primeira mensagem da conversa):
  Em 1–2 linhas: cumprimento + ofereça as categorias como opções explícitas.
  Modelo: "Olá! 😊 Temos ${categoryList}. Por onde quer começar?"
  PROIBIDO: "Como posso ajudar?", "Em que posso te ajudar?", ou qualquer pergunta aberta sem opções.

Quando cliente pede uma CATEGORIA (ex: "ver pizzas"):
  → Liste TODOS os itens daquela categoria com preços do cardápio acima.
  → Ao final: "Quer pedir algo daqui ou ver outra categoria?"

Quando cliente PEDE UM ITEM (ex: "quero uma calabresa", "me vê uma coca"):
  → Confirme em 1 linha: "✅ Anotei! [Item] — R$ X,XX"
  → Pergunte: "Mais alguma coisa? Temos também: ${categoryList.split(",").slice(0, 2).join(",")}, etc."
  → NÃO faça upsell nesta fase — apenas colete e confirme itens.

Permaneça na Fase 1 enquanto o cliente estiver explorando.

━━━━━━━━━━━━━━━━━━━━━━━━━
TRANSIÇÃO → FASE 2
━━━━━━━━━━━━━━━━━━━━━━━━━
Ative Fase 2 IMEDIATAMENTE quando cliente disser qualquer um destes:
"só isso" | "é isso" | "pode fechar" | "finalizar" | "já escolhi" |
"pode confirmar" | "tô bem" | "acabei" | "mais nada" | "isso mesmo" | "pode ir"

━━━━━━━━━━━━━━━━━━━━━━━━━
FASE 2 — UPSELL INTELIGENTE
━━━━━━━━━━━━━━━━━━━━━━━━━
Ao entrar na Fase 2, use o PEDIDO ATUAL acima para saber o que já foi escolhido.

${categoriesWithout.length > 0 ? `Categorias SEM itens no pedido (ofereça nesta ordem):
${upsellHints}

Regras:
1. Ofereça a PRIMEIRA categoria sem itens com 2 opções concretas do cardápio.
   Modelo: "Perfeito! 😊 Quer incluir uma *[Categoria]*? Temos *[Opção1]* (R$ X) ou *[Opção2]* (R$ X)."
2. Se cliente ACEITAR → confirme o item, passe para próxima categoria ausente.
3. Se cliente RECUSAR (qualquer forma de "não") → passe para próxima categoria SEM insistir.
4. Ofereça UMA categoria por vez. Nunca duas ao mesmo tempo.
5. Quando todas as categorias forem cobertas ou recusadas:
   → Liste todos os itens do PEDIDO ATUAL com preços e total.
   → Pergunte: "Vai ser entrega ou retirada?"` :
`Todas as categorias já têm itens no pedido!
→ Liste o PEDIDO ATUAL completo com total.
→ Pergunte: "Vai ser entrega ou retirada?"`}

━━━━━━━━━━━━━━━━━━━━━━━━━
REGRAS ABSOLUTAS
━━━━━━━━━━━━━━━━━━━━━━━━━
• NUNCA diga "como posso ajudar" ou qualquer variação.
• Fase 1: guie e colete — sem upsell.
• Fase 2: UMA categoria por vez, sem insistir.
• NUNCA invente itens ou preços fora do cardápio acima.
• Respostas CURTAS: máx. 5 linhas.
• Sempre em português brasileiro.`;
}

// ─── GET /api/chat-sim ────────────────────────────────────────
// Returns full menu so the UI can render contextual chips.

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const categories = await prisma.menuCategory.findMany({
      where: { restaurantId: ctx.restaurantId, isActive: true },
      orderBy: { sortOrder: "asc" },
      include: {
        items: {
          where: { isActive: true },
          orderBy: { sortOrder: "asc" },
          select: { name: true, price: true, description: true },
        },
      },
    });

    return ok({
      categories: categories.map((c) => ({
        name: c.name,
        items: c.items.map((i) => ({
          name: i.name,
          price: Number(i.price),
          description: i.description,
        })),
      })),
    });
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

    const { message, history, cart = [] } = body;
    if (!message?.trim())        return badRequest("message is required.");
    if (!Array.isArray(history)) return badRequest("history must be an array.");

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
    const emojiUsage     = brandConfig?.emojiUsage         ?? "moderate";
    const aiModel        = brandConfig?.aiModel            ?? "gpt-4o-mini";
    const maxHistory     = brandConfig?.maxHistoryMessages ?? 20;

    const systemPrompt = buildSystemPrompt(
      restaurantName,
      categories,
      emojiUsage,
      cart
    );

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
      temperature: 0.3,
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
