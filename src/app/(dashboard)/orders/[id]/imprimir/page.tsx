import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { TopBar } from "@/components/layout/TopBar";
import { prisma } from "@/lib/prisma";
import { PrintButton } from "@/components/print/PrintButton";
import { OrderTicket } from "@/components/print/OrderTicket";

export const metadata = { title: "Pré-visualizar comanda" };

export default async function ImprimirPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const [order, restaurant] = await Promise.all([
    prisma.order.findUnique({
      where: { id: params.id },
      include: {
        items:           true,
        payment:         true,
        customer:        { select: { id: true, name: true, phone: true } },
        deliveryAddress: true,
      },
    }),
    prisma.restaurant.findUnique({
      where:  { id: session.user.restaurantId },
      select: { name: true },
    }),
  ]);

  if (!order || order.restaurantId !== session.user.restaurantId) {
    notFound();
  }

  const restaurantName = restaurant?.name ?? "Restaurante";

  return (
    <>
      <TopBar title={`Comanda — ${order.customer.name}`} />

      {/* Action bar — screen only, hidden during print */}
      <div className="flex items-center justify-between border-b border-gray-100 bg-white px-6 py-3 print:hidden">
        <Link
          href={`/orders/${order.id}`}
          className="text-sm text-brand-600 hover:underline"
        >
          ← Voltar para o pedido
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">
            Verifique os dados antes de imprimir
          </span>
          <PrintButton />
        </div>
      </div>

      {/* Ticket preview — centered on gray background */}
      <div className="min-h-[calc(100vh-8rem)] bg-gray-100 py-10 print:bg-transparent print:py-0">
        <OrderTicket
          order={order}
          restaurantName={restaurantName}
          mode="preview"
        />
      </div>

      {/* Print CSS: hide everything except the ticket; 80mm page size */}
      <style>{`
        @media print {
          * { visibility: hidden; }
          #foocci-print-ticket { display: block !important; visibility: visible; position: fixed; top: 0; left: 0; }
          #foocci-print-ticket * { visibility: visible; }
          @page { margin: 0; size: 80mm auto; }
          body { margin: 0; }
        }
      `}</style>
    </>
  );
}
