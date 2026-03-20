/**
 * /api/chat-sim
 *
 * GET  — full active menu with imageUrl at category + item level.
 * POST — guided ordering AI endpoint. Cart-aware, phase-aware, promo-aware.
 *
 * UX contract: the AI writes GUIDANCE TEXT ONLY (≤3 lines).
 * All selectable options live in the bottom chip bar rendered by the client.
 * The AI must NEVER list items, categories, or choices in its reply text.
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

  // ── Full menu (internal AI reference — never echoed to user) ──
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

  // ── Cart state ────────────────────────────────────────────────
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

  // ── Upsell order (internal reference — NOT listed in AI text) ──
  const upsellOrder = categoriesWithout.length > 0
    ? categoriesWithout.map((n) => `  → ${categoryEmoji(n)} ${n}`).join("\n")
    : "  (todas cobertas)";

  const firstMissing = categoriesWithout[0] ?? null;

  const emojiRule =
    emojiUsage === "none"       ? "NÃO use emojis." :
    emojiUsage === "minimal"    ? "Máx. 1 emoji por mensagem." :
    emojiUsage === "expressive" ? "Use emojis livremente." :
    "Use 1–2 emojis por mensagem.";

  const visitedNote = visitedCategories.length > 0
    ? `Categorias já exploradas: ${visitedCategories.join(", ")}.` : "";

  const promoBlock = promo
    ? `\n━━━━━━━━━━━━━━━━━━━━━━━━━
PROMOÇÃO ATIVA
━━━━━━━━━━━━━━━━━━━━━━━━━
O cliente acabou de ver: "${promo.title}" por R$ ${promo.bundlePrice.toFixed(2)} (economia R$ ${promo.savings.toFixed(2)}).
Se aceitar: confirme em 1 linha → "Como vai receber? 👇"
Se recusar: → "Como vai receber? 👇"`
    : "";

  return `Você é o atendente de pedidos do *${restaurantName}*.
${emojiRule}
${visitedNote}

━━━━━━━━━━━━━━━━━━━━━━━━━
CARDÁPIO (referência interna — NÃO repita para o cliente)
━━━━━━━━━━━━━━━━━━━━━━━━━
${menuBlock || "Cardápio temporariamente indisponível."}

━━━━━━━━━━━━━━━━━━━━━━━━━
${cartBlock}
━━━━━━━━━━━━━━━━━━━━━━━━━
${promoBlock}

━━━━━━━━━━━━━━━━━━━━━━━━━
INTERFACE — REGRA CRÍTICA
━━━━━━━━━━━━━━━━━━━━━━━━━
Esta conversa tem DOIS elementos visuais:
  1. Sua mensagem de texto  → orientação, confirmação (máx. 2 linhas)
  2. Área de botões abaixo  → TODAS as opções clicáveis (gerenciada pelo sistema)

⚠️ PROIBIDO ABSOLUTO no texto:
  • Listar itens do cardápio  (ex: "• Pizza Calabresa — R$ 35,90")
  • Listar categorias          (ex: "🍕 Pizzas  🥤 Bebidas")
  • Usar bullets ou numeração para apresentar escolhas
  • Repetir qualquer coisa que já aparece nos botões abaixo
O texto é GUIA. Os botões são ESCOLHA. Nunca os dois ao mesmo tempo.
Termine com "👇" para direcionar o cliente aos botões.

━━━━━━━━━━━━━━━━━━━━━━━━━
TEMPLATES POR SITUAÇÃO
━━━━━━━━━━━━━━━━━━━━━━━━━

SAUDAÇÃO (primeira mensagem):
  "Olá! Bem-vindo ao ${restaurantName}! 😊 O que vai querer hoje? 👇"

CATEGORIA PEDIDA (cliente pediu ver uma categoria):
  "${categoryEmoji(active[0]?.name ?? "🍽️")} [NomeDaCategoria] — escolha o que preferir 👇"
  NÃO liste os itens. Os cards aparecem automaticamente abaixo.

ITEM CONFIRMADO (cliente escolheu um item):
  "✅ [NomeDoItem] adicionado! (R$ X,XX)"
  Se ainda há categorias sem itens: "Continue montando seu pedido 👇"
  Se todas cobertas: "Ótimo! Como vai receber? 👇"

CLIENTE QUER FINALIZAR ("só isso" / "finalizar" / etc.):
${firstMissing
  ? `  Ainda há categorias sem itens: ${categoriesWithout.join(", ")}.
  Resposta: "Antes de fechar — que tal ${firstMissing}? 👇"
  NÃO liste os itens. Os botões já aparecem abaixo.`
  : `  Todas categorias têm itens.
  Resposta: "Tudo certo! Como vai receber? 👇"`}

UPSELL (categorias ainda sem itens — ofereça nesta ordem):
${upsellOrder}
  Modelo: "Antes de fechar — que tal [categoria]? 👇"
  NÃO liste os itens. Uma categoria por vez. Sem insistir ao recusar.

CLIENTE RECUSA UPSELL:
  → Se há próxima categoria: "Certo! E [próxima categoria]? 👇"
  → Se não há mais: "Sem problema! Como vai receber? 👇"

ENTREGA / RETIRADA:
  "Perfeito! Como vai receber seu pedido? 👇"

RESUMO FINAL (após cliente escolher entrega ou retirada):
  Liste o PEDIDO ATUAL completo (itens + preços + total).
  "Pedido anotado! Estamos preparando tudo. 🎉"
  O resumo é a ÚNICA situação onde você pode listar itens.

━━━━━━━━━━━━━━━━━━━━━━━━━
REGRAS ABSOLUTAS
━━━━━━━━━━━━━━━━━━━━━━━━━
• Mensagens CURTAS: máx. 3 linhas.
• NUNCA invente itens ou preços fora do cardápio.
• NUNCA diga "Como posso ajudar?" ou variações.
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
      max_tokens: 200,  // shorter cap — guidance only, no lists
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
