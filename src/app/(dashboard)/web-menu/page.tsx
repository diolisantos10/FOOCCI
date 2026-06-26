/**
 * /web-menu — QR code and public menu link management
 */

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { QRCard } from "@/app/(dashboard)/menu/QRCard";

export const metadata = { title: "Web Menu" };

export default async function WebMenuPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const headersList = await headers();
  const host  = headersList.get("host")              ?? "localhost:3000";
  const proto = headersList.get("x-forwarded-proto") ?? "http";
  const appOrigin = `${proto}://${host}`;

  const restaurant = await prisma.restaurant.findUnique({
    where:  { id: session.user.restaurantId },
    select: { slug: true, name: true },
  });

  if (!restaurant) redirect("/dashboard");

  const qrUrl = `${appOrigin}/qr/${restaurant.slug}`;

  return (
    <div className="p-6 max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-ink">Web Menu</h1>
        <p className="mt-1 text-sm text-muted">
          Compartilhe o link do cardápio digital ou imprima o QR code para as mesas.
        </p>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Formato",    value: "Mobile-first" },
          { label: "Acesso",     value: "Público"      },
          { label: "Atualiza",   value: "Em tempo real" },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-line bg-paper px-4 py-3 text-center">
            <p className="text-xs text-muted">{label}</p>
            <p className="text-sm font-semibold text-ink">{value}</p>
          </div>
        ))}
      </div>

      {/* QR Card — expanded by default via the QRCard component */}
      <QRCard url={qrUrl} slug={restaurant.slug} />

      {/* How to use */}
      <section className="rounded-xl border border-line bg-paper p-5 space-y-3">
        <h2 className="text-sm font-semibold text-ink2">Como usar</h2>
        <ol className="space-y-2 text-sm text-ink2 list-none">
          {[
            'Abra o QR acima e clique em "Baixar QR".',
            "Imprima e cole nas mesas, balcão ou embalagens.",
            "Clientes escaneiam com a câmera do celular e veem o cardápio.",
            "Cada alteração no Cardápio aparece imediatamente no Web Menu.",
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[11px] font-bold text-brand-600">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
