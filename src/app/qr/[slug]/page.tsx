/**
 * /qr/[slug] — Public read-only dine-in menu
 *
 * Accessible via QR code at the table. No auth required.
 * Strictly read-only: no cart, no ordering, no interaction.
 *
 * Items where isAvailable=false are shown with an "Indisponível" badge.
 * Items where showInDineIn=false are hidden.
 */

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Generate page metadata from restaurant name
export async function generateMetadata({ params }: { params: { slug: string } }) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug: params.slug },
    select: { name: true },
  });
  return { title: restaurant ? `Cardápio — ${restaurant.name}` : "Cardápio" };
}

type Item = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  isAvailable: boolean;
};

type Category = {
  id: string;
  name: string;
  imageUrl: string | null;
  items: Item[];
};

function formatPrice(n: number) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function categoryEmoji(name: string): string {
  const n = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (n.includes("pizza"))                            return "🍕";
  if (n.includes("bebida") || n.includes("drink"))    return "🥤";
  if (n.includes("sobremesa") || n.includes("doce"))  return "🍰";
  if (n.includes("lanche") || n.includes("burger"))   return "🍔";
  if (n.includes("entrada") || n.includes("porcao"))  return "🥗";
  return "🍽️";
}

export default async function QRMenuPage({ params }: { params: { slug: string } }) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug: params.slug },
    select: { id: true, name: true, logoUrl: true },
  });

  if (!restaurant) notFound();

  const rawCategories = await prisma.menuCategory.findMany({
    where: { restaurantId: restaurant.id, isActive: true, isAvailable: true },
    orderBy: { sortOrder: "asc" },
    include: {
      items: {
        where: { isActive: true, showInDineIn: true, isAvailable: true },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          description: true,
          price: true,
          imageUrl: true,
          isAvailable: true,
        },
      },
    },
  });

  const categories: Category[] = rawCategories
    .filter((c) => c.items.length > 0)
    .map((c) => ({
      id: c.id,
      name: c.name,
      imageUrl: c.imageUrl ?? null,
      items: c.items.map((i) => ({
        id: i.id,
        name: i.name,
        description: i.description ?? null,
        price: Number(i.price),
        imageUrl: i.imageUrl ?? null,
        isAvailable: i.isAvailable,
      })),
    }));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Restaurant header */}
      <header className="bg-white border-b border-gray-200 px-4 py-5 text-center">
        {restaurant.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={restaurant.logoUrl}
            alt={restaurant.name}
            className="mx-auto mb-3 h-14 w-14 rounded-full object-cover"
          />
        )}
        <h1 className="text-xl font-bold text-gray-900">{restaurant.name}</h1>
        <p className="mt-0.5 text-xs text-gray-500">Cardápio · Apenas consulta</p>
      </header>

      {categories.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400 text-sm">
          <span className="text-4xl mb-3">🍽️</span>
          <p>Cardápio não disponível no momento.</p>
        </div>
      ) : (
        <main className="mx-auto max-w-lg px-4 py-6 space-y-8">
          {categories.map((cat) => (
            <section key={cat.id}>
              {/* Category heading */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl leading-none">{categoryEmoji(cat.name)}</span>
                <h2 className="text-base font-bold text-gray-800">{cat.name}</h2>
              </div>

              {/* Item list */}
              <ul className="space-y-3">
                {cat.items.map((item) => (
                  <li
                    key={item.id}
                    className={`flex gap-3 rounded-xl bg-white p-3 shadow-sm border border-gray-100 ${
                      !item.isAvailable ? "opacity-60" : ""
                    }`}
                  >
                    {/* Thumbnail */}
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="h-16 w-16 shrink-0 rounded-lg object-cover"
                        onError={undefined}
                      />
                    ) : (
                      <div className="h-16 w-16 shrink-0 rounded-lg bg-gray-100 flex items-center justify-center text-2xl">
                        {categoryEmoji(cat.name)}
                      </div>
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm font-semibold leading-tight ${!item.isAvailable ? "text-gray-400" : "text-gray-900"}`}>
                          {item.name}
                        </p>
                        <span className="shrink-0 text-sm font-bold text-gray-800">
                          R$&nbsp;{formatPrice(item.price)}
                        </span>
                      </div>
                      {item.description && (
                        <p className="mt-1 text-xs text-gray-500 line-clamp-2 leading-relaxed">
                          {item.description}
                        </p>
                      )}
                      {!item.isAvailable && (
                        <span className="mt-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-600">
                          Indisponível
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </main>
      )}

      <footer className="py-8 text-center text-xs text-gray-400">
        Cardápio gerado por Foocci
      </footer>
    </div>
  );
}
