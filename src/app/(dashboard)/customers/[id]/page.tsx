import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { TopBar } from "@/components/layout/TopBar";
import { prisma } from "@/lib/prisma";
import CustomerProfileClient from "./CustomerProfileClient";
import type { Classification } from "./CustomerProfileClient";

export const metadata = { title: "Perfil do Cliente" };

// ─── CRM Classification ───────────────────────────────────────────────────────

function classify(spend: number): Classification {
  if (spend >= 2000) return { tier: "Diamond", icon: "💎", gradient: "from-cyan-400 to-blue-500",     nextTier: null,      nextThreshold: null, progressPercent: 100 };
  if (spend >= 800)  return { tier: "Gold",    icon: "🥇", gradient: "from-amber-400 to-orange-500", nextTier: "Diamond", nextThreshold: 2000, progressPercent: Math.round(((spend - 800)  / 1200) * 100) };
  if (spend >= 300)  return { tier: "Silver",  icon: "🥈", gradient: "from-gray-300 to-gray-500",    nextTier: "Gold",    nextThreshold: 800,  progressPercent: Math.round(((spend - 300)  / 500)  * 100) };
  return                    { tier: "Bronze",  icon: "🥉", gradient: "from-orange-400 to-orange-700",nextTier: "Silver",  nextThreshold: 300,  progressPercent: Math.round((spend / 300)            * 100) };
}

// ─── Header Analytics ─────────────────────────────────────────────────────────

function computeHeader(orders: Array<{ createdAt: Date; total: { toString(): string }; items: Array<{ name: string; quantity: number }> }>) {
  const delivered = orders.filter((_, i) => i >= 0); // all passed orders are pre-filtered

  /* Purchase frequency: avg days between consecutive orders */
  let purchaseFrequencyDays = 0;
  if (delivered.length >= 2) {
    const sorted = [...delivered].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++)
      gaps.push((sorted[i].createdAt.getTime() - sorted[i - 1].createdAt.getTime()) / 86_400_000);
    purchaseFrequencyDays = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
  }

  /* Favorite product: most-ordered item by cumulative quantity */
  const counts: Record<string, number> = {};
  delivered.forEach((o) =>
    o.items.forEach((item) => {
      counts[item.name] = (counts[item.name] ?? 0) + item.quantity;
    })
  );
  const favoriteProduct = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return { purchaseFrequencyDays, favoriteProduct };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function CustomerDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const customer = await prisma.customer.findUnique({
    where: { id: params.id },
    select: {
      id:           true,
      name:         true,
      phone:        true,
      email:        true,
      totalOrders:  true,
      totalSpend:   true,
      lastOrderAt:  true,
      createdAt:    true,
      isActive:     true,
      restaurantId: true,
      orders: {
        where:   { status: "DELIVERED" },
        orderBy: { createdAt: "asc"    },
        select:  {
          createdAt: true,
          total:     true,
          items: { select: { name: true, quantity: true } },
        },
      },
    },
  });

  if (!customer || customer.restaurantId !== session.user.restaurantId) {
    notFound();
  }

  const totalSpend = Number(customer.totalSpend);
  const classification = classify(totalSpend);
  const { purchaseFrequencyDays, favoriteProduct } = computeHeader(customer.orders);

  return (
    <>
      <TopBar title={customer.name} />
      <CustomerProfileClient
        id={customer.id}
        name={customer.name}
        phone={customer.phone}
        email={customer.email}
        totalOrders={customer.totalOrders}
        totalSpend={totalSpend}
        lastOrderAt={customer.lastOrderAt?.toISOString() ?? null}
        createdAt={customer.createdAt.toISOString()}
        isActive={customer.isActive}
        classification={classification}
        purchaseFrequencyDays={purchaseFrequencyDays}
        favoriteProduct={favoriteProduct}
      />
    </>
  );
}
