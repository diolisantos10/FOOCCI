/**
 * GET /api/admin/diagnostics/restaurant-mismatch
 *
 * Read-only diagnostic for duplicate/mismatched restaurant records.
 * Designed to diagnose the Sushi Cazza cart-recovery P0 (Evolution config
 * bound to one restaurantId while /pedido drafts are on another).
 *
 * Auth: x-admin-secret header OR foocci-admin-token cookie.
 * Disabled entirely when ADMIN_SECRET env var is not set.
 *
 * Query params:
 *   slug  — slug fragment to search for (default: "sushi-cazza")
 *           Matches restaurants whose slug contains this string.
 *   name  — name fragment (case-insensitive, default: slug value)
 *
 * Safe:
 *   - Read-only. No mutations.
 *   - Never returns apiKey, webhookSecret, encrypted fields, or DATABASE_URL.
 *   - Customer phones are masked to last-4 digits only.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdminRequest } from "@/lib/admin-auth";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RestaurantRecord {
  id:        string;
  slug:      string;
  name:      string;
  isActive:  boolean;
  createdAt: string;
  updatedAt: string;
}

interface EvolutionSummary {
  restaurantId: string;
  hasEvolutionConfig: boolean;
  instanceName:       string | null;
  isActive:           boolean | null;
  configCreatedAt:    string | null;
}

interface WhatsAppAgentSummary {
  restaurantId: string;
  agentMode:    string | null;
  menuUrl:      string | null; // the configured override URL sent to customers
  updatedAt:    string | null;
}

interface ConversationSummary {
  restaurantId:            string;
  conversationCountLast90d: number;
  latestConversationAt:    string | null;
  phoneSamplesMasked:      string[];
}

interface MenuSummary {
  restaurantId:       string;
  menuCategoryCount:  number;
  activeCategoryCount: number;
  totalProductCount:  number;
  activeProductCount: number;
}

interface DraftOrderSummary {
  restaurantId:   string;
  openDrafts:     number;
  abandonedDrafts: number;
  confirmedDrafts: number;
  latestDraftAt:  string | null;
  ordersLast30d:  number;
  latestOrderAt:  string | null;
}

type RestaurantRole =
  | "CANONICAL_WHATSAPP_ACTIVE"   // has Evolution config + recent WhatsApp conversations
  | "CANONICAL_EVO_NO_CONVS"      // has Evolution config but no recent conversations
  | "PUBLIC_SLUG_NO_EVO"          // owns the queried slug but has no Evolution config
  | "HAS_MENU_NO_EVO"             // has menu/products but no Evolution config
  | "LEGACY_NO_EVO"               // no Evolution config, likely a stale duplicate
  | "UNKNOWN";

interface RestaurantDiagRow {
  restaurantId: string;
  slug:         string;
  name:         string;
  isActive:     boolean;
  hasEvolutionConfig: boolean;
  evoActive:    boolean | null;
  instanceName: string | null;
  conversationCountLast90d: number;
  openDrafts:   number;
  menuItemCount: number;
  ordersLast30d: number;
  likelyRole:   RestaurantRole;
}

interface SlugResolution {
  queriedSlug:      string;
  resolvedRestaurantId:   string | null;
  resolvedRestaurantName: string | null;
  hasEvolutionConfig:     boolean;
  relatedSlugs:           string[]; // e.g. sushi-cazza-1748000000000
}

interface Diagnosis {
  likelyCanonicalRestaurantId: string | null;
  likelyLegacyRestaurantIds:   string[];
  likelyRootCause:             string;
  safeRecommendation:          string;
  slugSwapSafe:                boolean;
  slugSwapSQL:                 string | null; // populated only when a safe swap is possible
}

interface MismatchDiagnosticResponse {
  ok:                true;
  queriedAt:         string;
  slugFilter:        string;
  nameFilter:        string;
  restaurants:       RestaurantRecord[];
  evolutionSummary:  EvolutionSummary[];
  whatsappAgents:    WhatsAppAgentSummary[];
  conversations:     ConversationSummary[];
  menus:             MenuSummary[];
  draftsAndOrders:   DraftOrderSummary[];
  slugResolution:    SlugResolution;
  diagTable:         RestaurantDiagRow[];
  diagnosis:         Diagnosis;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "(none)";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "****";
  return `****${digits.slice(-4)}`;
}

function isoOrNull(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

function roleFor(row: {
  hasEvo:    boolean;
  convs:     number;
  slug:      string;
  items:     number;
  queriedSlug: string;
}): RestaurantRole {
  if (row.hasEvo && row.convs > 0)  return "CANONICAL_WHATSAPP_ACTIVE";
  if (row.hasEvo)                   return "CANONICAL_EVO_NO_CONVS";
  if (row.slug === row.queriedSlug) return "PUBLIC_SLUG_NO_EVO";
  if (row.items > 0)                return "HAS_MENU_NO_EVO";
  return "LEGACY_NO_EVO";
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json(
      { error: "Endpoint disabled — ADMIN_SECRET not configured." },
      { status: 403 },
    );
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp          = req.nextUrl.searchParams;
  const slugFilter  = (sp.get("slug")  ?? "sushi-cazza").toLowerCase().trim();
  const nameFilter  = (sp.get("name")  ?? slugFilter).toLowerCase().trim();

  try {
    // ── 1. Find matching restaurants ─────────────────────────────────────────
    const restaurants = await prisma.restaurant.findMany({
      where: {
        OR: [
          { slug: { contains: slugFilter,  mode: "insensitive" } },
          { name: { contains: nameFilter,  mode: "insensitive" } },
        ],
      },
      select: {
        id: true, slug: true, name: true, isActive: true,
        createdAt: true, updatedAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const ids = restaurants.map((r) => r.id);

    if (ids.length === 0) {
      return NextResponse.json({
        ok:      true,
        queriedAt: new Date().toISOString(),
        slugFilter,
        nameFilter,
        restaurants: [],
        evolutionSummary: [],
        whatsappAgents:   [],
        conversations:    [],
        menus:            [],
        draftsAndOrders:  [],
        slugResolution: {
          queriedSlug: slugFilter,
          resolvedRestaurantId: null,
          resolvedRestaurantName: null,
          hasEvolutionConfig: false,
          relatedSlugs: [],
        },
        diagTable: [],
        diagnosis: {
          likelyCanonicalRestaurantId: null,
          likelyLegacyRestaurantIds:   [],
          likelyRootCause:   "No matching restaurants found.",
          safeRecommendation: `Retry with different ?slug= or ?name= params.`,
          slugSwapSafe: false,
          slugSwapSQL:  null,
        },
      });
    }

    // ── 2. Batch fetch ancillary data ────────────────────────────────────────
    const [
      evolutionConfigs,
      whatsappAgentConfigs,
      convGroups,
      draftGroups,
      menuCategories,
      orderGroups,
    ] = await Promise.all([
      // Evolution — instanceName + isActive ONLY (no apiKey/webhookSecret)
      prisma.evolutionConfig.findMany({
        where:  { restaurantId: { in: ids } },
        select: {
          restaurantId: true,
          instanceName: true,
          isActive:     true,
          createdAt:    true,
        },
      }),

      // WhatsApp agent config — agentMode + menuUrl (no secrets)
      prisma.whatsAppAgentConfig.findMany({
        where:  { restaurantId: { in: ids } },
        select: { restaurantId: true, agentMode: true, menuUrl: true, updatedAt: true },
      }),

      // Conversation counts per restaurant (last 90 days, WhatsApp only)
      prisma.conversation.groupBy({
        by:    ["restaurantId"],
        where: {
          restaurantId: { in: ids },
          channel:      "WHATSAPP",
          createdAt:    { gt: new Date(Date.now() - 90 * 24 * 60 * 60_000) },
        },
        _count: { id: true },
        _max:   { lastMessageAt: true },
      }),

      // Draft counts per restaurant × status
      prisma.orderDraft.groupBy({
        by:    ["restaurantId", "status"],
        where: { restaurantId: { in: ids } },
        _count: { id: true },
        _max:   { updatedAt: true },
      }),

      // Menu categories (with item counts)
      prisma.menuCategory.findMany({
        where:  { restaurantId: { in: ids } },
        select: {
          restaurantId: true,
          isActive:     true,
          _count:       { select: { items: true } },
        },
      }),

      // Orders last 30 days (non-cancelled)
      prisma.order.groupBy({
        by:    ["restaurantId"],
        where: {
          restaurantId: { in: ids },
          createdAt:    { gt: new Date(Date.now() - 30 * 24 * 60 * 60_000) },
          status:       { not: "CANCELLED" },
        },
        _count: { id: true },
        _max:   { createdAt: true },
      }),
    ]);

    // Per-restaurant masked phone samples (3 most-recent conversations each)
    const phoneSamples: Record<string, string[]> = {};
    await Promise.all(ids.map(async (id) => {
      const convs = await prisma.conversation.findMany({
        where:   { restaurantId: id, channel: "WHATSAPP" },
        orderBy: { lastMessageAt: "desc" },
        take:    3,
        select:  { customerPhone: true },
      });
      phoneSamples[id] = convs.map((c) => maskPhone(c.customerPhone));
    }));

    // ── 3. Shape response sections ───────────────────────────────────────────

    const evolutionSummary: EvolutionSummary[] = restaurants.map((r) => {
      const evo = evolutionConfigs.find((e) => e.restaurantId === r.id);
      return {
        restaurantId:       r.id,
        hasEvolutionConfig: !!evo,
        instanceName:       evo?.instanceName ?? null,
        isActive:           evo?.isActive     ?? null,
        configCreatedAt:    isoOrNull(evo?.createdAt),
      };
    });

    const whatsappAgents: WhatsAppAgentSummary[] = restaurants.map((r) => {
      const cfg = whatsappAgentConfigs.find((a) => a.restaurantId === r.id);
      return {
        restaurantId: r.id,
        agentMode:    cfg?.agentMode ?? null,
        menuUrl:      cfg?.menuUrl   ?? null,
        updatedAt:    isoOrNull(cfg?.updatedAt),
      };
    });

    const conversations: ConversationSummary[] = restaurants.map((r) => {
      const g = convGroups.find((c) => c.restaurantId === r.id);
      return {
        restaurantId:             r.id,
        conversationCountLast90d: g?._count.id ?? 0,
        latestConversationAt:     isoOrNull(g?._max.lastMessageAt),
        phoneSamplesMasked:       phoneSamples[r.id] ?? [],
      };
    });

    const menus: MenuSummary[] = restaurants.map((r) => {
      const cats = menuCategories.filter((c) => c.restaurantId === r.id);
      return {
        restaurantId:        r.id,
        menuCategoryCount:   cats.length,
        activeCategoryCount: cats.filter((c) => c.isActive).length,
        totalProductCount:   cats.reduce((s, c) => s + c._count.items, 0),
        activeProductCount:  -1,
      };
    });

    // Fetch active product counts separately (menuCategories.items filtered)
    await Promise.all(ids.map(async (id) => {
      const count = await prisma.menuItem.count({
        where: { isActive: true, category: { restaurantId: id } },
      });
      const row = menus.find((m) => m.restaurantId === id);
      if (row) row.activeProductCount = count;
    }));

    const draftsAndOrders: DraftOrderSummary[] = restaurants.map((r) => {
      const draftRows = draftGroups.filter((d) => d.restaurantId === r.id);
      const latestDraft = draftRows.reduce<Date | null>((best, row) => {
        const t = row._max.updatedAt;
        if (!t) return best;
        return !best || t > best ? t : best;
      }, null);

      const orderRow = orderGroups.find((o) => o.restaurantId === r.id);

      return {
        restaurantId:    r.id,
        openDrafts:      draftRows.find((d) => d.status === "OPEN")?._count.id      ?? 0,
        abandonedDrafts: draftRows.find((d) => d.status === "ABANDONED")?._count.id ?? 0,
        confirmedDrafts: draftRows.find((d) => d.status === "CONFIRMED")?._count.id ?? 0,
        latestDraftAt:   isoOrNull(latestDraft),
        ordersLast30d:   orderRow?._count.id ?? 0,
        latestOrderAt:   isoOrNull(orderRow?._max.createdAt),
      };
    });

    // ── 4. Slug resolution ──────────────────────────────────────────────────
    const exactSlugMatch = await prisma.restaurant.findUnique({
      where:  { slug: slugFilter },
      select: { id: true, name: true },
    });

    const relatedSlugs = restaurants
      .map((r) => r.slug)
      .filter((s) => s !== slugFilter);

    const exactHasEvo = exactSlugMatch
      ? evolutionConfigs.some((e) => e.restaurantId === exactSlugMatch.id)
      : false;

    const slugResolution: SlugResolution = {
      queriedSlug:            slugFilter,
      resolvedRestaurantId:   exactSlugMatch?.id   ?? null,
      resolvedRestaurantName: exactSlugMatch?.name ?? null,
      hasEvolutionConfig:     exactHasEvo,
      relatedSlugs,
    };

    // ── 5. Diagnostic table ─────────────────────────────────────────────────
    const diagTable: RestaurantDiagRow[] = restaurants.map((r) => {
      const evo   = evolutionConfigs.find((e) => e.restaurantId === r.id);
      const convG = convGroups.find((c) => c.restaurantId === r.id);
      const draftRows = draftGroups.filter((d) => d.restaurantId === r.id);
      const menuR = menus.find((m) => m.restaurantId === r.id);
      const orderR = orderGroups.find((o) => o.restaurantId === r.id);
      const convCount = convG?._count.id ?? 0;
      const itemCount = menuR?.totalProductCount ?? 0;
      const openCount = draftRows.find((d) => d.status === "OPEN")?._count.id ?? 0;
      const hasEvo = !!evo;

      return {
        restaurantId:            r.id,
        slug:                    r.slug,
        name:                    r.name,
        isActive:                r.isActive,
        hasEvolutionConfig:      hasEvo,
        evoActive:               evo?.isActive ?? null,
        instanceName:            evo?.instanceName ?? null,
        conversationCountLast90d: convCount,
        openDrafts:              openCount,
        menuItemCount:           itemCount,
        ordersLast30d:           orderR?._count.id ?? 0,
        likelyRole:              roleFor({ hasEvo, convs: convCount, slug: r.slug, items: itemCount, queriedSlug: slugFilter }),
      };
    });

    // ── 6. Diagnosis ────────────────────────────────────────────────────────
    const canonical = diagTable.find(
      (r) => r.likelyRole === "CANONICAL_WHATSAPP_ACTIVE" || r.likelyRole === "CANONICAL_EVO_NO_CONVS",
    );
    const legacies = diagTable.filter(
      (r) => r.likelyRole !== "CANONICAL_WHATSAPP_ACTIVE" && r.likelyRole !== "CANONICAL_EVO_NO_CONVS",
    );

    let likelyRootCause: string;
    let safeRecommendation: string;
    let slugSwapSafe = false;
    let slugSwapSQL: string | null = null;

    if (!canonical) {
      likelyRootCause     = "No restaurant with Evolution config found in the matched set. Check slug/name filters.";
      safeRecommendation  = "Ensure the WhatsApp-configured restaurant is reachable by expanding slug/name search.";
    } else if (canonical.slug === slugFilter) {
      likelyRootCause     = "Canonical restaurant already owns the primary slug. Old stale drafts may exist for other restaurants.";
      safeRecommendation  = "No slug swap needed. Old drafts from legacy restaurants are being skipped correctly (skippedNoConfig counter).";
      slugSwapSafe        = false;
    } else {
      // Canonical has a timestamped/alternate slug — needs swap
      const legacyOwnsSlug = legacies.find((r) => r.slug === slugFilter);
      const canSwapSafely  = !!legacyOwnsSlug && (legacyOwnsSlug.menuItemCount === 0 || canonical.menuItemCount > 0);

      likelyRootCause = `Canonical restaurant (${canonical.restaurantId}) has slug "${canonical.slug}" ` +
        `while public URL /pedido/${slugFilter} resolves to legacy restaurant ` +
        `(${legacyOwnsSlug?.restaurantId ?? "unknown"}).  ` +
        `OrderDrafts created via /pedido/${slugFilter} land on the legacy restaurant which has no Evolution config.`;

      if (legacyOwnsSlug && canonical.menuItemCount > 0) {
        slugSwapSafe = true;
        safeRecommendation =
          `Canonical restaurant has menu items (${canonical.menuItemCount}) and Evolution config. ` +
          `Safe to swap slugs. Run the SQL below inside a transaction.`;
        slugSwapSQL = [
          "BEGIN;",
          `-- Step 1: free slug "${slugFilter}" from legacy restaurant`,
          `UPDATE restaurants SET slug = '${slugFilter}-legacy' WHERE id = '${legacyOwnsSlug.restaurantId}';`,
          `-- Step 2: assign canonical slug to WhatsApp-configured restaurant`,
          `UPDATE restaurants SET slug = '${slugFilter}' WHERE id = '${canonical.restaurantId}';`,
          ...(() => {
            const agCfg = whatsappAgents.find((a) => a.restaurantId === canonical.restaurantId);
            const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://foocci.com.br";
            return agCfg?.menuUrl
              ? [
                  `-- Step 3: update menuUrl in whatsapp_agent_configs if pointing to old slug`,
                  `UPDATE whatsapp_agent_configs SET "menuUrl" = '${siteUrl}/pedido/${slugFilter}'`,
                  `  WHERE "restaurantId" = '${canonical.restaurantId}';`,
                ]
              : [];
          })(),
          "COMMIT;",
        ].join("\n");
      } else if (legacyOwnsSlug && legacyOwnsSlug.menuItemCount > 0 && canonical.menuItemCount === 0) {
        slugSwapSafe = false;
        safeRecommendation =
          `WARNING: legacy restaurant has ${legacyOwnsSlug.menuItemCount} menu items but canonical has none. ` +
          `Do NOT slug-swap blindly. Options: (A) move Evolution config to the menu-owning restaurant, ` +
          `or (B) migrate menu/customers/orders to the Evolution-config restaurant first.`;
      } else {
        slugSwapSafe = false;
        safeRecommendation =
          "Cannot determine safe action automatically. Review diagTable rows and menuItemCount fields manually.";
      }
    }

    const diagnosis: Diagnosis = {
      likelyCanonicalRestaurantId: canonical?.restaurantId ?? null,
      likelyLegacyRestaurantIds:   legacies.map((r) => r.restaurantId),
      likelyRootCause,
      safeRecommendation,
      slugSwapSafe,
      slugSwapSQL,
    };

    const response: MismatchDiagnosticResponse = {
      ok:              true,
      queriedAt:       new Date().toISOString(),
      slugFilter,
      nameFilter,
      restaurants:     restaurants.map((r) => ({
        id:        r.id,
        slug:      r.slug,
        name:      r.name,
        isActive:  r.isActive,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
      evolutionSummary,
      whatsappAgents,
      conversations,
      menus,
      draftsAndOrders,
      slugResolution,
      diagTable,
      diagnosis,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("[GET /api/admin/diagnostics/restaurant-mismatch]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
