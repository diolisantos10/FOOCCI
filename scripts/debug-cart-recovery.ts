/**
 * scripts/debug-cart-recovery.ts
 *
 * Diagnostic: shows latest OPEN OrderDraft state and full eligibility check.
 * Read-only — makes no changes to the database.
 *
 * Usage (run on a machine that has DATABASE_URL):
 *   DATABASE_URL=<your-url> npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/debug-cart-recovery.ts
 *
 * Optional env overrides:
 *   PHONE="+5511987654321"   — filter to one customer phone
 *   INACTIVITY_MINUTES=2    — override threshold (default: 2)
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const inactivityMinutes = Number(process.env.INACTIVITY_MINUTES ?? "2");
const phoneFilter       = process.env.PHONE ?? null;

async function main() {
  const now           = new Date();
  const thresholdDate = new Date(Date.now() - inactivityMinutes * 60_000);
  const oneDayAgo     = new Date(Date.now() - 24 * 60 * 60_000);

  console.log("\n════════════════════════════════════════════════════════");
  console.log(" Cart Recovery Diagnostic");
  console.log(`════════════════════════════════════════════════════════`);
  console.log(` Now            : ${now.toISOString()}`);
  console.log(` Threshold      : ${thresholdDate.toISOString()} (updatedAt must be older)`);
  console.log(` Phone filter   : ${phoneFilter ?? "(all customers)"}`);
  console.log("════════════════════════════════════════════════════════\n");

  // ── 1. All OPEN drafts with items ──────────────────────────────────────────
  const openDrafts = await prisma.orderDraft.findMany({
    where: {
      status:   "OPEN",
      items:    { some: {} },
      ...(phoneFilter
        ? { customer: { phone: { contains: phoneFilter.replace(/\D/g, "") } } }
        : {}),
    },
    select: {
      id:               true,
      restaurantId:     true,
      customerId:       true,
      updatedAt:        true,
      createdAt:        true,
      recoveryAttempts: true,
      lastRecoveryAt:   true,
      abandonedAt:      true,
      customer: { select: { id: true, name: true, phone: true } },
      restaurant: { select: { slug: true } },
      _count: { select: { items: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });

  console.log(`OPEN drafts with items: ${openDrafts.length}`);

  if (openDrafts.length === 0) {
    console.log("\n  ⚠  No OPEN drafts found.");
    console.log("  Root cause A: Draft not created — draft sync or sendBeacon failed silently.");
    console.log("  Check: browser DevTools → Network tab → POST /api/pedido/[slug]/draft");
    console.log("  Check: sessionStorage key foocci-draft-{slug} should be set after adding items\n");
    return;
  }

  // ── 2. Per-draft eligibility ───────────────────────────────────────────────
  const uniqueCustomerIds = [...new Set(openDrafts.map((d) => d.customerId))];
  const uniqueRestaurantIds = [...new Set(openDrafts.map((d) => d.restaurantId))];

  const recentlyRecoveredDrafts = await prisma.orderDraft.findMany({
    where: { customerId: { in: uniqueCustomerIds }, lastRecoveryAt: { gt: oneDayAgo } },
    select: { customerId: true },
  });
  const dailyLimitSet = new Set(recentlyRecoveredDrafts.map((d: { customerId: string }) => d.customerId));

  const pendingPaymentOrders = await prisma.order.findMany({
    where: {
      status:       "AWAITING_PAYMENT",
      customerId:   { in: uniqueCustomerIds },
      restaurantId: { in: uniqueRestaurantIds },
    },
    select: { customerId: true, restaurantId: true },
  });
  const pendingSet = new Set(pendingPaymentOrders.map((o: { restaurantId: string; customerId: string }) => `${o.restaurantId}:${o.customerId}`));

  // Canal de WhatsApp = Meta Cloud API (único desde 04/08/2026; a Evolution e a
  // tabela EvolutionConfig foram removidas). O que importa aqui continua sendo o
  // mesmo: este restaurante consegue mandar mensagem?
  const metaConfigs = await prisma.metaWhatsAppConfig.findMany({
    where: { restaurantId: { in: uniqueRestaurantIds } },
    select: { restaurantId: true, connectionStatus: true, displayPhoneNumber: true },
  });
  const whatsappMap = new Map(metaConfigs.map((c: { restaurantId: string; connectionStatus: string | null; displayPhoneNumber: string | null }) => [c.restaurantId, c]));

  console.log("\n──────────────────────────────────────────────────────");
  console.log(" Draft Eligibility Report");
  console.log("──────────────────────────────────────────────────────");

  for (const draft of openDrafts) {
    const c    = draft.customer;
    const age  = Math.round((now.getTime() - draft.updatedAt.getTime()) / 1000);
    const key  = `${draft.restaurantId}:${draft.customerId}`;

    console.log(`\nDraft: ${draft.id}`);
    console.log(`  Restaurant  : ${draft.restaurant.slug}`);
    console.log(`  Customer    : ${c.name} (${c.phone ?? "NO PHONE"})`);
    console.log(`  Items       : ${draft._count.items}`);
    console.log(`  updatedAt   : ${draft.updatedAt.toISOString()} (${age}s ago)`);
    console.log(`  createdAt   : ${draft.createdAt.toISOString()}`);
    console.log(`  recoveryAttempts: ${draft.recoveryAttempts}`);
    console.log(`  lastRecoveryAt  : ${draft.lastRecoveryAt?.toISOString() ?? "null"}`);

    const rules: { rule: string; pass: boolean; note: string }[] = [];

    rules.push({
      rule: "status = OPEN",
      pass: true,
      note: "confirmed (query filter)",
    });

    rules.push({
      rule: `updatedAt < NOW − ${inactivityMinutes}min`,
      pass: draft.updatedAt < thresholdDate,
      note: draft.updatedAt < thresholdDate
        ? `age ${age}s > threshold ${inactivityMinutes * 60}s`
        : `age ${age}s ≤ threshold ${inactivityMinutes * 60}s — TOO RECENT, wait ${inactivityMinutes * 60 - age}s`,
    });

    rules.push({
      rule: "has items",
      pass: draft._count.items > 0,
      note: `${draft._count.items} item(s)`,
    });

    const hasPhone = !!c.phone && c.phone.length >= 8;
    const digits   = c.phone?.replace(/\D/g, "") ?? "";
    const isGuest  = !c.phone || c.phone.startsWith("guest_") || c.phone.includes("@") || c.phone.startsWith("anon_");
    rules.push({
      rule: "phone valid + non-guest",
      pass: hasPhone && !isGuest,
      note: hasPhone && !isGuest
        ? `phone: ${c.phone} (digits: ${digits.length})`
        : `phone: ${c.phone ?? "null"} — INVALID`,
    });

    rules.push({
      rule: "recoveryAttempts = 0",
      pass: draft.recoveryAttempts === 0,
      note: `recoveryAttempts = ${draft.recoveryAttempts}`,
    });

    rules.push({
      rule: "daily limit not hit",
      pass: !dailyLimitSet.has(draft.customerId),
      note: dailyLimitSet.has(draft.customerId)
        ? "customer already recovered today"
        : "no recovery today",
    });

    rules.push({
      rule: "no AWAITING_PAYMENT order",
      pass: !pendingSet.has(key),
      note: pendingSet.has(key)
        ? "Pix/payment pending — do not interrupt"
        : "no pending payment",
    });

    // Check recent order after draft (per-draft DB check)
    const recentOrder = await prisma.order.findFirst({
      where: {
        restaurantId: draft.restaurantId,
        customerId:   draft.customerId,
        status:       { not: "CANCELLED" },
        createdAt:    { gt: draft.updatedAt },
      },
      select: { id: true, status: true, createdAt: true },
    });
    rules.push({
      rule: "no order placed after draft",
      pass: !recentOrder,
      note: recentOrder
        ? `order ${recentOrder.id} placed at ${recentOrder.createdAt.toISOString()}`
        : "no order after draft",
    });

    const wa = whatsappMap.get(draft.restaurantId);
    rules.push({
      rule: "WhatsApp (Meta) conectado",
      pass: wa?.connectionStatus === "CONNECTED",
      note: wa
        ? `número: ${wa.displayPhoneNumber ?? "—"}, conexão: ${wa.connectionStatus}`
        : "SEM CONFIG DA META — o envio não sai; conta em skippedNoConfig",
    });

    const allPass = rules.every((r) => r.pass);
    console.log(`\n  Eligibility: ${allPass ? "✅ ELIGIBLE — should be found by cron" : "❌ INELIGIBLE"}`);

    for (const r of rules) {
      const icon = r.pass ? "  ✅" : "  ❌";
      console.log(`${icon} ${r.rule.padEnd(35)} ${r.note}`);
    }
  }

  // ── 3. Summary ─────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════════════");
  console.log(" Action Steps");
  console.log("══════════════════════════════════════════════════════");
  console.log(" 1. If no drafts found: check browser DevTools → Network → POST /draft → response");
  console.log(" 2. If draft is TOO RECENT: wait 2+ min then trigger cron manually");
  console.log(" 3. If Evolution config missing: set it up in Atendimento → Integrações → WhatsApp");
  console.log(" 4. If all ✅: check GitHub Actions → CRM Cron → latest Cart Recovery run log");
  console.log("    Expected response: { ok:true, sent:1, ... }");
  console.log(" 5. Trigger manually: GitHub → Actions → CRM Cron → Run workflow → target:cart-recovery");
  console.log("    Set cart_recovery_dry_run = false");
  console.log("");
  console.log(" Direct cron call (if you have CRON_SECRET):");
  console.log('   curl -X POST https://foocci.com.br/api/cron/send-cart-recovery \\');
  console.log('     -H "Authorization: Bearer YOUR_CRON_SECRET" \\');
  console.log('     -H "Content-Type: application/json" \\');
  console.log("     -d '{\"dryRun\":false,\"inactivityMinutes\":2}'");
  console.log("══════════════════════════════════════════════════════\n");

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Script error:", err);
  process.exit(1);
});
