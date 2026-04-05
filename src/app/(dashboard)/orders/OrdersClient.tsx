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

type StatusFilter = "PENDING" | "PREPARING" | "READY" | "DELAYED" | null;

interface OrderItem {
  name: string;
  qty: number;
  price: number;
  note?: string;
  addons?: string[];
}

interface MockOrder {
  id: string;
  num: number;
  customer: string;
  phone: string;
  email?: string;
  channel: string;
  total: number;
  subtotal: number;
  deliveryFee?: number;
  changeFor?: number;
  status: OrderStatus;
  type: "DELIVERY" | "PICKUP" | "TABLE";
  createdAt: Date;
  itemCount: number;
  payment: string;
  address: string;
  items: OrderItem[];
}

// ─── Constants ────────────────────────────────────────────────

const DELAY_THRESHOLD = 20;


const STATUS_CONFIG: Record<OrderStatus, { label: string; border: string; badge: string }> = {
  PENDING:          { label: "Novo",       border: "border-l-amber-400",  badge: "bg-amber-100 text-amber-800"   },
  CONFIRMED:        { label: "Confirmado", border: "border-l-blue-400",   badge: "bg-blue-100 text-blue-800"     },
  PREPARING:        { label: "Preparando", border: "border-l-orange-400", badge: "bg-orange-100 text-orange-800" },
  READY:            { label: "Pronto",     border: "border-l-teal-400",   badge: "bg-teal-100 text-teal-800"     },
  OUT_FOR_DELIVERY: { label: "Em entrega", border: "border-l-purple-400", badge: "bg-purple-100 text-purple-800" },
  DELIVERED:        { label: "Entregue",   border: "border-l-green-400",  badge: "bg-green-100 text-green-800"   },
  CANCELLED:        { label: "Cancelado",  border: "border-l-gray-300",   badge: "bg-gray-100 text-gray-500"     },
};

const NEXT_ACTION: Partial<Record<OrderStatus, { label: string; next: OrderStatus }>> = {
  PENDING:          { label: "Confirmar", next: "CONFIRMED"        },
  CONFIRMED:        { label: "Preparar",  next: "PREPARING"        },
  PREPARING:        { label: "Pronto",    next: "READY"            },
  READY:            { label: "Despachar", next: "OUT_FOR_DELIVERY" },
  OUT_FOR_DELIVERY: { label: "Entregue",  next: "DELIVERED"        },
};

const TERMINAL: OrderStatus[] = ["DELIVERED", "CANCELLED"];

// ─── Mock orders ──────────────────────────────────────────────

const _now = Date.now();
const ago  = (m: number) => new Date(_now - m * 60_000);

const INITIAL_ORDERS: MockOrder[] = [
  {
    id: "o1", num: 1, customer: "Maria Silva",
    phone: "(11) 99234-5678", email: "maria.silva@gmail.com", channel: "WhatsApp",
    status: "PREPARING", type: "DELIVERY", createdAt: ago(28),
    itemCount: 3, payment: "PIX",
    address: "Rua das Flores, 142, Apto 3B — Jardim Paulista, São Paulo/SP",
    subtotal: 77.50, deliveryFee: 10.00, total: 87.50,
    items: [
      { name: "Parmegiana de Frango", qty: 1, price: 42.00, note: "Sem cebola" },
      { name: "Arroz + Feijão", qty: 1, price: 18.50 },
      { name: "Refrigerante Lata", qty: 2, price: 8.50, addons: ["Coca-Cola", "Guaraná"] },
    ],
  },
  {
    id: "o2", num: 2, customer: "João Santos",
    phone: "(11) 98765-4321", channel: "Telefone",
    status: "PENDING", type: "PICKUP", createdAt: ago(25),
    itemCount: 2, payment: "Cartão Crédito",
    address: "Retirada no local",
    subtotal: 45.00, total: 45.00,
    items: [
      { name: "X-Bacon Duplo", qty: 1, price: 32.00, addons: ["+ Queijo extra", "+ Bacon extra"] },
      { name: "Batata Frita M", qty: 1, price: 13.00 },
    ],
  },
  {
    id: "o3", num: 3, customer: "Ana Oliveira",
    phone: "(11) 91234-0000", email: "ana@outlook.com", channel: "App",
    status: "PENDING", type: "DELIVERY", createdAt: ago(5),
    itemCount: 4, payment: "PIX",
    address: "Av. Brasil, 890, Casa — Centro, São Paulo/SP — CEP 01310-100",
    subtotal: 116.00, deliveryFee: 8.00, total: 124.00,
    items: [
      { name: "Frango Grelhado", qty: 2, price: 38.00 },
      { name: "Salada Caesar", qty: 1, price: 24.00, note: "Molho à parte" },
      { name: "Suco Natural 500ml", qty: 2, price: 8.00 },
    ],
  },
  {
    id: "o4", num: 4, customer: "Carlos Mendes",
    phone: "(11) 97777-2233", channel: "WhatsApp",
    status: "PENDING", type: "TABLE", createdAt: ago(2),
    itemCount: 1, payment: "Dinheiro",
    address: "Mesa 4",
    subtotal: 38.50, total: 38.50, changeFor: 50.00,
    items: [
      { name: "Marmita Fitness", qty: 1, price: 38.50, note: "Sem sal na salada" },
    ],
  },
  {
    id: "o5", num: 5, customer: "Lúcia Ferreira",
    phone: "(11) 94455-6677", email: "lucia.ferreira@empresa.com.br", channel: "WhatsApp",
    status: "CONFIRMED", type: "DELIVERY", createdAt: ago(10),
    itemCount: 3, payment: "PIX",
    address: "Rua dos Pinheiros, 33, Bloco B Ap. 12 — Pinheiros, São Paulo/SP",
    subtotal: 57.00, deliveryFee: 10.00, total: 67.00,
    items: [
      { name: "Pizza Margherita M", qty: 1, price: 45.00, addons: ["+ Borda recheada"] },
      { name: "Água Mineral 500ml", qty: 2, price: 4.00 },
      { name: "Sobremesa do Dia", qty: 1, price: 12.00 },
    ],
  },
  {
    id: "o6", num: 6, customer: "Roberto Lima",
    phone: "(11) 93300-8899", channel: "App",
    status: "PREPARING", type: "DELIVERY", createdAt: ago(12),
    itemCount: 3, payment: "Cartão Débito",
    address: "Rua Augusta, 512, Cj 74 — Consolação, São Paulo/SP — CEP 01305-000",
    subtotal: 84.00, deliveryFee: 8.00, total: 92.00,
    items: [
      { name: "Costela na Brasa 400g", qty: 1, price: 68.00 },
      { name: "Farofa Especial", qty: 1, price: 14.00 },
      { name: "Refrigerante 600ml", qty: 1, price: 10.00 },
    ],
  },
  {
    id: "o7", num: 7, customer: "Patrícia Souza",
    phone: "(11) 96611-2233", email: "pati.souza@gmail.com", channel: "WhatsApp",
    status: "READY", type: "TABLE", createdAt: ago(18),
    itemCount: 4, payment: "PIX",
    address: "Mesa 7",
    subtotal: 55.00, total: 55.00,
    items: [
      { name: "Bowl Açaí 500ml", qty: 1, price: 28.00 },
      { name: "Granola Extra", qty: 1, price: 8.00 },
      { name: "Suco de Laranja", qty: 1, price: 10.00 },
      { name: "Tapioca Recheada", qty: 1, price: 9.00, note: "Sem queijo" },
    ],
  },
  {
    id: "o8", num: 8, customer: "Fernando Costa",
    phone: "(11) 92200-4455", email: "fernando@costa.net", channel: "App",
    status: "DELIVERED", type: "DELIVERY", createdAt: ago(35),
    itemCount: 3, payment: "Cartão Crédito",
    address: "Al. Santos, 1200, Apto 101 — Jardins, São Paulo/SP — CEP 01419-002",
    subtotal: 133.00, deliveryFee: 8.00, total: 141.00,
    items: [
      { name: "Salmão Grelhado", qty: 1, price: 54.00 },
      { name: "Risoto de Cogumelos", qty: 1, price: 38.00 },
      { name: "Vinho Tinto 375ml", qty: 1, price: 41.00 },
    ],
  },
  {
    id: "o9", num: 9, customer: "Beatriz Alves",
    phone: "(11) 95544-3322", channel: "WhatsApp",
    status: "CANCELLED", type: "PICKUP", createdAt: ago(40),
    itemCount: 1, payment: "PIX",
    address: "Retirada no local",
    subtotal: 29.00, total: 29.00,
    items: [
      { name: "Combo Kids", qty: 1, price: 29.00 },
    ],
  },
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


// ─── SearchBar ────────────────────────────────────────────────

function SearchBar({
  searchQuery,
  dateFrom,
  dateTo,
  onSearchChange,
  onDateFromChange,
  onDateToChange,
  onClear,
}: {
  searchQuery: string;
  dateFrom: string;
  dateTo: string;
  onSearchChange: (v: string) => void;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-[#E5E5E5] bg-white px-4 py-2.5">
      <input
        type="date"
        value={dateFrom}
        onChange={(e) => onDateFromChange(e.target.value)}
        className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400 transition-shadow"
      />
      <input
        type="date"
        value={dateTo}
        onChange={(e) => onDateToChange(e.target.value)}
        className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400 transition-shadow"
      />
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Busque por cliente, pedido, telefone, email..."
        className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400 transition-shadow"
      />
      <button className="shrink-0 rounded-lg bg-orange-500 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-orange-600">
        Filtrar
      </button>
      <button
        onClick={onClear}
        className="shrink-0 rounded-lg border border-gray-200 px-4 py-1.5 text-xs font-semibold text-gray-500 transition-colors hover:bg-gray-50"
      >
        Limpar filtro
      </button>
    </div>
  );
}

// ─── StatusRow ────────────────────────────────────────────────

function StatusRow({
  orders,
  statusFilter,
  onFilterChange,
}: {
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

  const BTNS: Array<{ id: StatusFilter; label: string; count: number; on: string; off: string }> = [
    { id: "PENDING",   label: "Novos",      count: counts.PENDING,   on: "bg-amber-500 text-white",  off: "bg-gray-100 text-gray-600 hover:bg-gray-200"                                    },
    { id: "PREPARING", label: "Preparando", count: counts.PREPARING, on: "bg-orange-500 text-white", off: "bg-gray-100 text-gray-600 hover:bg-gray-200"                                    },
    { id: "READY",     label: "Pronto",     count: counts.READY,     on: "bg-teal-600 text-white",   off: "bg-gray-100 text-gray-600 hover:bg-gray-200"                                    },
    { id: "DELAYED",   label: "Atrasados",  count: counts.DELAYED,   on: "bg-red-600 text-white",    off: counts.DELAYED > 0 ? "bg-red-50 text-red-700 hover:bg-red-100" : "bg-gray-100 text-gray-400" },
  ];

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-[#E5E5E5] bg-white px-4 py-2.5">
      {BTNS.map((btn) => (
        <button
          key={String(btn.id)}
          onClick={() => onFilterChange(statusFilter === btn.id ? null : btn.id)}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
            statusFilter === btn.id ? btn.on : btn.off
          }`}
        >
          {btn.label}
          <span className={`rounded-full px-1.5 py-0.5 text-xs font-bold leading-none ${
            statusFilter === btn.id ? "bg-white/25 text-inherit" : "bg-white/80 text-gray-500"
          }`}>
            {btn.count}
          </span>
        </button>
      ))}
    </div>
  );
}

// ─── PerformanceBar ───────────────────────────────────────────

function PerformanceBar({ orders }: { orders: MockOrder[] }) {
  const active     = orders.filter((o) => !TERMINAL.includes(o.status));
  const delayed    = orders.filter(isDelayed).length;
  const pctDelayed = active.length > 0 ? Math.round((delayed / active.length) * 100) : 0;

  const delivery = orders.filter((o) => o.type === "DELIVERY").length;
  const pickup   = orders.filter((o) => o.type === "PICKUP").length;
  const table    = orders.filter((o) => o.type === "TABLE").length;

  return (
    <div className="flex shrink-0 items-center gap-6 border-b border-[#E5E5E5] bg-white px-4 py-2.5">
      {/* Label */}
      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 shrink-0">
        Performance
      </span>

      {/* KPIs */}
      <div className="flex items-center gap-6">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[10px] font-medium text-gray-400">Tempo médio</span>
          <span className="text-sm font-bold text-gray-800">22 min</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[10px] font-medium text-gray-400">Atrasados</span>
          <span className={`text-sm font-bold ${pctDelayed >= 20 ? "text-red-600" : "text-gray-800"}`}>
            {pctDelayed}%
          </span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[10px] font-medium text-gray-400">Total hoje</span>
          <span className="text-sm font-bold text-gray-800">{orders.length}</span>
        </div>
      </div>

      {/* Divider */}
      <div className="h-5 w-px bg-gray-200 shrink-0" />

      {/* Modalidades */}
      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 shrink-0">
        Modalidades
      </span>
      <div className="flex items-center gap-2">
        {[
          { label: "Delivery",  count: delivery },
          { label: "Retirada",  count: pickup   },
          { label: "Mesa",      count: table    },
        ].map(({ label, count }) => (
          <span key={label} className="flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
            {label}
            <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold leading-none text-gray-500">
              {count}
            </span>
          </span>
        ))}
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
          {order.type === "DELIVERY" ? "Delivery" : order.type === "TABLE" ? "Mesa" : "Retirada"}
          {" · "}
          {order.payment}
        </p>

        {/* Row 4: actions */}
        {!isTerminal && (
          <div className="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
            {nextAction && (
              <button
                onClick={() => onAction(order.id, nextAction.next)}
                className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-orange-600"
              >
                {nextAction.label}
              </button>
            )}
            <button
              onClick={() => onCancel(order.id)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 transition-colors hover:bg-gray-50"
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

// ─── StatusTimeline ───────────────────────────────────────────

const FLOW_ALL: Array<{ status: OrderStatus; label: string }> = [
  { status: "PENDING",          label: "Novo"        },
  { status: "CONFIRMED",        label: "Confirmado"  },
  { status: "PREPARING",        label: "Preparando"  },
  { status: "READY",            label: "Pronto"      },
  { status: "OUT_FOR_DELIVERY", label: "Saiu"        },
  { status: "DELIVERED",        label: "Entregue"    },
];

const STATUS_ORDER: OrderStatus[] = [
  "PENDING","CONFIRMED","PREPARING","READY","OUT_FOR_DELIVERY","DELIVERED","CANCELLED",
];

function StatusTimeline({ order }: { order: MockOrder }) {
  const flow = order.type === "DELIVERY"
    ? FLOW_ALL
    : FLOW_ALL.filter((s) => s.status !== "OUT_FOR_DELIVERY");

  const currentIdx = STATUS_ORDER.indexOf(order.status);

  return (
    <div className="flex items-start">
      {flow.map((step, i) => {
        const stepIdx = STATUS_ORDER.indexOf(step.status);
        const done    = stepIdx < currentIdx;
        const current = step.status === order.status;
        const isLast  = i === flow.length - 1;

        return (
          <div key={step.status} className="flex flex-1 flex-col items-center">
            {/* Connector + dot row */}
            <div className="flex w-full items-center">
              <div className={`h-px flex-1 transition-colors ${i === 0 ? "invisible" : done || current ? "bg-orange-400" : "bg-gray-200"}`} />
              <div className={`h-4 w-4 shrink-0 rounded-full flex items-center justify-center text-[9px] font-bold transition-colors
                ${done    ? "bg-orange-500 text-white"
                : current ? "border-2 border-orange-500 bg-white"
                :           "bg-gray-200"}`}
              >
                {done && "✓"}
              </div>
              <div className={`h-px flex-1 transition-colors ${isLast ? "invisible" : done ? "bg-orange-400" : "bg-gray-200"}`} />
            </div>
            {/* Label */}
            <p className={`mt-1 text-center text-[9px] leading-tight ${
              current ? "font-bold text-orange-600"
              : done   ? "text-gray-500"
              :          "text-gray-300"
            }`}>
              {step.label}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ─── DetailPanel (Order Ticket) ───────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">
      {children}
    </p>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="shrink-0 text-gray-400">{label}</span>
      <span className="text-right font-medium text-gray-800">{value}</span>
    </div>
  );
}

function DetailPanel({
  order,
  onClose,
}: {
  order: MockOrder | null;
  onClose: () => void;
}) {
  if (!order) {
    return (
      <div className="hidden lg:flex w-[380px] shrink-0 flex-col items-center justify-center gap-3 border-l border-[#E5E5E5] bg-white text-gray-300">
        <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" d="M9 12h6M3 7l2-2h14l2 2v14l-2 2H5l-2-2V7z" />
        </svg>
        <p className="text-sm">Selecione um pedido</p>
      </div>
    );
  }

  const isDelivery = order.type === "DELIVERY";
  const isCash     = order.payment === "Dinheiro";
  const troco      = isCash && order.changeFor ? order.changeFor - order.total : null;

  return (
    <div className="hidden lg:flex w-[380px] shrink-0 flex-col border-l border-[#E5E5E5] bg-white">

      {/* Header */}
      <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
        <div>
          <p className="font-mono text-xs text-gray-400">
            Pedido #{String(order.num).padStart(3, "0")}
          </p>
          <h3 className="mt-0.5 text-base font-bold text-gray-900">{order.customer}</h3>
        </div>
        <button onClick={onClose} className="mt-0.5 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>

      {/* Status timeline */}
      <div className="border-b border-[#E5E5E5] px-5 py-3">
        <StatusTimeline order={order} />
      </div>

      {/* Scrollable body */}
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">

        {/* 1. Cliente */}
        <div>
          <SectionLabel>Cliente</SectionLabel>
          <div className="space-y-1.5">
            <Row label="Telefone" value={order.phone} />
            {order.email && <Row label="E-mail" value={order.email} />}
          </div>
        </div>

        {/* 2. Pedido context */}
        <div>
          <SectionLabel>Pedido</SectionLabel>
          <div className="space-y-1.5">
            <Row label="Canal" value={order.channel} />
            <Row label="Modalidade" value={
              order.type === "DELIVERY" ? "Delivery"
              : order.type === "TABLE"  ? `Mesa — ${order.address}`
              : "Retirada"
            } />
          </div>
        </div>

        {/* 3. Entrega (delivery only) */}
        {isDelivery && (
          <div>
            <SectionLabel>Entrega</SectionLabel>
            <div className="space-y-1.5">
              <div className="text-sm text-gray-800 leading-snug">{order.address}</div>
              {order.deliveryFee != null && (
                <Row label="Taxa de entrega" value={fmtCurrency(order.deliveryFee)} />
              )}
            </div>
          </div>
        )}

        {/* 4. Itens */}
        <div>
          <SectionLabel>Itens</SectionLabel>
          <div className="space-y-3">
            {order.items.map((item, i) => (
              <div key={i}>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-gray-800">
                    <span className="mr-2 font-semibold text-gray-500">{item.qty}×</span>
                    {item.name}
                  </span>
                  <span className="ml-4 shrink-0 text-sm font-medium text-gray-700">
                    {fmtCurrency(item.price * item.qty)}
                  </span>
                </div>
                {item.note && (
                  <p className="mt-0.5 pl-6 text-xs italic text-gray-400">{item.note}</p>
                )}
                {item.addons?.map((addon, j) => (
                  <p key={j} className="mt-0.5 pl-6 text-xs text-gray-500">+ {addon}</p>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* 5. Pagamento */}
        <div>
          <SectionLabel>Pagamento</SectionLabel>
          <div className="space-y-1.5">
            <Row label="Forma" value={order.payment} />
            {isCash && order.changeFor && (
              <Row label="Troco para" value={fmtCurrency(order.changeFor)} />
            )}
            {troco != null && troco > 0 && (
              <Row label="Valor do troco" value={
                <span className="text-green-700">{fmtCurrency(troco)}</span>
              } />
            )}
          </div>
        </div>

        {/* 6. Resumo */}
        <div className="border-t border-dashed border-gray-200 pt-4">
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Subtotal</span>
              <span className="text-gray-700">{fmtCurrency(order.subtotal)}</span>
            </div>
            {isDelivery && order.deliveryFee != null && (
              <div className="flex justify-between">
                <span className="text-gray-400">Entrega</span>
                <span className="text-gray-700">{fmtCurrency(order.deliveryFee)}</span>
              </div>
            )}
            <div className="flex justify-between pt-1">
              <span className="font-semibold text-gray-700">Total</span>
              <span className="font-bold text-gray-900">{fmtCurrency(order.total)}</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────

export default function OrdersClient() {
  const [orders,       setOrders]       = useState<MockOrder[]>(INITIAL_ORDERS);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(null);
  const [selectedId,   setSelectedId]   = useState<string | null>(null);
  const [checkedIds,   setCheckedIds]   = useState<Set<string>>(new Set());
  const [searchQuery,  setSearchQuery]  = useState("");
  const [dateFrom,     setDateFrom]     = useState("");
  const [dateTo,       setDateTo]       = useState("");
  const [,             setTick]         = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const filtered  = useMemo(
    () => [...orders].sort((a, b) => priorityScore(a) - priorityScore(b)),
    [orders]
  );
  const displayed = useMemo(() => {
    let result = filtered;
    if (statusFilter === "DELAYED") result = result.filter(isDelayed);
    else if (statusFilter) result = result.filter((o) => o.status === statusFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((o) =>
        o.customer.toLowerCase().includes(q) ||
        String(o.num).includes(q)
      );
    }
    return result;
  }, [filtered, statusFilter, searchQuery]);
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

      <PerformanceBar orders={orders} />

      <SearchBar
        searchQuery={searchQuery}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onSearchChange={setSearchQuery}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        onClear={() => { setSearchQuery(""); setDateFrom(""); setDateTo(""); }}
      />

      <StatusRow
        orders={filtered}
        statusFilter={statusFilter}
        onFilterChange={setStatusFilter}
      />

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
          onClose={() => setSelectedId(null)}
        />
      </div>

    </div>
  );
}
