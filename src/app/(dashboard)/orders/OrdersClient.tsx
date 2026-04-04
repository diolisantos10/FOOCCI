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

const DELAY_THRESHOLD = 20; // minutes until an active order is considered delayed

const PERIOD_OPTIONS: Array<{ id: TimePeriod; label: string }> = [
  { id: "now",   label: "Agora"        },
  { id: "30min", label: "Últ. 30 min" },
  { id: "1h",    label: "Última 1h"   },
  { id: "today", label: "Hoje"        },
  { id: "peak",  label: "🔥 Pico"     },
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

// Maps each status to the next logical transition
const NEXT_ACTION: Partial<Record<OrderStatus, { label: string; next: OrderStatus; cls: string }>> = {
  PENDING:          { label: "Confirmar",  next: "CONFIRMED",        cls: "bg-blue-600 hover:bg-blue-700 text-white"     },
  CONFIRMED:        { label: "Preparar",   next: "PREPARING",        cls: "bg-orange-500 hover:bg-orange-600 text-white" },
  PREPARING:        { label: "Pronto",     next: "READY",            cls: "bg-teal-600 hover:bg-teal-700 text-white"     },
  READY:            { label: "Despachar",  next: "OUT_FOR_DELIVERY", cls: "bg-purple-600 hover:bg-purple-700 text-white" },
  OUT_FOR_DELIVERY: { label: "Entregue",   next: "DELIVERED",        cls: "bg-green-600 hover:bg-green-700 text-white"   },
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
  { id: "o1", num: 1, customer: "Maria Silva",    total: 87.50,  status: "PREPARING",        type: "DELIVERY", createdAt: ago(28), itemCount: 3, payment: "PIX"            },
  { id: "o2", num: 2, customer: "João Santos",    total: 45.00,  status: "PENDING",          type: "PICKUP",   createdAt: ago(25), itemCount: 2, payment: "Cartão Crédito" },
  { id: "o3", num: 3, customer: "Ana Oliveira",   total: 124.00, status: "PENDING",          type: "DELIVERY", createdAt: ago(5),  itemCount: 4, payment: "PIX"            },
  { id: "o4", num: 4, customer: "Carlos Mendes",  total: 38.50,  status: "PENDING",          type: "PICKUP",   createdAt: ago(2),  itemCount: 1, payment: "Dinheiro"       },
  { id: "o5", num: 5, customer: "Lúcia Ferreira", total: 67.00,  status: "CONFIRMED",        type: "DELIVERY", createdAt: ago(10), itemCount: 3, payment: "PIX"            },
  { id: "o6", num: 6, customer: "Roberto Lima",   total: 92.00,  status: "PREPARING",        type: "DELIVERY", createdAt: ago(12), itemCount: 2, payment: "Cartão Débito"  },
  { id: "o7", num: 7, customer: "Patrícia Souza", total: 55.00,  status: "READY",            type: "PICKUP",   createdAt: ago(18), itemCount: 3, payment: "PIX"            },
  { id: "o8", num: 8, customer: "Fernando Costa", total: 141.00, status: "DELIVERED",        type: "DELIVERY", createdAt: ago(35), itemCount: 5, payment: "Cartão Crédito" },
  { id: "o9", num: 9, customer: "Beatriz Alves",  total: 29.00,  status: "CANCELLED",        type: "PICKUP",   createdAt: ago(40), itemCount: 1, payment: "PIX"            },
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
    if (mins !== null) {
      result = result.filter((o) => minutesSince(o.createdAt) <= mins);
    }
  }

  return result.sort((a, b) => priorityScore(a) - priorityScore(b));
}

// ─── Insights ─────────────────────────────────────────────────

interface Insight {
  id: string;
  icon: string;
  label: string;
  type: "peak" | "warning" | "info";
}

function computeInsights(orders: MockOrder[]): Insight[] {
  const insights: Insight[] = [];
  const active   = orders.filter((o) => !TERMINAL.includes(o.status));
  const delayed  = orders.filter(isDelayed);
  const preparing = orders.filter((o) => o.status === "PREPARING");
  const slowPrep  = preparing.filter((o) => minutesSince(o.createdAt) > 15);

  if (active.length >= 4)
    insights.push({ id: "peak",       icon: "🔥", label: `Pico ativo — ${active.length} pedidos em curso`,           type: "peak"    });
  if (delayed.length >= 2)
    insights.push({ id: "bottleneck", icon: "⚠️", label: `Gargalo: ${delayed.length} pedidos atrasados`,             type: "warning" });
  if (slowPrep.length > 0 && preparing.length > 0)
    insights.push({ id: "slowprep",   icon: "⏱️", label: "Tempo de preparo acima do normal",                         type: "info"    });

  return insights;
}

// ─── AlertStrip ───────────────────────────────────────────────

function AlertStrip({ orders }: { orders: MockOrder[] }) {
  const pending = orders.filter((o) => o.status === "PENDING").length;
  const delayed = orders.filter(isDelayed);

  const alerts: string[] = [];
  if (pending > 0)
    alerts.push(`${pending} pedido${pending > 1 ? "s" : ""} aguardando confirmação`);
  delayed.forEach((o) => {
    const over = minutesSince(o.createdAt) - DELAY_THRESHOLD;
    alerts.push(`Pedido #${String(o.num).padStart(3, "0")} atrasado há ${over} min`);
  });

  if (alerts.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-red-200 bg-red-50 px-4 py-2">
      {alerts.map((a, i) => (
        <span key={i} className="flex items-center gap-2 text-sm text-red-700">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500 shrink-0" />
          {a}
        </span>
      ))}
    </div>
  );
}

// ─── InsightsRow ──────────────────────────────────────────────

const INSIGHT_CHIP: Record<Insight["type"], string> = {
  peak:    "bg-orange-50 text-orange-700",
  warning: "bg-red-50 text-red-700",
  info:    "bg-blue-50 text-blue-700",
};

function InsightsRow({ orders }: { orders: MockOrder[] }) {
  const insights = computeInsights(orders);
  if (insights.length === 0) return null;
  return (
    <div className="ml-auto hidden sm:flex items-center gap-2 flex-wrap">
      {insights.map((ins) => (
        <span key={ins.id} className={`rounded-full px-3 py-1 text-xs font-medium ${INSIGHT_CHIP[ins.type]}`}>
          {ins.icon} {ins.label}
        </span>
      ))}
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

function KPIRow({ orders }: { orders: MockOrder[] }) {
  const pending   = orders.filter((o) => o.status === "PENDING").length;
  const confirmed = orders.filter((o) => o.status === "CONFIRMED").length;
  const preparing = orders.filter((o) => o.status === "PREPARING").length;
  const delayed   = orders.filter(isDelayed).length;

  const kpis = [
    { label: "Novos pedidos",       value: String(pending),   urgent: pending > 0,  blink: pending > 0  },
    { label: "Confirmados",         value: String(confirmed), urgent: false,         blink: false         },
    { label: "Em preparo",          value: String(preparing), urgent: false,         blink: false         },
    { label: "Atrasados",           value: String(delayed),   urgent: delayed > 0,  blink: delayed > 0  },
    { label: "Tempo médio",         value: "22 min",          urgent: false,         blink: false         },
  ];

  return (
    <div className="grid grid-cols-5 gap-2 shrink-0 border-b border-gray-200 bg-white px-4 py-3">
      {kpis.map((k) => (
        <div
          key={k.label}
          className={`rounded-xl px-3 py-2.5 ${k.urgent ? "bg-red-50" : "bg-gray-50"}`}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            {k.label}
          </p>
          <div className="mt-1 flex items-center gap-1.5">
            {k.blink && (
              <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-red-500" />
            )}
            <p className={`text-2xl font-bold leading-none ${k.urgent ? "text-red-600" : "text-gray-900"}`}>
              {k.value}
            </p>
          </div>
        </div>
      ))}
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

  return (
    <div
      onClick={onClick}
      className={`cursor-pointer rounded-xl border border-gray-200 border-l-4 bg-white shadow-sm transition-all select-none
        ${border}
        ${active     ? "ring-2 ring-orange-400 ring-offset-1" : "hover:shadow-md"}
        ${delayed    ? "bg-red-50/30" : ""}`}
    >
      <div className="p-4">
        {/* Row 1: checkbox + num + badges + elapsed */}
        <div className="mb-2 flex items-center gap-2">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => { e.stopPropagation(); onCheck(order.id, e.target.checked); }}
            onClick={(e) => e.stopPropagation()}
            className="h-3.5 w-3.5 shrink-0 accent-orange-500"
          />
          <span className="font-mono text-sm font-bold text-gray-500">
            #{String(order.num).padStart(3, "0")}
          </span>

          {delayed && (
            <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
              ATRASADO
            </span>
          )}

          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cfg.badge}`}>
            {cfg.label}
          </span>

          <span className={`ml-auto text-xs font-medium ${delayed ? "text-red-500" : "text-gray-400"}`}>
            {mins < 1 ? "agora" : `${mins} min`}
          </span>
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

        {/* Row 4: inline actions */}
        {!isTerminal && (
          <div
            className="mt-3 flex gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            {nextAction && (
              <button
                onClick={() => onAction(order.id, nextAction.next)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${nextAction.cls}`}
              >
                {nextAction.label}
              </button>
            )}
            <button
              onClick={() => onCancel(order.id)}
              className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50"
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
          <button
            onClick={onConfirm}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            Confirmar todos
          </button>
        )}
        {canDispatch && (
          <button
            onClick={onDispatch}
            className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700 transition-colors"
          >
            Despachar todos
          </button>
        )}
        <button
          onClick={onClear}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
        >
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
      {checkedIds.size > 0 ? (
        <BulkBar
          count={checkedIds.size}
          selectedOrders={selectedOrders}
          onConfirm={onBulkConfirm}
          onDispatch={onBulkDispatch}
          onClear={onBulkClear}
        />
      ) : null}

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
    <div className="hidden lg:flex w-[420px] shrink-0 flex-col border-l border-gray-200 bg-white">
      {order ? (
        <>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <div>
              <p className="font-mono text-xs text-gray-400">
                #{String(order.num).padStart(3, "0")}
              </p>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-gray-900">{order.customer}</h3>
                {delayed && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">
                    ATRASADO
                  </span>
                )}
              </div>
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

          {/* Body */}
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {/* Progress bar */}
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

            {/* Timeline */}
            <div className="rounded-xl bg-gray-50 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                Timeline
              </p>
              <div className="space-y-2.5">
                {(["PENDING", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED"] as OrderStatus[]).map((s) => {
                  const statusIdx  = ["PENDING","CONFIRMED","PREPARING","READY","OUT_FOR_DELIVERY","DELIVERED"].indexOf(s);
                  const currentIdx = ["PENDING","CONFIRMED","PREPARING","READY","OUT_FOR_DELIVERY","DELIVERED"].indexOf(order.status);
                  const done    = statusIdx < currentIdx;
                  const current = statusIdx === currentIdx;
                  return (
                    <div key={s} className="flex items-center gap-3">
                      <span className={`h-5 w-5 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold
                        ${done    ? "bg-orange-500 text-white"
                        : current ? "border-2 border-orange-500 bg-white text-orange-600"
                        :           "bg-gray-200 text-transparent"}`}
                      >
                        {done ? "✓" : "●"}
                      </span>
                      <span className={`text-sm ${current ? "font-semibold text-orange-700" : done ? "text-gray-600" : "text-gray-400"}`}>
                        {STATUS_CONFIG[s].label}
                      </span>
                      {current && (
                        <span className="ml-auto text-xs text-orange-500">
                          {elapsed(order.createdAt)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Meta */}
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

          {/* Fixed action buttons */}
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
  const [orders,     setOrders]     = useState<MockOrder[]>(INITIAL_ORDERS);
  const [period,     setPeriod]     = useState<TimePeriod>("30min");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [,           setTick]       = useState(0);

  // Re-render every 30 s so elapsed times and delayed flags stay current
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const filtered      = useMemo(() => filterOrders(orders, period), [orders, period]);
  const selectedOrder = orders.find((o) => o.id === selectedId) ?? null;

  function handleAction(id: string, next: OrderStatus) {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: next } : o)));
  }

  function handleCancel(id: string) {
    setOrders((prev) =>
      prev.map((o) => (o.id === id ? { ...o, status: "CANCELLED" as OrderStatus } : o))
    );
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
      prev.map((o) =>
        checkedIds.has(o.id) && o.status === "PENDING" ? { ...o, status: "CONFIRMED" as OrderStatus } : o
      )
    );
    setCheckedIds(new Set());
  }

  function handleBulkDispatch() {
    setOrders((prev) =>
      prev.map((o) =>
        checkedIds.has(o.id) && o.status === "READY" ? { ...o, status: "OUT_FOR_DELIVERY" as OrderStatus } : o
      )
    );
    setCheckedIds(new Set());
  }

  return (
    <div className="flex flex-col bg-gray-50" style={{ height: "calc(100vh - 64px)" }}>

      {/* Alert strip — hidden when no alerts */}
      <AlertStrip orders={filtered} />

      {/* Controls row */}
      <div className="flex shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4 py-2.5">
        <TimeFilter period={period} onChange={setPeriod} />
        <InsightsRow orders={filtered} />
      </div>

      {/* KPI row */}
      <KPIRow orders={filtered} />

      {/* Split view */}
      <div className="flex flex-1 overflow-hidden">
        <OrderListPane
          orders={filtered}
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
