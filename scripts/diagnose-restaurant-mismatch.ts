/**
 * scripts/diagnose-restaurant-mismatch.ts
 *
 * Read-only diagnostic for duplicate/mismatched restaurant records.
 * Designed for the Sushi Cazza cart-recovery mismatch P0 but works for
 * any slug pattern.
 *
 * Usage:
 *   DATABASE_URL=<prod-url> \
 *     npx ts-node --compiler-options '{"module":"CommonJS"}' \
 *     scripts/diagnose-restaurant-mismatch.ts
 *
 * Optional env overrides:
 *   SLUG_PATTERN="sushi-cazza"   — SQL LIKE pattern for slug search (default: "sushi-cazza%")
 *   NAME_PATTERN="sushi"         — SQL ILIKE pattern for name search (default: "%sushi%")
 *
 * Output is fully read-only. No secrets, no full phones, no API keys.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const slugPattern = process.env.SLUG_PATTERN ?? "sushi-cazza%";
const namePattern = process.env.NAME_PATTERN ?? "%sushi%";

function maskPhone(p: string | null | undefined): string {
  if (!p) return "(none)";
  const d = p.replace(/\D/g, "");
  if (d.length < 4) return "****";
  return `****${d.slice(-4)}`;
}

function pad(s: string | number, n: number): string {
  return String(s).padEnd(n).slice(0, n);
}

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("  Restaurant Mismatch Diagnostic");
  console.log(`  SLUG_PATTERN: "${slugPattern}"   NAME_PATTERN: "${namePattern}"`);
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  // ── 1. Find matching restaurants ────────────────────────────────────────────
  const restaurants = await prisma.restaurant.findMany({
    where: {
      OR: [
        { slug: { contains: slugPattern.replace(/%/g, "") } },
        { name: { contains: namePattern.replace(/%/g, ""), mode: "insensitive" } },
      ],
    },
    select: {
      id:        true,
      slug:      true,
      name:      true,
      isActive:  true,
      phone:     true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  if (restaurants.length === 0) {
    console.log("  ⚠  No restaurants found matching the patterns.");
    console.log(`  Try: SLUG_PATTERN="sushi-cazza%" NAME_PATTERN="%sushi%"\n`);
    await prisma.$disconnect();
    return;
  }

  console.log(`Found ${restaurants.length} restaurant record(s):\n`);

  const ids = restaurants.map((r) => r.id);

  // ── 2. Batch-fetch all related data ─────────────────────────────────────────

  const [
    evolutionConfigs,
    whatsappAgentConfigs,
    conversationStats,
    draftStats,
    menuStats,
    orderStats,
  ] = await Promise.all([
    // Evolution configs — instanceName and isActive only (NO apiKey/webhookSecret)
    prisma.evolutionConfig.findMany({
      where:  { restaurantId: { in: ids } },
      select: { restaurantId: true, instanceName: true, baseUrl: true, isActive: true, createdAt: true, updatedAt: true },
    }),

    // WhatsApp agent config — especially menuUrl
    prisma.whatsAppAgentConfig.findMany({
      where:  { restaurantId: { in: ids } },
      select: { restaurantId: true, agentMode: true, agentName: true, menuUrl: true, updatedAt: true },
    }),

    // Conversation counts per restaurant (last 90 days, WHATSAPP only)
    prisma.conversation.groupBy({
      by:     ["restaurantId"],
      where:  {
        restaurantId: { in: ids },
        channel:      "WHATSAPP",
        createdAt:    { gt: new Date(Date.now() - 90 * 24 * 60 * 60_000) },
      },
      _count: { id: true },
      _max:   { lastMessageAt: true },
    }),

    // Draft counts per restaurant × status
    prisma.orderDraft.groupBy({
      by:     ["restaurantId", "status"],
      where:  { restaurantId: { in: ids } },
      _count: { id: true },
      _max:   { updatedAt: true },
    }),

    // Menu categories + items
    prisma.menuCategory.findMany({
      where:  { restaurantId: { in: ids } },
      select: {
        restaurantId: true,
        isActive:     true,
        _count:       { select: { items: true } },
      },
    }),

    // Orders (last 30 days)
    prisma.order.groupBy({
      by:     ["restaurantId"],
      where:  {
        restaurantId: { in: ids },
        createdAt:    { gt: new Date(Date.now() - 30 * 24 * 60 * 60_000) },
        status:       { not: "CANCELLED" },
      },
      _count: { id: true },
      _max:   { createdAt: true },
    }),
  ]);

  // Fetch latest 3 masked phones per restaurant for conversation sample
  const conversationSamples: Record<string, string[]> = {};
  for (const id of ids) {
    const convs = await prisma.conversation.findMany({
      where:   { restaurantId: id, channel: "WHATSAPP" },
      orderBy: { lastMessageAt: "desc" },
      take:    3,
      select:  { customerPhone: true },
    });
    conversationSamples[id] = convs.map((c) => maskPhone(c.customerPhone));
  }

  // ── 3. Print per-restaurant detail ─────────────────────────────────────────
  for (const r of restaurants) {
    const evo    = evolutionConfigs.find((e) => e.restaurantId === r.id);
    const agCfg  = whatsappAgentConfigs.find((a) => a.restaurantId === r.id);
    const convG  = conversationStats.find((c) => c.restaurantId === r.id);

    const draftRows = draftStats.filter((d) => d.restaurantId === r.id);
    const openDrafts = draftRows.find((d) => d.status === "OPEN")?._count.id ?? 0;
    const abanDrafts = draftRows.find((d) => d.status === "ABANDONED")?._count.id ?? 0;
    const confDrafts = draftRows.find((d) => d.status === "CONFIRMED")?._count.id ?? 0;
    const latestDraft = draftRows.reduce<Date | null>((best, row) => {
      const t = row._max.updatedAt;
      if (!t) return best;
      return !best || t > best ? t : best;
    }, null);

    const cats      = menuStats.filter((c) => c.restaurantId === r.id);
    const totalCats = cats.length;
    const activeCats = cats.filter((c) => c.isActive).length;
    const totalItems = cats.reduce((s, c) => s + c._count.items, 0);

    const orderG = orderStats.find((o) => o.restaurantId === r.id);
    const recentOrders = orderG?._count.id ?? 0;
    const latestOrder  = orderG?._max.createdAt;

    const phones = conversationSamples[r.id] ?? [];

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`Restaurant: ${r.name}`);
    console.log(`  id         : ${r.id}`);
    console.log(`  slug       : ${r.slug}`);
    console.log(`  isActive   : ${r.isActive}`);
    console.log(`  createdAt  : ${r.createdAt.toISOString()}`);
    console.log(`  updatedAt  : ${r.updatedAt.toISOString()}`);

    console.log(`\n  ── Evolution config ──`);
    if (evo) {
      console.log(`  instanceName : ${evo.instanceName}`);
      console.log(`  baseUrl      : ${evo.baseUrl}`);
      console.log(`  isActive     : ${evo.isActive}`);
      console.log(`  createdAt    : ${evo.createdAt.toISOString()}`);
    } else {
      console.log(`  ❌ NO Evolution config`);
    }

    console.log(`\n  ── WhatsApp Agent config ──`);
    if (agCfg) {
      console.log(`  agentMode  : ${agCfg.agentMode}`);
      console.log(`  agentName  : ${agCfg.agentName}`);
      console.log(`  menuUrl    : ${agCfg.menuUrl ?? "(not set — uses slug-based default)"}`);
      console.log(`  updatedAt  : ${agCfg.updatedAt.toISOString()}`);
    } else {
      console.log(`  ❌ NO WhatsApp agent config`);
    }

    console.log(`\n  ── WhatsApp conversations (last 90 days) ──`);
    console.log(`  count        : ${convG?._count.id ?? 0}`);
    console.log(`  latest msg   : ${convG?._max.lastMessageAt?.toISOString() ?? "(none)"}`);
    console.log(`  phone sample : ${phones.length > 0 ? phones.join(", ") : "(none)"}`);

    console.log(`\n  ── OrderDrafts ──`);
    console.log(`  OPEN      : ${openDrafts}`);
    console.log(`  ABANDONED : ${abanDrafts}`);
    console.log(`  CONFIRMED : ${confDrafts}`);
    console.log(`  latest    : ${latestDraft?.toISOString() ?? "(none)"}`);

    console.log(`\n  ── Menu / Products ──`);
    console.log(`  categories (total / active) : ${totalCats} / ${activeCats}`);
    console.log(`  items total                 : ${totalItems}`);

    console.log(`\n  ── Orders (last 30 days, non-cancelled) ──`);
    console.log(`  count  : ${recentOrders}`);
    console.log(`  latest : ${latestOrder?.toISOString() ?? "(none)"}`);
  }

  // ── 4. Summary table ────────────────────────────────────────────────────────
  console.log("\n\n╔══════════════════════════════════════════════════════════════════════════════════════════╗");
  console.log("  Summary Table");
  console.log("╚══════════════════════════════════════════════════════════════════════════════════════════╝\n");

  const header = [
    pad("restaurantId", 30),
    pad("slug", 32),
    pad("evoConfig", 10),
    pad("convs90d", 9),
    pad("openDrafts", 11),
    pad("menuItems", 10),
    pad("orders30d", 10),
    pad("likelyRole", 28),
  ].join(" | ");
  console.log(header);
  console.log("─".repeat(header.length));

  for (const r of restaurants) {
    const evo    = evolutionConfigs.find((e) => e.restaurantId === r.id);
    const convG  = conversationStats.find((c) => c.restaurantId === r.id);
    const draftRows = draftStats.filter((d) => d.restaurantId === r.id);
    const openDrafts = draftRows.find((d) => d.status === "OPEN")?._count.id ?? 0;
    const cats      = menuStats.filter((c) => c.restaurantId === r.id);
    const totalItems = cats.reduce((s, c) => s + c._count.items, 0);
    const orderG = orderStats.find((o) => o.restaurantId === r.id);
    const recentOrders = orderG?._count.id ?? 0;
    const convCount    = convG?._count.id ?? 0;

    // Determine likely role
    let role = "UNKNOWN";
    if (evo && convCount > 0 && recentOrders > 0) role = "CANONICAL_WHATSAPP_ACTIVE";
    else if (evo && convCount > 0)                 role = "CANONICAL_WHATSAPP_ACTIVE";
    else if (evo && !convCount)                    role = "CANONICAL_NO_CONVS";
    else if (!evo && r.slug === "sushi-cazza")     role = "PUBLIC_SLUG_NO_EVO";
    else if (!evo && totalItems > 0)               role = "HAS_MENU_NO_EVO";
    else if (!evo)                                 role = "LEGACY_NO_EVO";

    console.log([
      pad(r.id, 30),
      pad(r.slug, 32),
      pad(evo ? `✅ ${evo.isActive ? "active" : "inactive"}` : "❌ none", 10),
      pad(String(convCount), 9),
      pad(String(openDrafts), 11),
      pad(String(totalItems), 10),
      pad(String(recentOrders), 10),
      pad(role, 28),
    ].join(" | "));
  }

  // ── 5. Slug resolution check ────────────────────────────────────────────────
  console.log("\n\n── Slug resolution: /pedido/sushi-cazza ──────────────────────────────────────");
  const canonical = await prisma.restaurant.findUnique({
    where:  { slug: "sushi-cazza" },
    select: { id: true, name: true, isActive: true },
  });
  if (canonical) {
    console.log(`  /pedido/sushi-cazza  →  restaurantId: ${canonical.id}  (${canonical.name}, active: ${canonical.isActive})`);
    const hasEvo = evolutionConfigs.some((e) => e.restaurantId === canonical.id);
    console.log(`  This restaurant has Evolution config: ${hasEvo ? "✅ YES" : "❌ NO"}`);
  } else {
    console.log("  ⚠  No restaurant has slug = 'sushi-cazza' exactly.");
  }

  // ── 6. Known IDs check ──────────────────────────────────────────────────────
  const knownIds = [
    { id: "cmmxu4oei0001gw0vwpfrj27b", label: "from cart-recovery logs (no config)" },
    { id: "cmp30upkp000198i4r8wpxdl1", label: "from WhatsApp webhook logs (Evolution active)" },
  ];

  console.log("\n\n── Known restaurantId check ─────────────────────────────────────────────────");
  for (const { id, label } of knownIds) {
    const r = await prisma.restaurant.findUnique({
      where:  { id },
      select: { id: true, slug: true, name: true, isActive: true },
    });
    if (r) {
      const hasEvo = !!(await prisma.evolutionConfig.findUnique({ where: { restaurantId: id }, select: { instanceName: true } }));
      console.log(`  ${label}`);
      console.log(`    id       : ${r.id}`);
      console.log(`    slug     : ${r.slug}`);
      console.log(`    name     : ${r.name}`);
      console.log(`    active   : ${r.isActive}`);
      console.log(`    hasEvo   : ${hasEvo ? "✅ YES" : "❌ NO"}`);
    } else {
      console.log(`  ${label}`);
      console.log(`    ❌ NOT FOUND in DB (id: ${id})`);
    }
    console.log("");
  }

  // ── 7. Recommendation ──────────────────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("  Action Guide");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");
  console.log("  After reading the summary table above, apply the relevant data fix:\n");
  console.log("  CASE A — canonical (Evolution) restaurant does NOT own slug 'sushi-cazza':");
  console.log("    → /pedido/sushi-cazza resolves to the WRONG restaurant.");
  console.log("    → Run the slug-swap SQL (see step instructions).\n");
  console.log("  CASE B — canonical restaurant DOES own 'sushi-cazza' but has no menu:");
  console.log("    → Menu/products are on the legacy restaurant.");
  console.log("    → You need data migration or EvolutionConfig re-assignment.\n");
  console.log("  CASE C — all menu/products AND Evolution config are on the same restaurant:");
  console.log("    → Only the slug is wrong. Slug-swap is safe.\n");
  console.log("  CASE D — Evolution config is the only thing on the canonical restaurant:");
  console.log("    → Consider moving Evolution config to the legacy restaurant instead.");
  console.log("    → Or run full data consolidation (customers, orders, drafts, menu).\n");
  console.log("  See SLUG-SWAP SQL below — review BEFORE executing:\n");
  console.log("  BEGIN;");
  console.log("  -- Step 1: move legacy restaurant away from canonical slug");
  console.log("  UPDATE restaurants SET slug = 'sushi-cazza-legacy'");
  console.log("    WHERE id = '<legacyRestaurantId>';");
  console.log("  -- Step 2: assign canonical slug to the WhatsApp-configured restaurant");
  console.log("  UPDATE restaurants SET slug = 'sushi-cazza'");
  console.log("    WHERE id = '<canonicalRestaurantId>';");
  console.log("  -- Step 3 (if agentCfg.menuUrl was hardcoded to old slug URL):");
  console.log("  UPDATE whatsapp_agent_configs SET \"menuUrl\" = 'https://foocci.com.br/pedido/sushi-cazza'");
  console.log("    WHERE \"restaurantId\" = '<canonicalRestaurantId>';");
  console.log("  COMMIT;\n");

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Script error:", err);
  process.exit(1);
});
