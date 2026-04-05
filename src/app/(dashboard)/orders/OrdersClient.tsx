"use client";

import { useState, useEffect, useMemo } from "react";

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
type StatusFilter = "PENDING" | "PREPARING" | "READY" | "DELAYED" | null;

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

const DELAY_THRESHOLD = 20;

const PERIOD_OPTIONS: Array<{ id: TimePeriod; label: string }> = [
  { id: "now",   label: "Agora"       },
  { id: "30min", label: "Últ. 30min" },
  { id: "1h",    label: "1h"         },
  { id: "today", label: "Hoje"       },
  { id: "peak",  label: "🔥 Pico"    },
];

const STATUS_CONFIG: Record<OrderStatus, { label: string; border: string; badge: string }> = {
  PENDING:          { label: "Novo",       border: "border-l-amber-400",  badge: "bg-amber-100 text-amber-800"   },
  CONFIRMED:        { label: "Confirmado", border: "border-l-blue-400",   badge: "bg-blue-100 text-blue-800"     },
  PREPARING:        { label: "Preparando", border: "border-l-orange-400", badge: "bg-orange-100 text-orange-800" },
  READY:            { label: "Pronto",     border: "border-l-teal-400",   badge: "bg-teal-100 text-teal-800"     },
  OUT_FOR_DELIVERY: { label: "Em entrega", border: "border-l-purple-400", badge: "bg-purple-100 text-purple-800" },
  DELIVERED:        { label: "Entregue",   border: "border-l-green-400",  badge: "bg-green-100 text-green-800"   },
  CANCELLED:        { label: "Cancelado",  border: "border-l-gray-300",   badge: "bg-gray-100 text-gray-500"     },
};

const NEXT_ACTION: Partial<Record<OrderStatus, { label: string; next: OrderStatus; cls: string }>> = {
  PENDING:          { label: "Confirmar", next: "CONFIRMED",        cls: "bg-blue-600 hover:bg-blue-700 text-white"     },
  CONFIRMED:        { label: "Preparar",  next: "PREPARING",        cls: "bg-orange-500 hover:bg-orange-600 text-white" },
  PREPARING:        { label: "Pronto",    next: "READY",            cls: "bg-teal-600 hover:bg-teal-700 text-white"     },
  READY:            { label: "Despachar", next: "OUT_FOR_DELIVERY", cls: "bg-purple-600 hover:bg-purple-700 text-white" },
  OUT_FOR_DELIVERY: { label: "Entregue",  next: "DELIVERED",        cls: "bg-green-600 hover:bg-green-700 text-white"   },
};

const TERMINAL: OrderStatus[] = ["DELIVERED", "CANCELLED"];

const STATUS_PROGRESS: Record<OrderStatus, number> = {
  PENDING: 10, CONFIRMED: 25, PREPARING: 50,
  READY: 75, OUT_FOR_DELIVERY: 90, DELIVERED: 100, CANCELLED: 0,
};

// ─── Mock orders ──────────────────────────────────────────────

const _now = Date.now();
const ago  = (m: number) => new Date(_now - m * 60_000);

const INITIAL_ORDERS: MockOrder[] = [
  { id: "o1", num: 1, customer: "Maria Silva",    total: 87.50,  status: "PREPARING",  type: "DELIVERY", createdAt: ago(28), itemCount: 3, payment: "PIX"            },
  { id: "o2", num: 2, customer: "João Santos",    total: 45.00,  status: "PENDING",    type: "PICKUP",   createdAt: ago(25), itemCount: 2, payment: "Cartão Crédito" },
  { id: "o3", num: 3, customer: "Ana Oliveira",   total: 124.00, status: "PENDING",    type: "DELIVERY", createdAt: ago(5),  itemCount: 4, payment: "PIX"            },
  { id: "o4", num: 4, customer: "Carlos Mendes",  total: 38.50,  status: "PENDING",    type: "PICKUP",   createdAt: ago(2),  itemCount: 1, payment: "Dinheiro"       },
  { id: "o5", num: 5, customer: "Lúcia Ferreira", total: 67.00,  status: "CONFIRMED",  type: "DELIVERY", createdAt: ago(10), itemCount: 3, payment: "PIX"            },
  { id: "o6", num: 6, customer: "Roberto Lima",   total: 92.00,  status: "PREPARING",  type: "DELIVERY", createdAt: ago(12), itemCount: 2, payment: "Cartão Débito"  },
  { id: "o7", num: 7, customer: "Patrícia Souza", total: 55.00,  status: "READY",      type: "PICKUP",   createdAt: ago(18), itemCount: 3, payment: "PIX"            },
  { id: "o8", num: 8, customer: "Fernando Costa", total: 141.00, status: "DELIVERED",  type: "DELIVERY", createdAt: ago(35), itemCount: 5, payment: "Cartão Crédito" },
  { id: "o9", num: 9, customer: "Beatriz Alves",  total: 29.00,  status: "CANCELLED",  type: "PICKUP",   createdAt: ago(40), itemCount: 1, payment: "PIX"            },
];

// ─── Utilities ────────────────────────────────────────────────

function fmtCurrency(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function minutesSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / 60_000);
}

function elapsed(date: Date): string {
  const m = minutesSince(date);
  if (m < 1)  return "agora";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}min`;
}

function isDelayed(order: MockOrder): boolean {
  if (TERMINAL.includes(order.status)) return false;
  return minutesSince(order.createdAt) > DELAY_THRESHOLD;
}

function priorityScore(order: MockOrder): number {
  if (isDelayed(order)) return 0;
  const scores: Record<OrderStatus, number> = {
    PENDING: 1, CONFIRMED: 2, PREPARING: 3, READY: 4,
    OUT_FOR_DELIVERY: 5, DELIVERED: 6, CANCELLED: 7,
  };
  return scores[order.status];
}

function filterOrders(orders: MockOrder[], period: TimePeriod): MockOrder[] {
  const cutoffs: Record<TimePeriod, number | null> = {
    now: 15, "30min": 30, "1h": 60, today: null, peak: null,
  };
  let result = [...orders];

  if (period === "peak") {
    result = result.filter((o) => !TERMINAL.includes(o.status));
  } else {
    const mins = cutoffs[period];
    if (mins !== null) result = result.filter((o) => minutesSince(o.createdAt) <= mins);
  }

  return result.sort((a, b) => priorityScore(a) - priorityScore(b));
}

// ─── AlertBar ─────────────────────────────────────────────────

function AlertBar({ orders }: { orders: MockOrder[] }) {
  const pending = orders.filter((o) => o.status === "PENDING").length;
  const delayed = orders.filter(isDelayed).length;

  const parts: string[] = [];
  if (pending > 0) parts.push(`${pending} aguardando confirmação`);
  if (delayed > 0) parts.push(`${delayed} atrasado${delayed > 1 ? "s" : ""}`);

  if (parts.length === 0) return null;

  return (
    <div className="flex shrink-0 items-center gap-2.5 border-b border-red-200 bg-red-50 px-4 py-2">
      <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-red-500" />
      <p className="text-sm font-medium text-red-700">{parts.join(" • ")}</p>
    </div>
  );
}

// ─── ControlsRow ──────────────────────────────────────────────

function ControlsRow({
  period,
  onPeriodChange,
  orders,
  statusFilter,
  onFilterChange,
}: {
  period: TimePeriod;
  onPeriodChange: (p: TimePeriod) => void;
  orders: MockOrder[];
  statusFilter: StatusFilter;
  onFilterChange: (f: StatusFilter) => void;
}) {
  const counts = {
    PENDING:   orders.filter((o) => o.status === "PENDING").length,
    PREPARING: orders.filter((o) => o.status === "PREPARING").length,
    READY:     orders.filter((o) => o.status === "READY").length,
    DELAYED:   orders.filter(isDelayed).length,
  };

  const STATUS_BTNS: Array<{
    id: StatusFilter;
    label: string;
    count: number;
    on: string;
    off: string;
  }> = [
    { id: "PENDING",   label: "Novos",      count: counts.PENDING,   on: "bg-amber-500 text-white",  off: "bg-gray-100 text-gray-600 hover:bg-gray-200" },
    { id: "PREPARING", label: "Preparando", count: counts.PREPARING, on: "bg-orange-500 text-white", off: "bg-gray-100 text-gray-600 hover:bg-gray-200" },
    { id: "READY",     label: "Pronto",     count: counts.READY,     on: "bg-teal-600 text-white",   off: "bg-gray-100 text-gray-600 hover:bg-gray-200" },
    { id: "DELAYED",   label: "Atrasados",  count: counts.DELAYED,   on: "bg-red-600 text-white",    off: counts.DELAYED > 0 ? "bg-red-50 text-red-700 hover:bg-red-100" : "bg-gray-100 text-gray-400" },
  ];

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[#E5E5E5] bg-white px-4 py-2.5">
      {/* Period */}
      <div className="flex gap-1">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            onClick={() => onPeriodChange(opt.id)}
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

      <div className="mx-1 h-5 w-px bg-gray-200 shrink-0" />

      {/* Status filters */}
      <div className="flex gap-1">
        {STATUS_BTNS.map((btn) => (
          <button
            key={String(btn.id)}
            onClick={() => onFilterChange(statusFilter === btn.id ? null : btn.id)}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
              statusFilter === btn.id ? btn.on : btn.off
            }`}
          >
            {btn.label}
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
              statusFilter === btn.id ? "bg-white/25 text-inherit" : "bg-white/80 text-gray-500"
            }`}>
              {btn.count}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── KPIStrip ─────────────────────────────────────────────────

function KPIStrip({ orders }: { orders: MockOrder[] }) {
  const active     = orders.filter((o) => !TERMINAL.includes(o.status));
  const delayed    = orders.filter(isDelayed).length;
  const pctDelayed = active.length > 0 ? Math.round((delayed / active.length) * 100) : 0;

  return (
    <div className="flex shrink-0 items-center gap-8 border-b border-[#E5E5E5] bg-white px-4 py-2">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Tempo médio</p>
        <p className="text-xl font-bold leading-tight text-gray-800">22 min</p>
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Atrasados</p>
        <p className={`text-xl font-bold leading-tight ${pctDelayed >= 20 ? "text-red-600" : "text-gray-800"}`}>
          {pctDelayed}%
        </p>
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Total hoje</p>
        <p className="text-xl font-bold leading-tight text-gray-800">{orders.length}</p>
      </div>
    </div>
  );
}

// ─── OrderCard ────────────────────────────────────────────────

function OrderCard({
  order,
  active,
  checked,
  onClick,
  onAction,
  onCancel,
  onCheck,
}: {
  order: MockOrder;
  active: boolean;
  checked: boolean;
  onClick: () => void;
  onAction: (id: string, next: OrderStatus) => void;
  onCancel: (id: string) => void;
  onCheck: (id: string, v: boolean) => void;
}) {
  const delayed    = isDelayed(order);
  const cfg        = STATUS_CONFIG[order.status];
  const nextAction = NEXT_ACTION[order.status];
  const isTerminal = TERMINAL.includes(order.status);
  const border     = delayed ? "border-l-red-500" : cfg.border;
  const mins       = minutesSince(order.createdAt);

  // Single badge: if delayed, show "Atrasado" — not the status label
  const badge = delayed
    ? <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500 shrink-0" />
        Atrasado
      </span>
    : <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cfg.badge}`}>{cfg.label}</span>;

  return (
    <div
      onClick={onClick}
      className={`cursor-pointer rounded-xl border border-gray-200 border-l-4 bg-white shadow-sm transition-all select-none
        ${border}
        ${active  ? "ring-2 ring-orange-400 ring-offset-1" : "hover:shadow-md"}
        ${delayed ? "bg-red-50/40" : ""}`}
    >
      <div className="p-3.5">
        {/* Row 1: checkbox + num + single badge + elapsed */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => { e.stopPropagation(); onCheck(order.id, e.target.checked); }}
            onClick={(e) => e.stopPropagation()}
            className="h-3.5 w-3.5 shrink-0 accent-orange-500"
          />
          <span className="font-mono text-xs font-bold text-gray-400">
            #{String(order.num).padStart(3, "0")}
          </span>
          {badge}
          <span className={`ml-auto text-sm font-bold tabular-nums ${delayed ? "text-red-600" : "text-gray-500"}`}>
            {mins < 1 ? "agora" : `${mins} min`}
          </span>
        </div>

        {/* Row 2: customer + total */}
        <div className="mt-2 flex items-baseline justify-between">
          <span className="font-semibold text-gray-900">{order.customer}</span>
          <span className="font-bold text-gray-900">{fmtCurrency(order.total)}</span>
        </div>

        {/* Row 3: meta */}
        <p className="mt-0.5 text-xs text-gray-400">
          {order.itemCount} {order.itemCount === 1 ? "item" : "itens"}
          {" · "}
          {order.type === "DELIVERY" ? "Delivery" : "Retirada"}
          {" · "}
          {order.payment}
        </p>

        {/* Row 4: actions */}
        {!isTerminal && (
          <div className="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
            {nextAction && (
              <button
                onClick={() => onAction(order.id, nextAction.next)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${nextAction.cls}`}
              >
                {nextAction.label}
              </button>
            )}
            <button
              onClick={() => onCancel(order.id)}
              className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── BulkBar ──────────────────────────────────────────────────

function BulkBar({
  count,
  selectedOrders,
  onConfirm,
  onDispatch,
  onClear,
}: {
  count: number;
  selectedOrders: MockOrder[];
  onConfirm: () => void;
  onDispatch: () => void;
  onClear: () => void;
}) {
  const canConfirm  = selectedOrders.some((o) => o.status === "PENDING");
  const canDispatch = selectedOrders.some((o) => o.status === "READY");

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-orange-200 bg-orange-50 px-4 py-2">
      <span className="text-sm font-semibold text-orange-700">
        {count} selecionado{count > 1 ? "s" : ""}
      </span>
      <div className="ml-auto flex gap-2">
        {canConfirm && (
          <button onClick={onConfirm} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors">
            Confirmar todos
          </button>
        )}
        {canDispatch && (
          <button onClick={onDispatch} className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700 transition-colors">
            Despachar todos
          </button>
        )}
        <button onClick={onClear} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-colors">
          Limpar
        </button>
      </div>
    </div>
  );
}

// ─── OrderListPane ────────────────────────────────────────────

function OrderListPane({
  orders,
  selectedId,
  checkedIds,
  onSelect,
  onAction,
  onCancel,
  onCheck,
  onBulkConfirm,
  onBulkDispatch,
  onBulkClear,
}: {
  orders: MockOrder[];
  selectedId: string | null;
  checkedIds: Set<string>;
  onSelect: (id: string) => void;
  onAction: (id: string, next: OrderStatus) => void;
  onCancel: (id: string) => void;
  onCheck: (id: string, v: boolean) => void;
  onBulkConfirm: () => void;
  onBulkDispatch: () => void;
  onBulkClear: () => void;
}) {
  const selectedOrders = orders.filter((o) => checkedIds.has(o.id));

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      {checkedIds.size > 0 && (
        <BulkBar
          count={checkedIds.size}
          selectedOrders={selectedOrders}
          onConfirm={onBulkConfirm}
          onDispatch={onBulkDispatch}
          onClear={onBulkClear}
        />
      )}

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
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
              checked={checkedIds.has(order.id)}
              onClick={() => onSelect(order.id)}
              onAction={onAction}
              onCancel={onCancel}
              onCheck={onCheck}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── DetailPanel ──────────────────────────────────────────────

function DetailPanel({
  order,
  onAction,
  onCancel,
  onClose,
}: {
  order: MockOrder | null;
  onAction: (id: string, next: OrderStatus) => void;
  onCancel: (id: string) => void;
  onClose: () => void;
}) {
  const nextAction = order ? NEXT_ACTION[order.status] : undefined;
  const isTerminal = order ? TERMINAL.includes(order.status) : false;
  const delayed    = order ? isDelayed(order) : false;

  return (
    <div className="hidden lg:flex w-[400px] shrink-0 flex-col border-l border-[#E5E5E5] bg-white">
      {order ? (
        <>
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <div>
              <p className="font-mono text-xs text-gray-400">#{String(order.num).padStart(3, "0")}</p>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-gray-900">{order.customer}</h3>
                {delayed && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">
                    Atrasado
                  </span>
                )}
              </div>
            </div>
            <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {!isTerminal && (
              <div>
                <div className="mb-1.5 flex justify-between text-xs text-gray-400">
                  <span>Progresso</span>
                  <span className="font-semibold text-orange-600">{STATUS_PROGRESS[order.status]}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-orange-500 transition-all duration-500"
                    style={{ width: `${STATUS_PROGRESS[order.status]}%` }}
                  />
                </div>
              </div>
            )}

            <div className="rounded-xl bg-gray-50 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Timeline</p>
              <div className="space-y-2.5">
                {(["PENDING", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED"] as OrderStatus[]).map((s) => {
                  const flow       = ["PENDING","CONFIRMED","PREPARING","READY","OUT_FOR_DELIVERY","DELIVERED"];
                  const done       = flow.indexOf(s) < flow.indexOf(order.status);
                  const current    = s === order.status;
                  return (
                    <div key={s} className="flex items-center gap-3">
                      <span className={`h-5 w-5 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold
                        ${done    ? "bg-orange-500 text-white"
                        : current ? "border-2 border-orange-500 bg-white text-orange-600"
                        :           "bg-gray-200 text-transparent"}`}>
                        {done ? "✓" : "●"}
                      </span>
                      <span className={`text-sm ${current ? "font-semibold text-orange-700" : done ? "text-gray-600" : "text-gray-400"}`}>
                        {STATUS_CONFIG[s].label}
                      </span>
                      {current && (
                        <span className="ml-auto text-xs text-orange-500">{elapsed(order.createdAt)}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Total</span>
                <span className="font-bold text-gray-900">{fmtCurrency(order.total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Tipo</span>
                <span className="font-medium text-gray-800">
                  {order.type === "DELIVERY" ? "🛵 Delivery" : "🏃 Retirada"}
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

          {!isTerminal && (
            <div className="flex gap-3 border-t border-gray-100 bg-gray-50 px-5 py-4">
              {nextAction && (
                <button
                  onClick={() => onAction(order.id, nextAction.next)}
                  className={`flex-1 rounded-xl py-2.5 font-semibold transition-colors ${nextAction.cls}`}
                >
                  {nextAction.label}
                </button>
              )}
              <button
                onClick={() => onCancel(order.id)}
                className="rounded-xl border border-red-200 px-4 py-2.5 font-semibold text-red-600 transition-colors hover:bg-red-50"
              >
                Cancelar
              </button>
            </div>
          )}
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
  const [orders,       setOrders]       = useState<MockOrder[]>(INITIAL_ORDERS);
  const [period,       setPeriod]       = useState<TimePeriod>("30min");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(null);
  const [selectedId,   setSelectedId]   = useState<string | null>(null);
  const [checkedIds,   setCheckedIds]   = useState<Set<string>>(new Set());
  const [,             setTick]         = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const filtered  = useMemo(() => filterOrders(orders, period), [orders, period]);
  const displayed = useMemo(() => {
    if (!statusFilter) return filtered;
    if (statusFilter === "DELAYED") return filtered.filter(isDelayed);
    return filtered.filter((o) => o.status === statusFilter);
  }, [filtered, statusFilter]);
  const selectedOrder = orders.find((o) => o.id === selectedId) ?? null;

  function handleAction(id: string, next: OrderStatus) {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: next } : o)));
  }

  function handleCancel(id: string) {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: "CANCELLED" as OrderStatus } : o)));
    if (selectedId === id) setSelectedId(null);
  }

  function handleSelect(id: string) {
    setSelectedId((prev) => (prev === id ? null : id));
  }

  function handleCheck(id: string, v: boolean) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (v) next.add(id); else next.delete(id);
      return next;
    });
  }

  function handleBulkConfirm() {
    setOrders((prev) =>
      prev.map((o) => checkedIds.has(o.id) && o.status === "PENDING" ? { ...o, status: "CONFIRMED" as OrderStatus } : o)
    );
    setCheckedIds(new Set());
  }

  function handleBulkDispatch() {
    setOrders((prev) =>
      prev.map((o) => checkedIds.has(o.id) && o.status === "READY" ? { ...o, status: "OUT_FOR_DELIVERY" as OrderStatus } : o)
    );
    setCheckedIds(new Set());
  }

  return (
    <div className="flex flex-col bg-[#F5F5F5]" style={{ height: "calc(100vh - 56px)" }}>

      <AlertBar orders={filtered} />

      <ControlsRow
        period={period}
        onPeriodChange={setPeriod}
        orders={filtered}
        statusFilter={statusFilter}
        onFilterChange={setStatusFilter}
      />

      <KPIStrip orders={filtered} />

      <div className="flex flex-1 overflow-hidden">
        <OrderListPane
          orders={displayed}
          selectedId={selectedId}
          checkedIds={checkedIds}
          onSelect={handleSelect}
          onAction={handleAction}
          onCancel={handleCancel}
          onCheck={handleCheck}
          onBulkConfirm={handleBulkConfirm}
          onBulkDispatch={handleBulkDispatch}
          onBulkClear={() => setCheckedIds(new Set())}
        />
        <DetailPanel
          order={selectedOrder}
          onAction={handleAction}
          onCancel={handleCancel}
          onClose={() => setSelectedId(null)}
        />
      </div>

    </div>
  );
}
