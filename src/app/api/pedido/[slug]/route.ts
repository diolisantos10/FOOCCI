/**
 * /api/pedido/[slug]
 *
 * Public (no auth) API for the external ordering experience.
 *
 * GET  — return the restaurant menu
 * POST — AI sales agent (WaiterBrainV2 event-driven), powered by AIOrderService.runWebTurn()
 *
 * V2 response always includes `cards: string[]` — product IDs to show as UI cards.
 * Non-AI events (ON_ENTRY, ON_ITEM_ADDED, ON_IDLE, etc.) return immediately without
 * an OpenAI call, making them fast and cost-free.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma }      from "@/lib/prisma";
import { ok, badRequest, serverError } from "@/lib/api-response";
import { aiWaiterIncluded } from "@/lib/plan-features";
import { AIOrderService } from "@/services/ai/AIOrderService";
import type { V2Event, V2CatalogItem } from "@/services/ai/WaiterBrainV2";
import { getBestSellerMap, applyBestSellers } from "@/services/ai/waiter/bestSellers";
import type { OrderStage } from "@/lib/agent/types";
import { rateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { ConversationLogService } from "@/services/conversation/ConversationLogService";
import { REPEAT_ORDER_INTENT_RE, buildRepeatOrderReply } from "@/services/order/RepeatOrderService";
import { channelPrice } from "@/services/menu/MenuPricingService";
import { Channel } from "@prisma/client";

// ── Request shape ─────────────────────────────────────────────────────────────

interface HistoryEntry { role: "user" | "assistant"; content: string; }
// baseItemId = the plain product id; `id` may be suffixed for variant/customized/
// upsell lines. The waiter brain needs baseItemId to match the catalog.
interface CartItem     { id?: string; baseItemId?: string; name: string; price: number; qty: number; }

interface PedidoChatRequest {
  message:         string;
  history:         HistoryEntry[];
  cart?:           CartItem[];
  stage?:          OrderStage;
  upsellOffered?:  "drink" | "dessert" | "extras" | null;
  deliveryMethod?: "delivery" | "pickup" | null;
  address?:        string | null;
  paymentMethod?:  string | null;
  customerName?:   string | null;
  customerPhone?:  string | null;
  customerId?:     string;
  categoryIntro?:  { name: string; description: string } | null;
  // ── V2 fields ─────────────────────────────────────────────────
  event?:               V2Event;
  lastAddedId?:         string;
  /** Product IDs already shown as cards this session (for de-duplication). */
  suggestedProductIds?: string[];
  waiterMemory?:        Record<string, unknown>;
  // ── Chat Inbox ────────────────────────────────────────────────
  sessionId?:      string;   // stable browser session ID
  conversationId?: string;   // existing conversation, returned on first turn
}

// ── GET ───────────────────────────────────────────────────────────────────────

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
    if (!restaurant) return badRequest("Restaurante não encontrado.");

    const categories = await prisma.menuCategory.findMany({
      where:    { restaurantId: restaurant.id, isActive: true, isAvailable: true },
      orderBy:  { sortOrder: "asc" },
      include:  {
        items: {
          where:   { isActive: true, isAvailable: true, showInDelivery: true },
          orderBy: { sortOrder: "asc" },
          select:  {
            id: true, name: true, price: true,
            priceDelivery: true, priceDineIn: true, priceIfood: true,
            description: true, imageUrl: true,
          },
        },
      },
    });

    return ok({
      restaurantName: restaurant.name,
      categories: categories.map((c) => ({
        id:          c.id,
        name:        c.name,
        description: c.description ?? null,
        imageUrl:    c.imageUrl ?? null,
        items: c.items.map((i) => ({
          id:          i.id,
          name:        i.name,
          // Delivery channel: use the delivery price when set, else base.
          price:       channelPrice(i, "DELIVERY"),
          description: i.description,
          imageUrl:    i.imageUrl ?? null,
        })),
      })),
    });
  } catch (err) {
    console.error("[GET /api/pedido/[slug]]", err);
    return serverError();
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const ip = getClientIp(req);
  const rl = rateLimit({ key: `pedido-chat:${ip}`, limit: 60, windowMs: 60_000 });
  if (rl.limited) return rateLimitResponse(rl.retryAfter);

  try {
    const { slug } = await params;

    const restaurant = await prisma.restaurant.findUnique({
      where:  { slug },
      select: {
        id: true, plan: true, aiWaiterEnabled: true,
        // Categorias que o lojista escolheu oferecer no fechamento, na ordem dele.
        // Vem junto desta busca (mesma query) para não custar round-trip por turno.
        brandConfig: { select: { waiterUpsellCategories: true } },
      },
    });
    if (!restaurant) return badRequest("Restaurante não encontrado.");

    // Plan gate — the AI Waiter is a paid feature and this route is its ONLY entry
    // from the public store. Without this check the gate is contract text, and the
    // token bill for a plan that "does not include AI" lands on us (guardrail 4:
    // prompt é aviso, código é trava).
    //
    // 403 with a machine-readable body, no customer-facing prose: the storefront
    // treats any failure here silently — checkout proceeds click-driven, the greeting
    // path never calls this route when the plan lacks the Waiter. The customer must
    // never see "seu restaurante não pagou".
    if (!aiWaiterIncluded(restaurant)) {
      return NextResponse.json({ success: false, error: "ai_not_included" }, { status: 403 });
    }

    let body: PedidoChatRequest;
    try { body = await req.json(); } catch { return badRequest("Invalid JSON body."); }

    const {
      message,
      history,
      cart           = [],
      stage          = "BROWSE",
      upsellOffered  = null,
      deliveryMethod = null,
      address        = null,
      paymentMethod  = null,
      customerName   = null,
      customerPhone  = null,
      customerId,
      categoryIntro  = null,
      event               = "ON_USER_MESSAGE",
      lastAddedId,
      suggestedProductIds,
      waiterMemory,
      sessionId,
      conversationId: reqConvId,
    } = body;

    // ON_IDLE and non-AI events may arrive with an empty message
    if (event === "ON_USER_MESSAGE" && !message?.trim()) {
      return badRequest("message is required for ON_USER_MESSAGE.");
    }
    if (!Array.isArray(history)) return badRequest("history must be an array.");

    // ── Chat Inbox: conversation logging ─────────────────────────────────────
    // Conversation is ensured on ON_ENTRY (greeting), ON_USER_MESSAGE (chat),
    // and ON_ITEM_ADDED (so item-added AI replies are logged even before the
    // customer sends their first message).
    // All errors are caught so ordering never breaks due to logging failures.
    let conversationId: string | null = reqConvId ?? null;
    // aiActive: false when an operator explicitly took over THIS Cardápio session.
    // Surfaced in every response so the /pedido client can render human-mode UI
    // (banner + "fale com o atendente" placeholder) and stop expecting AI replies.
    let aiActive = true;

    if (sessionId && (event === "ON_USER_MESSAGE" || event === "ON_ENTRY" || event === "ON_ITEM_ADDED")) {
      try {
        conversationId = await ConversationLogService.ensureConversation({
          restaurantId:  restaurant.id,
          sessionId,
          customerId:    customerId   ?? null,
          customerName:  customerName ?? null,
          customerPhone: customerPhone ?? null,
          channel:       Channel.QR_AGENT,
        });

        // Resolve human-takeover state for this conversation.
        // Guard: only a Cardápio (QR_AGENT/WEB_AGENT) takeover suppresses the
        // /pedido AI. A WhatsApp human takeover on the merged conversation must
        // NOT block the /pedido AI — the customer browsing the menu still deserves
        // a response on this channel.
        const convAiState = await prisma.conversation.findFirst({
          where:  { id: conversationId, restaurantId: restaurant.id },
          select: { aiEnabled: true, channel: true },
        });
        const isCardapioConv = !convAiState ||
          convAiState.channel === Channel.QR_AGENT ||
          convAiState.channel === Channel.WEB_AGENT;
        aiActive = !((convAiState?.aiEnabled === false) && isCardapioConv);

        if (event === "ON_USER_MESSAGE" && message?.trim()) {
          // Log customer message (always — even in human mode, so the operator
          // sees what the customer is typing in Atendimento).
          await ConversationLogService.logMessage({
            conversationId,
            restaurantId: restaurant.id,
            senderType:   "CUSTOMER_CARDAPIO",
            content:      message.trim(),
          });

          if (!aiActive) {
            // Operator owns this Cardápio conversation — do not run the AI.
            return ok({
              reply:             "",
              cards:             [],
              mode:              "BROWSE",
              options:           [],
              suggestedItemName: null,
              pinnedCardId:      null,
              memoryPatch:       null,
              conversationId,
              aiActive:          false,
            });
          }
        }
      } catch (logErr) {
        console.error("[waiter] conversation logging failed (non-fatal)", logErr);
        // continue — ordering must not break due to logging failure
      }
    }

    // ── Repeat-order intent (W3): "quero o mesmo", "repetir pedido", "o de sempre" ──
    // Handled here (not in WaiterBrainV2) so the deterministic Waiter brain stays
    // pure (no DB) and its test suite is unaffected. Returns before decide() runs.
    if (event === "ON_USER_MESSAGE" && message?.trim() && REPEAT_ORDER_INTENT_RE.test(message)) {
      const repeat = await buildRepeatOrderReply(restaurant.id, customerId ?? null);
      if (conversationId && repeat.reply) {
        ConversationLogService.logMessage({
          conversationId,
          restaurantId:   restaurant.id,
          senderType:     "AI",
          content:        repeat.reply,
          metadata:       { source: "CARDAPIO" },
          dedupeWindowMs: 0,
        }).catch((e) => console.error("[waiter] repeat-order reply logging failed (non-fatal)", e));
      }
      return ok({
        reply:             repeat.reply,
        cards:             [],
        mode:              "BROWSE",
        options:           repeat.options,
        suggestedItemName: null,
        pinnedCardId:      null,
        memoryPatch:       null,
        conversationId,
        aiActive,
      });
    }

    // Fetch flat catalog for WaiterBrainV2 card selection (lightweight query)
    const catalogRows = await prisma.menuItem.findMany({
      where:   { isActive: true, isAvailable: true, showInDelivery: true, category: { restaurantId: restaurant.id } },
      orderBy: { sortOrder: "asc" },
      select:  {
        id: true, name: true, price: true,
        priceDelivery: true, priceDineIn: true, priceIfood: true,
        description: true, sortOrder: true,
        servingSize: true, portionInfo: true,
        tagFunil: true, perfilPaladar: true, harmonizacaoSugerida: true,
        alergenosDetalhados: true, storytellingIA: true,
        category: { select: { name: true } },
      },
    });
    const catalogItems: V2CatalogItem[] = catalogRows.map((i: typeof catalogRows[number]) => ({
      id:                   i.id,
      name:                 i.name,
      categoryName:         (i.category as { name: string } | null)?.name ?? "",
      // /pedido is the delivery channel — Waiter suggests delivery prices.
      price:                channelPrice(i, "DELIVERY"),
      sortOrder:            i.sortOrder ?? undefined,
      description:          i.description ?? null,
      servingSize:          (i.servingSize as number | null) ?? null,
      portionInfo:          (i.portionInfo as string | null) ?? null,
      tagFunil:             i.tagFunil ?? null,
      perfilPaladar:        i.perfilPaladar ?? null,
      harmonizacaoSugerida: i.harmonizacaoSugerida ?? null,
      alergenosDetalhados:  i.alergenosDetalhados ?? null,
      storytellingIA:       i.storytellingIA ?? null,
      salesCount:           null,
      isBestSeller:         null,
    }));

    // Enrich catalog with best-seller metrics so the Waiter orders cards by most-sold
    // first. Cached per restaurant; degrades to deterministic fallback ordering on error.
    try {
      const bestSellerMap = await getBestSellerMap(restaurant.id);
      applyBestSellers(catalogItems, bestSellerMap);
    } catch {
      /* non-fatal — fallback ordering (sortOrder/name) still applies */
    }

    const { reply, cards, mode, options, suggestedItemName, pinnedCardId, memoryPatch } = await AIOrderService.runWebTurn({
      restaurantId:  restaurant.id,
      message:       message?.trim() ?? "",
      history,
      cart,
      stage,
      upsellOffered,
      deliveryMethod,
      address,
      paymentMethod,
      customerName,
      customerPhone:  customerPhone ?? undefined,
      categoryIntro,
      event,
      catalogItems,
      lastAddedId,
      suggestedProductIds: Array.isArray(suggestedProductIds) ? suggestedProductIds : [],
      waiterMemory:        waiterMemory ?? undefined,
      // Sem registro de marca → null = "use o padrão legado" (bebida → sobremesa).
      upsellCategories:    restaurant.brandConfig?.waiterUpsellCategories ?? null,
    });

    console.info("[waiter]", JSON.stringify({
      event,
      mode:    mode    ?? "BROWSE",
      cards:   (cards  ?? []).length,
      options: (options ?? []).length,
    }));

    // Log AI reply for any event that produced a visible reply (fire-and-forget).
    // Dedup window guards against duplicate greetings when the customer reloads
    // /pedido and ON_ENTRY (or repeated silent events) re-fire the same reply.
    if (conversationId && reply) {
      ConversationLogService.logMessage({
        conversationId,
        restaurantId:   restaurant.id,
        senderType:     "AI",
        content:        reply,
        metadata:       { source: "CARDAPIO" },
        dedupeWindowMs: event === "ON_USER_MESSAGE" ? 0 : 60_000,
      }).catch((e) => console.error("[waiter] AI reply logging failed (non-fatal)", e));
    }

    return ok({
      reply,
      cards,
      mode:              mode ?? "BROWSE",
      options:           options ?? [],
      suggestedItemName: suggestedItemName ?? null,
      pinnedCardId:      pinnedCardId ?? null,
      memoryPatch:       memoryPatch ?? null,
      conversationId,
      aiActive,
    });
  } catch (err) {
    console.error("[POST /api/pedido/[slug]]", err);
    return serverError("Erro interno ao processar mensagem.");
  }
}
