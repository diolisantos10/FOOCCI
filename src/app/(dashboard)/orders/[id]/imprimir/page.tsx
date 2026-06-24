import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { TopBar } from "@/components/layout/TopBar";
import { prisma } from "@/lib/prisma";
import { PrintButton } from "@/components/print/PrintButton";
import { OrderTicket } from "@/components/print/OrderTicket";
import { AutoPrintTrigger } from "@/components/print/AutoPrintTrigger";
import { buildStoreInfo, TICKET_PRINT_CSS } from "@/lib/print-ticket";

export const metadata = { title: "Pré-visualizar comanda" };

export default async function ImprimirPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { autoprint?: string; printOnly?: string };
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
      select: {
        name:     true,
        address:  true,
        timezone: true,
        storeProfile: {
          select: {
            cnpj: true, street: true, streetNumber: true, complement: true,
            neighborhood: true, city: true, state: true, cep: true,
          },
        },
      },
    }),
  ]);

  if (!order || order.restaurantId !== session.user.restaurantId) {
    notFound();
  }

  const restaurantName = restaurant?.name ?? "Restaurante";
  const storeInfo = restaurant
    ? buildStoreInfo(restaurant, restaurant.storeProfile)
    : undefined;
  const autoPrint = searchParams.autoprint === "1";
  const printOnly = searchParams.printOnly === "1";

  // Both notinhas: kitchen comanda (resumida) + cashier nota (completa).
  const tickets = (mode: "print" | "preview") => (
    <div id="foocci-print-area">
      <OrderTicket order={order} restaurantName={restaurantName} variant="kitchen" store={storeInfo} mode={mode} />
      <OrderTicket order={order} restaurantName={restaurantName} variant="cashier" store={storeInfo} mode={mode} />
    </div>
  );

  // printOnly: minimal wrapper used by hidden-iframe printing.
  if (printOnly) {
    return (
      <>
        <style>{`body{margin:0;background:#fff;}`}</style>
        <style>{TICKET_PRINT_CSS}</style>
        {tickets("preview")}
      </>
    );
  }

  return (
    <>
      {autoPrint && <AutoPrintTrigger />}
      <TopBar title={`Comanda — ${order.customer.name}`} />

      {/* Action bar — screen only, hidden during print */}
      <div className="flex items-center justify-between border-b border-gray-100 bg-white px-6 py-3 print:hidden">
        <Link href="/orders" className="text-sm text-brand-600 hover:underline">
          ← Voltar para Pedidos
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">
            Imprime a comanda da cozinha e a nota do caixa
          </span>
          <PrintButton />
        </div>
      </div>

      {/* On-screen preview labels (hidden in print) */}
      <div className="bg-gray-100 px-6 pt-6 text-center text-xs font-semibold uppercase tracking-wide text-gray-400 print:hidden">
        Pré-visualização · 2 vias (cozinha + caixa)
      </div>

      {/* Ticket preview — both notinhas, centered on gray background */}
      <div className="min-h-[calc(100vh-9rem)] space-y-8 bg-gray-100 py-8 print:min-h-0 print:space-y-0 print:bg-transparent print:py-0">
        {tickets("preview")}
      </div>

      <style>{TICKET_PRINT_CSS}</style>
    </>
  );
}
