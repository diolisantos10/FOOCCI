/**
 * /qr/[slug] — Public read-only dine-in menu
 *
 * Accessible via QR code at the table. No auth required.
 * Items where isAvailable=false or showInDineIn=false are excluded.
 */

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { QRMenuClient } from "./QRMenuClient";
import { getActiveProductPromotions, buildPromotionMap } from "@/services/promotions/productPromotionResolver";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug: params.slug },
    select: { name: true },
  });
  return { title: restaurant ? `Cardápio — ${restaurant.name}` : "Cardápio" };
}

export default async function QRMenuPage({
  params,
}: {
  params: { slug: string };
}) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug: params.slug },
    select: {
      id: true, name: true, logoUrl: true, phone: true,
      storeProfile: { select: { whatsappPhone: true } },
    },
  });

  if (!restaurant) notFound();

  const brandConfig = await prisma.restaurantBrandConfig.findUnique({
    where: { restaurantId: restaurant.id },
    select: { brandPrimaryColor: true, instagramUrl: true, tiktokUrl: true, googleReviewUrl: true, brandPersona: true },
  });

  const rawCategories = await prisma.menuCategory.findMany({
    where: {
      restaurantId: restaurant.id,
      isActive: true,
      isAvailable: true,
    },
    orderBy: { sortOrder: "asc" },
    include: {
      items: {
        where: { isActive: true, showInDineIn: true, isAvailable: true },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true, name: true, description: true, price: true, imageUrl: true,
          isAvailable: true, ingredients: true, servingSize: true, portionInfo: true,
          variants: {
            where: { isAvailable: true },
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
            select: { id: true, name: true, price: true, isAvailable: true },
          },
          extras: {
            orderBy: { name: "asc" },
            select: { id: true, name: true, quantity: true, price: true },
          },
        },
      },
      placements: {
        where: { item: { isActive: true, showInDineIn: true, isAvailable: true } },
        orderBy: { sortOrder: "asc" },
        include: {
          item: {
            select: {
              id: true, name: true, description: true, price: true, imageUrl: true,
              isAvailable: true, ingredients: true, servingSize: true, portionInfo: true,
              variants: {
                where: { isAvailable: true },
                orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
                select: { id: true, name: true, price: true, isAvailable: true },
              },
              extras: {
                orderBy: { name: "asc" },
                select: { id: true, name: true, quantity: true, price: true },
              },
            },
          },
        },
      },
    },
  });

  // Fetch active promotions + real best sellers in parallel
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const [activePromotions, topSoldRows] = await Promise.all([
    getActiveProductPromotions(restaurant.id, "QR_MENU"),
    prisma.orderItem.groupBy({
      by: ["menuItemId"],
      where: {
        order: {
          restaurantId: restaurant.id,
          status: { notIn: ["CANCELLED", "AWAITING_PAYMENT"] },
          createdAt: { gte: sevenDaysAgo },
        },
        menuItemId: { not: null },
      },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 30,
    }),
  ]);

  // Build promo map from all raw items
  const allRawItems = rawCategories.flatMap((c) => [
    ...c.items.map((i) => ({ id: i.id, price: Number(i.price) })),
    ...c.placements.map((p) => ({ id: p.item.id, price: Number(p.item.price) })),
  ]);
  const promoMap = buildPromotionMap(allRawItems, activePromotions);

  function mapQrItem(i: {
    id: string; name: string; description: string | null; price: { toNumber?: () => number } | number;
    imageUrl: string | null; isAvailable: boolean; ingredients: string | null;
    servingSize: number | null; portionInfo: string | null;
    variants: { id: string; name: string; price: { toNumber?: () => number } | number; isAvailable: boolean }[];
    extras: { id: string; name: string; quantity: number; price: { toNumber?: () => number } | number }[];
  }) {
    return {
      id: i.id,
      name: i.name,
      description: i.description ?? null,
      price: Number(i.price),
      imageUrl: i.imageUrl ?? null,
      isAvailable: i.isAvailable,
      ingredients: i.ingredients ?? null,
      servingSize: i.servingSize ?? null,
      portionInfo: i.portionInfo ?? null,
      promotion: promoMap.get(i.id) ?? null,
      variants: i.variants.map((v) => ({ id: v.id, name: v.name, price: Number(v.price), isAvailable: v.isAvailable })),
      extras: i.extras.map((e) => ({ id: e.id, name: e.name, quantity: e.quantity, price: Number(e.price) })),
    };
  }

  const categories = rawCategories
    .map((c) => {
      const ownIds = new Set(c.items.map((i) => i.id));
      const placedItems = c.placements.map((p) => p.item).filter((i) => !ownIds.has(i.id));
      return { id: c.id, name: c.name, description: c.description ?? null, items: [...c.items, ...placedItems].map(mapQrItem) };
    })
    .filter((c) => c.items.length > 0);

  // Build flat item lookup for best-sellers
  const allItemsFlat = new Map(categories.flatMap((c) => c.items.map((i) => [i.id, i])));

  // Real 7-day best sellers
  const featured = topSoldRows
    .map((r) => (r.menuItemId ? allItemsFlat.get(r.menuItemId) : undefined))
    .filter((i): i is Exclude<typeof i, undefined> => i !== undefined)
    .slice(0, 10);

  // Promoted items for the "🔥 Promoções" section — deduplicate across categories (placements can repeat an item)
  const seenPromo = new Set<string>();
  const promotedItems = categories.flatMap((c) => c.items).filter((i) => {
    if (i.promotion === null || seenPromo.has(i.id)) return false;
    seenPromo.add(i.id);
    return true;
  });

  // promoBanner: first promoted item with an image, or null
  const promoBanner = promotedItems.find((i) => i.imageUrl) ?? promotedItems[0] ?? null;

  // Active promotion image banners from Promotions table
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun … 6=Sat
  const rawBanners = await prisma.promotion.findMany({
    where: {
      restaurantId: restaurant.id,
      status: "ACTIVE",
      bannerImageUrl: { not: null },
      OR: [
        { startsAt: null },
        { startsAt: { lte: today } },
      ],
      AND: [
        { OR: [{ endsAt: null }, { endsAt: { gte: today } }] },
      ],
    },
    select: { id: true, name: true, bannerImageUrl: true, daysOfWeek: true },
  });
  const promotionBanners = rawBanners
    .filter((b) => !b.daysOfWeek || b.daysOfWeek.length === 0 || b.daysOfWeek.includes(dayOfWeek))
    .map((b) => ({ id: b.id, name: b.name, imageUrl: b.bannerImageUrl! }));

  return (
    <QRMenuClient
      slug={params.slug}
      restaurant={{ name: restaurant.name, logoUrl:
          (brandConfig?.brandPersona != null && typeof brandConfig.brandPersona === "object"
            ? (brandConfig.brandPersona as Record<string, unknown>).logoUrl as string | undefined
            : undefined) ??
          restaurant.logoUrl ??
          null
        }}
      categories={categories}
      featured={featured}
      promotedItems={promotedItems}
      promoBanner={promoBanner}
      promotionBanners={promotionBanners}
      brandPrimaryColor={brandConfig?.brandPrimaryColor ?? null}
      instagramUrl={brandConfig?.instagramUrl ?? null}
      tiktokUrl={brandConfig?.tiktokUrl ?? null}
      googleReviewUrl={brandConfig?.googleReviewUrl ?? null}
      restaurantPhone={restaurant.storeProfile?.whatsappPhone ?? restaurant.phone ?? null}
    />
  );
}
