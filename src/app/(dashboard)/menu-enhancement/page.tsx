/**
 * /menu-enhancement — Internal admin page for menu photo enhancement.
 *
 * Requires tenant JWT (dashboard auth) AND ADMIN_SECRET cookie/header.
 * Not linked from the main nav — access via direct URL.
 */

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { EnhancementClient } from "./EnhancementClient";

export const dynamic = "force-dynamic";

export default async function MenuEnhancementPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  // Require admin authentication for this internal tool
  if (!isAdminAuthenticated()) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="max-w-sm rounded-xl border border-red-200 bg-white p-8 text-center shadow">
          <p className="text-2xl">🔒</p>
          <p className="mt-2 font-semibold text-gray-900">Acesso restrito</p>
          <p className="mt-1 text-sm text-gray-500">
            Esta página requer autenticação de administrador Foocci.
          </p>
        </div>
      </div>
    );
  }

  // Fetch restaurant for this session
  const restaurantId = (session.user as { restaurantId?: string }).restaurantId;
  if (!restaurantId) redirect("/login");

  const restaurant = await prisma.restaurant.findUnique({
    where:  { id: restaurantId },
    select: { id: true, name: true },
  });
  if (!restaurant) redirect("/login");

  // Load existing enhancement jobs
  const jobs = await prisma.menuItemImageEnhancement.findMany({
    where: { restaurantId },
    include: {
      menuItem: {
        select: {
          id:       true,
          name:     true,
          imageUrl: true,
          category: { select: { name: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Load products that have no enhancement job yet
  const processedItemIds = new Set(jobs.map((j) => j.menuItemId));
  const unprocessedItems = await prisma.menuItem.findMany({
    where: {
      category:  { restaurantId },
      isActive:  true,
      imageUrl:  { not: null },
      id:        { notIn: [...processedItemIds] },
    },
    select: {
      id:       true,
      name:     true,
      imageUrl: true,
      category: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  });

  const totalWithImage = jobs.length + unprocessedItems.length;

  return (
    <EnhancementClient
      restaurant={restaurant}
      jobs={JSON.parse(JSON.stringify(jobs))}
      unprocessedItems={unprocessedItems}
      totalWithImage={totalWithImage}
    />
  );
}
