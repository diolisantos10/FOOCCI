import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { TopBar } from "@/components/layout/TopBar";
import { prisma } from "@/lib/prisma";
import { MenuManager } from "./MenuManager";

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
    },
  });

  // Normalise Decimal → number so the client component receives plain JSON
  const data = categories.map((cat) => ({
    id: cat.id,
    name: cat.name,
    description: cat.description,
    isActive: cat.isActive,
    source: cat.source as "MANUAL" | "EXTERNAL",
    items: cat.items.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      price: Number(item.price),
      isActive: item.isActive,
      sortOrder: item.sortOrder,
    })),
  }));

  return (
    <>
      <TopBar title="Cardápio" />
      <div className="p-6">
        <MenuManager initialCategories={data} />
      </div>
    </>
  );
}
