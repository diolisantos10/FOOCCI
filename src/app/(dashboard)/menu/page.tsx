import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { authOptions } from "@/lib/auth";
import { TopBar } from "@/components/layout/TopBar";
import { prisma } from "@/lib/prisma";
import { MenuManager } from "./MenuManager";

export const metadata = { title: "Cardápio" };

export default async function MenuPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const proto = headersList.get("x-forwarded-proto") ?? "http";
  const appOrigin = `${proto}://${host}`;

  const [restaurant, categories] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: session.user.restaurantId },
      select: { slug: true },
    }),
    prisma.menuCategory.findMany({
      where: { restaurantId: session.user.restaurantId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        items: {
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          include: {
            variants: {
              orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
            },
            extras: {
              orderBy: { name: "asc" },
            },
          },
        },
      },
    }),
  ]);

  // Normalise Decimal → number so the client component receives plain JSON
  const data = categories.map((cat) => ({
    id: cat.id,
    name: cat.name,
    description: cat.description,
    isActive: cat.isActive,
    isAvailable: cat.isAvailable,
    showInDelivery: cat.showInDelivery,
    showInDineIn: cat.showInDineIn,
    sortOrder: cat.sortOrder,
    source: cat.source as "MANUAL" | "EXTERNAL",
    items: cat.items.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      ingredients: item.ingredients ?? null,
      price: Number(item.price),
      imageUrl: item.imageUrl,
      isActive: item.isActive,
      sortOrder: item.sortOrder,
      isAvailable: item.isAvailable,
      showInDelivery: item.showInDelivery,
      showInDineIn: item.showInDineIn,
      hasVariants: item.hasVariants,
      code: item.code ?? null,
      servingSize: item.servingSize ?? null,
      portionInfo: item.portionInfo ?? null,
      tagFunil:             item.tagFunil             ?? null,
      perfilPaladar:        item.perfilPaladar        ?? null,
      harmonizacaoSugerida: item.harmonizacaoSugerida ?? null,
      alergenosDetalhados:  item.alergenosDetalhados  ?? null,
      storytellingIA:       item.storytellingIA       ?? null,
      variants: item.variants.map((v) => ({
        id: v.id,
        name: v.name,
        price: Number(v.price),
        portion: v.portion ?? null,
        isAvailable: v.isAvailable,
        sortOrder: v.sortOrder,
      })),
      extras: item.extras.map((e) => ({
        id: e.id,
        name: e.name,
        quantity: e.quantity,
        price: Number(e.price),
        portion: e.portion ?? null,
        isAvailable: e.isAvailable,
      })),
    })),
  }));

  return (
    <>
      <TopBar title="Cardápio" />
      <div className="p-4 sm:p-6">
        <MenuManager
          initialCategories={data}
          restaurantSlug={restaurant?.slug ?? ""}
          qrUrl={`${appOrigin}/qr/${restaurant?.slug ?? ""}`}
          pedidoUrl={`${appOrigin}/pedido/${restaurant?.slug ?? ""}`}
        />
      </div>
    </>
  );
}
