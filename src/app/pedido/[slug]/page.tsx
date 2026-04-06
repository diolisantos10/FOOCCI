/**
 * /pedido/[slug] — Public AI ordering experience
 *
 * No auth required. Resolved by restaurant slug.
 * Full customer interface: menu, AI agent, checkout flow.
 */

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PedidoClient } from "./PedidoClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: { name: true },
  });
  return {
    title: restaurant ? `Cardápio — ${restaurant.name}` : "Cardápio",
  };
}

export default async function PedidoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: { id: true, name: true, logoUrl: true },
  });

  if (!restaurant) notFound();

  const rawCategories = await prisma.menuCategory.findMany({
    where: { restaurantId: restaurant.id, isActive: true, isAvailable: true },
    orderBy: { sortOrder: "asc" },
    include: {
      items: {
        where: { isActive: true, isAvailable: true, showInDelivery: true },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          price: true,
          description: true,
          imageUrl: true,
        },
      },
    },
  });

  const categories = rawCategories
    .filter((c) => c.items.length > 0)
    .map((c) => ({
      id: c.id,
      name: c.name,
      imageUrl: c.imageUrl ?? null,
      items: c.items.map((i) => ({
        id: i.id,
        name: i.name,
        price: Number(i.price),
        description: i.description ?? null,
        imageUrl: i.imageUrl ?? null,
      })),
    }));

  return (
    <PedidoClient
      slug={slug}
      restaurantName={restaurant.name}
      logoUrl={restaurant.logoUrl ?? null}
      categories={categories}
    />
  );
}
