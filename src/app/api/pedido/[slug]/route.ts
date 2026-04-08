/**
 * /api/pedido/[slug]
 *
 * Public (no auth) API for the external ordering experience.
 *
 * GET  — return the restaurant menu
 * POST — AI sales agent (structured 4-layer prompt via src/lib/agent/)
 */

import { NextRequest } from "next/server";
import { prisma }      from "@/lib/prisma";
import { openai }      from "@/lib/openai";
import { ok, badRequest, serverError } from "@/lib/api-response";
import type OpenAI from "openai";

import { buildAgentPrompt }                   from "@/lib/agent/builder";
import {
  DEFAULT_PERSONALITY,
  DEFAULT_SALES,
  ALLOWED_MODELS,
} from "@/lib/agent/types";
import type {
  PersonalityConfig,
  SalesConfig,
  AgentContext,
  OrderStage,
} from "@/lib/agent/types";

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
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Coerce a DB string value to a known union type, falling back to the default.
 * Avoids casting unknown strings directly onto discriminated union types.
 */
function coerce<T extends string>(value: string | null | undefined, allowed: T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
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
      select: { id: true, name: true },
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
    } = body;

    if (!message?.trim())        return badRequest("message is required.");
    if (!Array.isArray(history)) return badRequest("history must be an array.");

    // ── Fetch menu + brand config in parallel ─────────────────────────────────
    const [categories, brandConfig] = await Promise.all([
      prisma.menuCategory.findMany({
        where:   { restaurantId: restaurant.id, isActive: true, isAvailable: true },
        orderBy: { sortOrder: "asc" },
        include: {
          items: {
            where:   { isActive: true, isAvailable: true, showInDelivery: true },
            orderBy: { sortOrder: "asc" },
            select:  { name: true, price: true, description: true, imageUrl: true },
          },
        },
      }),
      prisma.restaurantBrandConfig.findUnique({
        where:  { restaurantId: restaurant.id },
        select: {
          tone:               true,
          formality:          true,
          emojiUsage:         true,
          communicationStyle: true,
          personalityPreset:  true,
          greetingTemplate:   true,
          upsellStyle:        true,
          upsellIntensity:    true,
          salesFocus:         true,
          salesPriority:      true,
          systemPromptOverride: true,
          aiModel:            true,
          maxHistoryMessages: true,
        },
      }),
    ]);

    // ── Build PersonalityConfig from DB (with coercion + defaults) ────────────
    const personality: PersonalityConfig = {
      tone: coerce(
        brandConfig?.tone,
        ["friendly", "professional", "casual", "warm"],
        DEFAULT_PERSONALITY.tone,
      ),
      formality: coerce(
        brandConfig?.formality,
        ["formal", "informal", "mixed"],
        DEFAULT_PERSONALITY.formality,
      ),
      emojiUsage: coerce(
        brandConfig?.emojiUsage,
        ["none", "minimal", "moderate", "expressive"],
        DEFAULT_PERSONALITY.emojiUsage,
      ),
      communicationStyle: coerce(
        brandConfig?.communicationStyle,
        ["conversational", "concise", "detailed"],
        DEFAULT_PERSONALITY.communicationStyle,
      ),
      preset: coerce(
        brandConfig?.personalityPreset,
        ["traditional", "fast", "premium", "young", "aggressive"],
        DEFAULT_PERSONALITY.preset,
      ),
      greetingTemplate: brandConfig?.greetingTemplate ?? null,
    };

    // ── Build SalesConfig from DB ─────────────────────────────────────────────
    const sales: SalesConfig = {
      upsellStyle: coerce(
        brandConfig?.upsellStyle,
        ["none", "gentle", "moderate", "proactive"],
        DEFAULT_SALES.upsellStyle,
      ),
      upsellIntensity: coerce(
        brandConfig?.upsellIntensity,
        ["low", "medium", "high"],
        DEFAULT_SALES.upsellIntensity,
      ),
      focus: coerce(
        brandConfig?.salesFocus,
        ["balanced", "ticket", "volume"],
        DEFAULT_SALES.focus,
      ),
      priority: coerce(
        brandConfig?.salesPriority,
        ["bestsellers", "high_margin", "promotions"],
        DEFAULT_SALES.priority,
      ),
    };

    // ── Assemble agent context ────────────────────────────────────────────────
    const context: AgentContext = {
      restaurantName: restaurant.name,
      categories,
      cart,
      stage:          stage as OrderStage,
      upsellOffered,
      deliveryMethod,
    };

    // ── Build system prompt ───────────────────────────────────────────────────
    // systemPromptOverride bypasses all agent layers — escape hatch for power users.
    const systemPrompt = brandConfig?.systemPromptOverride
      ?? buildAgentPrompt(personality, sales, context);

    // ── Whitelist AI model ────────────────────────────────────────────────────
    const aiModel    = ALLOWED_MODELS.has(brandConfig?.aiModel ?? "")
      ? brandConfig!.aiModel
      : "gpt-4o-mini";
    const maxHistory = brandConfig?.maxHistoryMessages ?? 20;

    // ── Call OpenAI ───────────────────────────────────────────────────────────
    const cappedHistory = history.slice(-maxHistory);

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system",  content: systemPrompt },
      ...cappedHistory.map((m) => ({ role: m.role, content: m.content })),
      { role: "user",    content: message.trim() },
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
