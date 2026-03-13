import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { TopBar } from "@/components/layout/TopBar";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Pedidos" };

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  CONFIRMED: "Confirmado",
  PREPARING: "Preparando",
  READY: "Pronto",
  OUT_FOR_DELIVERY: "Em entrega",
  DELIVERED: "Entregue",
  CANCELLED: "Cancelado",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-700",
  CONFIRMED: "bg-blue-100 text-blue-700",
  PREPARING: "bg-orange-100 text-orange-700",
  READY: "bg-teal-100 text-teal-700",
  OUT_FOR_DELIVERY: "bg-purple-100 text-purple-700",
  DELIVERED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-700",
};

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: { page?: string; status?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const page = Math.max(1, Number(searchParams.page ?? 1));
  const limit = 20;
  const skip = (page - 1) * limit;
  const statusFilter = searchParams.status as string | undefined;

  const where = {
    restaurantId: session.user.restaurantId,
    ...(statusFilter && { status: statusFilter as never }),
  };

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        status: true,
        type: true,
        total: true,
        createdAt: true,
        customer: { select: { name: true } },
        payment: { select: { status: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  const STATUS_KEYS = Object.keys(STATUS_LABELS);

  return (
    <>
      <TopBar title="Pedidos" />
      <div className="p-6">
        {/* Status filter pills */}
        <div className="mb-4 flex flex-wrap gap-2">
          <Link
            href="/dashboard/orders"
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              !statusFilter
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Todos
          </Link>
          {STATUS_KEYS.map((s) => (
            <Link
              key={s}
              href={`/dashboard/orders?status=${s}`}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                statusFilter === s
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {STATUS_LABELS[s]}
            </Link>
          ))}
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    Nenhum pedido encontrado.
                  </td>
                </tr>
              )}
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/orders/${order.id}`}
                      className="font-medium text-brand-600 hover:underline"
                    >
                      {order.customer.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {STATUS_LABELS[order.status] ?? order.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{order.type}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    R$ {Number(order.total).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    {new Date(order.createdAt).toLocaleDateString("pt-BR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
            <span>Página {page} de {totalPages}</span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={`?page=${page - 1}${statusFilter ? `&status=${statusFilter}` : ""}`}
                  className="rounded-lg border border-gray-300 px-3 py-1 hover:bg-gray-50"
                >
                  ← Anterior
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={`?page=${page + 1}${statusFilter ? `&status=${statusFilter}` : ""}`}
                  className="rounded-lg border border-gray-300 px-3 py-1 hover:bg-gray-50"
                >
                  Próxima →
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
