import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { TopBar } from "@/components/layout/TopBar";
import { prisma } from "@/lib/prisma";
import { isGuestIdentifier } from "@/lib/guest";
import { SaiposRetryButton } from "@/components/saipos/SaiposRetryButton";
import { PrintButton } from "@/components/print/PrintButton";
import { ReprintButton } from "@/components/print/ReprintButton";
import { OrderTicket } from "@/components/print/OrderTicket";
import { buildStoreInfo, TICKET_PRINT_CSS } from "@/lib/print-ticket";
import { ItemReplacementButton } from "@/components/orders/ItemReplacementButton";
import { OrderEditLogBanner } from "@/components/orders/OrderEditLogBanner";

export const metadata = { title: "Pedido" };

const STATUS_LABELS: Record<string, string> = {
  PENDING:          "Pendente",
  CONFIRMED:        "Confirmado",
  PREPARING:        "Preparando",
  READY:            "Pronto",
  OUT_FOR_DELIVERY: "Em entrega",
  DELIVERED:        "Entregue",
  CANCELLED:        "Cancelado",
};

export default async function OrderDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: {
      items:          true,
      payment:        true,
      customer:       { select: { id: true, name: true, phone: true } },
      deliveryAddress: true,
      editLogs: {
        orderBy: { createdAt: "desc" },
        select: {
          id:              true,
          createdAt:       true,
          previousItemName: true,
          newItemName:     true,
          priceDiff:       true,
          newTotal:        true,
          reason:          true,
          paymentResolved: true,
        },
      },
    },
  });

  if (!order || order.restaurantId !== session.user.restaurantId) {
    notFound();
  }

  const restaurant = await prisma.restaurant.findUnique({
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
  });
  const restaurantName = restaurant?.name ?? "Restaurante";
  const storeInfo = restaurant ? buildStoreInfo(restaurant, restaurant.storeProfile) : undefined;

  const canEdit = ["OWNER", "MANAGER"].includes(session.user.role);
  const orderTotalNum = Number(order.total);

  // Serialize editLogs for client components (Decimal → number)
  const editLogsForClient = order.editLogs.map((l) => ({
    id:               l.id,
    createdAt:        l.createdAt.toISOString(),
    previousItemName: l.previousItemName,
    newItemName:      l.newItemName,
    priceDiff:        Number(l.priceDiff),
    newTotal:         Number(l.newTotal),
    reason:           l.reason,
    paymentResolved:  l.paymentResolved,
  }));

  return (
    <>
      <TopBar title={`Pedido — ${order.customer.name}`} />
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <Link href="/orders" className="text-sm text-brand-600 hover:underline">
            ← Voltar para pedidos
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href={`/orders/${order.id}/imprimir`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-line2 bg-paper px-4 py-2 text-sm font-medium text-ink2 hover:bg-[#FAFAF8] transition"
            >
              🔍 Pré-visualizar comanda
            </Link>
            <ReprintButton orderId={order.id} />
            <PrintButton />
          </div>
        </div>

        {/* Status + meta */}
        <div className="rounded-xl border border-line2 bg-paper p-5">
          <div className="flex items-start justify-between">
            <div>
              <Link
                href={`/customers/${order.customer.id}`}
                className="font-semibold text-brand-600 hover:underline"
              >
                {order.customer.name}
              </Link>
              <p className="text-sm text-muted">
                {!order.customer.phone || isGuestIdentifier(order.customer.phone) ? "Telefone não informado" : order.customer.phone}
              </p>
            </div>
            <span className="rounded-full bg-[#F4F4F2] px-3 py-1 text-sm font-medium text-ink2">
              {STATUS_LABELS[order.status] ?? order.status}
            </span>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted">Tipo</dt>
              <dd className="font-medium">{order.type}</dd>
            </div>
            <div>
              <dt className="text-muted">Data</dt>
              <dd className="font-medium">
                {new Date(order.createdAt).toLocaleString("pt-BR", {
                  day: "2-digit", month: "2-digit", year: "numeric",
                  hour: "2-digit", minute: "2-digit",
                })}
              </dd>
            </div>
            {order.deliveryAddress && (
              <div className="col-span-2">
                <dt className="text-muted">Endereço de entrega</dt>
                <dd className="font-medium">
                  {order.deliveryAddress.street}, {order.deliveryAddress.number} —{" "}
                  {order.deliveryAddress.neighborhood}, {order.deliveryAddress.city}/
                  {order.deliveryAddress.state}
                </dd>
              </div>
            )}
            {order.notes && (
              <div className="col-span-2">
                <dt className="text-muted">Observações</dt>
                <dd className="font-medium">{order.notes}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Edit history banner (only if edits exist) */}
        {editLogsForClient.length > 0 && (
          <OrderEditLogBanner orderId={order.id} logs={editLogsForClient} />
        )}

        {/* Items */}
        <div className="rounded-xl border border-line2 bg-paper overflow-hidden">
          <div className="border-b border-line bg-[#FAFAF8] px-5 py-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted uppercase tracking-wide">
              Itens
            </h2>
            {canEdit && order.status !== "DELIVERED" && order.status !== "CANCELLED" && (
              <span className="text-xs text-muted">Clique em &ldquo;Trocar&rdquo; para alterar um item</span>
            )}
          </div>
          <ul className="divide-y divide-line">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <div className="flex items-center gap-1">
                  <span className="text-ink">
                    {item.quantity}× {item.name}
                    {item.variantName && (
                      <span className="ml-1 text-xs text-muted">({item.variantName})</span>
                    )}
                    {item.notes && <span className="ml-1 text-xs text-muted">({item.notes})</span>}
                  </span>
                  <ItemReplacementButton
                    orderId={order.id}
                    orderTotal={orderTotalNum}
                    orderStatus={order.status}
                    canEdit={canEdit}
                    item={{
                      id:          item.id,
                      name:        item.name,
                      quantity:    item.quantity,
                      price:       Number(item.price),
                      total:       Number(item.total),
                      variantName: item.variantName ?? null,
                      notes:       item.notes ?? null,
                    }}
                  />
                </div>
                <span className="font-medium">R$ {Number(item.total).toFixed(2)}</span>
              </li>
            ))}
          </ul>
          <div className="border-t border-line px-5 py-3">
            <div className="flex justify-between text-sm text-muted">
              <span>Subtotal</span>
              <span>R$ {Number(order.subtotal).toFixed(2)}</span>
            </div>
            {Number(order.deliveryFee) > 0 && (
              <div className="flex justify-between text-sm text-muted">
                <span>Taxa de entrega</span>
                <span>R$ {Number(order.deliveryFee).toFixed(2)}</span>
              </div>
            )}
            {Number(order.discount) > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>Desconto</span>
                <span>– R$ {Number(order.discount).toFixed(2)}</span>
              </div>
            )}
            <div className="mt-2 flex justify-between font-semibold text-ink">
              <span>Total</span>
              <span>R$ {Number(order.total).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Payment */}
        <div className="rounded-xl border border-line2 bg-paper p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
            Pagamento
          </h2>
          {order.payment ? (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-muted">Método</dt>
                <dd className="font-medium">{order.payment.method}</dd>
              </div>
              <div>
                <dt className="text-muted">Status</dt>
                <dd className="font-medium">{order.payment.status}</dd>
              </div>
              <div>
                <dt className="text-muted">Valor</dt>
                <dd className="font-medium">R$ {Number(order.payment.amount).toFixed(2)}</dd>
              </div>
              {order.payment.paidAt && (
                <div>
                  <dt className="text-muted">Pago em</dt>
                  <dd className="font-medium">
                    {new Date(order.payment.paidAt).toLocaleString("pt-BR")}
                  </dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="text-sm text-muted">Nenhum registro de pagamento ainda.</p>
          )}
        </div>

        {/* Saipos POS integration */}
        {(order.saiposStatus || order.saiposSentAt || order.saiposError) && (
          <div className="rounded-xl border border-violet-100 bg-paper p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-violet-400">
              Saipos PDV
            </h2>

            {/* 403 auth banner */}
            {order.saiposStatus === "AUTH_BLOCKED_403" && !order.saiposSentAt && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800 space-y-1">
                <p className="font-semibold">Saipos: Falha na integração ⚠️</p>
                <p>
                  HTTP 403 — acesso negado pela Saipos no endpoint v2.5.
                  A URL informada pelo suporte está em uso, mas a credencial/parceiro ainda não foi autorizado para autenticação.
                </p>
              </div>
            )}

            <dl className="grid grid-cols-2 gap-3 text-sm">
              {order.saiposStatus && (
                <div>
                  <dt className="text-muted">Status Saipos</dt>
                  <dd className="font-medium">
                    {order.saiposStatus === "AUTH_BLOCKED_403"
                      ? "Falha na integração (HTTP 403)"
                      : order.saiposStatus === "PENDING_SAIPOS_VALIDATION"
                      ? "Falha na integração (erro 902)"
                      : order.saiposStatus === "SENT"
                      ? "Enviado"
                      : order.saiposStatus}
                  </dd>
                </div>
              )}
              {order.saiposSentAt && (
                <div>
                  <dt className="text-muted">Enviado em</dt>
                  <dd className="font-medium">
                    {new Date(order.saiposSentAt).toLocaleString("pt-BR")}
                  </dd>
                </div>
              )}
              {order.saiposOrderId && (
                <div>
                  <dt className="text-muted">ID Saipos</dt>
                  <dd className="font-mono font-medium text-xs">{order.saiposOrderId}</dd>
                </div>
              )}
              {order.saiposLastAttemptAt && (
                <div>
                  <dt className="text-muted">Última tentativa</dt>
                  <dd className="font-medium">
                    {new Date(order.saiposLastAttemptAt).toLocaleString("pt-BR")}
                  </dd>
                </div>
              )}
              {order.saiposLastErrorCode && (
                <div>
                  <dt className="text-muted">Código de erro</dt>
                  <dd className="font-mono font-medium text-red-600">{order.saiposLastErrorCode}</dd>
                </div>
              )}
              {order.saiposError && (
                <div className="col-span-2">
                  <dt className="text-muted">Erro</dt>
                  <dd className="font-medium text-red-600 text-xs break-words">{order.saiposError}</dd>
                </div>
              )}
            </dl>

            <div className="mt-4">
              <SaiposRetryButton
                orderId={order.id}
                saiposSentAt={order.saiposSentAt?.toISOString() ?? null}
                saiposStatus={order.saiposStatus ?? null}
              />
            </div>
          </div>
        )}
      </div>

      {/* Print tickets — hidden on screen, printed during @media print:
          kitchen comanda (resumida) + cashier nota (completa). */}
      <div id="foocci-print-area" className="hidden print:block">
        <OrderTicket order={order} restaurantName={restaurantName} variant="kitchen" store={storeInfo} mode="print" />
        <OrderTicket order={order} restaurantName={restaurantName} variant="cashier" store={storeInfo} mode="print" />
      </div>
      <style>{TICKET_PRINT_CSS}</style>
    </>
  );
}
