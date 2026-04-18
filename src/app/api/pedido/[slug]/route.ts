/**
 * /api/pedido/[slug]
 *
 * Public (no auth) API for the external ordering experience.
 *
 * GET  — return the restaurant menu
 * POST — AI sales agent, powered by runAITurn() (src/lib/ai-context/runner)
 */

import { NextRequest } from "next/server";
import { prisma }      from "@/lib/prisma";
import { ok, badRequest, serverError } from "@/lib/api-response";
import { runAITurn }   from "@/lib/ai-context/runner";
import type { OrderStage } from "@/lib/agent/types";

// ── Request shape ─────────────────────────────────────────────────────────────

interface HistoryEntry { role: "user" | "assistant"; content: string; }
interface CartItem     { name: string; price: number; qty: number; }

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
  categoryIntro?:  { name: string; description: string } | null;
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
        id:      c.id,
        name:    c.name,
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
      categoryIntro  = null,
    } = body;

    if (!message?.trim())        return badRequest("message is required.");
    if (!Array.isArray(history)) return badRequest("history must be an array.");

    const { reply } = await runAITurn({
      restaurantId: restaurant.id,
      message:      message.trim(),
      history,
      cart,
      stage,
      upsellOffered,
      deliveryMethod,
      address,
      paymentMethod,
      customerName,
      categoryIntro,
    });

    return ok({ reply });
  } catch (err) {
    console.error("[POST /api/pedido/[slug]]", err);
    return serverError("Erro interno ao processar mensagem.");
  }
}
