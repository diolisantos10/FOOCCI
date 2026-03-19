import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { TopBar } from "@/components/layout/TopBar";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Cliente" };

export default async function CustomerDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const customer = await prisma.customer.findUnique({
    where: { id: params.id },
    include: {
      addresses: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] },
      orders: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          status: true,
          total: true,
          type: true,
          createdAt: true,
        },
      },
    },
  });

  if (!customer || customer.restaurantId !== session.user.restaurantId) {
    notFound();
  }

  const STATUS_LABELS: Record<string, string> = {
    PENDING: "Pendente",
    CONFIRMED: "Confirmado",
    PREPARING: "Preparando",
    READY: "Pronto",
    OUT_FOR_DELIVERY: "Em entrega",
    DELIVERED: "Entregue",
    CANCELLED: "Cancelado",
  };

  return (
    <>
      <TopBar title={customer.name} />
      <div className="p-6 space-y-6">
        {/* Back */}
        <Link href="/customers" className="text-sm text-brand-600 hover:underline">
          ← Voltar para clientes
        </Link>

        {/* Info card */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
            Informações
          </h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-gray-500">Telefone</dt>
              <dd className="font-medium text-gray-900">{customer.phone}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Email</dt>
              <dd className="font-medium text-gray-900">{customer.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Total de pedidos</dt>
              <dd className="font-medium text-gray-900">{customer.totalOrders}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Total gasto</dt>
              <dd className="font-medium text-gray-900">
                R$ {Number(customer.totalSpend).toFixed(2)}
              </dd>
            </div>
          </dl>
        </div>

        {/* Addresses */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
            Endereços ({customer.addresses.length})
          </h2>
          {customer.addresses.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhum endereço cadastrado.</p>
          ) : (
            <ul className="space-y-2">
              {customer.addresses.map((addr) => (
                <li key={addr.id} className="rounded-lg bg-gray-50 px-4 py-3 text-sm">
                  {addr.isDefault && (
                    <span className="mr-2 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">
                      padrão
                    </span>
                  )}
                  {addr.street}, {addr.number}
                  {addr.complement ? `, ${addr.complement}` : ""} — {addr.neighborhood},{" "}
                  {addr.city}/{addr.state}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent orders */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
            Pedidos recentes
          </h2>
          {customer.orders.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhum pedido ainda.</p>
          ) : (
            <ul className="space-y-2">
              {customer.orders.map((order) => (
                <li key={order.id}>
                  <Link
                    href={`/orders/${order.id}`}
                    className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3 text-sm hover:bg-gray-100"
                  >
                    <span className="font-medium text-gray-700">
                      {STATUS_LABELS[order.status] ?? order.status}
                    </span>
                    <span className="text-gray-500">
                      R$ {Number(order.total).toFixed(2)} •{" "}
                      {new Date(order.createdAt).toLocaleDateString("pt-BR")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
