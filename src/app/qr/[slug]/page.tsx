/**
 * /qr/[slug] — Public read-only dine-in menu
 *
 * Accessible via QR code at the table. No auth required.
 * Items where isAvailable=false or showInDineIn=false are excluded.
 */

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { QRMenuClient } from "./QRMenuClient";
import { getActiveMenuPromotions, buildPromotionMap } from "@/services/promotions/productPromotionResolver";
import { channelPrice, resolveVariantPrice } from "@/services/menu/MenuPricingService";
import { getMenuBestSellerRows, rankBestSellers, MENU_BESTSELLER_LIMIT } from "@/services/menu/menuBestSellers";

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
    select: {
      brandPrimaryColor: true, brandSecondaryColor: true, coverImageUrl: true,
      instagramUrl: true, tiktokUrl: true, googleReviewUrl: true, brandPersona: true,
    },
  });

  const rawCategories = await prisma.menuCategory.findMany({
    where: {
      restaurantId: restaurant.id,
      isActive: true,
      isAvailable: true,
      showInDineIn: true,
    },
    orderBy: { sortOrder: "asc" },
    include: {
      items: {
        where: { isActive: true, showInDineIn: true, isAvailable: true },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true, name: true, description: true, price: true,
          priceDelivery: true, priceDineIn: true, priceIfood: true,
          imageUrl: true, images: true, carouselEnabled: true,
          isAvailable: true, ingredients: true, servingSize: true, portionInfo: true,
          variants: {
            where: { isAvailable: true },
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
            select: { id: true, name: true, price: true, priceDelivery: true, priceDineIn: true, imageUrl: true, isAvailable: true },
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
              id: true, name: true, description: true, price: true,
              priceDelivery: true, priceDineIn: true, priceIfood: true,
              imageUrl: true, images: true, carouselEnabled: true,
              categoryId: true,
              isAvailable: true, ingredients: true, servingSize: true, portionInfo: true,
              variants: {
                where: { isAvailable: true },
                orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
                select: { id: true, name: true, price: true, priceDelivery: true, priceDineIn: true, imageUrl: true, isAvailable: true },
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

  // Fetch active promotions + dynamic best sellers in parallel. Best sellers use
  // the Analytics-consistent aggregation (30-day Foocci real sales, valid orders),
  // ranked by units sold — see services/menu/menuBestSellers.
  const [activePromotions, bestSellerRows] = await Promise.all([
    getActiveMenuPromotions(restaurant.id, "QR_MENU"),
    getMenuBestSellerRows(restaurant.id),
  ]);

  // Build promo map from all raw items with their home categoryId
  const allRawItems = rawCategories.flatMap((c) => [
    ...c.items.map((i) => ({ id: i.id, categoryId: c.id, price: channelPrice(i, "DINE_IN") })),
    ...c.placements.map((p) => ({ id: p.item.id, categoryId: p.item.categoryId, price: channelPrice(p.item, "DINE_IN") })),
  ]);
  const promoMap = buildPromotionMap(allRawItems, activePromotions);

  function mapQrItem(i: typeof rawCategories[0]["items"][0]) {
    return {
      id: i.id,
      name: i.name,
      description: i.description ?? null,
      // QR is the dine-in / salão channel: use priceDineIn when set, else base.
      price: channelPrice(i, "DINE_IN"),
      imageUrl: i.imageUrl ?? null,
      // Fotos extras da ficha (carrossel). A capa continua sendo o imageUrl —
      // sem isto aqui o lojista subia 3 fotos e o cardápio da mesa mostrava 1.
      images: i.images ?? [],
      carouselEnabled: i.carouselEnabled === true,
      isAvailable: i.isAvailable,
      ingredients: i.ingredients ?? null,
      servingSize: i.servingSize ?? null,
      portionInfo: i.portionInfo ?? null,
      promotion: promoMap.get(i.id) ?? null,
      variants: i.variants.map((v) => ({ id: v.id, name: v.name, price: resolveVariantPrice(i, v, "DINE_IN"), imageUrl: v.imageUrl ?? null, isAvailable: v.isAvailable })),
      extras: i.extras.map((e) => ({ id: e.id, name: e.name, quantity: e.quantity, price: Number(e.price) })),
    };
  }

  const categories = rawCategories
    .map((c) => {
      // Category shows ONLY its own products — cross-category placements no longer
      // bleed to the end (mirrors the /pedido delivery menu, fixed in 2e20a51).
      // Combos that "contain" a category item need a proper combo-content model,
      // not placements; until then the category stays clean.
      return { id: c.id, name: c.name, description: c.description ?? null, items: c.items.map(mapQrItem) };
    })
    .filter((c) => c.items.length > 0);

  // Build flat item lookup for best-sellers
  const allItemsFlat = new Map(categories.flatMap((c) => c.items.map((i) => [i.id, i])));

  // Dynamic "Mais vendidos": keep only products still orderable in this menu
  // (drops unavailable/deleted), ranked by units sold then revenue, top 10.
  const featured = rankBestSellers(bestSellerRows, new Set(allItemsFlat.keys()), MENU_BESTSELLER_LIMIT)
    .map((r) => allItemsFlat.get(r.menuItemId))
    .filter((i): i is Exclude<typeof i, undefined> => i !== undefined);

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
      coverImageUrl={brandConfig?.coverImageUrl ?? null}
      brandPrimaryColor={brandConfig?.brandPrimaryColor ?? null}
      brandSecondaryColor={brandConfig?.brandSecondaryColor ?? null}
      instagramUrl={brandConfig?.instagramUrl ?? null}
      tiktokUrl={brandConfig?.tiktokUrl ?? null}
      googleReviewUrl={brandConfig?.googleReviewUrl ?? null}
      restaurantPhone={restaurant.storeProfile?.whatsappPhone ?? restaurant.phone ?? null}
    />
  );
}
