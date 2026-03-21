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

type OrderStage =
  | "SELECT_MAIN"
  | "SELECT_DRINK"
  | "SELECT_DESSERT"
  | "PROMO"
  | "CONFIRM_ORDER"
  | "DELIVERY_TYPE"
  | "ADDRESS_INPUT"
  | "ADDRESS_DETAILS"
  | "ADDRESS_CONFIRM"
  | "ASK_NAME"
  | "PAYMENT"
  | "DONE";

interface ChatSimRequest {
  message: string;
  history: HistoryEntry[];
  cart?: CartItem[];
  visitedCategories?: string[];
  promo?: PromoContext | null;
  stage?: OrderStage;
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
  promo: PromoContext | null,
  stage: OrderStage
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
ETAPA ATUAL DO PEDIDO: ${stage}
━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ REGRA DE TRANSIÇÃO — CRÍTICA:
O stage já reflete a PRÓXIMA etapa. Gere diretamente o texto da etapa atual.
Nunca diga "Sem problema" isolado. Flua para frente com energia.
Varie as frases — evite repetição literal das sugestões abaixo.

${stage === "SELECT_MAIN" ? `EXPLORAÇÃO (SELECT_MAIN) — cliente está escolhendo os itens principais.
  Saudação:   Varie entre estas opções neutras (nunca use "Bem-vindo"):
              "Olá! Que bom ter você por aqui 😊 O que vai querer hoje? 👇"
              "Olá! Boas-vindas ao ${restaurantName} 🍕 O que vai ser? 👇"
              "Olá! Que bom ver você por aqui. O que vai pedir hoje? 👇"
  Categoria:  "[emoji] [Categoria] — escolha o que preferir 👇"
  Item conf.: Confirme o item (ex: "✅ [Item] adicionado!") e convide a continuar 👇` : ""}

${stage === "SELECT_DRINK" ? `UPSELL BEBIDA (SELECT_DRINK) — ofereça uma bebida de forma natural.
  Variar entre: "🥤 Antes de fechar — que tal uma bebida? 👇"
               "Uma bebida pra acompanhar fica ótimo! 🥤 👇"
  NÃO liste itens. Cards aparecem abaixo.` : ""}

${stage === "SELECT_DESSERT" ? `UPSELL SOBREMESA (SELECT_DESSERT) — guie para a sobremesa, nunca pergunte "Deseja?".
  Varie entre:  "Agora vamos fechar com uma sobremesa 👇"
                "Pra completar seu pedido, escolha sua sobremesa 👇"
                "🍰 Temos ótimas sobremesas aqui — dá uma olhada 👇"
                "Perfeito 👌 Vamos completar com uma sobremesa? 👇"
  NÃO liste itens. Cards aparecem abaixo. NUNCA pergunte "Deseja adicionar sobremesas?".` : ""}

${stage === "PROMO" ? `PROMO — bundle especial após recusas. Destaque o valor da oferta.
  "🔥 Espera! Temos uma oferta especial pra você hoje — dá uma olhada! 👇"` : ""}

${stage === "CONFIRM_ORDER" ? `CONFIRMAÇÃO (CONFIRM_ORDER) — foque no positivo, convide a confirmar.
  "Ótimo pedido! 🎉 Confirme abaixo ou adicione mais itens 👇"
  NÃO mencione recusas. Celebre o que foi escolhido.` : ""}

${stage === "DELIVERY_TYPE" ? `FORMA DE ENTREGA (DELIVERY_TYPE).
  "Perfeito! Como vai receber? 👇"` : ""}

${stage === "ADDRESS_INPUT" ? `ENDEREÇO — passo 1: rua e número.
  "📍 Qual o endereço de entrega? Informe a rua e número acima ↑"` : ""}

${stage === "ADDRESS_DETAILS" ? `ENDEREÇO — passo 2: bairro e complemento.
  "Ótimo! Agora informe o bairro (e complemento se houver) acima ↑"` : ""}

${stage === "ADDRESS_CONFIRM" ? `ENDEREÇO — confirmação: endereço coletado, aguardando confirmação do cliente.
  "Confira o endereço abaixo e confirme para prosseguir 👇"` : ""}

${stage === "ASK_NAME" ? `NOME DO CLIENTE (ASK_NAME) — pedido quase pronto, só falta o nome.
  "Quase lá! 😊 Qual é o seu nome para identificar o pedido? Digite acima ↑"` : ""}

${stage === "PAYMENT" ? `PAGAMENTO (PAYMENT) — último passo.
  Variar: "💳 Como vai pagar? 👇"  /  "Quase lá! Escolha a forma de pagamento 👇"` : ""}

${stage === "DONE" ? `PEDIDO CONCLUÍDO (DONE) — liste o pedido e despeça com entusiasmo.
  Liste PEDIDO ATUAL completo (itens + preços + total).
  "Pedido confirmado, [nome]! Estamos preparando tudo. 🎉"
  ÚNICO momento onde você pode listar itens.` : ""}

FALLBACK: "✅ [Item] adicionado! (R$ X,XX)"

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

    const { message, history, cart = [], visitedCategories = [], promo = null, stage = "SELECT_MAIN" } = body;
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
      promo,
      stage as OrderStage
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
