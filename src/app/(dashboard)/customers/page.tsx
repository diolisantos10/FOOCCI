import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { TopBar } from "@/components/layout/TopBar";
import { prisma } from "@/lib/prisma";
import CustomersClient, { type SortCol, type SortDir, type FilterTab } from "./CustomersClient";

export const metadata = { title: "Clientes" };

const VALID_SORT_COLS = new Set<SortCol>(["totalSpend", "totalOrders", "lastOrderAt"]);
const VALID_FILTERS   = new Set<FilterTab>(["all", "vip", "inactive", "firstTime", "recent"]);

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: { page?: string; search?: string; sortBy?: string; sortDir?: string; filter?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const page    = Math.max(1, Number(searchParams.page ?? 1));
  const limit   = 20;
  const skip    = (page - 1) * limit;
  const search  = searchParams.search?.trim();
  const sortBy  = VALID_SORT_COLS.has(searchParams.sortBy as SortCol)
    ? (searchParams.sortBy as SortCol)
    : undefined;
  const sortDir: SortDir = searchParams.sortDir === "asc" ? "asc" : "desc";
  const filter: FilterTab = VALID_FILTERS.has(searchParams.filter as FilterTab)
    ? (searchParams.filter as FilterTab)
    : "all";

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Unified filter definitions — same logic as CRMService
  const filterClause = (() => {
    switch (filter) {
      case "vip":
        return { isActive: true as const, OR: [
          { totalSpend: { gte: 800 } },
          { totalOrders: { gte: 10 } },
        ]};
      case "inactive":
        return { isActive: true as const, OR: [
          { lastOrderAt: { lt: thirtyDaysAgo } },
          { lastOrderAt: null as null },
        ]};
      case "firstTime":
        return { isActive: true as const, totalOrders: 1 };
      case "recent":
        return { isActive: true as const, lastOrderAt: { gte: thirtyDaysAgo } };
      default:
        return { isActive: true as const };
    }
  })();

  const andClauses = [
    { restaurantId: session.user.restaurantId },
    filterClause,
    ...(search ? [{ OR: [
      { name:  { contains: search, mode: "insensitive" as const } },
      { phone: { contains: search } },
    ]}] : []),
  ];

  const where = { AND: andClauses };

  const orderBy = sortBy ? { [sortBy]: sortDir } : { createdAt: "desc" as const };

  const [raw, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      select: {
        id:          true,
        name:        true,
        phone:       true,
        email:       true,
        totalOrders: true,
        totalSpend:  true,
        lastOrderAt: true,
      },
    }),
    prisma.customer.count({ where }),
  ]);

  const customers = raw.map((c) => ({
    ...c,
    totalSpend:  Number(c.totalSpend),
    lastOrderAt: c.lastOrderAt?.toISOString() ?? null,
  }));

  const totalPages = Math.ceil(total / limit);

  return (
    <>
      <TopBar title="Clientes" />
      <div className="p-4 sm:p-6">
        {/* Header row: count + search */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <p className="text-sm text-gray-500">
            {total} cliente{total !== 1 ? "s" : ""}
          </p>
          <form method="GET" className="ml-auto">
            {/* Preserve sort/filter when searching */}
            {sortBy  && <input type="hidden" name="sortBy"  value={sortBy}  />}
            {sortDir === "asc" && <input type="hidden" name="sortDir" value="asc" />}
            {filter !== "all"  && <input type="hidden" name="filter"  value={filter} />}
            <input
              name="search"
              defaultValue={search}
              placeholder="Nome ou telefone…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 sm:w-auto"
            />
          </form>
        </div>

        <CustomersClient
          customers={customers}
          total={total}
          page={page}
          totalPages={totalPages}
          search={search}
          sortBy={sortBy}
          sortDir={sortDir}
          filter={filter}
        />
      </div>
    </>
  );
}
