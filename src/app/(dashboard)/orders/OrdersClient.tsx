"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { isGuestIdentifier } from "@/lib/guest";
import { SaiposRetryButton } from "@/components/saipos/SaiposRetryButton";
import { ManualOrderModal } from "@/components/orders/ManualOrderModal";
import { formatOrderNumber } from "@/lib/order-number";
import { createAutoPrintGuard } from "@/utils/autoPrintGuard";
import { SOUND_PREF_KEY } from "@/lib/sound-prefs";

// ─── Sound alert ──────────────────────────────────────────────────────────────
const ALERT_WAV      = "/sounds/foocci-order-alert.m4a";

// Oscillator fallback — used when WAV file is unavailable or AudioContext is not suspended
function playBeep() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(1100, ctx.currentTime + 0.5);
    gain2.gain.setValueAtTime(0.3, ctx.currentTime + 0.5);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.9);
    osc2.start(ctx.currentTime + 0.5);
    osc2.stop(ctx.currentTime + 0.9);
  } catch {
    // silent fail — browser may block AudioContext without user gesture
  }
}

// Display name for the active manager/POS integration shown in order detail.
// When Saipos is active this is "Saipos". Replace here (or derive from order data)
// when another provider is introduced — no other file needs to change.
const MANAGER_INTEGRATION_DISPLAY_NAME = "Saipos";

// ─── Types ────────────────────────────────────────────────────

type OrderStatus =
  | "PENDING"
  | "AWAITING_PAYMENT"
  | "CONFIRMED"
  | "PREPARING"
  | "READY"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED";

type StatusFilter = "PENDING" | "PREPARING" | "READY" | "DELAYED" | null;

type SortKey =
  | "recent"
  | "oldest"
  | "delayed"
  | "value_desc"
  | "value_asc"
  | "vip_first"
  | "cold_first"
  | "status"
  | "wait";

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "recent",     label: "Mais recentes"        },
  { value: "oldest",     label: "Mais antigos"          },
  { value: "delayed",    label: "Mais atrasados"        },
  { value: "value_desc", label: "Maior valor"           },
  { value: "value_asc",  label: "Menor valor"           },
  { value: "vip_first",  label: "Clientes VIP primeiro" },
  { value: "cold_first", label: "Clientes frios primeiro" },
  { value: "status",     label: "Status do pedido"      },
  { value: "wait",       label: "Tempo de espera"       },
];

interface OrderItem {
  name: string;
  qty: number;
  price: number;
  note?: string;
  addons?: string[];
}

interface CustomerProfile {
  totalOrders: number;
  totalSpend: number;
  lastOrderAt?: string | null;
  note?: string;
  tier?: string;
}

interface MockOrder {
  id: string;
  num: number;
  orderNumber?: number | null;
  customer: string;
  customerId?: string;
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
  payment:              string;
  paymentProviderName?: string | null;
  paymentStatus?:       string | null;
  address: string;
  items: OrderItem[];
  profile?: CustomerProfile;
  conversationId?: string | null;
  notes?:          string | null;
  // Saipos POS integration — undefined for demo/mock orders, populated from API
  saiposSentAt?:        string | null;
  saiposOrderId?:       string | null;
  saiposStatus?:        string | null;
  saiposError?:         string | null;
  saiposLastErrorCode?: string | null;
  saiposLastAttemptAt?: string | null;
}

// ─── API response type (from GET /api/orders) ─────────────────

interface ApiOrderItem {
  name:       string;
  price:      string;
  quantity:   number;
  notes?:     string | null;
  variantName?: string | null;
  addonsJson?: {
    options?: { groupName: string; optionName: string; qty: number; priceAdjustment: number }[];
    extras?:  { name: string; unitPrice: number; qty: number }[];
  } | null;
}

interface ApiOrder {
  id: string;
  orderNumber?: number | null;
  status: string;
  type: string;
  subtotal: string;
  deliveryFee: string;
  discount?: string | null;
  total: string;
  notes?: string | null;
  createdAt: string;
  customer: { id?: string; name: string; phone: string; totalOrders: number; totalSpend: string; lastOrderAt: string | null; tier: string };
  deliveryAddress: {
    street: string;
    number: string;
    complement: string | null;
    neighborhood: string;
  } | null;
  items: ApiOrderItem[];
  payment: { method: string; providerName?: string | null; status?: string | null } | null;
  orderDraft?: { conversationId?: string | null } | null;
  // Saipos POS integration
  saiposSentAt:        string | null;
  saiposOrderId:       string | null;
  saiposStatus:        string | null;
  saiposError:         string | null;
  saiposLastErrorCode: string | null;
  saiposLastAttemptAt: string | null;
}

const PAYMENT_LABELS: Record<string, string> = {
  CASH:          "Dinheiro",
  PIX:           "PIX",
  PIX_IN_PERSON: "PIX",
  CREDIT_CARD:   "Cartão Crédito",
  DEBIT_CARD:    "Cartão Débito",
  CARD_MACHINE:  "Cartão Maquininha",
  ONLINE:        "Online",
};

function resolvePaymentLabel(payment: ApiOrder["payment"]): string {
  if (!payment) return "—";
  if (payment.method === "ONLINE" && payment.providerName === "mercadopago") return "Pix (MP)";
  return PAYMENT_LABELS[payment.method] ?? payment.method ?? "—";
}

function apiOrderToMock(o: ApiOrder, index: number): MockOrder {
  const status = o.status as OrderStatus;
  const type = o.type === "DINE_IN" ? "TABLE" : (o.type as MockOrder["type"]);
  return {
    id:         o.id,
    num:        index + 1,
    orderNumber: o.orderNumber ?? null,
    customer:   o.customer.name,
    customerId: o.customer.id ?? undefined,
    phone:      !o.customer.phone || isGuestIdentifier(o.customer.phone) ? "Telefone não informado" : o.customer.phone,
    channel:    "Online",
    total:      parseFloat(o.total),
    subtotal:   parseFloat(o.subtotal),
    deliveryFee: parseFloat(o.deliveryFee) || undefined,
    status,
    type,
    createdAt:  new Date(o.createdAt),
    itemCount:  o.items.length,
    payment:             resolvePaymentLabel(o.payment),
    paymentProviderName: o.payment?.providerName ?? null,
    paymentStatus:       o.payment?.status       ?? null,
    address:
      type === "DELIVERY" && o.deliveryAddress
        ? [
            o.deliveryAddress.street,
            o.deliveryAddress.number,
            o.deliveryAddress.complement,
            o.deliveryAddress.neighborhood,
          ]
            .filter(Boolean)
            .join(", ")
        : "Retirada no local",
    items: o.items.map((item) => {
      const addons: string[] = [];
      if (item.variantName) addons.push(item.variantName);
      for (const opt of item.addonsJson?.options ?? []) {
        const label = opt.qty > 1 ? `${opt.qty}× ${opt.optionName}` : opt.optionName;
        addons.push(opt.priceAdjustment > 0 ? `${label} (+R$ ${(opt.priceAdjustment * opt.qty).toFixed(2)})` : label);
      }
      for (const ext of item.addonsJson?.extras ?? []) {
        addons.push(`${ext.qty > 1 ? `${ext.qty}× ` : ""}${ext.name} (+R$ ${(ext.unitPrice * ext.qty).toFixed(2)})`);
      }
      return {
        name:   item.name,
        qty:    item.quantity,
        price:  parseFloat(item.price),
        note:   item.notes ?? undefined,
        addons: addons.length > 0 ? addons : undefined,
      };
    }),
    profile: {
      totalOrders: o.customer.totalOrders,
      totalSpend:  parseFloat(o.customer.totalSpend),
      lastOrderAt: o.customer.lastOrderAt ?? null,
      tier:        o.customer.tier ?? "BRONZE",
    },
    conversationId: o.orderDraft?.conversationId ?? null,
    notes:               o.notes               ?? null,
    saiposSentAt:        o.saiposSentAt        ?? null,
    saiposOrderId:       o.saiposOrderId       ?? null,
    saiposStatus:        o.saiposStatus        ?? null,
    saiposError:         o.saiposError         ?? null,
    saiposLastErrorCode: o.saiposLastErrorCode ?? null,
    saiposLastAttemptAt: o.saiposLastAttemptAt ?? null,
  };
}

// ─── Constants ────────────────────────────────────────────────

const DELAY_THRESHOLD = 20;


const STATUS_CONFIG: Record<OrderStatus, { label: string; border: string; badge: string }> = {
  PENDING:          { label: "Novo",              border: "border-l-amber-400",  badge: "bg-amber-100 text-amber-800"   },
  AWAITING_PAYMENT: { label: "Aguardando Pix",   border: "border-l-yellow-400", badge: "bg-yellow-100 text-yellow-800" },
  CONFIRMED:        { label: "Confirmado",        border: "border-l-blue-400",   badge: "bg-blue-100 text-blue-800"     },
  PREPARING:        { label: "Preparando",        border: "border-l-orange-400", badge: "bg-orange-100 text-orange-800" },
  READY:            { label: "Pronto",            border: "border-l-teal-400",   badge: "bg-teal-100 text-teal-800"     },
  OUT_FOR_DELIVERY: { label: "Em entrega",        border: "border-l-purple-400", badge: "bg-purple-100 text-purple-800" },
  DELIVERED:        { label: "Entregue",          border: "border-l-green-400",  badge: "bg-green-100 text-green-800"   },
  CANCELLED:        { label: "Cancelado",         border: "border-l-gray-300",   badge: "bg-gray-100 text-gray-500"     },
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
    profile: { totalOrders: 12, totalSpend: 843.00, note: "Sempre pede sem cebola" },
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
    profile: { totalOrders: 1, totalSpend: 45.00 },
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
    profile: { totalOrders: 4, totalSpend: 387.00, note: "Prefere molho à parte" },
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
    profile: { totalOrders: 7, totalSpend: 291.00, note: "Dieta fitness, sem sal" },
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
    profile: { totalOrders: 22, totalSpend: 1480.00, note: "VIP — sempre pede sobremesa" },
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
    profile: { totalOrders: 3, totalSpend: 238.00 },
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
    profile: { totalOrders: 9, totalSpend: 512.00, note: "Intolerante à lactose" },
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
    profile: { totalOrders: 18, totalSpend: 2140.00 },
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
    profile: { totalOrders: 2, totalSpend: 58.00 },
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

function formatCardDateTime(date: Date): string {
  const d = String(date.getDate()).padStart(2, "0");
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const h  = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${d}/${mo} · ${h}:${mi}`;
}

function isDelayed(order: MockOrder): boolean {
  if (TERMINAL.includes(order.status)) return false;
  return minutesSince(order.createdAt) > DELAY_THRESHOLD;
}

function isPaymentPendingOrder(order: MockOrder): boolean {
  if (order.status === "AWAITING_PAYMENT") return true;
  if (
    order.paymentProviderName === "mercadopago" &&
    (order.paymentStatus === "LINK_SENT" || order.paymentStatus === "PENDING")
  ) return true;
  return false;
}

// ─── Customer context helpers ─────────────────────────────────

function customerTierDisplay(tier: string): { label: string; icon: string; color: string } {
  switch (tier) {
    case "DIAMANTE": return { label: "Diamante", icon: "💎", color: "text-cyan-700 bg-cyan-50 border border-cyan-200"      };
    case "OURO":     return { label: "Ouro",     icon: "🥇", color: "text-amber-700 bg-amber-50 border border-amber-200"   };
    case "PRATA":    return { label: "Prata",    icon: "🥈", color: "text-gray-600 bg-gray-100 border border-gray-200"     };
    default:         return { label: "Bronze",   icon: "🥉", color: "text-orange-700 bg-orange-50 border border-orange-200" };
  }
}

function customerTag(totalOrders: number, spend: number): { label: string; color: string } {
  if (totalOrders <= 1) return { label: "Novo",       color: "text-emerald-700 bg-emerald-50" };
  if (spend >= 800)     return { label: "VIP",        color: "text-purple-700 bg-purple-50"   };
  return                       { label: "Recorrente", color: "text-blue-700 bg-blue-50"       };
}

function customerTemperature(lastOrderAt: string | null | undefined): { label: string; color: string } | null {
  if (!lastOrderAt) return null;
  const days = Math.floor((Date.now() - new Date(lastOrderAt).getTime()) / 86_400_000);
  if (days <= 30)  return { label: "Quente", color: "text-orange-700 bg-orange-50" };
  if (days <= 60)  return { label: "Morno",  color: "text-yellow-700 bg-yellow-50" };
  return                  { label: "Frio",   color: "text-sky-700 bg-sky-50"       };
}

function priorityScore(order: MockOrder): number {
  if (isDelayed(order)) return 0;
  const scores: Record<OrderStatus, number> = {
    PENDING: 1, AWAITING_PAYMENT: 0, CONFIRMED: 2, PREPARING: 3, READY: 4,
    OUT_FOR_DELIVERY: 5, DELIVERED: 6, CANCELLED: 7,
  };
  return scores[order.status];
}

function applySort(orders: MockOrder[], sort: SortKey): MockOrder[] {
  const s = [...orders];
  switch (sort) {
    case "recent":
      return s.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    case "oldest":
      return s.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    case "delayed":
      return s.sort((a, b) => {
        const aM = isDelayed(a) ? minutesSince(a.createdAt) : 0;
        const bM = isDelayed(b) ? minutesSince(b.createdAt) : 0;
        return bM - aM;
      });
    case "value_desc":
      return s.sort((a, b) => b.total - a.total);
    case "value_asc":
      return s.sort((a, b) => a.total - b.total);
    case "vip_first":
      return s.sort((a, b) => (b.profile?.totalSpend ?? 0) - (a.profile?.totalSpend ?? 0));
    case "cold_first": {
      const daysSince = (o: MockOrder) => {
        const d = o.profile?.lastOrderAt;
        return d ? Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000) : 0;
      };
      return s.sort((a, b) => daysSince(b) - daysSince(a));
    }
    case "status":
      return s.sort((a, b) => priorityScore(a) - priorityScore(b));
    case "wait":
      return s.sort((a, b) => minutesSince(b.createdAt) - minutesSince(a.createdAt));
    default:
      return s;
  }
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
  onManualOrder,
  onReconcile,
  reconciling,
}: {
  searchQuery: string;
  dateFrom: string;
  dateTo: string;
  onSearchChange: (v: string) => void;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  onClear: () => void;
  onManualOrder?: () => void;
  onReconcile?: () => void;
  reconciling?: boolean;
}) {
  return (
    <div className="shrink-0 border-b border-[#E5E5E5] bg-white px-4 py-2.5">
      <div className="flex flex-wrap gap-2">
        {/* Date inputs */}
        <div className="flex min-w-0 flex-1 gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => onDateFromChange(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => onDateToChange(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200"
          />
        </div>
        {/* Text search */}
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Busque por cliente ou pedido…"
          className="w-full min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700 placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200 sm:w-auto"
        />
        {/* Action buttons */}
        <div className="flex w-full gap-2 sm:w-auto">
          <button className="flex-1 rounded-lg bg-orange-500 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-orange-600 sm:flex-none">
            Filtrar
          </button>
          <button
            onClick={onClear}
            className="flex-1 rounded-lg border border-gray-200 px-4 py-1.5 text-xs font-semibold text-gray-500 transition-colors hover:bg-gray-50 sm:flex-none"
          >
            Limpar
          </button>
          {onManualOrder && (
            <button
              onClick={onManualOrder}
              className="flex-1 rounded-lg border border-blue-300 bg-white px-4 py-1.5 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-50 sm:flex-none"
            >
              + Pedido manual
            </button>
          )}
          {onReconcile && (
            <button
              onClick={onReconcile}
              disabled={reconciling}
              title="Buscar pagamentos Pix aprovados no Mercado Pago e confirmar automaticamente"
              className="flex-1 rounded-lg border border-yellow-300 bg-white px-4 py-1.5 text-xs font-semibold text-yellow-700 transition-colors hover:bg-yellow-50 disabled:opacity-50 sm:flex-none"
            >
              {reconciling ? "Reconciliando…" : "Reconciliar MP"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── StatusRow ────────────────────────────────────────────────

function StatusRow({
  orders,
  statusFilter,
  onFilterChange,
  sortBy,
  onSortChange,
}: {
  orders: MockOrder[];
  statusFilter: StatusFilter;
  onFilterChange: (f: StatusFilter) => void;
  sortBy: SortKey;
  onSortChange: (v: SortKey) => void;
}) {
  const counts = {
    PENDING:   orders.filter((o) => o.status === "PENDING").length,
    PREPARING: orders.filter((o) => o.status === "PREPARING").length,
    READY:     orders.filter((o) => o.status === "READY").length,
    DELAYED:   orders.filter(isDelayed).length,
  };

  const total = orders.length;

  const BTNS: Array<{ id: StatusFilter; label: string; count: number; on: string; off: string }> = [
    { id: null,        label: "Todos",      count: total,            on: "bg-gray-700 text-white",   off: "bg-gray-100 text-gray-600 hover:bg-gray-200"                                    },
    { id: "PENDING",   label: "Novos",      count: counts.PENDING,   on: "bg-amber-500 text-white",  off: "bg-gray-100 text-gray-600 hover:bg-gray-200"                                    },
    { id: "PREPARING", label: "Preparando", count: counts.PREPARING, on: "bg-orange-500 text-white", off: "bg-gray-100 text-gray-600 hover:bg-gray-200"                                    },
    { id: "READY",     label: "Pronto",     count: counts.READY,     on: "bg-teal-600 text-white",   off: "bg-gray-100 text-gray-600 hover:bg-gray-200"                                    },
    { id: "DELAYED",   label: "Atrasados",  count: counts.DELAYED,   on: "bg-red-600 text-white",    off: counts.DELAYED > 0 ? "bg-red-50 text-red-700 hover:bg-red-100" : "bg-gray-100 text-gray-400" },
  ];

  return (
    <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-[#E5E5E5] bg-white px-4 py-2.5 scrollbar-hide">
      {/* Status chips */}
      {BTNS.map((btn) => {
        const isActive = statusFilter === btn.id;
        return (
          <button
            key={String(btn.id)}
            onClick={() => onFilterChange(btn.id)}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              isActive ? btn.on : btn.off
            }`}
          >
            {btn.label}
            <span className={`rounded-full px-1.5 py-0.5 text-xs font-bold leading-none ${
              isActive ? "bg-white/25 text-inherit" : "bg-white/80 text-gray-500"
            }`}>
              {btn.count}
            </span>
          </button>
        );
      })}

      {/* Sort control — right-aligned, visually next to status chips */}
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Ordenar</span>
        <select
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value as SortKey)}
          className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
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
    <div className="hidden shrink-0 items-center gap-6 border-b border-[#E5E5E5] bg-white px-4 py-2.5 sm:flex">
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
  onManualConfirm,
  onVerifyPix,
  verifyingPix,
}: {
  order: MockOrder;
  active: boolean;
  checked: boolean;
  onClick: () => void;
  onAction: (id: string, next: OrderStatus) => void;
  onCancel: (id: string) => void;
  onCheck: (id: string, v: boolean) => void;
  onManualConfirm?: (id: string) => void;
  onVerifyPix?: (id: string) => void;
  verifyingPix?: boolean;
}) {
  const delayed         = isDelayed(order);
  const isPaymentPending = isPaymentPendingOrder(order);
  const cfg             = STATUS_CONFIG[order.status];
  const nextAction      = NEXT_ACTION[order.status];
  const isTerminal      = TERMINAL.includes(order.status);
  const border          = delayed ? "border-l-red-500" : cfg.border;
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
      <div className="p-3">
        {/* Row 1: checkbox + num (prominent) + badge + elapsed */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => { e.stopPropagation(); onCheck(order.id, e.target.checked); }}
            onClick={(e) => e.stopPropagation()}
            className="h-3.5 w-3.5 shrink-0 accent-orange-500"
          />
          <span className="font-mono text-sm font-bold text-gray-700">
            {formatOrderNumber(order.orderNumber, order.id)}
          </span>
          {badge}
          <span className={`ml-auto text-xs font-semibold tabular-nums ${delayed ? "text-red-600" : "text-gray-400"}`}>
            {formatCardDateTime(order.createdAt)}
          </span>
        </div>

        {/* Row 2: customer name + inline tags + total */}
        <div className="mt-1.5 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1">
              {order.customerId ? (
                <a href={`/customers/${order.customerId}`} target="_blank" rel="noopener noreferrer" className="text-base font-bold text-gray-900 leading-tight hover:underline" title="Abrir cadastro do cliente">{order.customer}</a>
              ) : (
                <span className="text-base font-bold text-gray-900 leading-tight">{order.customer}</span>
              )}
              {order.profile && (() => {
                const { totalOrders, totalSpend, lastOrderAt, tier: storedTier } = order.profile!;
                const tier = customerTierDisplay(storedTier ?? "BRONZE");
                const tag  = customerTag(totalOrders, totalSpend);
                const temp = customerTemperature(lastOrderAt);
                return (
                  <>
                    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${tier.color}`}>
                      {tier.icon} {tier.label}
                    </span>
                    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${tag.color}`}>
                      {tag.label}
                    </span>
                    {temp && (
                      <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${temp.color}`}>
                        {temp.label}
                      </span>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
          <span className="shrink-0 text-xs font-semibold text-gray-500">{fmtCurrency(order.total)}</span>
        </div>

        {/* Row 3: meta */}
        <p className="mt-0.5 text-xs text-gray-400">
          {order.itemCount} {order.itemCount === 1 ? "item" : "itens"}
          {" · "}
          {order.type === "DELIVERY" ? "Delivery" : order.type === "TABLE" ? "Mesa" : "Retirada"}
          {" · "}
          {order.payment}
        </p>

        {/* Row 3.5: spend context + note (tags moved inline to Row 2) */}
        {order.profile && (() => {
          const { totalOrders, totalSpend, note } = order.profile!;
          return (
            <>
              <p className="mt-0.5 text-[10px] text-gray-400">
                {totalOrders === 1 ? "1 pedido" : `${totalOrders} pedidos`}
                {" · "}
                {totalSpend.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} gasto
              </p>
              {note && (
                <p className="mt-1 text-[10px] text-gray-500 leading-tight">
                  📝 {note}
                </p>
              )}
            </>
          );
        })()}

        {/* Saipos badge — compact, shown only when relevant */}
        {(() => {
          const sent = Boolean(order.saiposSentAt);
          const st   = order.saiposStatus;
          if (!st && !sent) return null;
          if (sent) return (
            <span className="mt-1 inline-block rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
              Saipos: Enviado ✅
            </span>
          );
          if (st === "AUTH_BLOCKED_403" || st === "FAILED" || st === "ORDER_SEND_FAILED") return (
            <span className="mt-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
              Saipos: Falha na integração ⚠️
            </span>
          );
          if (st === "PENDING_SAIPOS_VALIDATION") return (
            <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              Saipos: Aguardando envio
            </span>
          );
          return null;
        })()}

        {/* Row 4: actions */}
        <div className="mt-2 flex gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
          {isPaymentPending && (
            <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-semibold text-yellow-800">
              ⏳ Aguardando Pix
            </span>
          )}
          {isPaymentPending && onManualConfirm && (
            <button
              onClick={() => onManualConfirm(order.id)}
              className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50 transition-colors"
            >
              Confirmar pagamento
            </button>
          )}
          {isPaymentPending && order.paymentProviderName === "mercadopago" && onVerifyPix && (
            <button
              onClick={() => onVerifyPix(order.id)}
              disabled={verifyingPix}
              className="rounded-lg border border-blue-300 bg-white px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 transition-colors disabled:opacity-50"
            >
              {verifyingPix ? "Verificando…" : "Verificar Pix"}
            </button>
          )}
          {!isTerminal && !isPaymentPending && nextAction && (
            <button
              onClick={() => onAction(order.id, nextAction.next)}
              className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-orange-600"
            >
              {nextAction.label}
            </button>
          )}
          {!isTerminal && !isPaymentPending && (
            <button
              onClick={() => onCancel(order.id)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 transition-colors hover:bg-gray-50"
            >
              Cancelar
            </button>
          )}
          {!isPaymentPending && (
            <button
              onClick={(e) => { e.stopPropagation(); printOrder(order.id); }}
              className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-50"
            >
              🖨️ Imprimir
            </button>
          )}
          {order.conversationId && (
            <a
              href={`/atendimento?conv=${order.conversationId}`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-50"
            >
              💬 Abrir conversa
            </a>
          )}
        </div>
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
  onManualConfirm,
  onVerifyPix,
  verifyingPixIds,
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
  onManualConfirm?: (id: string) => void;
  onVerifyPix?: (id: string) => void;
  verifyingPixIds?: Set<string>;
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
              onManualConfirm={onManualConfirm}
              onVerifyPix={onVerifyPix}
              verifyingPix={verifyingPixIds?.has(order.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── StatusTimeline ───────────────────────────────────────────

const FLOW_ALL: Array<{ status: OrderStatus; label: string }> = [
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

// ─── SaiposSection ────────────────────────────────────────────

function SaiposSection({
  order,
  managerIntegrationDisplayName = MANAGER_INTEGRATION_DISPLAY_NAME,
}: {
  order: MockOrder;
  managerIntegrationDisplayName?: string;
}) {
  const saiposStatus        = order.saiposStatus        ?? null;
  const saiposSentAt        = order.saiposSentAt        ?? null;
  const saiposError         = order.saiposError         ?? null;
  const saiposLastErrorCode = order.saiposLastErrorCode ?? null;
  const saiposLastAttemptAt = order.saiposLastAttemptAt ?? null;
  const saiposOrderId       = order.saiposOrderId       ?? null;

  const hasSaiposData = saiposStatus || saiposSentAt || saiposLastAttemptAt;
  if (!hasSaiposData) return null;

  const n = managerIntegrationDisplayName;

  const is403  = saiposStatus === "AUTH_BLOCKED_403";
  const is902  = saiposStatus === "PENDING_SAIPOS_VALIDATION";
  const isFailed = saiposStatus === "FAILED" || saiposStatus === "ORDER_SEND_FAILED";

  const statusBanner = (() => {
    if (saiposSentAt)
      return { label: `${n}: Enviado ✅`, color: "text-green-700", bg: "bg-green-50 border-green-100" };
    if (is403)
      return {
        label: `${n}: Falha na integração ⚠️`,
        detail: "HTTP 403 — acesso negado pela Saipos. A integração ainda não está autorizada no endpoint v2.5.",
        color: "text-red-800", bg: "bg-red-50 border-red-200",
      };
    if (is902)
      return {
        label: `${n}: Falha na integração ⚠️`,
        detail: "Erro 902 — credenciais aguardando validação pela Saipos.",
        color: "text-amber-800", bg: "bg-amber-50 border-amber-200",
      };
    if (isFailed)
      return { label: `${n}: Falha na integração ⚠️`, color: "text-red-700", bg: "bg-red-50 border-red-100" };
    return { label: `${n}: Aguardando envio`, color: "text-gray-500", bg: "bg-gray-50 border-gray-100" };
  })();

  return (
    <div className="border-t border-dashed border-gray-200 pt-4">
      <SectionLabel>Sistema de gestão</SectionLabel>

      {/* Status banner */}
      <div className={`mb-3 rounded-lg border px-3 py-2 text-xs font-medium ${statusBanner.bg} ${statusBanner.color}`}>
        <p>{statusBanner.label}</p>
        {"detail" in statusBanner && statusBanner.detail && (
          <p className="mt-0.5 font-normal opacity-80">{statusBanner.detail}</p>
        )}
      </div>

      {/* Diagnostic rows */}
      <div className="space-y-1.5">
        {saiposStatus && (
          <Row label={`Status ${n}`} value={
            saiposStatus === "AUTH_BLOCKED_403"            ? "Falha na integração (HTTP 403)"
            : saiposStatus === "PENDING_SAIPOS_VALIDATION" ? "Falha na integração (erro 902)"
            : saiposStatus === "SENT"                      ? "Enviado"
            : saiposStatus
          } />
        )}
        {saiposLastAttemptAt && (
          <Row label="Última tentativa" value={new Date(saiposLastAttemptAt).toLocaleString("pt-BR")} />
        )}
        {saiposLastErrorCode && (
          <Row label="Código do erro" value={saiposLastErrorCode} />
        )}
        {saiposError && (
          <Row label="Último erro" value={<span className="max-w-[180px] break-words text-right text-red-600">{saiposError}</span>} />
        )}
        {saiposSentAt && (
          <Row label="Enviado em" value={new Date(saiposSentAt).toLocaleString("pt-BR")} />
        )}
        {saiposOrderId && (
          <Row label={`ID externo ${n}`} value={saiposOrderId} />
        )}
      </div>

      {/* Retry via API */}
      {!saiposSentAt && (
        <div className="mt-3">
          <SaiposRetryButton
            orderId={order.id}
            saiposSentAt={saiposSentAt}
            saiposStatus={saiposStatus}
          />
        </div>
      )}
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
  isOwner,
  onDelete,
}: {
  order:     MockOrder | null;
  onClose:   () => void;
  isOwner?:  boolean;
  onDelete?: (id: string) => void;
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
    // Mobile: fixed full-screen overlay (z-30)
    // Desktop: static side panel (lg:relative, lg:w-[380px])
    <div className="fixed inset-0 z-30 flex flex-col bg-white lg:relative lg:inset-auto lg:z-auto lg:w-[380px] lg:shrink-0 lg:border-l lg:border-[#E5E5E5]">

      {/* Mobile back button row */}
      <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3 lg:hidden">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 rounded-lg py-1 pr-2 text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          ← Voltar
        </button>
        <span className="font-mono text-xs text-gray-400">
          Pedido {formatOrderNumber(order.orderNumber, order.id)}
        </span>
        <button
          onClick={() => printOrder(order.id)}
          className="ml-auto flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
        >
          🖨️ Imprimir
        </button>
      </div>

      {/* Desktop header */}
      <div className="hidden items-start justify-between border-b border-gray-100 px-5 py-4 lg:flex">
        <div>
          <p className="font-mono text-xs text-gray-400">
            Pedido {formatOrderNumber(order.orderNumber, order.id)}
          </p>
          <h3 className="mt-0.5 text-base font-bold text-gray-900">
            {order.customerId ? (
              <a href={`/customers/${order.customerId}`} target="_blank" rel="noopener noreferrer" className="hover:underline" title="Abrir cadastro do cliente">{order.customer}</a>
            ) : order.customer}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => printOrder(order.id)}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-50"
          >
            🖨️ Imprimir comanda
          </button>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
      </div>

      {/* Customer name — mobile only (since desktop header above has it) */}
      <div className="border-b border-gray-100 px-4 py-2 lg:hidden">
        <h3 className="text-base font-bold text-gray-900">
          {order.customerId ? (
            <a href={`/customers/${order.customerId}`} target="_blank" rel="noopener noreferrer" className="hover:underline" title="Abrir cadastro do cliente">{order.customer}</a>
          ) : order.customer}
        </h3>
      </div>

      {/* Status timeline */}
      <div className="border-b border-[#E5E5E5] px-4 py-3 lg:px-5">
        <StatusTimeline order={order} />
      </div>

      {/* Scrollable body */}
      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4 lg:px-5">

        {/* 1. Cliente */}
        <div>
          <SectionLabel>Cliente</SectionLabel>
          <div className="space-y-1.5">
            <Row label="Telefone" value={order.phone} />
            {order.email && <Row label="E-mail" value={order.email} />}
            {order.conversationId && (
              <a
                href={`/atendimento?conv=${order.conversationId}`}
                className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50"
              >
                💬 Abrir conversa no Chat
              </a>
            )}
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

        {/* 7. Integração Saipos */}
        <SaiposSection order={order} />

        {/* 8. Zona de Perigo */}
        {isOwner && onDelete && (
          <div className="border-t border-dashed border-red-200 pt-4">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-red-400">
              Zona de Perigo
            </p>
            <button
              type="button"
              onClick={() => onDelete(order.id)}
              className="w-full rounded-lg border border-red-200 bg-white px-3 py-2.5 text-xs font-semibold text-red-700 hover:bg-red-50 transition-colors"
            >
              Apagar pedido permanentemente
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Direct print via hidden iframe ──────────────────────────
// Opens the print route in an off-screen iframe and calls contentWindow.print().
// Falls back to a new tab with ?autoprint=1 on any iframe error.

function printOrder(orderId: string): void {
  const iframe = document.createElement("iframe");
  iframe.style.cssText =
    "position:fixed;width:0;height:0;top:-9999px;left:-9999px;border:none;opacity:0;pointer-events:none;";
  iframe.src = `/orders/${orderId}/imprimir?printOnly=1`;
  document.body.appendChild(iframe);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    setTimeout(() => {
      if (document.body.contains(iframe)) document.body.removeChild(iframe);
    }, 500);
  };

  iframe.addEventListener("load", () => {
    try {
      iframe.contentWindow?.print();
      iframe.contentWindow?.addEventListener("afterprint", cleanup, { once: true });
    } catch {
      window.open(`/orders/${orderId}/imprimir?autoprint=1`, "_blank");
      cleanup();
    }
    setTimeout(cleanup, 15_000);
  }, { once: true });

  iframe.addEventListener("error", () => {
    window.open(`/orders/${orderId}/imprimir?autoprint=1`, "_blank");
    cleanup();
  }, { once: true });
}

// ─── NewOrderModal ────────────────────────────────────────────

function NewOrderModal({
  order,
  queueLength,
  onAccept,
  onReject,
  accepting,
  rejecting,
  audioBlocked,
  onUnlockAudio,
}: {
  order: MockOrder;
  queueLength: number;
  onAccept: () => void;
  onReject: (reason?: string) => void;
  accepting: boolean;
  rejecting: boolean;
  audioBlocked: boolean;
  onUnlockAudio: () => void;
}) {
  const [confirmReject, setConfirmReject] = useState(false);
  const [rejectReason,  setRejectReason]  = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm">
      <div className="relative mx-4 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">

        {/* Header */}
        <div className="bg-orange-500 px-6 py-4 text-white">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="h-3 w-3 animate-pulse rounded-full bg-white shrink-0" />
              <span className="text-xl font-bold tracking-wide">NOVO PEDIDO!</span>
            </div>
            {audioBlocked && (
              <button
                type="button"
                onClick={onUnlockAudio}
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white/20 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-white/30 transition-colors animate-pulse"
              >
                🔇 Ativar som
              </button>
            )}
          </div>
          {queueLength > 1 ? (
            <p className="mt-0.5 text-sm text-orange-100">
              Há {queueLength} pedidos aguardando aceite — mostrando 1 de {queueLength}.
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-orange-100">
              Um novo pedido aguarda sua confirmação
            </p>
          )}
        </div>

        {/* Order details */}
        <div className="max-h-[55vh] overflow-y-auto px-6 py-4 space-y-4">

          {/* Customer + number + total */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-xs text-gray-400">
                Pedido {formatOrderNumber(order.orderNumber, order.id)}
              </p>
              <h3 className="mt-0.5 text-xl font-bold text-gray-900 leading-tight">
                {order.customerId ? (
                  <a href={`/customers/${order.customerId}`} target="_blank" rel="noopener noreferrer" className="hover:underline" title="Abrir cadastro do cliente">{order.customer}</a>
                ) : order.customer}
              </h3>
              <p className="text-sm text-gray-500">{order.phone}</p>
            </div>
            <span className="shrink-0 text-2xl font-bold text-gray-900">
              {fmtCurrency(order.total)}
            </span>
          </div>

          {/* Type + payment chips */}
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
              {order.type === "DELIVERY" ? "🛵 Delivery" : order.type === "TABLE" ? "🍽️ Mesa" : "🏃 Retirada"}
            </span>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
              💳 {order.payment}
            </span>
          </div>

          {/* Address (delivery only) */}
          {order.type === "DELIVERY" && (
            <div className="rounded-lg bg-gray-50 px-3 py-2.5">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                Endereço
              </p>
              <p className="text-sm text-gray-800 leading-snug">{order.address}</p>
            </div>
          )}

          {/* Items */}
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">Itens</p>
            <div className="space-y-1.5">
              {order.items.map((item, i) => (
                <div key={i} className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="text-gray-800">
                    <span className="font-semibold text-gray-500">{item.qty}×</span>{" "}
                    {item.name}
                    {item.note && (
                      <span className="ml-1 italic text-xs text-gray-400">({item.note})</span>
                    )}
                  </span>
                  <span className="shrink-0 font-medium text-gray-700">
                    {fmtCurrency(item.price * item.qty)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="border-t border-gray-100 pt-3 space-y-1.5">
            {order.type === "DELIVERY" && order.deliveryFee != null && (
              <div className="flex justify-between text-sm text-gray-500">
                <span>Taxa de entrega</span>
                <span>{fmtCurrency(order.deliveryFee)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-gray-900">
              <span>Total</span>
              <span>{fmtCurrency(order.total)}</span>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="border-t border-gray-100 px-6 py-4">
          {!confirmReject ? (
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmReject(true)}
                disabled={accepting || rejecting}
                className="flex-1 rounded-xl border-2 border-gray-200 px-4 py-3 text-sm font-bold text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-40"
              >
                Recusar pedido
              </button>
              <button
                onClick={onAccept}
                disabled={accepting || rejecting}
                className="flex-1 rounded-xl bg-orange-500 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-orange-600 disabled:opacity-40"
              >
                {accepting ? "Aceitando…" : "✓ Aceitar pedido"}
              </button>
            </div>
          ) : (
            <div>
              <p className="mb-2 text-center text-sm font-semibold text-gray-800">
                Confirmar recusa deste pedido?
              </p>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Motivo do cancelamento (opcional — será enviado ao cliente)"
                rows={2}
                disabled={rejecting}
                className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-100 disabled:opacity-50"
              />
              <div className="mt-3 flex gap-3">
                <button
                  onClick={() => { setConfirmReject(false); setRejectReason(""); }}
                  disabled={rejecting}
                  className="flex-1 rounded-xl border-2 border-gray-200 px-4 py-3 text-sm font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                >
                  Voltar
                </button>
                <button
                  onClick={() => onReject(rejectReason.trim() || undefined)}
                  disabled={rejecting}
                  className="flex-1 rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-40"
                >
                  {rejecting ? "Recusando…" : "Confirmar recusa"}
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────

export default function OrdersClient({ isOwner, isManagerOrOwner }: { isOwner?: boolean; isManagerOrOwner?: boolean } = {}) {
  const [orders,       setOrders]       = useState<MockOrder[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(null);
  const [selectedId,   setSelectedId]   = useState<string | null>(null);
  const [checkedIds,   setCheckedIds]   = useState<Set<string>>(new Set());
  const [searchQuery,  setSearchQuery]  = useState("");
  const [dateFrom,     setDateFrom]     = useState("");
  const [dateTo,       setDateTo]       = useState("");
  const [sortBy,       setSortBy]       = useState<SortKey>("recent");
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    const saved = localStorage.getItem(SOUND_PREF_KEY);
    return saved === null ? true : saved === "true";
  });
  const [audioBlocked, setAudioBlocked] = useState(false);
  const alertAudioRef = useRef<HTMLAudioElement | null>(null);
  const knownIds = useRef<Set<string>>(new Set());
  const hasFetched = useRef(false);
  const [cancelDialog, setCancelDialog] = useState<{ id: string; reason: string } | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{ id: string } | null>(null);
  const [deleting,     setDeleting]     = useState(false);
  const [deleteError,  setDeleteError]  = useState<string | null>(null);
  const [modalQueue,     setModalQueue]     = useState<MockOrder[]>([]);
  const [modalAccepting, setModalAccepting] = useState(false);
  const [modalRejecting, setModalRejecting] = useState(false);
  const shownInModal = useRef<Set<string>>(new Set());
  const [autoPrintOnAccept, setAutoPrintOnAccept] = useState(() => {
    if (typeof window === "undefined") return true;
    const saved = localStorage.getItem("foocci_autoprint_on_accept");
    return saved === null ? true : saved === "true";
  });
  // Tracks order IDs that triggered auto-print this session — prevents double-print on re-render.
  const autoPrintGuard = useRef(createAutoPrintGuard());
  const [printToast, setPrintToast] = useState<string | null>(null);

  // Manual payment confirm dialog — enriched with order context for staff review
  const [manualConfirmDialog, setManualConfirmDialog] = useState<{
    id:           string;
    total:        number;
    customer:     string;
    phone:        string;
    paymentLabel: string;
    status:       string;
    createdAt:    Date;
  } | null>(null);
  const [manualConfirmChecked, setManualConfirmChecked] = useState(false);
  const [manualConfirmReason,  setManualConfirmReason]  = useState("");
  const [manualConfirming,     setManualConfirming]     = useState(false);
  const [manualConfirmError,   setManualConfirmError]   = useState<string | null>(null);

  // Manual order creation dialog
  const [manualOrderOpen, setManualOrderOpen] = useState(false);

  // MP reconciliation
  const [reconciling,    setReconciling]    = useState(false);
  const [reconcileToast, setReconcileToast] = useState<string | null>(null);

  const modalOrder = modalQueue[0] ?? null;
  const modalOrderId = modalOrder?.id ?? null;

  // Initialise the WAV audio element once on mount
  useEffect(() => {
    const audio = new Audio(ALERT_WAV);
    audio.preload = "auto";
    audio.volume  = 1.0;
    alertAudioRef.current = audio;
    return () => { audio.pause(); audio.src = ""; };
  }, []);

  // Track pending count via ref so the alert effect can log it without adding orders to deps
  const pendingCountRef = useRef(0);

  // Whether there is at least one order waiting for acceptance
  const hasPendingOrders = useMemo(() => {
    const count = orders.filter((o) => o.status === "PENDING").length;
    pendingCountRef.current = count;
    return count > 0;
  }, [orders]);

  // Loop alert every 5 s while modal is open OR there are pending orders.
  // Deps include both so the interval restarts each time a new modal order appears.
  // Cleanup pauses audio immediately when the condition becomes false (accepted/rejected).
  useEffect(() => {
    const active = hasPendingOrders || !!modalOrderId;
    if (!active || !soundEnabled) return;

    if (process.env.NODE_ENV !== "production") {
      console.debug("[order-alert-loop]", {
        hasPendingOrders,
        soundEnabled,
        modalOrderId,
        intervalActive: true,
        audioPath: ALERT_WAV,
      });
    }

    const doPlay = () => {
      const audio = alertAudioRef.current;
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = 1.0;
        audio.play().catch((err: unknown) => {
          if (err instanceof DOMException && err.name === "NotAllowedError") {
            setAudioBlocked(true);
          } else {
            console.warn("[order-alert] audio play failed", err);
            playBeep();
          }
        });
      } else {
        playBeep();
      }
    };

    doPlay();
    const id = setInterval(doPlay, 5_000);
    return () => {
      clearInterval(id);
      const audio = alertAudioRef.current;
      if (audio) { audio.pause(); audio.currentTime = 0; }
    };
  }, [hasPendingOrders, modalOrderId, soundEnabled]);

  function toggleSound() {
    setSoundEnabled((prev) => {
      const next = !prev;
      localStorage.setItem(SOUND_PREF_KEY, String(next));
      return next;
    });
  }

  // Called when operator clicks "Ativar som de pedidos" after browser blocks autoplay
  function unlockAudio() {
    setAudioBlocked(false);
    localStorage.setItem(SOUND_PREF_KEY, "true");
    const audio = alertAudioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = 1.0;
      audio.play().catch(() => playBeep());
    } else {
      playBeep();
    }
  }

  const fetchOrders = useCallback(() => {
    fetch("/api/orders?limit=100")
      .then((r) => r.json())
      .then((res: { success: boolean; data?: { data: ApiOrder[] } }) => {
        if (res.success && Array.isArray(res.data?.data)) {
          const incoming = res.data.data.map(apiOrderToMock);

          // Immediate alert on new order arrival (interval handles repeat)
          if (hasFetched.current) {
            const newOnes = incoming.filter((o) => !knownIds.current.has(o.id));
            // No sound for AWAITING_PAYMENT — payment not confirmed, not yet operational.
            const actionableNew = newOnes.filter((o) => !isPaymentPendingOrder(o));
            if (actionableNew.length > 0 && soundEnabled) {
              const audio = alertAudioRef.current;
              if (audio) {
                audio.pause();
                audio.currentTime = 0;
                audio.volume = 1.0;
                audio.play().catch((err: unknown) => {
                  if (err instanceof DOMException && err.name === "NotAllowedError") {
                    setAudioBlocked(true);
                  } else {
                    playBeep();
                  }
                });
              } else {
                playBeep();
              }
            }
            const newPending = newOnes.filter(
              (o) =>
                (o.status === "PENDING" || o.status === "CONFIRMED") &&
                !shownInModal.current.has(o.id)
            );
            if (newPending.length > 0) {
              newPending.forEach((o) => shownInModal.current.add(o.id));
              setModalQueue((prev) => [...prev, ...newPending]);
            }
          }
          hasFetched.current = true;
          incoming.forEach((o) => knownIds.current.add(o.id));

          setOrders(incoming);
        }
      })
      .catch((err) => console.error("[OrdersClient] fetch failed", err));
  }, [soundEnabled]);

  // Initial load
  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Poll every 30 seconds
  useEffect(() => {
    const id = setInterval(fetchOrders, 30_000);
    return () => clearInterval(id);
  }, [fetchOrders]);

  const filtered  = useMemo(
    () => applySort(orders, sortBy),
    [orders, sortBy]
  );
  const displayed = useMemo(() => {
    let result = filtered;
    if (statusFilter === "DELAYED") result = result.filter(isDelayed);
    else if (statusFilter) result = result.filter((o) => o.status === statusFilter);
    if (searchQuery.trim()) {
      const q       = searchQuery.toLowerCase();
      const qDigits = q.replace(/\D/g, ""); // "#001" / "001" / "1" → "001"/"1"
      result = result.filter((o) => {
        if (o.customer.toLowerCase().includes(q)) return true;
        if (o.id.slice(-6).toLowerCase().includes(q)) return true;
        if (o.orderNumber != null && qDigits) {
          const num = String(o.orderNumber);
          // match raw ("42"), zero-padded ("042"/"001"), or substring
          if (num.includes(qDigits) || String(o.orderNumber).padStart(3, "0").includes(qDigits)) return true;
        }
        return false;
      });
    }
    return result;
  }, [filtered, statusFilter, searchQuery]);
  const selectedOrder = orders.find((o) => o.id === selectedId) ?? null;

  async function persistStatus(id: string, status: OrderStatus, cancelReason?: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, ...(cancelReason ? { cancelReason } : {}) }),
      });
      return res.ok;
    } catch (err) {
      console.error("[OrdersClient] status persist failed", err);
      return false;
    }
  }

  function triggerAutoPrint(orderId: string) {
    if (!autoPrintGuard.current.claim(orderId)) return;
    printOrder(orderId);
    setPrintToast("Impressão enviada ✓");
    setTimeout(() => setPrintToast(null), 3000);
  }

  async function handleAction(id: string, next: OrderStatus) {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: next } : o)));
    const ok = await persistStatus(id, next);
    if (ok && autoPrintOnAccept && next === "CONFIRMED") {
      triggerAutoPrint(id);
    }
  }

  function handleCancel(id: string) {
    setCancelDialog({ id, reason: "" });
  }

  function executeCancelWithReason(id: string, reason?: string) {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: "CANCELLED" as OrderStatus } : o)));
    if (selectedId === id) setSelectedId(null);
    void persistStatus(id, "CANCELLED", reason || undefined);
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
    const ids = [...checkedIds].filter((id) => orders.find((o) => o.id === id)?.status === "PENDING");
    setOrders((prev) =>
      prev.map((o) => checkedIds.has(o.id) && o.status === "PENDING" ? { ...o, status: "CONFIRMED" as OrderStatus } : o)
    );
    setCheckedIds(new Set());
    ids.forEach((id) => void persistStatus(id, "CONFIRMED"));
  }

  function handleBulkDispatch() {
    const ids = [...checkedIds].filter((id) => orders.find((o) => o.id === id)?.status === "READY");
    setOrders((prev) =>
      prev.map((o) => checkedIds.has(o.id) && o.status === "READY" ? { ...o, status: "OUT_FOR_DELIVERY" as OrderStatus } : o)
    );
    setCheckedIds(new Set());
    ids.forEach((id) => void persistStatus(id, "OUT_FOR_DELIVERY"));
  }

  function handleDeleteOrder(id: string) {
    setDeleteDialog({ id });
    setDeleteError(null);
  }

  async function handleConfirmDelete(id: string) {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res  = await fetch(`/api/orders/${id}`, { method: "DELETE" });
      const json = await res.json() as { success: boolean; error?: string };
      if (json.success) {
        setOrders((prev) => prev.filter((o) => o.id !== id));
        if (selectedId === id) setSelectedId(null);
        setDeleteDialog(null);
      } else {
        setDeleteError(json.error ?? "Erro ao apagar pedido.");
      }
    } catch {
      setDeleteError("Falha de rede ao apagar pedido.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleModalAccept() {
    if (!modalOrder || modalAccepting) return;
    setModalAccepting(true);
    try {
      const nextStatus = NEXT_ACTION[modalOrder.status]?.next ?? "CONFIRMED";
      await persistStatus(modalOrder.id, nextStatus);
      setOrders((prev) =>
        prev.map((o) => (o.id === modalOrder.id ? { ...o, status: nextStatus } : o))
      );
      if (autoPrintOnAccept) triggerAutoPrint(modalOrder.id);
      setModalQueue((prev) => prev.slice(1));
    } finally {
      setModalAccepting(false);
    }
  }

  async function handleModalReject(reason?: string) {
    if (!modalOrder || modalRejecting) return;
    setModalRejecting(true);
    try {
      await persistStatus(modalOrder.id, "CANCELLED", reason || undefined);
      setOrders((prev) =>
        prev.map((o) => (o.id === modalOrder.id ? { ...o, status: "CANCELLED" as OrderStatus } : o))
      );
      if (selectedId === modalOrder.id) setSelectedId(null);
      setModalQueue((prev) => prev.slice(1));
    } finally {
      setModalRejecting(false);
    }
  }

  function handleOpenManualConfirm(id: string) {
    const order = orders.find((o) => o.id === id);
    if (!order) return;
    setManualConfirmDialog({
      id,
      total:        order.total,
      customer:     order.customer,
      phone:        order.phone,
      paymentLabel: order.payment,
      status:       order.status,
      createdAt:    order.createdAt,
    });
    setManualConfirmChecked(false);
    setManualConfirmReason("");
    setManualConfirmError(null);
  }

  async function handleConfirmManualPayment() {
    if (!manualConfirmDialog || !manualConfirmChecked || !manualConfirmReason.trim()) return;
    setManualConfirming(true);
    setManualConfirmError(null);
    try {
      const res  = await fetch(`/api/orders/${manualConfirmDialog.id}/confirm-manual-payment`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ reason: manualConfirmReason.trim() }),
      });
      const json = await res.json() as { success?: boolean; error?: string };
      if (json.success) {
        setOrders((prev) =>
          prev.map((o) => o.id === manualConfirmDialog.id ? { ...o, status: "CONFIRMED" as OrderStatus, paymentStatus: "PAID" } : o)
        );
        setManualConfirmDialog(null);
      } else {
        setManualConfirmError(json.error ?? "Erro ao confirmar");
      }
    } catch {
      setManualConfirmError("Falha de rede");
    } finally {
      setManualConfirming(false);
    }
  }

  function handleOpenManualOrder() {
    setManualOrderOpen(true);
  }

  async function handleReconcile() {
    setReconciling(true);
    setReconcileToast(null);
    try {
      const res  = await fetch("/api/payments/mercadopago/reconcile", { method: "POST" });
      const json = await res.json() as { success?: boolean; result?: { confirmed: number; pending: number; expired: number; failed: number }; error?: string };
      if (json.success && json.result) {
        const { confirmed, pending } = json.result;
        setReconcileToast(
          confirmed > 0
            ? `✅ ${confirmed} pedido${confirmed > 1 ? "s" : ""} confirmado${confirmed > 1 ? "s" : ""} automaticamente.`
            : pending > 0
            ? `Nenhum pagamento novo confirmado — ${pending} ainda aguardando.`
            : "Nenhum pedido pendente encontrado."
        );
        if (confirmed > 0) fetchOrders();
        setTimeout(() => setReconcileToast(null), 6000);
      } else {
        setReconcileToast(json.error ?? "Erro ao reconciliar. Verifique a integração Mercado Pago.");
        setTimeout(() => setReconcileToast(null), 8000);
      }
    } catch {
      setReconcileToast("Falha de rede ao reconciliar.");
      setTimeout(() => setReconcileToast(null), 8000);
    } finally {
      setReconciling(false);
    }
  }

  const [verifyingPixIds, setVerifyingPixIds] = useState<Set<string>>(new Set());

  async function handleVerifyPix(orderId: string) {
    setVerifyingPixIds((prev) => new Set(prev).add(orderId));
    setReconcileToast(null);
    try {
      const res  = await fetch("/api/payments/mercadopago/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const json = await res.json() as { success?: boolean; result?: { confirmed: number; alreadyPaid: number; pending: number }; error?: string };
      if (json.success && json.result) {
        const { confirmed, alreadyPaid, pending } = json.result;
        if (confirmed > 0) {
          setOrders((prev) =>
            prev.map((o) =>
              o.id === orderId
                ? {
                    ...o,
                    paymentStatus: "PAID",
                    status: (["PENDING", "AWAITING_PAYMENT"] as OrderStatus[]).includes(o.status)
                      ? "CONFIRMED"
                      : o.status,
                  }
                : o
            )
          );
          setReconcileToast("✅ Pagamento Pix confirmado automaticamente.");
        } else if (alreadyPaid > 0) {
          setReconcileToast("Pagamento já estava confirmado.");
        } else if (pending > 0) {
          setReconcileToast("Pix ainda não pago no Mercado Pago.");
        } else {
          setReconcileToast("Nenhum pagamento encontrado para este pedido.");
        }
      } else {
        setReconcileToast(json.error ?? "Erro ao verificar Pix.");
      }
    } catch {
      setReconcileToast("Falha de rede ao verificar Pix.");
    } finally {
      setVerifyingPixIds((prev) => { const s = new Set(prev); s.delete(orderId); return s; });
      setTimeout(() => setReconcileToast(null), 6000);
    }
  }

  return (
    <div className="flex flex-col bg-[#F5F5F5]" style={{ height: "calc(100vh - 56px)" }}>

      <PerformanceBar orders={orders} />

      {/* ── Alert toggles ── */}
      <div className="flex flex-wrap items-center justify-end gap-2 px-4 pt-2">
        {/* Active alert banner */}
        {hasPendingOrders && soundEnabled && !audioBlocked && (
          <span className="flex items-center gap-1.5 rounded-lg bg-orange-100 px-3 py-1.5 text-xs font-semibold text-orange-700 animate-pulse">
            🔊 Novo pedido aguardando aceite
          </span>
        )}
        {/* Unlock button — shown when browser blocked autoplay */}
        {audioBlocked && (
          <button
            type="button"
            onClick={unlockAudio}
            title="Clique para desbloquear áudio neste dispositivo. Configurações completas em Configurações → Sons e alertas."
            className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 transition-colors"
          >
            🔇 Desbloquear áudio
          </button>
        )}
        <button
          type="button"
          onClick={toggleSound}
          title={soundEnabled ? "Desativar som dos pedidos" : "Ativar som dos pedidos"}
          className={`rounded-lg p-1.5 text-base transition-colors ${
            soundEnabled
              ? "text-orange-500 hover:bg-orange-50"
              : "text-gray-400 hover:bg-gray-100"
          }`}
        >
          {soundEnabled ? "🔔" : "🔕"}
        </button>
        <button
          type="button"
          onClick={() => {
            setAutoPrintOnAccept((prev) => {
              const next = !prev;
              localStorage.setItem("foocci_autoprint_on_accept", String(next));
              return next;
            });
          }}
          title={autoPrintOnAccept ? "Desativar impressão automática ao aceitar" : "Ativar impressão automática ao aceitar"}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            autoPrintOnAccept
              ? "bg-blue-50 text-blue-600 hover:bg-blue-100"
              : "bg-gray-100 text-gray-400 hover:bg-gray-200"
          }`}
        >
          🖨️
          <span className="hidden sm:inline">{autoPrintOnAccept ? "Impr. automática" : "Impr. manual"}</span>
        </button>
      </div>

      {/* Reconcile toast */}
      {reconcileToast && (
        <div className="mx-4 mt-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-800 shadow-sm">
          {reconcileToast}
        </div>
      )}

      {/* Auto-print toast */}
      {printToast && (
        <div className="mx-4 mt-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs font-medium text-green-800 shadow-sm">
          🖨️ {printToast}
        </div>
      )}

      <SearchBar
        searchQuery={searchQuery}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onSearchChange={setSearchQuery}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        onClear={() => { setSearchQuery(""); setDateFrom(""); setDateTo(""); }}
        onManualOrder={isManagerOrOwner ? handleOpenManualOrder : undefined}
        onReconcile={isManagerOrOwner ? handleReconcile : undefined}
        reconciling={reconciling}
      />

      <StatusRow
        orders={filtered}
        statusFilter={statusFilter}
        onFilterChange={setStatusFilter}
        sortBy={sortBy}
        onSortChange={setSortBy}
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
          onManualConfirm={isManagerOrOwner ? handleOpenManualConfirm : undefined}
          onVerifyPix={isManagerOrOwner ? handleVerifyPix : undefined}
          verifyingPixIds={verifyingPixIds}
        />
        <DetailPanel
          order={selectedOrder}
          onClose={() => setSelectedId(null)}
          isOwner={isOwner}
          onDelete={handleDeleteOrder}
        />
      </div>

      {/* Cancel confirmation dialog */}
      {cancelDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-bold text-gray-900">Cancelar pedido?</h3>
            <p className="mt-1 text-sm text-gray-500">Esta ação não pode ser desfeita.</p>
            <textarea
              value={cancelDialog.reason}
              onChange={(e) => setCancelDialog((prev) => prev ? { ...prev, reason: e.target.value } : null)}
              placeholder="Motivo do cancelamento (opcional — será enviado ao cliente via WhatsApp)"
              rows={2}
              className="mt-3 w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-100"
            />
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => setCancelDialog(null)}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Voltar
              </button>
              <button
                onClick={() => {
                  executeCancelWithReason(cancelDialog.id, cancelDialog.reason.trim() || undefined);
                  setCancelDialog(null);
                }}
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition-colors"
              >
                Confirmar cancelamento
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-bold text-gray-900">Apagar pedido?</h3>
            <p className="mt-2 text-sm text-gray-600">
              Essa ação remove o pedido e desfaz seus impactos em faturamento, produtos, cliente, histórico e relatórios. Essa ação não pode ser desfeita.
            </p>
            {deleteError && (
              <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{deleteError}</p>
            )}
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => { setDeleteDialog(null); setDeleteError(null); }}
                disabled={deleting}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleConfirmDelete(deleteDialog.id)}
                disabled={deleting}
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40 transition-colors"
              >
                {deleting ? "Apagando…" : "Sim, apagar pedido"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalOrder && (
        <NewOrderModal
          order={modalOrder}
          queueLength={modalQueue.length}
          onAccept={handleModalAccept}
          onReject={handleModalReject}
          accepting={modalAccepting}
          rejecting={modalRejecting}
          audioBlocked={audioBlocked}
          onUnlockAudio={unlockAudio}
        />
      )}

      {/* Manual payment confirmation dialog */}
      {manualConfirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-bold text-gray-900">Confirmar pagamento manualmente?</h3>
            <p className="mt-1 text-xs text-gray-500">
              Use apenas se você verificou o pagamento no painel do Mercado Pago.
              Esta ação marca o pedido como pago e o envia para produção.
            </p>
            {/* Order context for staff review */}
            <div className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2.5 text-xs text-yellow-900 space-y-1">
              <div className="flex justify-between">
                <span className="text-yellow-700">Cliente</span>
                <span className="font-semibold">{manualConfirmDialog.customer}</span>
              </div>
              {manualConfirmDialog.phone && manualConfirmDialog.phone !== "Telefone não informado" && (
                <div className="flex justify-between">
                  <span className="text-yellow-700">Telefone</span>
                  <span className="font-semibold">{manualConfirmDialog.phone}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-yellow-700">Pagamento</span>
                <span className="font-semibold">{manualConfirmDialog.paymentLabel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-yellow-700">Total</span>
                <span className="font-semibold">R$ {manualConfirmDialog.total.toFixed(2).replace(".", ",")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-yellow-700">Aguardando há</span>
                <span className="font-semibold">{elapsed(manualConfirmDialog.createdAt)}</span>
              </div>
            </div>
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs font-semibold text-gray-700">
              <input
                type="checkbox"
                checked={manualConfirmChecked}
                onChange={(e) => setManualConfirmChecked(e.target.checked)}
                className="h-4 w-4 accent-amber-500"
              />
              Confirmei o pagamento no painel do Mercado Pago
            </label>
            <textarea
              value={manualConfirmReason}
              onChange={(e) => setManualConfirmReason(e.target.value)}
              placeholder="Ex: Pagamento confirmado manualmente no painel Mercado Pago às 19:42."
              rows={2}
              className="mt-2 w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-100"
            />
            {manualConfirmError && (
              <p className="mt-1 text-xs text-red-600">{manualConfirmError}</p>
            )}
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => setManualConfirmDialog(null)}
                disabled={manualConfirming}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                Voltar
              </button>
              <button
                onClick={handleConfirmManualPayment}
                disabled={manualConfirming || !manualConfirmChecked || !manualConfirmReason.trim()}
                className="flex-1 rounded-xl bg-amber-500 py-2.5 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-40 transition-colors"
              >
                {manualConfirming ? "Confirmando…" : "Confirmar pagamento"}
              </button>
            </div>
          </div>
        </div>
      )}

      {manualOrderOpen && (
        <ManualOrderModal
          source="manual"
          onClose={() => setManualOrderOpen(false)}
          onCreated={() => {
            setManualOrderOpen(false);
            fetchOrders();
          }}
        />
      )}

    </div>
  );
}
