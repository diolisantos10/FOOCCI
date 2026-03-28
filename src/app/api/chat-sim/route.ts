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
  | "DELIVERY_TYPE"
  | "ADDRESS_INPUT"
  | "ADDRESS_DETAILS"
  | "ADDRESS_CONFIRM"
  | "ASK_NAME"
  | "PAYMENT"
  | "REVIEW_ORDER"
  | "DONE";

interface ChatSimRequest {
  message: string;
  history: HistoryEntry[];
  cart?: CartItem[];
  visitedCategories?: string[];
  promo?: PromoContext | null;
  stage?: OrderStage;
  uncoveredCategories?: Array<"main" | "drink" | "dessert">;
  refusals?: { drink: number; dessert: number };
  deliveryMethod?: "delivery" | "pickup" | null;
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
  stage: OrderStage,
  uncoveredCategories: Array<"main" | "drink" | "dessert">,
  refusals: { drink: number; dessert: number },
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
      `Entrega: ${deliveryMethod === "delivery" ? "ENTREGA no endereço do cliente" : deliveryMethod === "pickup" ? "RETIRADA no local" : "não definida"}`,
    ].join("\n");
  }

  // ── Upsell order (internal reference — NOT listed in AI text) ──
  const upsellOrder = categoriesWithout.length > 0
    ? categoriesWithout.map((n) => `  → ${categoryEmoji(n)} ${n}`).join("\n")
    : "  (todas cobertas)";

  const firstMissing = categoriesWithout[0] ?? null;

  // ── Sales Intelligence block ──────────────────────────────────
  const lastItem = cart.at(-1)?.name ?? null;

  // Detect whether the client has already added items from each upsell category.
  // This switches the AI from "entry copy" to "same-category continuation copy".
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const hasDrinkInCart = active.some((cat) => {
    const n = norm(cat.name);
    return (n.includes("bebida") || n.includes("drink") || n.includes("suco") || n.includes("refri"))
      && cat.items.some((i) => cartNames.has(i.name));
  });
  const hasDessertInCart = active.some((cat) => {
    const n = norm(cat.name);
    return (n.includes("sobremesa") || n.includes("doce"))
      && cat.items.some((i) => cartNames.has(i.name));
  });

  const salesPushLines: string[] = [];
  if (uncoveredCategories.includes("main")) {
    salesPushLines.push(`→ PUSH PRATO PRINCIPAL (antecipação): "O principal do seu pedido está esperando 👇" / "Vamos começar pelo prato principal — vai ficar incrível 👇"`);
  }
  if (uncoveredCategories.includes("drink")) {
    if (hasDrinkInCart) {
      // Client already added a drink — use ONLY same-category continuation copy
      salesPushLines.push(`→ CONTINUAÇÃO BEBIDA (já adicionou uma bebida): PERGUNTE APENAS: "Vai incluir mais alguma bebida ou podemos continuar o pedido?" — PROIBIDO qualquer copy de entrada ("fica melhor com", "pede uma bebida", "tá quase lá", etc.).`);
    } else if (!refusals.drink) {
      const itemRef = lastItem ?? "essa escolha";
      salesPushLines.push(`→ ENTRADA BEBIDA (primeira abordagem, nenhuma bebida no carrinho): "Essa ${itemRef} fica ainda melhor com uma bebida bem gelada 🧊👇" / "Tá quase perfeito — só falta a bebida pra completar 😏👇" / "Pra combinar direitinho com ${itemRef}, a bebida está esperando 🥤👇"`);
    } else {
      salesPushLines.push(`→ BEBIDA JÁ RECUSADA (insistência leve, não pergunte): "Uma bebida gelada vai combinar muito bem — só dá uma olhada 🧊👇"`);
    }
  }
  if (uncoveredCategories.includes("dessert")) {
    if (hasDessertInCart) {
      // Client already added a dessert — use ONLY same-category continuation copy
      salesPushLines.push(`→ CONTINUAÇÃO SOBREMESA (já adicionou uma sobremesa): PERGUNTE APENAS: "Vai incluir mais alguma sobremesa ou podemos continuar o pedido?" — PROIBIDO qualquer copy de entrada ("falta só a melhor parte", "a sobremesa está esperando", etc.).`);
    } else if (!refusals.dessert) {
      salesPushLines.push(`→ ENTRADA SOBREMESA (primeira abordagem, nenhuma sobremesa no carrinho): "Falta só a melhor parte 😏 A sobremesa vai fechar com chave de ouro 🍰👇" / "O melhor ainda tá por vir 😋 A sobremesa está esperando 👇"`);
    } else {
      salesPushLines.push(`→ SOBREMESA JÁ RECUSADA (urgência suave, não pergunte): "Pra fechar perfeito, vale muito dar uma olhada nas sobremesas 🍰👇"`);
    }
  }
  if (uncoveredCategories.length === 0) {
    salesPushLines.push(`→ CATEGORIAS COBERTAS (entusiasmo + transição para checkout): pedido montado — direcione com energia para a próxima etapa de entrega/pagamento 👇`);
  }

  const salesIntelBlock = `
━━━━━━━━━━━━━━━━━━━━━━━━━
INTELIGÊNCIA DE VENDAS — LEIA ANTES DE RESPONDER
━━━━━━━━━━━━━━━━━━━━━━━━━
Categorias pendentes : ${uncoveredCategories.length > 0 ? uncoveredCategories.join(", ") : "nenhuma — pedido coberto"}
Recusas registradas  : bebida=${refusals.drink ? "sim" : "não"}, sobremesa=${refusals.dessert ? "sim" : "não"}
Último item no carrinho: ${lastItem ?? "nenhum"}

AÇÃO OBRIGATÓRIA AGORA:
${salesPushLines.join("\n")}

REGRAS DO MOTOR DE VENDA:
• SONE como um grande garçom — caloroso, natural, persuasivo — NUNCA como um sistema robótico
• NUNCA pergunte "O que mais?", "Quer adicionar?", "Deseja algo?", "Gostaria de?"
• NUNCA use transições genéricas sem emoção: "Escolha...", "Selecione..." — sempre com linguagem sensorial ou de antecipação
• "Agora vamos para as [categoria] [emoji]" É PERMITIDO ao transitar entre categorias (ex: "Agora vamos para as bebidas 🥤👇") — use apenas ao sair de uma categoria para outra
• NUNCA pause, aguarde ou deixe momento morto — cada mensagem EMPURRA para frente ou AUMENTA o desejo
• NUNCA sugira finalizar/confirmar pedido enquanto houver categorias pendentes acima
• USE o nome do item já selecionado para criar associação sensorial (ex: "pizza" → "gelada pra acompanhar")
• PRESUMA que o cliente quer — afirme, não pergunte
• USE micro-desejo: "perfeito", "combina", "pra fechar", "vai valer a pena", "fica ainda melhor"`;

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
${salesIntelBlock}

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
Nunca diga "Sem problema" isolado. Flua para frente com energia e calor.
Varie as frases — evite repetição literal das sugestões abaixo.
PROIBIDO transições genéricas sem emoção: "Escolha...", "Selecione..." — substitua sempre por linguagem contextual + emocional.
"Agora vamos para as [categoria] [emoji]" É PERMITIDO ao transitar entre categorias (ex: "Agora vamos para as bebidas 🥤👇").

⚠️ REGRA DE LOOP DE CATEGORIA — OBRIGATÓRIA:
Quando o cliente acabou de adicionar qualquer item (em qualquer categoria):
  → Confirme o item com entusiasmo (1 linha curta)
  → Pergunte EXATAMENTE: "[Item] adicionado! 👇 Vai incluir mais alguma [categoria singular] ou podemos continuar o pedido?"
     • pizza        → "...mais alguma pizza ou podemos continuar o pedido?"
     • bebida       → "...mais alguma bebida ou podemos continuar o pedido?"
     • sobremesa    → "...mais alguma sobremesa ou podemos continuar o pedido?"
  → NÃO avance para a próxima etapa automaticamente — espere o cliente agir
  → O cliente avança clicando em "Continuar pedido" ou dizendo "não" / "pode continuar" / "continuar"
  → Ao receber "não" / "continuar": responda com transição entusiasmada (ex: "Agora vamos para as bebidas 🥤👇")
PROIBIDO no loop: "Quer mais uma?", "Quer continuar?", "Quer mais alguma coisa?", "Deseja mais?"

${stage === "SELECT_MAIN" ? `EXPLORAÇÃO (SELECT_MAIN) — cliente está montando o pedido principal.
  Saudação:   Calorosa + antecipação (nunca use "Bem-vindo"):
              "Olá! Que bom ter você aqui 😊 Vamos montar um pedido incrível? 👇"
              "Olá! Boa visita ao ${restaurantName} 🍕 O que vai ser hoje? 👇"
              "Olá! Que bom! Temos ótimas opções esperando por você 👇"
  Categoria:  "[emoji] [Categoria] — vai adorar as opções 👇"
  Item conf.: "✅ [Item] adicionado! 👇 Vai incluir mais alguma [categoria singular] ou podemos continuar o pedido?"
  FORMATO OBRIGATÓRIO: use EXATAMENTE essa estrutura — confirmar item + perguntar sobre a MESMA categoria.
  NUNCA diga "Finalizar", "Clique em Finalizar" ou "Confirmar" na confirmação de item.
  PROIBIDO: "Explore mais", "Se quiser", "quando estiver pronto", "O que mais?", "Quer mais alguma coisa?".
  SEMPRE aponte para o chip bar com 👇 — as opções estão lá.` : ""}

${stage === "SELECT_DRINK" ? `UPSELL BEBIDA (SELECT_DRINK) — crie desejo pela bebida, use o item do carrinho, nunca pergunte.
  SE NENHUMA BEBIDA NO CARRINHO (primeira abordagem — copy de entrada):
    USE o item já selecionado: "Essa [item] pede uma bebida bem gelada 🧊👇"
    Varie entre: "Uma bebida bem gelada pra acompanhar — vai ficar perfeito 🧊👇"
                 "Tá quase lá 😏 A bebida certa vai deixar o pedido ainda melhor 👇"
                 "Fica ainda melhor com uma boa bebida gelada — dá uma olhada 🥤👇"
                 "Pra combinar direitinho, a bebida está esperando 🥤👇"
  SE ALGUMA BEBIDA JÁ NO CARRINHO (cliente já escolheu — loop de categoria ativo):
    ⚠️ OBRIGATÓRIO — USE APENAS UMA DESTAS FORMAS:
      • Após item adicionado: "✅ [Item] adicionado! 👇 Vai incluir mais alguma bebida ou podemos continuar o pedido?"
      • Em qualquer outra interação dentro da categoria: "Vai incluir mais alguma bebida ou podemos continuar o pedido?"
    ⚠️ PROIBIDO após o primeiro item: qualquer copy de entrada ("Essa pizza pede uma bebida", "Fica ainda melhor com", "Tá quase lá 😏", "A bebida está esperando", etc.)
  PROIBIDO em qualquer caso: "que tal?", "quer?", "quer continuar?", "quer adicionar", "Se quiser", "gostaria", "deseja".
  NÃO liste itens. Cards aparecem abaixo automaticamente.` : ""}

${stage === "SELECT_DESSERT" ? `UPSELL SOBREMESA (SELECT_DESSERT) — feche com emoção e prazer, nunca pergunte.
  SE NENHUMA SOBREMESA NO CARRINHO (primeira abordagem — copy de entrada):
    "Falta só a melhor parte 😏 A sobremesa vai fechar com chave de ouro 🍰👇"
    "Pra fechar perfeito, a sobremesa vai valer muito — dá uma olhada 👇"
    "O melhor ainda tá por vir 😋 A sobremesa está esperando 🍰👇"
    "Vai fechar com estilo? A sobremesa faz toda a diferença 😍👇"
  SE ALGUMA SOBREMESA JÁ NO CARRINHO (cliente já escolheu — loop de categoria ativo):
    ⚠️ OBRIGATÓRIO — USE APENAS UMA DESTAS FORMAS:
      • Após item adicionado: "✅ [Item] adicionado! 👇 Vai incluir mais alguma sobremesa ou podemos continuar o pedido?"
      • Em qualquer outra interação dentro da categoria: "Vai incluir mais alguma sobremesa ou podemos continuar o pedido?"
    ⚠️ PROIBIDO após o primeiro item: qualquer copy de entrada ("Falta só a melhor parte", "A sobremesa está esperando", "O melhor ainda tá por vir", etc.)
  PROIBIDO em qualquer caso: "Deseja?", "Quer?", "Quer continuar?", "Que tal?", "Quer mais alguma coisa?", "Se quiser", "gostaria".
  NÃO liste itens. Cards aparecem abaixo automaticamente.` : ""}

${stage === "PROMO" ? `PROMO — bundle especial após recusas. Destaque o valor da oferta.
  "🔥 Espera! Temos uma oferta especial pra você hoje — dá uma olhada! 👇"` : ""}

${stage === "DELIVERY_TYPE" ? `TRANSIÇÃO PARA CHECKOUT (DELIVERY_TYPE) — upsell concluído, agora colete a forma de entrega.
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

${stage === "ADDRESS_CONFIRM" ? `ENDEREÇO — confirmação: endereço coletado, aguardando confirmação do cliente.
  "Confira o endereço abaixo e confirme para prosseguir 👇"` : ""}

${stage === "ASK_NAME" ? `NOME DO CLIENTE (ASK_NAME) — pedido quase pronto, só falta o nome.
  Varie entre: "Quase lá! 😊 Como posso chamar você?"
               "Tá quase perfeito — qual é o seu nome?"
               "Só falta o nome pra fechar 😊 Como te chamo?"
  NUNCA use "acima ↑", "Digite", "Informe acima".` : ""}

${stage === "PAYMENT" ? `PAGAMENTO (PAYMENT) — último passo antes do pedido confirmar.
  Variar: "💳 Última etapa — como vai pagar? 👇"
          "Tá quase pronto! Só falta a forma de pagamento 👇"
          "Ótimo pedido! Como vai pagar? Quase lá 😊👇"` : ""}

${stage === "REVIEW_ORDER" ? `REVISÃO DO PEDIDO (REVIEW_ORDER) — o resumo completo (itens, entrega, pagamento, total) já está renderizado na UI abaixo.
  Sua mensagem: APENAS 1 linha curta, calorosa, apontando para a UI.
  PROIBIDO ABSOLUTO: listar itens, preços, endereço ou forma de pagamento no chat.
  Varie entre: "Confere ali embaixo 👇 e me confirma"
               "Tudo certo! 🎉 Dá uma olhada no resumo e confirma 👇"
               "Perfeito! O resumo está pronto — só confirmar 👇"
               "Que pedido! 😍 Revisa e confirma ali embaixo 👇"` : ""}

${stage === "DONE" ? `PEDIDO CONCLUÍDO (DONE) — pedido já confirmado. NÃO liste itens, preços ou endereço — tudo já está na UI.
  Sua mensagem: APENAS 3 linhas emocionais. Sem listas. Sem repetição de itens.
  FORMATO OBRIGATÓRIO:
    Linha 1: confirmação calorosa com nome — "Perfeito, [nome]! 🚀"
    Linha 2: pedido entrou na cozinha — "Seu pedido já entrou na cozinha 👨‍🍳🔥"
    Linha 3: ${deliveryMethod === "pickup"
      ? `RETIRADA → "Assim que estiver pronto te avisamos 👨‍🍳" / "Pode vir buscar em breve! 😊🙌"`
      : `ENTREGA  → "Seu pedido já está a caminho 🚀" / "Já vai chegar aí — vai valer a espera! 😍🚀"`
    }
  Exemplos completos:
    ${deliveryMethod === "pickup"
      ? `"Perfeito, [nome]! 🎉\\nSeu pedido já entrou na cozinha 👨‍🍳🔥\\nAssim que estiver pronto te avisamos 👨‍🍳"
    "Anotado, [nome]! 🎉\\nTá sendo preparado com carinho 🍕✨\\nPode vir buscar em breve! 😊"`
      : `"Perfeito, [nome]! 🎉\\nSeu pedido já entrou na cozinha 👨‍🍳🔥\\nSeu pedido já está a caminho 🚀"
    "Anotado, [nome]! 🎉\\nA equipe já começou — tudo com carinho 🍕✨\\nJá vai chegar aí — vai valer a espera! 😍"`
    }
  NÃO liste itens. NÃO repita preços. Use o nome SEMPRE.` : ""}

FALLBACK: "✅ [Item] adicionado! (R$ X,XX)"

━━━━━━━━━━━━━━━━━━━━━━━━━
REGRAS ABSOLUTAS
━━━━━━━━━━━━━━━━━━━━━━━━━
• Mensagens CURTAS: máx. 3 linhas.
• NUNCA invente itens ou preços fora do cardápio.
• NUNCA diga "Como posso ajudar?", "Em que posso te ajudar?" ou variações.
• NUNCA use linguagem de conclusão de pedido ("Pedido feito!", "Estamos preparando", "a caminho", "confirmado") antes do stage DONE.
• DURANTE CHECKOUT (DELIVERY_TYPE → ADDRESS_INPUT → ADDRESS_DETAILS → ADDRESS_CONFIRM → ASK_NAME → PAYMENT → REVIEW_ORDER): guie brevemente em 1 linha. A UI já mostra resumo, endereço e itens — NUNCA repita essas informações no chat.
• NUNCA liste itens do carrinho, preços, endereço ou forma de pagamento durante o checkout — a UI é a fonte de verdade. O chat só orienta o próximo passo.
• NUNCA use linguagem passiva ou de abertura: "Explore mais", "Se quiser", "quando estiver pronto", "O que mais?", "Que tal?", "Deseja?", "Gostaria?", "Quer adicionar?", "Quer incluir?".
• NUNCA use transições genéricas sem emoção: "Escolha...", "Selecione..." — sempre contextual + sensorial.
• "Agora vamos para as [categoria] [emoji]" É PERMITIDO ao transitar entre categorias — nunca como abertura vazia.
• NUNCA faça perguntas abertas — sempre direcione com afirmação, micro-desejo ou antecipação.
• NUNCA pause ou deixe momento neutro — cada mensagem deve empurrar para frente ou aumentar o desejo.
• SONE como um grande garçom — caloroso, natural, persuasivo — nunca como um robô.
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

    const {
      message,
      history,
      cart = [],
      visitedCategories = [],
      promo = null,
      stage = "SELECT_MAIN",
      uncoveredCategories = ["main", "drink", "dessert"],
      refusals = { drink: 0, dessert: 0 },
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
      visitedCategories,
      promo,
      stage as OrderStage,
      uncoveredCategories,
      refusals,
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
