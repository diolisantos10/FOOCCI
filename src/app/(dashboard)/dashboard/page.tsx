import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TopBar } from "@/components/layout/TopBar";
import DashboardClient from "./DashboardClient";

export const metadata = { title: "Dashboard — Foocci" };

const VALID = [
  "PENDING", "AWAITING_PAYMENT", "CONFIRMED",
  "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED",
] as const;

const ACTIVE = ["PENDING", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY"] as const;

async function getDashboardData(restaurantId: string) {
  const now = new Date();

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  // Orders older than 45 min in early statuses are flagged as delayed
  const delayedCutoff = new Date(now.getTime() - 45 * 60 * 1000);

  const [
    revToday,
    revYesterday,
    ordersToday,
    ordersYesterday,
    cancelledToday,
    inProgress,
    completedToday,
    delayed,
    topByQty,
    topByRev,
    soldItemIds,
    totalActiveItems,
    newCustomers,
    totalCustomers,
    typeDistribution,
    chartOrders,
  ] = await Promise.all([
    prisma.order.aggregate({
      where: { restaurantId, createdAt: { gte: today }, status: { in: [...VALID] } },
      _sum: { total: true },
    }),
    prisma.order.aggregate({
      where: { restaurantId, createdAt: { gte: yesterday, lt: today }, status: { in: [...VALID] } },
      _sum: { total: true },
    }),
    prisma.order.count({
      where: { restaurantId, createdAt: { gte: today }, status: { in: [...VALID] } },
    }),
    prisma.order.count({
      where: { restaurantId, createdAt: { gte: yesterday, lt: today }, status: { in: [...VALID] } },
    }),
    prisma.order.count({
      where: { restaurantId, createdAt: { gte: today }, status: "CANCELLED" },
    }),
    prisma.order.count({
      where: { restaurantId, status: { in: [...ACTIVE] } },
    }),
    prisma.order.count({
      where: { restaurantId, completedAt: { gte: today }, status: "DELIVERED" },
    }),
    prisma.order.count({
      where: {
        restaurantId,
        status: { in: ["PENDING", "CONFIRMED", "PREPARING"] },
        createdAt: { lt: delayedCutoff },
      },
    }),
    prisma.orderItem.groupBy({
      by: ["menuItemId", "name"],
      where: {
        order: { restaurantId, createdAt: { gte: today }, status: { in: [...VALID] } },
      },
      _sum: { quantity: true, total: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 5,
    }),
    prisma.orderItem.groupBy({
      by: ["menuItemId", "name"],
      where: {
        order: { restaurantId, createdAt: { gte: today }, status: { in: [...VALID] } },
      },
      _sum: { quantity: true, total: true },
      orderBy: { _sum: { total: "desc" } },
      take: 5,
    }),
    prisma.orderItem.findMany({
      where: { order: { restaurantId, createdAt: { gte: today } } },
      select: { menuItemId: true },
      distinct: ["menuItemId"],
    }),
    prisma.menuItem.count({
      where: { category: { restaurantId }, isActive: true },
    }),
    prisma.customer.count({
      where: { restaurantId, createdAt: { gte: today } },
    }),
    prisma.customer.count({
      where: { restaurantId, isActive: true },
    }),
    prisma.order.groupBy({
      by: ["type"],
      where: { restaurantId, createdAt: { gte: today } },
      _count: true,
    }),
    prisma.order.findMany({
      where: { restaurantId, createdAt: { gte: today } },
      select: { createdAt: true, total: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // Hourly breakdown (0–23)
  const hourlyOrders = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    count: 0,
    revenue: 0,
  }));
  for (const o of chartOrders) {
    const h = new Date(o.createdAt).getHours();
    const slot = hourlyOrders[h];
    if (slot) {
      slot.count++;
      slot.revenue += Number(o.total);
    }
  }

  const revTodayVal = Number(revToday._sum.total ?? 0);
  const revYestVal = Number(revYesterday._sum.total ?? 0);
  const avgTicket = ordersToday > 0 ? revTodayVal / ordersToday : 0;
  const avgTicketYest = ordersYesterday > 0 ? revYestVal / ordersYesterday : 0;
  const totalAttempts = ordersToday + cancelledToday;
  const conversionRate = totalAttempts > 0 ? (ordersToday / totalAttempts) * 100 : null;
  const convRateYest =
    ordersYesterday > 0
      ? (ordersYesterday / (ordersYesterday + cancelledToday)) * 100
      : null;

  const soldSet = new Set(soldItemIds.map((s) => s.menuItemId));
  const zeroSalesCount = Math.max(0, totalActiveItems - soldSet.size);

  // Generate contextual insights
  const insights: string[] = [];
  if (ordersToday === 0) {
    insights.push("Nenhum pedido registrado hoje ainda. Que tal ativar uma promoção?");
  }
  if (delayed > 0) {
    insights.push(
      `${delayed} pedido${delayed > 1 ? "s" : ""} com +45 min sem atualização de status.`
    );
  }
  if (newCustomers > 0) {
    insights.push(
      `${newCustomers} novo${newCustomers > 1 ? "s clientes" : " cliente"} hoje!`
    );
  }
  if (revTodayVal > revYestVal && revYestVal > 0) {
    const p = Math.round(((revTodayVal - revYestVal) / revYestVal) * 100);
    insights.push(`Receita ${p}% acima de ontem. Bom desempenho!`);
  }
  if (inProgress > 5) {
    insights.push(`${inProgress} pedidos ativos ao mesmo tempo — monitore os tempos de preparo.`);
  }
  const peakHour = hourlyOrders.reduce<(typeof hourlyOrders)[0] | undefined>(
    (best, h) => (best === undefined || h.count > best.count ? h : best),
    undefined
  );
  if (peakHour && peakHour.count >= 3) {
    insights.push(
      `Pico às ${String(peakHour.hour).padStart(2, "0")}h com ${peakHour.count} pedidos.`
    );
  }
  if (zeroSalesCount > 0) {
    insights.push(
      `${zeroSalesCount} item${zeroSalesCount > 1 ? "ns" : ""} sem nenhuma venda hoje.`
    );
  }
  if (insights.length === 0) {
    insights.push("Tudo tranquilo por aqui. Seu restaurante está online!");
  }

  return {
    kpis: {
      revToday: revTodayVal,
      revYesterday: revYestVal,
      ordersToday,
      ordersYesterday,
      avgTicket,
      avgTicketYest,
      conversionRate,
      convRateYest,
    },
    operations: { inProgress, completedToday, delayed },
    topByQty: topByQty.map((i) => ({
      name: i.name,
      qty: Number(i._sum.quantity ?? 0),
      rev: Number(i._sum.total ?? 0),
    })),
    topByRev: topByRev.map((i) => ({
      name: i.name,
      qty: Number(i._sum.quantity ?? 0),
      rev: Number(i._sum.total ?? 0),
    })),
    customers: {
      newCustomers,
      totalCustomers,
      typeDistribution: typeDistribution.map((d) => ({
        type: d.type,
        count: d._count,
      })),
    },
    zeroSalesCount,
    insights,
    hourlyOrders,
    currentHour: now.getHours(),
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const data = await getDashboardData(session.user.restaurantId);

  return (
    <>
      <TopBar title="Dashboard" />
      <DashboardClient data={data} userName={session.user.name ?? "Usuário"} />
    </>
  );
}
