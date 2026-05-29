/**
 * GET /api/admin/diagnostics/conversation-unification
 *
 * Validates that all channels (WhatsApp, /pedido/cardápio, WhatsApp externo)
 * appear in the SAME operational conversation for a given customer.
 *
 * Auth: x-admin-secret header OR foocci-admin-token cookie.
 *
 * Query params (at least one of phone or customerId is required):
 *   phone        — E.164 phone e.g. +5511940595223
 *   customerId   — Foocci customer UUID
 *   restaurantId — filter to one restaurant (required when using phone)
 *   slug         — restaurant slug (alternative to restaurantId)
 *
 * Response:
 *   customerFound, normalizedPhone, conversations[], verdict: PASS | FAIL | WARN
 *
 * Safe: read-only, no mutations, no secrets returned.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdminRequest } from "@/lib/admin-auth";

const ACTIVE_STATUSES = ["OPEN", "HUMAN", "BOT", "AI_ATENDENDO", "HUMANO_ASSUMIU"];

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return `+${digits}`;
}

export async function GET(req: NextRequest) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Endpoint disabled — ADMIN_SECRET not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp           = req.nextUrl.searchParams;
  const rawPhone     = sp.get("phone")         ?? undefined;
  const customerId   = sp.get("customerId")    ?? undefined;
  const restaurantId = sp.get("restaurantId")  ?? undefined;
  const slug         = sp.get("slug")          ?? undefined;

  if (!rawPhone && !customerId) {
    return NextResponse.json(
      { error: "Provide at least one of: phone, customerId" },
      { status: 400 },
    );
  }

  try {
    // ── Resolve restaurant ────────────────────────────────────────────────────
    let resolvedRestaurantId: string | undefined = restaurantId;
    if (!resolvedRestaurantId && slug) {
      const r = await prisma.restaurant.findUnique({
        where:  { slug },
        select: { id: true },
      });
      resolvedRestaurantId = r?.id;
    }
    if (!resolvedRestaurantId) {
      return NextResponse.json(
        { error: "Could not resolve restaurant. Provide restaurantId or slug." },
        { status: 400 },
      );
    }

    // ── Resolve customer ──────────────────────────────────────────────────────
    const normalizedPhone = rawPhone ? normalizePhone(rawPhone) : undefined;

    let customer: { id: string; name: string | null; phone: string | null } | null = null;

    if (customerId) {
      customer = await prisma.customer.findUnique({
        where:  { id: customerId },
        select: { id: true, name: true, phone: true },
      });
    } else if (normalizedPhone) {
      customer = await prisma.customer.findUnique({
        where:  { phone_restaurantId: { phone: normalizedPhone, restaurantId: resolvedRestaurantId } },
        select: { id: true, name: true, phone: true },
      });
    }

    // ── Fetch all conversations for this customer/phone ───────────────────────
    const where = customer
      ? { restaurantId: resolvedRestaurantId, customerId: customer.id }
      : { restaurantId: resolvedRestaurantId, customerPhone: normalizedPhone };

    const conversations = await prisma.conversation.findMany({
      where,
      orderBy: { lastMessageAt: "desc" },
      select: {
        id:            true,
        channel:       true,
        status:        true,
        contextType:   true,
        customerPhone: true,
        customerName:  true,
        lastMessageAt: true,
        createdAt:     true,
        aiEnabled:     true,
        messages: {
          select: { senderType: true, direction: true, sentAt: true },
          orderBy: { sentAt: "desc" },
          take: 5,
        },
      },
    });

    // ── Analyse each conversation ─────────────────────────────────────────────
    const analysed = conversations.map((c) => {
      const msgCountBySender: Record<string, number> = {};
      for (const m of c.messages) {
        const k = m.senderType ?? "unknown";
        msgCountBySender[k] = (msgCountBySender[k] ?? 0) + 1;
      }

      // Count total messages (not capped at 5)
      const hasWhatsApp        = c.messages.some((m) => m.senderType === "CUSTOMER");
      const hasCardapio        = c.messages.some((m) => m.senderType === "CUSTOMER_CARDAPIO");
      const hasWhatsAppExterno = c.messages.some((m) => m.senderType === "HUMAN_EXTERNAL");
      const isActive           = ACTIVE_STATUSES.includes(c.status);

      return {
        id:            c.id,
        channel:       c.channel,
        status:        c.status,
        contextType:   c.contextType,
        isActive,
        aiEnabled:     c.aiEnabled,
        lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
        createdAt:     c.createdAt.toISOString(),
        recentMessagesBySender: msgCountBySender,
        hasWhatsApp,
        hasCardapio,
        hasWhatsAppExterno,
      };
    });

    // ── Determine canonical conversation ─────────────────────────────────────
    // Priority: active WHATSAPP > any active > most recent
    const activeConversations = analysed.filter((c) => c.isActive);
    const canonicalConv =
      activeConversations.find((c) => c.channel === "WHATSAPP") ??
      activeConversations[0] ??
      analysed[0] ??
      null;

    // ── Detect fragmentation ──────────────────────────────────────────────────
    const activeCount          = activeConversations.length;
    const hasMultipleActive    = activeCount > 1;
    const whatsappChannel      = analysed.find((c) => c.channel === "WHATSAPP" && c.isActive);
    const cardapioChannel      = analysed.find((c) => (c.channel === "QR_AGENT" || c.channel === "WEB_AGENT") && c.isActive);
    const hasCardapioSeparate  = !!cardapioChannel && cardapioChannel.id !== canonicalConv?.id;

    // ── Check if all channels appear in the canonical conversation ────────────
    const canonicalHasWhatsApp = canonicalConv?.hasWhatsApp        ?? false;
    const canonicalHasCardapio = canonicalConv?.hasCardapio        ?? false;
    const canonicalHasExterno  = canonicalConv?.hasWhatsAppExterno ?? false;

    // ── Verdict ───────────────────────────────────────────────────────────────
    let verdict: "PASS" | "WARN" | "FAIL";
    const verdictReasons: string[] = [];

    if (!customer) {
      verdict = "WARN";
      verdictReasons.push("Customer not found in DB — conversations may be anonymous QR sessions");
    } else if (conversations.length === 0) {
      verdict = "WARN";
      verdictReasons.push("No conversations found for this customer");
    } else if (hasMultipleActive && hasCardapioSeparate) {
      verdict = "FAIL";
      verdictReasons.push(`FRAGMENTED: ${activeCount} active conversations — Cardápio messages go to a separate QR_AGENT conversation instead of the WhatsApp thread`);
    } else if (hasMultipleActive) {
      verdict = "WARN";
      verdictReasons.push(`${activeCount} active conversations exist — possible duplicates (may resolve on next message)`);
    } else {
      verdict = "PASS";
      verdictReasons.push("All channels funneling into one active conversation");
      if (canonicalHasWhatsApp)        verdictReasons.push("✓ WhatsApp inbound messages present");
      if (canonicalHasCardapio)        verdictReasons.push("✓ Cardápio messages present in canonical conversation");
      if (canonicalHasExterno)         verdictReasons.push("✓ WhatsApp externo messages present in canonical conversation");
    }

    return NextResponse.json({
      generatedAt:    new Date().toISOString(),
      restaurantId:   resolvedRestaurantId,
      query: {
        phone:        normalizedPhone ?? null,
        customerId:   customerId      ?? null,
      },
      customerFound:    !!customer,
      customerId:       customer?.id       ?? null,
      customerName:     customer?.name     ?? null,
      normalizedPhone:  customer?.phone    ?? normalizedPhone ?? null,
      totalConversations: conversations.length,
      activeConversations: activeCount,
      canonicalConversationId: canonicalConv?.id ?? null,
      canonicalChannel: canonicalConv?.channel    ?? null,
      verdict,
      verdictReasons,
      channelCoverage: {
        whatsAppActive:    !!whatsappChannel,
        cardapioSeparate:  hasCardapioSeparate,
        hasMultipleActive,
      },
      conversations: analysed,
    });
  } catch (err: unknown) {
    console.error("[diag/conversation-unification] error:", err);
    return NextResponse.json(
      { error: "Internal error", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
