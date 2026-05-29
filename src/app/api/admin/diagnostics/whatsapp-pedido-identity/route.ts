/**
 * GET /api/admin/diagnostics/whatsapp-pedido-identity
 *
 * Traces the full WhatsApp → /pedido identity chain to find exactly where
 * customer recognition fails.
 *
 * Auth: x-admin-secret header OR foocci-admin-token cookie.
 *
 * Query params:
 *   slug   — restaurant slug (default: sushi-cazza)
 *   phone  — E.164 test phone e.g. +5511940595223
 *
 * Returns: step-by-step verdict for every node in the pipeline.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdminRequest } from "@/lib/admin-auth";
import { signWaToken, verifyWaToken } from "@/lib/wa-token";
import { phoneCandidates } from "@/lib/phone";
import { getPublicMenuUrl, sanitizeCustomerUrl } from "@/lib/public-url";

export async function GET(req: NextRequest) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Endpoint disabled — ADMIN_SECRET not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp    = req.nextUrl.searchParams;
  const slug  = sp.get("slug")  ?? "sushi-cazza";
  const phone = sp.get("phone") ?? "";

  if (!phone) {
    return NextResponse.json({ error: "phone param required, e.g. ?phone=+5511940595223" }, { status: 400 });
  }

  const result: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    slug,
    phone,
  };

  // ── Step 1: Resolve restaurant ────────────────────────────────────────────
  const restaurant = await prisma.restaurant.findUnique({
    where:  { slug },
    select: { id: true, name: true, slug: true },
  });
  result.step1_restaurant = restaurant
    ? { found: true, restaurantId: restaurant.id, name: restaurant.name }
    : { found: false, error: `No restaurant with slug="${slug}"` };
  if (!restaurant) return NextResponse.json(result);

  // ── Step 2: Resolve customer by phone ─────────────────────────────────────
  const candidates = phoneCandidates(phone);
  let customer: { id: string; name: string; phone: string } | null = null;
  if (candidates.length > 0) {
    customer = await prisma.customer.findFirst({
      where:  { restaurantId: restaurant.id, phone: { in: candidates } },
      select: { id: true, name: true, phone: true },
    });
  }
  result.step2_customer = {
    inputPhone:  phone,
    candidates,
    found:       !!customer,
    customerId:  customer?.id   ?? null,
    customerPhone: customer?.phone ?? null,
    customerName: customer?.name  ?? null,
    mismatchNote: customer && customer.phone !== phone
      ? `DB phone "${customer.phone}" differs from input "${phone}" — both are valid candidates`
      : null,
  };

  // ── Step 3: Check agentCfg.menuUrl ───────────────────────────────────────
  const agentCfg = await prisma.whatsAppAgentConfig.findUnique({
    where:  { restaurantId: restaurant.id },
    select: { menuUrl: true, menuOptions: true },
  });
  const rawMenuUrl = agentCfg?.menuUrl?.trim() || getPublicMenuUrl(restaurant.slug);
  const fixedMenuUrl = rawMenuUrl?.replace(/\/qr\/([^/?]+)/, "/pedido/$1") ?? rawMenuUrl;
  const basePedidoUrl = fixedMenuUrl ? sanitizeCustomerUrl(fixedMenuUrl) : null;

  result.step3_menuUrl = {
    configuredMenuUrl: agentCfg?.menuUrl ?? null,
    rawMenuUrl,
    fixedMenuUrl,
    basePedidoUrl,
    isRelativeUrl: basePedidoUrl ? !basePedidoUrl.startsWith("http") : null,
    isQrUrl:       rawMenuUrl?.includes("/qr/") ?? false,
    menuOptions:   agentCfg?.menuOptions ?? "null (fallback defaults will apply)",
  };

  // ── Step 4: NEXTAUTH_SECRET check ────────────────────────────────────────
  const secretPresent = !!process.env.NEXTAUTH_SECRET;
  const secretLen     = process.env.NEXTAUTH_SECRET?.length ?? 0;
  result.step4_secret = {
    NEXTAUTH_SECRET_set: secretPresent,
    NEXTAUTH_SECRET_len: secretLen,
    APP_SECRET_set:      !!process.env.APP_SECRET,
    note: !secretPresent ? "MISSING — signWaToken will throw in production!" : "OK",
  };

  // ── Step 5: Sign waToken ──────────────────────────────────────────────────
  const phoneForToken = customer?.phone ?? phone;
  let token: string | null = null;
  let signError: string | null = null;
  try {
    token = signWaToken({
      phone: phoneForToken,
      name:  customer?.name?.trim().split(/\s+/)[0] ?? undefined,
    });
  } catch (err) {
    signError = err instanceof Error ? err.message : String(err);
  }

  result.step5_signToken = {
    phoneUsed:   phoneForToken,
    signSucceeded: !!token,
    signError,
    tokenPreview:  token ? `${token.slice(0, 30)}...` : null,
    tokenLength:   token?.length ?? null,
  };

  // ── Step 6: Verify round-trip ─────────────────────────────────────────────
  let verifyPayload: { phone: string; name?: string; exp: number } | null = null;
  let verifyError: string | null = null;
  if (token) {
    try {
      verifyPayload = verifyWaToken(token);
    } catch (err) {
      verifyError = err instanceof Error ? err.message : String(err);
    }
  }
  result.step6_verifyRoundTrip = {
    token: token ? "present" : "absent",
    verifySucceeded: !!verifyPayload,
    verifyError,
    tokenPhone:  verifyPayload?.phone ?? null,
    tokenName:   verifyPayload?.name  ?? null,
    tokenExpMs:  verifyPayload?.exp   ?? null,
    tokenExpISO: verifyPayload?.exp ? new Date(verifyPayload.exp).toISOString() : null,
    phonesMatch: verifyPayload?.phone === phoneForToken,
  };

  // ── Step 7: Build the full pedido URL ─────────────────────────────────────
  let pedidoUrl: string | null = null;
  let urlBuildError: string | null = null;
  if (token && basePedidoUrl) {
    try {
      const url = new URL(basePedidoUrl);
      url.searchParams.set("waToken", token);
      url.searchParams.set("src", "whatsapp");
      pedidoUrl = url.toString();
    } catch (err) {
      urlBuildError = err instanceof Error ? err.message : String(err);
    }
  }
  result.step7_pedidoUrl = {
    basePedidoUrl,
    pedidoUrlGenerated: !!pedidoUrl,
    pedidoUrlPreview:   pedidoUrl ? pedidoUrl.slice(0, 120) + (pedidoUrl.length > 120 ? "..." : "") : null,
    hasWaTokenParam:    pedidoUrl?.includes("waToken=") ?? false,
    hasSrcParam:        pedidoUrl?.includes("src=whatsapp") ?? false,
    urlBuildError,
  };

  // ── Step 8: Simulate page.tsx SSR resolution ──────────────────────────────
  // Reproduce exactly what page.tsx does: verify token → phoneCandidates → DB lookup
  let ssrCustomer: { id: string; name: string; phone: string } | null = null;
  let ssrError: string | null = null;
  if (verifyPayload?.phone) {
    const ssrCandidates = phoneCandidates(verifyPayload.phone);
    try {
      ssrCustomer = ssrCandidates.length > 0
        ? await prisma.customer.findFirst({
            where:  { restaurantId: restaurant.id, phone: { in: ssrCandidates } },
            select: { id: true, name: true, phone: true },
          })
        : null;
    } catch (err) {
      ssrError = err instanceof Error ? err.message : String(err);
    }
    result.step8_ssrResolution = {
      tokenPhone:         verifyPayload.phone,
      ssrCandidates,
      customerFound:      !!ssrCustomer,
      customerId:         ssrCustomer?.id   ?? null,
      customerPhone:      ssrCustomer?.phone ?? null,
      customerName:       ssrCustomer?.name  ?? null,
      ssrError,
      verdict: ssrCustomer
        ? "PASS — SSR would set knownCustomerId + knownCustomerPhone"
        : (token ? "FAIL — token verifies but DB lookup returns null" : "FAIL — no valid token"),
    };
  } else {
    result.step8_ssrResolution = {
      verdict: "SKIP — token not available or verification failed",
    };
  }

  // ── Step 9: Latest WhatsApp conversation ─────────────────────────────────
  if (customer) {
    const conv = await prisma.conversation.findFirst({
      where:   { restaurantId: restaurant.id, customerId: customer.id },
      orderBy: { lastMessageAt: "desc" },
      select: {
        id:            true,
        channel:       true,
        status:        true,
        customerPhone: true,
        lastMessageAt: true,
        aiEnabled:     true,
        messages: {
          where:   { direction: "OUTBOUND", senderType: "AI" },
          orderBy: { sentAt: "desc" },
          take:    1,
          select:  { content: true, sentAt: true },
        },
      },
    });

    result.step9_latestConversation = conv ? {
      conversationId:  conv.id,
      channel:         conv.channel,
      status:          conv.status,
      conversationPhone: conv.customerPhone,
      lastMessageAt:   conv.lastMessageAt?.toISOString() ?? null,
      aiEnabled:       conv.aiEnabled,
      lastAiReply:     conv.messages[0]
        ? { preview: conv.messages[0].content.slice(0, 100), sentAt: conv.messages[0].sentAt.toISOString() }
        : null,
      lastAiReplyHasLink: conv.messages[0]
        ? conv.messages[0].content.includes("foocci.com.br/pedido")
        : null,
      lastAiReplyHasWaToken: conv.messages[0]
        ? conv.messages[0].content.includes("waToken=")
        : null,
    } : { found: false };
  } else {
    result.step9_latestConversation = { note: "Customer not in DB — no conversation to check" };
  }

  // ── Summary verdict ───────────────────────────────────────────────────────
  const ssrRes = result.step8_ssrResolution as Record<string, unknown>;
  const signOk    = (result.step5_signToken as Record<string, unknown>).signSucceeded;
  const verifyOk  = (result.step6_verifyRoundTrip as Record<string, unknown>).verifySucceeded;
  const urlOk     = (result.step7_pedidoUrl as Record<string, unknown>).hasWaTokenParam;
  const ssrOk     = ssrRes.customerFound ?? ssrRes.verdict === "PASS — SSR would set knownCustomerId + knownCustomerPhone";

  const failures: string[] = [];
  if (!signOk)   failures.push("signWaToken failed — no waToken in WhatsApp link");
  if (!verifyOk) failures.push("verifyWaToken failed — token round-trip broken");
  if (!urlOk)    failures.push("pedido URL missing waToken param");
  if (!ssrOk)    failures.push("SSR page.tsx would NOT recognize customer from token");
  if ((result.step3_menuUrl as Record<string, unknown>).isRelativeUrl) {
    failures.push("menuUrl is relative — buildIdentifiedPedidoUrl cannot append waToken");
  }
  if ((result.step3_menuUrl as Record<string, unknown>).isQrUrl) {
    failures.push("menuUrl still points to /qr/ — fix remap may not have taken effect");
  }

  result.summary = {
    verdict:  failures.length === 0 ? "PASS — identity chain intact" : "FAIL",
    failures,
    recommendation: failures.length === 0
      ? "Token chain is correct. Issue may be client-side (sessionStorage, React hydration, or browser cache). Check browser devtools."
      : failures.join("; "),
  };

  return NextResponse.json(result, { status: 200 });
}
