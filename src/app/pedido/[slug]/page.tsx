/**
 * /pedido/[slug] — Public AI ordering experience
 *
 * No auth required. Resolved by restaurant slug.
 * Full customer interface: menu, AI agent, checkout flow.
 */

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PedidoClient } from "./PedidoClient";

/** Replicates the same normalization used in /api/qr/[slug]/identify */
function phoneCandidates(raw: string): string[] {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8) return [];
  const set = new Set<string>();
  if (digits.length >= 12 && digits.startsWith("55")) {
    set.add(`+${digits}`);
    set.add(digits);
  }
  if (digits.length === 11) {
    set.add(`+55${digits}`);
    set.add(digits);
  }
  if (digits.length === 10) {
    set.add(`+55${digits}`);
    set.add(`+55${digits.slice(0, 2)}9${digits.slice(2)}`);
  }
  set.add(digits);
  return [...set];
}

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
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const rawPhone = typeof sp.phone === "string" ? sp.phone.trim() : null;

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: { id: true, name: true, logoUrl: true, phone: true },
  });

  if (!restaurant) notFound();

  // ── WhatsApp / known-user identification ─────────────────────────────────────
  let knownCustomerPhone: string | null = null;
  let knownCustomerName: string | null = null;

  if (rawPhone) {
    const candidates = phoneCandidates(rawPhone);
    if (candidates.length > 0) {
      const customer = await prisma.customer.findFirst({
        where: { restaurantId: restaurant.id, phone: { in: candidates } },
        select: { name: true, phone: true },
      });
      if (customer) {
        knownCustomerPhone = customer.phone;
        knownCustomerName = customer.name.trim().split(/\s+/)[0] ?? null;
      } else {
        // Phone is known (came from WhatsApp link) but customer record doesn't exist yet
        knownCustomerPhone = rawPhone;
      }
    }
  }

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
      description: c.description ?? null,
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
      phone={restaurant.phone ?? null}
      categories={categories}
      knownCustomerPhone={knownCustomerPhone}
      knownCustomerName={knownCustomerName}
    />
  );
}
