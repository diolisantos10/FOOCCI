/**
 * /api/chat-sim
 *
 * GET  — full active menu with imageUrl at category + item level.
 * POST — guided ordering AI endpoint. Cart-aware, stage-aware.
 *
 * UX contract: the AI writes GUIDANCE TEXT ONLY (≤3 lines).
 * All selectable options live in the sidebar + product grid rendered by the client.
 * The AI must NEVER list items, categories, or choices in its reply text.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { openai } from "@/lib/openai";
import { ok, badRequest, unauthorized, serverError } from "@/lib/api-response";
import { mockMenu } from "@/lib/qa/fixtures/menu";
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

type OrderStage =
  | "BROWSE"
  | "DELIVERY_TYPE"
  | "ADDRESS_INPUT"
  | "ADDRESS_DETAILS"
  | "ADDRESS_CONFIRM"
  | "ASK_NAME"
  | "PAYMENT"
  | "PAYMENT_METHOD"
  | "PAYMENT_LINK"
  | "REVIEW_ORDER"
  | "DONE";

interface ChatSimRequest {
  message: string;
  history: HistoryEntry[];
  cart?: CartItem[];
  stage?: OrderStage;
  upsellOffered?: "drink" | "dessert" | null;
  deliveryMethod?: "delivery" | "pickup" | null;
}

type DbMenuItem = {
  name: string;
  price: unknown;
  description: string | null;
  imageUrl: string | null;
};
type DbCategory = {
  name: string;
  description: string | null;
  imageUrl: string | null;
  items: DbMenuItem[];
};

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
  stage: OrderStage,
  upsellOffered: "drink" | "dessert" | null,
  deliveryMethod: "delivery" | "pickup" | null,
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

  // ── Cart state ─────────────────────────────────────────────────
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
      `Entrega: ${
        deliveryMethod === "delivery"
          ? "ENTREGA no endereço do cliente"
          : deliveryMethod === "pickup"
          ? "RETIRADA no local"
          : "não definida"
      }`,
    ].join("\n");
  }

  // ── Upsell context ─────────────────────────────────────────────
  const lastItem = cart.at(-1)?.name ?? null;

  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const hasDrinkInCart = active.some((cat) => {
    const n = norm(cat.name);
    return (
      n.includes("bebida") ||
      n.includes("drink") ||
      n.includes("suco") ||
      n.includes("refri")
    ) && cat.items.some((i) => cartNames.has(i.name));
  });

  const hasDessertInCart = active.some((cat) => {
    const n = norm(cat.name);
    return (
      n.includes("sobremesa") || n.includes("doce")
    ) && cat.items.some((i) => cartNames.has(i.name));
  });

  // ── Upsell instruction block (BROWSE only) ─────────────────────
  let upsellBlock = "";
  if (stage === "BROWSE" && upsellOffered === "drink") {
    if (hasDrinkInCart) {
      upsellBlock = `→ CONTINUAÇÃO BEBIDA (bebida já no carrinho): "Vai incluir mais alguma bebida ou podemos continuar o pedido?" — PROIBIDO qualquer copy de entrada.`;
    } else {
      const itemRef = lastItem ?? "sua escolha";
      upsellBlock = `→ UPSELL BEBIDA (nenhuma bebida no carrinho ainda): "Essa ${itemRef} fica ainda melhor com uma bebida bem gelada 🧊👇" — use o item do carrinho, crie desejo, nunca pergunte.`;
    }
  } else if (stage === "BROWSE" && upsellOffered === "dessert") {
    if (hasDessertInCart) {
      upsellBlock = `→ CONTINUAÇÃO SOBREMESA (sobremesa já no carrinho): "Vai incluir mais alguma sobremesa ou podemos continuar o pedido?" — PROIBIDO qualquer copy de entrada.`;
    } else {
      upsellBlock = `→ UPSELL SOBREMESA (nenhuma sobremesa no carrinho ainda): "Falta só a melhor parte 😏 A sobremesa vai fechar com chave de ouro 🍰👇" — crie desejo, nunca pergunte.`;
    }
  }

  const emojiRule =
    emojiUsage === "none"       ? "NÃO use emojis." :
    emojiUsage === "minimal"    ? "Máx. 1 emoji por mensagem." :
    emojiUsage === "expressive" ? "Use emojis livremente." :
    "Use 1–2 emojis por mensagem.";

  const upsellCatEmoji =
    upsellOffered === "drink" ? "🥤" :
    upsellOffered === "dessert" ? "🍰" : "";

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
  1. Sua mensagem de texto  → orientação, confirmação (máx. 2 linhas)
  2. Sidebar + grade de produtos → TODAS as opções clicáveis (gerenciada pelo sistema)

⚠️ PROIBIDO ABSOLUTO no texto:
  • Listar itens do cardápio  (ex: "• Pizza Calabresa — R$ 35,90")
  • Listar categorias          (ex: "🍕 Pizzas  🥤 Bebidas")
  • Usar bullets ou numeração para apresentar escolhas
  • Repetir qualquer coisa que já aparece na grade de produtos
O texto é REAÇÃO. A grade é ESCOLHA. Nunca os dois ao mesmo tempo.
Em etapas de checkout: use "👇" para direcionar à UI. Em BROWSE após adicionar: NÃO use "👇".

━━━━━━━━━━━━━━━━━━━━━━━━━
ETAPA ATUAL: ${stage}${upsellOffered ? ` (upsell ativo: ${upsellOffered} ${upsellCatEmoji})` : ""}
━━━━━━━━━━━━━━━━━━━━━━━━━

${stage === "BROWSE" ? `BROWSE — cliente navega livremente. Você é um assistente leve de upsell, não um guia.

  Saudação inicial (primeira mensagem apenas):
    Exemplos: "Olá! Que bom ter você aqui 😊 O que vai ser hoje?"
              "Olá! Tudo pronto pra você 🍕 Escolha à vontade 👇"

  Após cliente adicionar item — REAÇÃO curta (máx. 1 linha, sem perguntas):
    Exemplos: "Boa escolha 👌 massa leve e crocante"
              "Excelente! Um clássico 🍕"
              "Perfeito 👏"
    ✗ PROIBIDO: "Vai incluir mais?", "posso continuar?", "O que mais deseja?", "Vai incluir mais algum?"
    ✗ PROIBIDO: guiar para categorias, listar itens, avançar fluxo automaticamente.
    ✗ PROIBIDO: usar "👇" após adicionar item (não há ação a direcionar no chat).

  Sugestão espontânea (OPCIONAL — não após cada item, apenas quando natural):
    Exemplos: "Combina muito com uma bebida gelada 👀"
              "Falta só a sobremesa pra fechar 😏"
    Não repita. Não insista. Não pergunte.

  ${upsellBlock ? `UPSELL ATIVO — cliente clicou Finalizar, a categoria já foi aberta na tela:
${upsellBlock}
    ✗ PROIBIDO: pedir confirmação, listar itens, insistir após recusa.` : ""}

  REGRAS BROWSE:
  • Máx. 1 linha por resposta (2 linhas apenas se upsell ativo)
  • NÃO controle navegação de categorias
  • NÃO pergunte se o cliente quer continuar ou avançar
  • NÃO liste itens, preços ou categorias
  • Reaja naturalmente — não guie` : ""}

${stage === "DELIVERY_TYPE" ? `TRANSIÇÃO PARA CHECKOUT (DELIVERY_TYPE) — pedido montado, agora colete a forma de entrega.
  Varie entre: "Perfeito! 🎉 Pedido montado — como vai receber? 👇"
               "Tá incrível! Como prefere receber? 👇"
               "Que pedido! 😍 Só falta a entrega — como vai ser? 👇"
  NÃO mencione recusas. NÃO diga que o pedido foi confirmado/feito/enviado.` : ""}

${stage === "ADDRESS_INPUT" ? `ENDEREÇO — passo 1: rua e número.
  Varie entre: "Me diz a rua e o número pra entrega 👇"
               "Qual é a rua e o número? 👇"
               "📍 Me passa o endereço — rua e número 👇"
  Se número ausente: "Preciso do número também — ex: Av. Paulista, 1000 👇"
  O número é obrigatório. Não avance sem ele. NUNCA use "acima ↑" ou "Digite".` : ""}

${stage === "ADDRESS_DETAILS" ? `ENDEREÇO — passo 2: bairro e complemento.
  Varie entre: "Agora só falta o bairro — e o complemento se tiver 👇"
               "Quase lá! Me passa o bairro 👇"
               "Bairro e complemento (apto, bloco...) 👇"
  NUNCA use "acima ↑" ou "Digite".` : ""}

${stage === "ADDRESS_CONFIRM" ? `ENDEREÇO — confirmação: endereço coletado, aguardando confirmação.
  "Confira o endereço abaixo e confirme para prosseguir 👇"` : ""}

${stage === "ASK_NAME" ? `NOME DO CLIENTE (ASK_NAME) — pedido quase pronto, só falta o nome.
  Varie entre: "Quase lá! 😊 Como posso chamar você?"
               "Tá quase perfeito — qual é o seu nome?"
               "Só falta o nome pra fechar 😊 Como te chamo?"
  NUNCA use "acima ↑", "Digite", "Informe acima".` : ""}

${stage === "PAYMENT" ? `PAGAMENTO (PAYMENT) — escolha do modo de pagamento.
  Varie entre: "💳 Última etapa — como vai pagar? Agora ou na entrega? 👇"
               "Tá quase pronto! Pagar agora pelo link ou na hora? 👇"
               "Ótimo pedido! Prefere pagar agora ou quando chegar? 😊👇"` : ""}

${stage === "PAYMENT_METHOD" ? `FORMA DE PAGAMENTO (PAYMENT_METHOD) — cliente escolheu pagar na entrega/retirada, agora escolhe como.
  Varie entre: "Ótimo! 💳 Como prefere pagar? 👇"
               "Perfeito! Qual a forma de pagamento? 👇"
               "Show! 😊 Pix, cartão ou dinheiro? 👇"` : ""}

${stage === "PAYMENT_LINK" ? `AGUARDANDO PAGAMENTO (PAYMENT_LINK) — link de pagamento gerado, aguardando confirmação.
  Varie entre: "Link enviado! 🎉 Assim que confirmar o pagamento, seu pedido entra na fila 🍕"
               "Quase lá! Pague pelo link e confirmamos na hora 👇"
               "Link gerado! 💳 Aguardando confirmação — qualquer dúvida é só falar 😊"` : ""}

${stage === "REVIEW_ORDER" ? `REVISÃO DO PEDIDO (REVIEW_ORDER) — o resumo completo já está renderizado na UI abaixo.
  Sua mensagem: APENAS 1 linha curta, calorosa, apontando para a UI.
  PROIBIDO ABSOLUTO: listar itens, preços, endereço ou forma de pagamento no chat.
  Varie entre: "Confere ali embaixo 👇 e me confirma"
               "Tudo certo! 🎉 Dá uma olhada no resumo e confirma 👇"
               "Perfeito! O resumo está pronto — só confirmar 👇"
               "Que pedido! 😍 Revisa e confirma ali embaixo 👇"` : ""}

${stage === "DONE" ? `PEDIDO CONCLUÍDO (DONE) — envie APENAS UMA ÚNICA linha. Nada mais.
  ${deliveryMethod === "pickup"
    ? `RETIRADA — USE EXATAMENTE: "Perfeito! Assim que estiver pronto te avisamos 👨‍🍳"`
    : `ENTREGA  — USE EXATAMENTE: "Perfeito! Seu pedido já entrou na cozinha 🚀 Já já chega aí!"`
  }
  PROIBIDO ABSOLUTO: múltiplas linhas, listas, itens, preços, endereço, qualquer texto além da linha acima.` : ""}

━━━━━━━━━━━━━━━━━━━━━━━━━
REGRAS ABSOLUTAS
━━━━━━━━━━━━━━━━━━━━━━━━━
• Mensagens CURTAS: máx. 3 linhas.
• NUNCA invente itens ou preços fora do cardápio.
• NUNCA diga "Como posso ajudar?", "Em que posso te ajudar?" ou variações.
• NUNCA use linguagem de conclusão antes do stage DONE ("Pedido feito!", "Estamos preparando", "a caminho").
• DURANTE CHECKOUT (DELIVERY_TYPE → REVIEW_ORDER): guie em 1 linha. A UI já mostra resumo — NUNCA repita no chat.
• NUNCA use linguagem passiva: "Explore mais", "Se quiser", "quando estiver pronto", "O que mais?".
• NUNCA faça perguntas abertas — sempre direcione com afirmação ou micro-desejo.
• SONE como um grande garçom — caloroso, natural, persuasivo.
• Sempre em português brasileiro.`;
}

// ─── GET /api/chat-sim ────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    // Internal E2E bypass: return stable mock menu so tests need no DB.
    if (req.headers.get("x-e2e-bypass") === "1") {
      return ok({ categories: mockMenu });
    }

    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const categories = await prisma.menuCategory.findMany({
      where: { restaurantId: ctx.restaurantId, isActive: true },
      orderBy: { sortOrder: "asc" },
      include: {
        items: {
          where: { isActive: true },
          orderBy: { sortOrder: "asc" },
          select: { id: true, name: true, price: true, description: true, imageUrl: true },
        },
      },
    });

    return ok({
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
    console.error("[GET /api/chat-sim]", err);
    return serverError();
  }
}

// ─── POST /api/chat-sim ───────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // Internal E2E bypass: return a neutral AI reply so tests can advance
    // stages without needing OpenAI or a real tenant in the DB.
    if (req.headers.get("x-e2e-bypass") === "1") {
      return ok({ reply: "Tudo certo! 👇" });
    }

    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    let body: ChatSimRequest;
    try {
      body = await req.json();
    } catch {
      return badRequest("Invalid JSON body.");
    }

    const {
      message,
      history,
      cart = [],
      stage = "BROWSE",
      upsellOffered = null,
      deliveryMethod = null,
    } = body;

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
      model: aiModel,
      messages,
      max_tokens: 200,
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
