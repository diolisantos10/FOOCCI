import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { TopBar } from "@/components/layout/TopBar";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Clientes" };

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: { page?: string; search?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const page = Math.max(1, Number(searchParams.page ?? 1));
  const limit = 20;
  const skip = (page - 1) * limit;
  const search = searchParams.search?.trim();

  const where = {
    restaurantId: session.user.restaurantId,
    isActive: true,
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" as const } },
        { phone: { contains: search } },
      ],
    }),
  };

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        totalOrders: true,
        lastOrderAt: true,
        createdAt: true,
      },
    }),
    prisma.customer.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return (
    <>
      <TopBar title="Clientes" />
      <div className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-gray-500">{total} cliente{total !== 1 ? "s" : ""}</p>
          <form method="GET">
            <input
              name="search"
              defaultValue={search}
              placeholder="Buscar por nome ou telefone…"
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </form>
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Telefone</th>
                <th className="px-4 py-3">Pedidos</th>
                <th className="px-4 py-3">Último pedido</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {customers.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                    Nenhum cliente encontrado.
                  </td>
                </tr>
              )}
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/customers/${c.id}`} className="font-medium text-brand-600 hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{c.phone}</td>
                  <td className="px-4 py-3 text-gray-600">{c.totalOrders}</td>
                  <td className="px-4 py-3 text-gray-400">
                    {c.lastOrderAt
                      ? new Date(c.lastOrderAt).toLocaleDateString("pt-BR")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
            <span>Página {page} de {totalPages}</span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={`?page=${page - 1}${search ? `&search=${search}` : ""}`}
                  className="rounded-lg border border-gray-300 px-3 py-1 hover:bg-gray-50"
                >
                  ← Anterior
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={`?page=${page + 1}${search ? `&search=${search}` : ""}`}
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
