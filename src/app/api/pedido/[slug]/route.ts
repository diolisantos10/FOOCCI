/**
 * /api/pedido/[slug]
 *
 * Public (no auth) API for the external test ordering page.
 *
 * GET  — return menu for the restaurant identified by slug
 * POST — guided ordering AI (same logic as /api/chat-sim but resolves tenant by slug)
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { openai } from "@/lib/openai";
import { ok, badRequest, serverError } from "@/lib/api-response";
import type OpenAI from "openai";

// ─── shared types (mirrors /api/chat-sim) ─────────────────────

interface HistoryEntry { role: "user" | "assistant"; content: string; }
interface CartItem     { name: string; price: number; qty: number; }

type OrderStage =
  | "BROWSE" | "DELIVERY_TYPE" | "ADDRESS_INPUT" | "ADDRESS_DETAILS"
  | "ADDRESS_CONFIRM" | "ASK_NAME" | "PAYMENT" | "PAYMENT_METHOD"
  | "PAYMENT_LINK" | "REVIEW_ORDER" | "DONE";

interface PedidoChatRequest {
  message:        string;
  history:        HistoryEntry[];
  cart?:          CartItem[];
  stage?:         OrderStage;
  upsellOffered?: "drink" | "dessert" | null;
  deliveryMethod?: "delivery" | "pickup" | null;
}

type DbMenuItem  = { name: string; price: unknown; description: string | null; imageUrl: string | null; };
type DbCategory  = { name: string; description: string | null; imageUrl: string | null; items: DbMenuItem[]; };

// ─── system-prompt builder (copy from /api/chat-sim) ──────────
// Kept as a local function so this route has zero coupling to the
// authenticated route.

function buildSystemPrompt(
  restaurantName: string,
  categories: DbCategory[],
  emojiUsage: string,
  cart: CartItem[],
  stage: OrderStage,
  upsellOffered: "drink" | "dessert" | null,
  deliveryMethod: "delivery" | "pickup" | null,
): string {
  const active = categories.filter((c) => c.items.length > 0);

  const menuBlock = active.map((cat) => {
    const rows = cat.items.map((item) => {
      const price = `R$ ${Number(item.price).toFixed(2)}`;
      return item.description
        ? `  • ${item.name} — ${price} (${item.description})`
        : `  • ${item.name} — ${price}`;
    }).join("\n");
    return `[${cat.name.toUpperCase()}]\n${rows}`;
  }).join("\n\n");

  const cartNames   = new Set(cart.map((c) => c.name));
  const withItems   = active.filter((c) => c.items.some((i) => cartNames.has(i.name))).map((c) => c.name);
  const withoutItems= active.filter((c) => !c.items.some((i) => cartNames.has(i.name))).map((c) => c.name);
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const hasDrinkInCart = active.some((cat) => {
    const n = norm(cat.name);
    return (n.includes("bebida")||n.includes("drink")||n.includes("suco")||n.includes("refri"))
      && cat.items.some((i) => cartNames.has(i.name));
  });
  const hasDessertInCart = active.some((cat) => {
    const n = norm(cat.name);
    return (n.includes("sobremesa")||n.includes("doce")) && cat.items.some((i) => cartNames.has(i.name));
  });

  let cartBlock: string;
  if (cart.length === 0) {
    cartBlock = "PEDIDO ATUAL: Nenhum item adicionado ainda.";
  } else {
    const cartLines = cart.map((i) => `  • ${i.name} × ${i.qty} — R$ ${(i.price * i.qty).toFixed(2)}`).join("\n");
    const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
    cartBlock = [
      `PEDIDO ATUAL:`, cartLines, `Total parcial: R$ ${total.toFixed(2)}`,
      `Categorias COM itens: ${withItems.join(", ") || "nenhuma"}`,
      `Categorias SEM itens: ${withoutItems.join(", ") || "nenhuma"}`,
      `Entrega: ${deliveryMethod === "delivery" ? "ENTREGA" : deliveryMethod === "pickup" ? "RETIRADA" : "não definida"}`,
    ].join("\n");
  }

  const lastItem = cart.at(-1)?.name ?? null;
  let upsellBlock = "";
  if (stage === "BROWSE" && upsellOffered === "drink") {
    upsellBlock = hasDrinkInCart
      ? `→ CONTINUAÇÃO BEBIDA: "Vai incluir mais alguma bebida ou podemos continuar?"`
      : `→ UPSELL BEBIDA: "Essa ${lastItem ?? "escolha"} fica ainda melhor com uma bebida bem gelada 🧊👇"`;
  } else if (stage === "BROWSE" && upsellOffered === "dessert") {
    upsellBlock = hasDessertInCart
      ? `→ CONTINUAÇÃO SOBREMESA: "Vai incluir mais alguma sobremesa ou podemos continuar?"`
      : `→ UPSELL SOBREMESA: "Falta só a melhor parte 😏 A sobremesa vai fechar com chave de ouro 🍰👇"`;
  }

  const emojiRule =
    emojiUsage === "none"       ? "NÃO use emojis." :
    emojiUsage === "minimal"    ? "Máx. 1 emoji por mensagem." :
    emojiUsage === "expressive" ? "Use emojis livremente." :
    "Use 1–2 emojis por mensagem.";

  const upsellCatEmoji = upsellOffered === "drink" ? "🥤" : upsellOffered === "dessert" ? "🍰" : "";

  return `Você é o atendente de pedidos do *${restaurantName}*.
${emojiRule}

━━━━━━━━━━━━━━━━━━━━━━━━━
CARDÁPIO (referência interna — NÃO repita para o cliente)
━━━━━━━━━━━━━━━━━━━━━━━━━
${menuBlock || "Cardápio temporariamente indisponível."}

━━━━━━━━━━━━━━━━━━━━━━━━━
${cartBlock}
━━━━━━━━━━━━━━━━━━━━━━━━━

━━━━━━━━━━━━━━━━━━━━━━━━━
INTERFACE — REGRA CRÍTICA
━━━━━━━━━━━━━━━━━━━━━━━━━
Esta conversa tem DOIS elementos visuais:
  1. Sua mensagem de texto → orientação, confirmação (máx. 2 linhas)
  2. Sidebar + grade de produtos → TODAS as opções clicáveis (gerenciada pelo sistema)

⚠️ PROIBIDO ABSOLUTO no texto:
  • Listar itens do cardápio
  • Listar categorias
  • Usar bullets ou numeração para apresentar escolhas
  • Repetir qualquer coisa que já aparece na grade de produtos
O texto é REAÇÃO. A grade é ESCOLHA.
Em etapas de checkout: use "👇" para direcionar à UI. Em BROWSE após adicionar: NÃO use "👇".

━━━━━━━━━━━━━━━━━━━━━━━━━
ETAPA ATUAL: ${stage}${upsellOffered ? ` (upsell ativo: ${upsellOffered} ${upsellCatEmoji})` : ""}
━━━━━━━━━━━━━━━━━━━━━━━━━

${stage === "BROWSE" ? `BROWSE — cliente navega livremente.
  Saudação inicial: "Olá! Que bom ter você aqui 😊 O que vai ser hoje?"
  Após adicionar item — REAÇÃO curta (máx. 1 linha, sem perguntas): "Boa escolha 👌", "Excelente!", "Perfeito 👏"
  ${upsellBlock ? `UPSELL ATIVO:\n${upsellBlock}` : ""}
  REGRAS: Máx. 1 linha. NÃO liste categorias/itens. Não pergunte se quer continuar.` : ""}
${stage === "DELIVERY_TYPE" ? `CHECKOUT — colete a forma de entrega. "Perfeito! 🎉 Pedido montado — como vai receber? 👇"` : ""}
${stage === "ADDRESS_INPUT" ? `ENDEREÇO passo 1: rua e número. "Me diz a rua e o número 👇"` : ""}
${stage === "ADDRESS_DETAILS" ? `ENDEREÇO passo 2: bairro e complemento. "Quase lá! Me passa o bairro 👇"` : ""}
${stage === "ADDRESS_CONFIRM" ? `ENDEREÇO confirmação. "Confira o endereço abaixo e confirme 👇"` : ""}
${stage === "ASK_NAME" ? `NOME. "Quase lá! 😊 Como posso chamar você?"` : ""}
${stage === "PAYMENT" ? `PAGAMENTO — escolha do modo. "💳 Última etapa — como vai pagar? 👇"` : ""}
${stage === "PAYMENT_METHOD" ? `FORMA DE PAGAMENTO. "Ótimo! 💳 Como prefere pagar? 👇"` : ""}
${stage === "PAYMENT_LINK" ? `AGUARDANDO PAGAMENTO. "Link enviado! 🎉 Aguardando confirmação 👇"` : ""}
${stage === "REVIEW_ORDER" ? `REVISÃO. APENAS 1 linha curta. "Confere ali embaixo 👇 e me confirma"` : ""}
${stage === "DONE" ? `PEDIDO CONCLUÍDO. APENAS UMA ÚNICA linha. "${deliveryMethod === "pickup" ? "Perfeito! Assim que estiver pronto te avisamos 👨‍🍳" : "Perfeito! Seu pedido já entrou na cozinha 🚀 Já já chega aí!"}"` : ""}

━━━━━━━━━━━━━━━━━━━━━━━━━
REGRAS ABSOLUTAS
━━━━━━━━━━━━━━━━━━━━━━━━━
• Mensagens CURTAS: máx. 3 linhas.
• NUNCA invente itens ou preços fora do cardápio.
• Sempre em português brasileiro.`;
}

// ─── GET /api/pedido/[slug] ───────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;

    const restaurant = await prisma.restaurant.findUnique({
      where: { slug },
      select: { id: true, name: true },
    });
    if (!restaurant) {
      return badRequest("Restaurante não encontrado.");
    }

    const categories = await prisma.menuCategory.findMany({
      where: { restaurantId: restaurant.id, isActive: true, isAvailable: true },
      orderBy: { sortOrder: "asc" },
      include: {
        items: {
          where: { isActive: true, isAvailable: true, showInDelivery: true },
          orderBy: { sortOrder: "asc" },
          select: { id: true, name: true, price: true, description: true, imageUrl: true },
        },
      },
    });

    return ok({
      restaurantName: restaurant.name,
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        imageUrl: c.imageUrl ?? null,
        items: c.items.map((i) => ({
          id: i.id,
          name: i.name,
          price: Number(i.price),
          description: i.description,
          imageUrl: i.imageUrl ?? null,
        })),
      })),
    });
  } catch (err) {
    console.error("[GET /api/pedido/[slug]]", err);
    return serverError();
  }
}

// ─── POST /api/pedido/[slug] ──────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;

    const restaurant = await prisma.restaurant.findUnique({
      where: { slug },
      select: { id: true, name: true },
    });
    if (!restaurant) {
      return badRequest("Restaurante não encontrado.");
    }

    let body: PedidoChatRequest;
    try { body = await req.json(); } catch { return badRequest("Invalid JSON body."); }

    const {
      message,
      history,
      cart          = [],
      stage         = "BROWSE",
      upsellOffered = null,
      deliveryMethod= null,
    } = body;

    if (!message?.trim())        return badRequest("message is required.");
    if (!Array.isArray(history)) return badRequest("history must be an array.");

    const [categories, brandConfig] = await Promise.all([
      prisma.menuCategory.findMany({
        where: { restaurantId: restaurant.id, isActive: true, isAvailable: true },
        orderBy: { sortOrder: "asc" },
        include: {
          items: {
            where: { isActive: true, isAvailable: true, showInDelivery: true },
            orderBy: { sortOrder: "asc" },
            select: { name: true, price: true, description: true, imageUrl: true },
          },
        },
      }),
      prisma.restaurantBrandConfig.findUnique({
        where: { restaurantId: restaurant.id },
        select: { emojiUsage: true, aiModel: true, maxHistoryMessages: true },
      }),
    ]);

    const emojiUsage = brandConfig?.emojiUsage         ?? "moderate";
    const aiModel    = brandConfig?.aiModel            ?? "gpt-4o-mini";
    const maxHistory = brandConfig?.maxHistoryMessages ?? 20;

    const systemPrompt = buildSystemPrompt(
      restaurant.name,
      categories,
      emojiUsage,
      cart,
      stage as OrderStage,
      upsellOffered,
      deliveryMethod,
    );

    const cappedHistory = history.slice(-maxHistory);

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...cappedHistory.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: message.trim() },
    ];

    const completion = await openai.chat.completions.create({
      model:       aiModel,
      messages,
      max_tokens:  200,
      temperature: 0.2,
    });

    const reply =
      completion.choices[0]?.message?.content?.trim() ??
      "Desculpe, não consegui processar sua mensagem. 😅";

    return ok({ reply });
  } catch (err) {
    console.error("[POST /api/pedido/[slug]]", err);
    return serverError("Erro interno ao processar mensagem.");
  }
}
