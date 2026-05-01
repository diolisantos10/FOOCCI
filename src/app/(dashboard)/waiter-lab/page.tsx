/**
 * /waiter-lab — Internal Waiter AI test lab.
 *
 * Auth: protected by (dashboard) layout — NextAuth session required.
 * Access: available in all environments. Auth is the only gate.
 *
 * Auto-detects the logged-in owner's restaurant from the tenant header
 * injected by middleware so the owner never needs to know or type a slug.
 */

import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import WaiterLabClient from "./WaiterLabClient";
import { WaiterLabErrorBoundary } from "./WaiterLabErrorBoundary";

export const dynamic = "force-dynamic";

export default async function WaiterLabPage() {
  const restaurantId = headers().get("x-restaurant-id");

  let defaultSlug:      string | null = null;
  let restaurantName:   string | null = null;
  let hasMenu = false;

  if (restaurantId) {
    const restaurant = await prisma.restaurant
      .findUnique({
        where:  { id: restaurantId },
        select: { slug: true, name: true },
      })
      .catch(() => null);

    if (restaurant) {
      // Confirm the restaurant has at least one active menu item
      const itemCount = await prisma.menuItem
        .count({
          where: {
            isActive:     true,
            isAvailable:  true,
            showInDelivery: true,
            category:     { restaurantId },
          },
        })
        .catch(() => 0);

      defaultSlug    = restaurant.slug;
      restaurantName = restaurant.name;
      hasMenu        = itemCount > 0;
    }
  }

  return (
    <WaiterLabErrorBoundary>
      <WaiterLabClient
        defaultSlug={defaultSlug}
        restaurantName={restaurantName}
        hasMenu={hasMenu}
      />
    </WaiterLabErrorBoundary>
  );
}
