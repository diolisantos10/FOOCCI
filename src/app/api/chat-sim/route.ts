/**
 * /api/chat-sim
 *
 * GET  — full active menu with imageUrl at category + item level.
 * POST — guided ordering AI endpoint. Cart-aware, phase-aware, promo-aware.
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
  price: number;
  qty: number;
}

interface PromoContext {
  title: string;
  bundlePrice: number;
  savings: number;
}

interface ChatSimRequest {
  message: string;
  history: HistoryEntry[];
  cart?: CartItem[];
  visitedCategories?: string[];
  promo?: PromoContext | null;
}

type DbMenuItem = { name: string; price: unknown; description: string | null; imageUrl: string | null };
type DbCategory  = { name: string; description: string | null; imageUrl: string | null; items: DbMenuItem[] };

// ─── emoji map ────────────────────────────────────────────────

function categoryEmoji(name: string): string {
  const n = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (n.includes("pizza"))                             return "🍕";
  if (n.includes("bebida") || n.includes("drink"))     return "🥤";
  if (n.includes("sobremesa") || n.includes("doce"))   return "🍰";
  if (n.includes("lanche") || n.includes("burger"))    return "🍔";
  if (n.includes("entrada") || n.includes("porcao"))   return "🥗";
  return "🍽️";
}

// ─── system prompt ────────────────────────────────────────────

function buildSystemPrompt(
  restaurantName: string,
  categories: DbCategory[],
  emojiUsage: string,
  cart: CartItem[],
  visitedCategories: string[],
  promo: PromoContext | null
): string {
  const active = categories.filter((c) => c.items.length > 0);

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

  const cartNames = new Set(cart.map((c) => c.name));

  const categoriesWithItems = active
    .filter((cat) => cat.items.some((i) => cartNames.has(i.name)))
    .map((c) => c.name);

  const categoriesWithout = active
    .filter((cat) => !cat.items.some((i) => cartNames.has(i.name)))
    .map((c) => c.name);

  let cartBlock: string;
  if (cart.length === 0) {
    cartBlock = "PEDIDO ATUAL: Nenhum item adicionado ainda.";
  } else {
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

  const remainingOptionsBlock = categoriesWithout.length > 0
    ? categoriesWithout.map((n) => `  ${categoryEmoji(n)} ${n}`).join("\n") + "\n  ✅ Finalizar pedido"
    : "  ✅ Finalizar pedido";

  const upsellHints = categoriesWithout
    .map((name) => {
      const cat = active.find((c) => c.name === name);
      const examples = cat?.items
        .slice(0, 2)
        .map((i) => `*${i.name}* (R$ ${Number(i.price).toFixed(2)})`)
        .join(" ou ");
      return examples ? `  → ${categoryEmoji(name)} ${name}: ${examples}` : `  → ${categoryEmoji(name)} ${name}`;
    })
    .join("\n");

  const emojiRule =
    emojiUsage === "none"       ? "NÃO use emojis." :
    emojiUsage === "minimal"    ? "Máx. 1 emoji por mensagem." :
    emojiUsage === "expressive" ? "Use emojis livremente." :
    "Use 1–2 emojis por mensagem.";

  const visitedNote = visitedCategories.length > 0
    ? `\nCategorias já exploradas: ${visitedCategories.join(", ")}.` : "";

  const promoBlock = promo
    ? `\n━━━━━━━━━━━━━━━━━━━━━━━━━
PROMOÇÃO ATIVA
━━━━━━━━━━━━━━━━━━━━━━━━━
O cliente acabou de ver uma promoção: "${promo.title}" por R$ ${promo.bundlePrice.toFixed(2)} (economia de R$ ${promo.savings.toFixed(2)}).
Se o cliente aceitar: confirme o item adicionado e prossiga para resumo + "Entrega ou retirada?".
Se o cliente recusar: siga direto para resumo + "Entrega ou retirada?".`
    : "";

  const firstMissingCat = categoriesWithout[0];
  const firstMissingExamples = firstMissingCat
    ? active.find((c) => c.name === firstMissingCat)?.items
        .slice(0, 2)
        .map((i) => `${categoryEmoji(firstMissingCat)} ${i.name} — R$ ${Number(i.price).toFixed(2)}`)
        .join("\n  ") ?? ""
    : "";

  return `Você é o sistema de pedidos do *${restaurantName}* no WhatsApp.
Missão: guiar o cliente etapa por etapa, maximizar o ticket, fechar o pedido.
${emojiRule}
REGRA MÁXIMA: NUNCA faça pergunta aberta sem opções. Nunca diga "Como posso ajudar?", "Quer mais algo?", "Deseja bebida?".
SEMPRE termine com opções concretas para o cliente escolher.
${visitedNote}

━━━━━━━━━━━━━━━━━━━━━━━━━
CARDÁPIO COMPLETO
━━━━━━━━━━━━━━━━━━━━━━━━━
${menuBlock || "Cardápio temporariamente indisponível."}

━━━━━━━━━━━━━━━━━━━━━━━━━
${cartBlock}
━━━━━━━━━━━━━━━━━━━━━━━━━
${promoBlock}

━━━━━━━━━━━━━━━━━━━━━━━━━
FASE 1 — SELEÇÃO GUIADA  ← fase padrão
━━━━━━━━━━━━━━━━━━━━━━━━━

SAUDAÇÃO (só na primeira mensagem):
  "Olá! 😊 Bem-vindo ao ${restaurantName}! O que vai querer hoje?
${active.map((c) => `  ${categoryEmoji(c.name)} ${c.name}`).join("\n")}
  Escolha uma opção 👇"

QUANDO CLIENTE ESCOLHE UMA CATEGORIA:
  → Liste TODOS os itens com preços. NÃO pagine.
  → Termine: "Qual deles você quer? 👇"

QUANDO CLIENTE CONFIRMA UM ITEM:
  → "✅ [Item] adicionado!"
  → OBRIGATÓRIO mostrar próximas opções:
    "Agora vamos complementar:
${remainingOptionsBlock}
    Escolha 👇"
  → NÃO diga "Quer mais alguma coisa?" ou variações.

━━━━━━━━━━━━━━━━━━━━━━━━━
TRANSIÇÃO → FASE 2
━━━━━━━━━━━━━━━━━━━━━━━━━
Ative quando cliente disser:
"só isso" | "é isso" | "pode fechar" | "finalizar" | "já escolhi" |
"pode confirmar" | "tô bem" | "acabei" | "mais nada" | "isso mesmo" | "pode ir"

━━━━━━━━━━━━━━━━━━━━━━━━━
FASE 2 — UPSELL INTELIGENTE
━━━━━━━━━━━━━━━━━━━━━━━━━
${categoriesWithout.length > 0
  ? `Categorias SEM itens (ofereça nesta ordem):
${upsellHints}

1. Ofereça a PRIMEIRA categoria com 2 opções concretas:
   "Antes de fechar — que tal ${firstMissingCat ? `uma ${firstMissingCat}?` : "algo mais?"}
  ${firstMissingExamples}
   Ou finalize 👇"
2. Cliente ACEITA → confirme, passe para próxima ausente.
3. Cliente RECUSA → próxima categoria SEM insistir.
4. UMA categoria por vez. Nunca duas.
5. Todas cobertas/recusadas → resumo + total + "Entrega ou retirada?"`
  : `Todas as categorias têm itens!
→ Resumo completo com total.
→ "Vai ser entrega ou retirada?"`}

━━━━━━━━━━━━━━━━━━━━━━━━━
REGRAS ABSOLUTAS
━━━━━━━━━━━━━━━━━━━━━━━━━
• Respostas CURTAS: máx. 6 linhas.
• NUNCA invente itens ou preços.
• Não sugira categorias com itens já no pedido.
• Sempre em português brasileiro.`;
}

// ─── GET /api/chat-sim ────────────────────────────────────────

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
          select: { name: true, price: true, description: true, imageUrl: true },
        },
      },
    });

    return ok({
      categories: categories.map((c) => ({
        name: c.name,
        imageUrl: c.imageUrl ?? null,
        items: c.items.map((i) => ({
          name: i.name,
          price: Number(i.price),
          description: i.description,
          imageUrl: i.imageUrl ?? null,
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

    const { message, history, cart = [], visitedCategories = [], promo = null } = body;
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
            select: { name: true, price: true, description: true, imageUrl: true },
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
      cart,
      visitedCategories,
      promo
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
      max_tokens: 450,
      temperature: 0.2,
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
