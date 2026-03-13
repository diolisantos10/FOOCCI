import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { TopBar } from "@/components/layout/TopBar";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Cardápio" };

export default async function MenuPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const categories = await prisma.menuCategory.findMany({
    where: { restaurantId: session.user.restaurantId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      items: {
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      },
      _count: { select: { items: true } },
    },
  });

  return (
    <>
      <TopBar title="Cardápio" />
      <div className="p-6 space-y-6">
        {categories.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-300 p-10 text-center text-sm text-gray-400">
            Nenhuma categoria criada. Use a API para adicionar categorias e itens.
          </div>
        )}

        {categories.map((cat) => (
          <div key={cat.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            {/* Category header */}
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-5 py-3">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-gray-900">{cat.name}</h2>
                {!cat.isActive && (
                  <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-500">
                    inativo
                  </span>
                )}
              </div>
              <span className="text-xs text-gray-400">{cat._count.items} iten{cat._count.items !== 1 ? "s" : ""}</span>
            </div>

            {/* Items */}
            {cat.items.length === 0 ? (
              <p className="px-5 py-4 text-sm text-gray-400">Nenhum item nesta categoria.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {cat.items.map((item) => (
                  <li key={item.id} className="flex items-center justify-between px-5 py-3 text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${!item.isActive ? "text-gray-400 line-through" : "text-gray-900"}`}>
                        {item.name}
                      </span>
                      {item.description && (
                        <span className="hidden text-xs text-gray-400 sm:inline">
                          — {item.description}
                        </span>
                      )}
                    </div>
                    <span className="font-semibold text-gray-700">
                      R$ {Number(item.price).toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
