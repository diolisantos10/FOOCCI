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

import { NextRequest } from "next/server";
import { prisma }      from "@/lib/prisma";
import { ok, badRequest, serverError } from "@/lib/api-response";
import { AIOrderService } from "@/services/ai/AIOrderService";
import type { V2Event } from "@/services/ai/WaiterBrainV2";
import type { OrderStage } from "@/lib/agent/types";
import { rateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

// ── Request shape ─────────────────────────────────────────────────────────────

interface HistoryEntry { role: "user" | "assistant"; content: string; }
interface CartItem     { id?: string; name: string; price: number; qty: number; }

interface PedidoChatRequest {
  message:         string;
  history:         HistoryEntry[];
  cart?:           CartItem[];
  stage?:          OrderStage;
  upsellOffered?:  "drink" | "dessert" | null;
  deliveryMethod?: "delivery" | "pickup" | null;
  address?:        string | null;
  paymentMethod?:  string | null;
  customerName?:   string | null;
  customerPhone?:  string | null;
  categoryIntro?:  { name: string; description: string } | null;
  // ── V2 fields ─────────────────────────────────────────────────
  event?:          V2Event;
  lastAddedId?:    string;
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
          select:  { id: true, name: true, price: true, description: true, imageUrl: true },
        },
      },
    });

    return ok({
      restaurantName: restaurant.name,
      categories: categories.map((c) => ({
        id:       c.id,
        name:     c.name,
        imageUrl: c.imageUrl ?? null,
        items: c.items.map((i) => ({
          id:          i.id,
          name:        i.name,
          price:       Number(i.price),
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
      select: { id: true },
    });
    if (!restaurant) return badRequest("Restaurante não encontrado.");

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
      categoryIntro  = null,
      event          = "ON_USER_MESSAGE",
      lastAddedId,
    } = body;

    // ON_IDLE and non-AI events may arrive with an empty message
    if (event === "ON_USER_MESSAGE" && !message?.trim()) {
      return badRequest("message is required for ON_USER_MESSAGE.");
    }
    if (!Array.isArray(history)) return badRequest("history must be an array.");

    // Fetch flat catalog for WaiterBrainV2 card selection (lightweight query)
    const catalogRows = await prisma.menuItem.findMany({
      where:   { isActive: true, isAvailable: true, showInDelivery: true, category: { restaurantId: restaurant.id } },
      orderBy: { sortOrder: "asc" },
      select:  { id: true, name: true, price: true, sortOrder: true, category: { select: { name: true } } },
    });
    const catalogItems = catalogRows.map((i: typeof catalogRows[number]) => ({
      id:           i.id,
      name:         i.name,
      categoryName: (i.category as { name: string } | null)?.name ?? "",
      price:        Number(i.price),
      sortOrder:    i.sortOrder ?? undefined,
    }));

    const { reply, cards, mode, options, suggestedItemName } = await AIOrderService.runWebTurn({
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
    });

    return ok({ reply, cards, mode: mode ?? "BROWSE", options: options ?? [], suggestedItemName: suggestedItemName ?? null });
  } catch (err) {
    console.error("[POST /api/pedido/[slug]]", err);
    return serverError("Erro interno ao processar mensagem.");
  }
}
