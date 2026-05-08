/**
 * /qr/[slug] — Public read-only dine-in menu
 *
 * Accessible via QR code at the table. No auth required.
 * Items where isAvailable=false or showInDineIn=false are excluded.
 */

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { QRMenuClient } from "./QRMenuClient";

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
    select: { id: true, name: true, logoUrl: true },
  });

  if (!restaurant) notFound();

  const brandConfig = await prisma.restaurantBrandConfig.findUnique({
    where: { restaurantId: restaurant.id },
    select: { googleReviewUrl: true },
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
          id: true,
          name: true,
          description: true,
          price: true,
          imageUrl: true,
          isAvailable: true,
          variants: {
            where: { isAvailable: true },
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
            select: { id: true, name: true, price: true, isAvailable: true },
          },
        },
      },
    },
  });

  const categories = rawCategories
    .filter((c) => c.items.length > 0)
    .map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description ?? null,
      items: c.items.map((i) => ({
        id: i.id,
        name: i.name,
        description: i.description ?? null,
        price: Number(i.price),
        imageUrl: i.imageUrl ?? null,
        isAvailable: i.isAvailable,
        variants: i.variants.map((v) => ({
          id: v.id,
          name: v.name,
          price: Number(v.price),
          isAvailable: v.isAvailable,
        })),
      })),
    }));

  // Promotions category surfaces first if present
  const isPromo = (name: string) => name.toLowerCase().includes("promo");
  const sortedCategories = [
    ...categories.filter((c) => isPromo(c.name)),
    ...categories.filter((c) => !isPromo(c.name)),
  ];

  // Promo banner: first item of the first promotions category
  const promoCategory = sortedCategories.find((c) => isPromo(c.name));
  const promoBanner = promoCategory?.items[0] ?? null;

  // Best sellers: first 8 items across all categories
  const featured = sortedCategories.flatMap((c) => c.items).slice(0, 8);

  return (
    <QRMenuClient
      slug={params.slug}
      restaurant={{ name: restaurant.name, logoUrl: restaurant.logoUrl ?? null }}
      categories={sortedCategories}
      featured={featured}
      promoBanner={promoBanner}
      googleReviewUrl={brandConfig?.googleReviewUrl ?? null}
    />
  );
}
