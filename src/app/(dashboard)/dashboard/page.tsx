import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { TopBar } from "@/components/layout/TopBar";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Dashboard" };

async function getStats(restaurantId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    totalCustomers,
    totalOrders,
    todayOrders,
    openDrafts,
    pendingPayments,
  ] = await Promise.all([
    prisma.customer.count({ where: { restaurantId, isActive: true } }),
    prisma.order.count({ where: { restaurantId } }),
    prisma.order.count({ where: { restaurantId, createdAt: { gte: today } } }),
    prisma.orderDraft.count({ where: { restaurantId, status: "OPEN" } }),
    prisma.payment.count({
      where: { order: { restaurantId }, status: "PENDING" },
    }),
  ]);

  return { totalCustomers, totalOrders, todayOrders, openDrafts, pendingPayments };
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const stats = await getStats(session.user.restaurantId);

  const tiles = [
    { label: "Clientes ativos", value: stats.totalCustomers, color: "bg-blue-50 text-blue-700" },
    { label: "Pedidos hoje", value: stats.todayOrders, color: "bg-green-50 text-green-700" },
    { label: "Pedidos total", value: stats.totalOrders, color: "bg-purple-50 text-purple-700" },
    { label: "Drafts abertos", value: stats.openDrafts, color: "bg-yellow-50 text-yellow-700" },
    { label: "Pagamentos pendentes", value: stats.pendingPayments, color: "bg-red-50 text-red-700" },
  ];

  return (
    <>
      <TopBar title="Dashboard" />
      <div className="p-6">
        <p className="mb-6 text-sm text-gray-500">
          Bem-vindo, <span className="font-medium text-gray-900">{session.user.name}</span>
        </p>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {tiles.map((tile) => (
            <div
              key={tile.label}
              className={`rounded-xl p-5 ${tile.color}`}
            >
              <p className="text-3xl font-bold">{tile.value}</p>
              <p className="mt-1 text-xs font-medium opacity-80">{tile.label}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400">
          Gráficos e analytics detalhados — Fase 4
        </div>
      </div>
    </>
  );
}
