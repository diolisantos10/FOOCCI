"use client";

import { useState } from "react";

// ─── Types ────────────────────────────────────────────────────

type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PREPARING"
  | "READY"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED";

type TimePeriod = "now" | "30min" | "1h" | "today" | "peak";

interface MockOrder {
  id: string;
  num: number;
  customer: string;
  total: number;
  status: OrderStatus;
  type: "DELIVERY" | "PICKUP";
  createdAt: Date;
  itemCount: number;
  payment: string;
}

// ─── Constants ────────────────────────────────────────────────

const PERIOD_OPTIONS: Array<{ id: TimePeriod; label: string }> = [
  { id: "now",    label: "Agora"        },
  { id: "30min",  label: "Últ. 30 min" },
  { id: "1h",     label: "Última 1h"   },
  { id: "today",  label: "Hoje"        },
  { id: "peak",   label: "🔥 Pico"     },
];

const STATUS_CONFIG: Record<
  OrderStatus,
  { label: string; border: string; badge: string }
> = {
  PENDING:          { label: "Novo",       border: "border-l-amber-400",  badge: "bg-amber-100 text-amber-800"   },
  CONFIRMED:        { label: "Confirmado", border: "border-l-blue-400",   badge: "bg-blue-100 text-blue-800"     },
  PREPARING:        { label: "Preparando", border: "border-l-orange-400", badge: "bg-orange-100 text-orange-800" },
  READY:            { label: "Pronto",     border: "border-l-teal-400",   badge: "bg-teal-100 text-teal-800"     },
  OUT_FOR_DELIVERY: { label: "Em entrega", border: "border-l-purple-400", badge: "bg-purple-100 text-purple-800" },
  DELIVERED:        { label: "Entregue",   border: "border-l-green-400",  badge: "bg-green-100 text-green-800"   },
  CANCELLED:        { label: "Cancelado",  border: "border-l-gray-300",   badge: "bg-gray-100 text-gray-500"     },
};

// KPI placeholders — will be computed from real data in later steps
const MOCK_KPIS = [
  { label: "Novos",        value: "3",      urgent: true  },
  { label: "Confirmados",  value: "2",      urgent: false },
  { label: "Em preparo",   value: "3",      urgent: false },
  { label: "Atrasados",    value: "1",      urgent: true  },
  { label: "Tempo médio",  value: "22 min", urgent: false },
];

// ─── Minimal mock orders ──────────────────────────────────────

const _now = Date.now();
const ago  = (m: number) => new Date(_now - m * 60_000);

const MOCK_ORDERS: MockOrder[] = [
  { id: "o1", num: 1, customer: "Maria Silva",   total: 87.50,  status: "PREPARING",        type: "DELIVERY", createdAt: ago(28), itemCount: 3, payment: "PIX"           },
  { id: "o2", num: 2, customer: "João Santos",   total: 45.00,  status: "PENDING",          type: "PICKUP",   createdAt: ago(25), itemCount: 2, payment: "Cartão Crédito" },
  { id: "o3", num: 3, customer: "Ana Oliveira",  total: 124.00, status: "PENDING",          type: "DELIVERY", createdAt: ago(5),  itemCount: 4, payment: "PIX"           },
  { id: "o4", num: 4, customer: "Carlos Mendes", total: 38.50,  status: "PENDING",          type: "PICKUP",   createdAt: ago(2),  itemCount: 1, payment: "Dinheiro"      },
  { id: "o5", num: 5, customer: "Lúcia Ferreira",total: 67.00,  status: "CONFIRMED",        type: "DELIVERY", createdAt: ago(10), itemCount: 3, payment: "PIX"           },
  { id: "o6", num: 6, customer: "Roberto Lima",  total: 92.00,  status: "PREPARING",        type: "DELIVERY", createdAt: ago(12), itemCount: 2, payment: "Cartão Débito" },
  { id: "o7", num: 7, customer: "Patrícia Souza",total: 55.00,  status: "READY",            type: "PICKUP",   createdAt: ago(18), itemCount: 3, payment: "PIX"           },
  { id: "o8", num: 8, customer: "Fernando Costa",total: 141.00, status: "DELIVERED",        type: "DELIVERY", createdAt: ago(35), itemCount: 5, payment: "Cartão Crédito"},
  { id: "o9", num: 9, customer: "Beatriz Alves", total: 29.00,  status: "CANCELLED",        type: "PICKUP",   createdAt: ago(40), itemCount: 1, payment: "PIX"           },
];

// ─── Utilities ────────────────────────────────────────────────

function fmtCurrency(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function elapsed(date: Date): string {
  const m = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (m < 1)  return "agora";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}min`;
}

// ─── AlertStrip ───────────────────────────────────────────────
// Placeholder — will show real computed alerts in a later step.

function AlertStrip() {
  return (
    <div className="flex items-center gap-6 border-b border-red-200 bg-red-50 px-4 py-2">
      <span className="flex items-center gap-2 text-sm text-red-700">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
        3 pedidos aguardando confirmação
      </span>
      <span className="flex items-center gap-2 text-sm text-red-700">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
        Pedido #001 atrasado há 8 min
      </span>
    </div>
  );
}

// ─── TimeFilter ───────────────────────────────────────────────

function TimeFilter({
  period,
  onChange,
}: {
  period: TimePeriod;
  onChange: (p: TimePeriod) => void;
}) {
  return (
    <div className="flex gap-1">
      {PERIOD_OPTIONS.map((opt) => (
        <button
          key={opt.id}
          onClick={() => onChange(opt.id)}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
            period === opt.id
              ? "bg-orange-500 text-white shadow-sm"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ─── KPIRow ───────────────────────────────────────────────────

function KPIRow() {
  return (
    <div className="grid grid-cols-5 gap-2 border-b border-gray-200 bg-white px-4 py-3">
      {MOCK_KPIS.map((kpi) => (
        <div
          key={kpi.label}
          className={`rounded-xl px-3 py-2.5 ${kpi.urgent ? "bg-red-50" : "bg-gray-50"}`}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            {kpi.label}
          </p>
          <p className={`mt-1 text-2xl font-bold leading-none ${kpi.urgent ? "text-red-600" : "text-gray-900"}`}>
            {kpi.value}
          </p>
        </div>
      ))}
    </div>
  );
}

// ─── OrderCard ────────────────────────────────────────────────
// Structure only — actions come in a later step.

function OrderCard({
  order,
  active,
  onClick,
}: {
  order: MockOrder;
  active: boolean;
  onClick: () => void;
}) {
  const cfg = STATUS_CONFIG[order.status];

  return (
    <div
      onClick={onClick}
      className={`cursor-pointer rounded-xl border border-gray-200 border-l-4 bg-white shadow-sm transition-all select-none
        ${cfg.border}
        ${active ? "ring-2 ring-orange-400 ring-offset-1" : "hover:shadow-md"}`}
    >
      <div className="p-4">
        {/* Row 1: num + status + elapsed */}
        <div className="mb-2 flex items-center gap-2">
          <span className="font-mono text-sm font-bold text-gray-500">
            #{String(order.num).padStart(3, "0")}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cfg.badge}`}>
            {cfg.label}
          </span>
          <span className="ml-auto text-xs text-gray-400">{elapsed(order.createdAt)}</span>
        </div>

        {/* Row 2: customer + total */}
        <div className="flex items-baseline justify-between">
          <span className="font-semibold text-gray-900">{order.customer}</span>
          <span className="font-bold text-gray-900">{fmtCurrency(order.total)}</span>
        </div>

        {/* Row 3: meta */}
        <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
          <span>{order.itemCount} {order.itemCount === 1 ? "item" : "itens"}</span>
          <span>·</span>
          <span>{order.type === "DELIVERY" ? "🛵 Delivery" : "🏃 Retirada"}</span>
          <span>·</span>
          <span>{order.payment}</span>
        </div>

        {/* Action row placeholder — implemented in Step 2 */}
        <div className="mt-3 h-7 rounded-lg bg-gray-50" />
      </div>
    </div>
  );
}

// ─── OrderListPane ────────────────────────────────────────────

function OrderListPane({
  orders,
  selectedId,
  onSelect,
}: {
  orders: MockOrder[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden min-w-0">
      {/* Bulk action placeholder — implemented in Step 3 */}
      <div className="shrink-0 border-b border-gray-100 bg-gray-50 px-4 py-2">
        <p className="text-xs text-gray-400">Ações em lote — em breve</p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <span className="mb-2 text-3xl">📭</span>
            <p className="text-sm">Nenhum pedido neste período</p>
          </div>
        ) : (
          orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              active={order.id === selectedId}
              onClick={() => onSelect(order.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── DetailPanel ──────────────────────────────────────────────
// Structural shell only — timeline and actions come in Step 2.

function DetailPanel({
  order,
  onClose,
}: {
  order: MockOrder | null;
  onClose: () => void;
}) {
  return (
    <div className="hidden lg:flex w-[420px] shrink-0 flex-col border-l border-gray-200 bg-white">
      {order ? (
        <>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <div>
              <p className="font-mono text-xs text-gray-400">
                #{String(order.num).padStart(3, "0")}
              </p>
              <h3 className="font-bold text-gray-900">{order.customer}</h3>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>

          {/* Timeline placeholder */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="rounded-xl bg-gray-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
                Timeline
              </p>
              <div className="space-y-2">
                {["Recebido", "Confirmado", "Preparando", "Pronto", "Entregue"].map((step) => (
                  <div key={step} className="flex items-center gap-3">
                    <span className="h-5 w-5 rounded-full bg-gray-200 shrink-0" />
                    <span className="text-sm text-gray-400">{step}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Order meta */}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Total</span>
                <span className="font-bold text-gray-900">{fmtCurrency(order.total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Tipo</span>
                <span className="font-medium text-gray-800">
                  {order.type === "DELIVERY" ? "Delivery" : "Retirada"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Pagamento</span>
                <span className="font-medium text-gray-800">{order.payment}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Recebido</span>
                <span className="font-medium text-gray-800">{elapsed(order.createdAt)} atrás</span>
              </div>
            </div>
          </div>

          {/* Action buttons placeholder */}
          <div className="border-t border-gray-100 bg-gray-50 px-5 py-4">
            <div className="h-10 rounded-xl bg-gray-200" />
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-gray-300">
          <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" d="M9 12h6M3 7l2-2h14l2 2v14l-2 2H5l-2-2V7z" />
          </svg>
          <p className="text-sm">Selecione um pedido</p>
        </div>
      )}
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────

export default function OrdersClient() {
  const [period,     setPeriod]     = useState<TimePeriod>("30min");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedOrder = MOCK_ORDERS.find((o) => o.id === selectedId) ?? null;

  return (
    <div className="flex flex-col bg-gray-50" style={{ height: "calc(100vh - 64px)" }}>

      {/* Alert strip */}
      <AlertStrip />

      {/* Controls row */}
      <div className="flex shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4 py-2.5">
        <TimeFilter period={period} onChange={setPeriod} />
        {/* Operational insights placeholder — Step 4 */}
        <div className="ml-auto hidden sm:flex items-center gap-2">
          <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-medium text-orange-600">
            🔥 Pico de pedidos detectado
          </span>
        </div>
      </div>

      {/* KPI row */}
      <KPIRow />

      {/* Split view — fills remaining height */}
      <div className="flex flex-1 overflow-hidden">
        <OrderListPane
          orders={MOCK_ORDERS}
          selectedId={selectedId}
          onSelect={(id) => setSelectedId(id === selectedId ? null : id)}
        />
        <DetailPanel
          order={selectedOrder}
          onClose={() => setSelectedId(null)}
        />
      </div>

    </div>
  );
}
