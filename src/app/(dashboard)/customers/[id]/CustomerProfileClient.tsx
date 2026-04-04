"use client";

import { useState } from "react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Classification {
  tier: "Bronze" | "Silver" | "Gold" | "Diamond";
  icon: string;
  gradient: string;
  nextTier: string | null;
  nextThreshold: number | null;
  progressPercent: number;
}

interface Props {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  totalOrders: number;
  totalSpend: number;
  lastOrderAt: string | null;
  createdAt: string;
  isActive: boolean;
  classification: Classification;
  purchaseFrequencyDays: number;
  favoriteProduct: string | null;
  behavior: BehaviorData;
  insights: InsightItem[];
  orders: OrderHistoryItem[];
  interactions: InteractionItem[];
  tags: CustomerTag[];
}

export interface InteractionItem {
  id: string;
  type: "order_placed" | "order_delivered" | "order_cancelled" | "message_in" | "message_out";
  description: string;
  date: string;
}

export interface OrderHistoryItem {
  id: string;
  status: string;
  total: number;
  createdAt: string;
  items: Array<{ name: string; quantity: number }>;
  payment: string | null;
}

export interface InsightItem {
  id: string;
  type: "churn" | "opportunity" | "info";
  icon: string;
  title: string;
  message: string;
  action: string;
}

export interface BehaviorData {
  timeSlots: Array<{ id: string; label: string; icon: string; range: string; count: number; pct: number }>;
  preferredTime: "Manhã" | "Tarde" | "Noite";
  dayDistribution: Array<{ day: string; count: number; pct: number }>;
  preferredDays: string[];
  favoriteCategories: Array<{ name: string; count: number; pct: number }>;
  leastCategories: Array<{ name: string; count: number }>;
  paymentDistribution: Array<{ method: string; count: number; pct: number }>;
  preferredPayment: string | null;
}

export interface CustomerTag {
  id: string;
  label: string;
  color: "amber" | "green" | "red" | "blue" | "purple" | "teal" | "orange" | "rose";
}

// ─── Constants ────────────────────────────────────────────────────────────────

const INTERACTION_META: Record<InteractionItem["type"], { icon: string; iconBg: string; textColor: string }> = {
  order_placed:    { icon: "🛒", iconBg: "bg-blue-50",    textColor: "text-blue-700"   },
  order_delivered: { icon: "✅", iconBg: "bg-green-50",   textColor: "text-green-700"  },
  order_cancelled: { icon: "✕",  iconBg: "bg-red-50",     textColor: "text-red-700"    },
  message_in:      { icon: "💬", iconBg: "bg-gray-100",   textColor: "text-gray-700"   },
  message_out:     { icon: "📤", iconBg: "bg-orange-50",  textColor: "text-orange-700" },
};

const STATUS_META: Record<string, { dot: string; badge: string; label: string }> = {
  PENDING:          { dot: "bg-amber-400",  badge: "bg-amber-100 text-amber-700",   label: "Pendente"      },
  AWAITING_PAYMENT: { dot: "bg-yellow-400", badge: "bg-yellow-100 text-yellow-700", label: "Ag. pagamento" },
  CONFIRMED:        { dot: "bg-blue-400",   badge: "bg-blue-100 text-blue-700",     label: "Confirmado"    },
  PREPARING:        { dot: "bg-orange-400", badge: "bg-orange-100 text-orange-700", label: "Preparando"    },
  READY:            { dot: "bg-teal-400",   badge: "bg-teal-100 text-teal-700",     label: "Pronto"        },
  OUT_FOR_DELIVERY: { dot: "bg-purple-400", badge: "bg-purple-100 text-purple-700", label: "Em entrega"    },
  DELIVERED:        { dot: "bg-green-500",  badge: "bg-green-100 text-green-700",   label: "Entregue"      },
  CANCELLED:        { dot: "bg-gray-300",   badge: "bg-gray-100 text-gray-400",     label: "Cancelado"     },
};

const INSIGHT_STYLES: Record<InsightItem["type"], { bg: string; border: string; iconBg: string; title: string; action: string }> = {
  churn:       { bg: "bg-red-50",     border: "border-red-100",     iconBg: "bg-red-100",     title: "text-red-800",     action: "text-red-600"     },
  opportunity: { bg: "bg-emerald-50", border: "border-emerald-100", iconBg: "bg-emerald-100", title: "text-emerald-800", action: "text-emerald-700" },
  info:        { bg: "bg-blue-50",    border: "border-blue-100",    iconBg: "bg-blue-100",    title: "text-blue-800",    action: "text-blue-600"    },
};

const PAYMENT_LABELS: Record<string, string> = {
  CASH:           "Dinheiro",
  CREDIT_CARD:    "Cartão Crédito",
  DEBIT_CARD:     "Cartão Débito",
  PIX:            "PIX",
  ONLINE:         "Online",
  CARD_MACHINE:   "Maquininha",
  PIX_IN_PERSON:  "PIX Presencial",
};

const TAG_STYLES: Record<CustomerTag["color"], { chip: string }> = {
  amber:  { chip: "bg-amber-50 text-amber-700 border border-amber-200"   },
  green:  { chip: "bg-green-50 text-green-700 border border-green-200"   },
  red:    { chip: "bg-red-50 text-red-700 border border-red-200"         },
  blue:   { chip: "bg-blue-50 text-blue-700 border border-blue-200"      },
  purple: { chip: "bg-purple-50 text-purple-700 border border-purple-200"},
  teal:   { chip: "bg-teal-50 text-teal-700 border border-teal-200"      },
  orange: { chip: "bg-orange-50 text-orange-700 border border-orange-200"},
  rose:   { chip: "bg-rose-50 text-rose-700 border border-rose-200"      },
};

const TIER_STYLES: Record<Classification["tier"], { badge: string; avatarRing: string; avatarBg: string }> = {
  Diamond: { badge: "bg-cyan-50 text-cyan-700 border border-cyan-200",         avatarRing: "ring-2 ring-cyan-300",   avatarBg: "bg-cyan-500"   },
  Gold:    { badge: "bg-amber-50 text-amber-700 border border-amber-200",       avatarRing: "ring-2 ring-amber-300",  avatarBg: "bg-amber-500"  },
  Silver:  { badge: "bg-gray-100 text-gray-600 border border-gray-300",         avatarRing: "ring-2 ring-gray-300",   avatarBg: "bg-gray-400"   },
  Bronze:  { badge: "bg-orange-50 text-orange-700 border border-orange-200",    avatarRing: "ring-2 ring-orange-300", avatarBg: "bg-orange-500" },
};

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtCurrency(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtRelative(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return "hoje";
  if (days === 1) return "ontem";
  if (days <  7)  return `há ${days} dias`;
  if (days < 30)  return `há ${Math.floor(days / 7)} sem.`;
  if (days < 365) return `há ${Math.floor(days / 30)} meses`;
  return `há ${Math.floor(days / 365)} ano${Math.floor(days / 365) > 1 ? "s" : ""}`;
}

// ─── Tab config ───────────────────────────────────────────────────────────────

type Tab = "overview" | "history" | "interactions" | "actions";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "overview",      label: "Visão Geral"      },
  { id: "history",       label: "Histórico"        },
  { id: "interactions",  label: "Interações"       },
  { id: "actions",       label: "Ações"            },
];

// ─── Placeholder block ────────────────────────────────────────────────────────

function Placeholder({
  label,
  height = "h-32",
}: {
  label: string;
  height?: string;
}) {
  return (
    <div
      className={`${height} flex items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white`}
    >
      <span className="text-sm font-medium text-gray-300">{label}</span>
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-gray-400">
        {icon && <span className="text-sm leading-none">{icon}</span>}
        {title}
      </h2>
      {children}
    </div>
  );
}

// ─── AIInsights ───────────────────────────────────────────────────────────────

function AIInsights({ insights }: { insights: InsightItem[] }) {
  if (insights.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white py-12">
        <span className="text-2xl">🤔</span>
        <p className="mt-2 text-sm font-medium text-gray-400">Dados insuficientes para gerar insights</p>
        <p className="mt-0.5 text-xs text-gray-300">Mais pedidos geram análises automáticas</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {insights.map((ins) => {
        const s = INSIGHT_STYLES[ins.type];
        return (
          <div key={ins.id} className={`rounded-2xl border ${s.border} ${s.bg} px-5 py-4 shadow-sm`}>
            <div className="flex items-start gap-3">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base ${s.iconBg}`}>
                {ins.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-bold ${s.title}`}>{ins.title}</p>
                <p className="mt-0.5 text-sm text-gray-600">{ins.message}</p>
                <p className={`mt-2 text-xs font-semibold ${s.action}`}>
                  💡 {ins.action}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── BehaviorProfile ─────────────────────────────────────────────────────────

function BehaviorProfile({ behavior }: { behavior: BehaviorData }) {
  const maxTime = Math.max(...behavior.timeSlots.map((t) => t.count), 1);

  return (
    <div className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">

      {/* ── Preferred time ── */}
      <div className="px-5 py-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
          Horário preferido
        </p>
        <div className="flex gap-2">
          {behavior.timeSlots.map((slot) => {
            const active = slot.label === behavior.preferredTime;
            const barH   = Math.round((slot.count / maxTime) * 28);
            return (
              <div
                key={slot.id}
                className={`flex flex-1 flex-col items-center rounded-lg px-2 py-2.5 ${
                  active ? "border border-orange-200 bg-orange-50" : "bg-gray-50"
                }`}
              >
                <span className="text-base leading-none">{slot.icon}</span>
                <span className={`mt-1 text-xs font-semibold ${active ? "text-orange-700" : "text-gray-500"}`}>
                  {slot.label}
                </span>
                <span className="text-[10px] text-gray-400">{slot.range}</span>
                {/* Mini bar */}
                <div className="mt-2 flex h-7 w-8 items-end justify-center rounded-sm bg-gray-100">
                  <div
                    className={`w-full rounded-sm ${active ? "bg-orange-400" : "bg-gray-300"}`}
                    style={{ height: `${barH}px` }}
                  />
                </div>
                <span className={`mt-1 text-xs font-bold ${active ? "text-orange-600" : "text-gray-400"}`}>
                  {slot.count}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Days of week ── */}
      <div className="px-5 py-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Dias preferidos
          </p>
          <div className="flex gap-1">
            {behavior.preferredDays.map((d) => (
              <span key={d} className="rounded-full bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-700">
                {d}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-end gap-1">
          {behavior.dayDistribution.map((d) => {
            const active = behavior.preferredDays.includes(d.day);
            return (
              <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex w-full items-end" style={{ height: "28px" }}>
                  <div
                    className={`w-full rounded-t-sm ${active ? "bg-orange-400" : "bg-gray-200"}`}
                    style={{ height: `${Math.max(d.pct, 4)}%` }}
                  />
                </div>
                <span className="text-[9px] leading-none text-gray-400">{d.day}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Categories ── */}
      <div className="px-5 py-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Categorias
          </p>
          {behavior.leastCategories.length > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-gray-300">menos pedidas:</span>
              {behavior.leastCategories.map((c) => (
                <span key={c.name} className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-400">
                  {c.name}
                </span>
              ))}
            </div>
          )}
        </div>
        {behavior.favoriteCategories.length > 0 ? (
          <div className="space-y-2">
            {behavior.favoriteCategories.map((cat) => (
              <div key={cat.name} className="flex items-center gap-2.5">
                <span className="w-24 shrink-0 truncate text-xs text-gray-700" title={cat.name}>
                  {cat.name}
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-orange-400 transition-all duration-500"
                    style={{ width: `${cat.pct}%` }}
                  />
                </div>
                <span className="w-8 text-right text-xs font-medium text-gray-400">
                  {cat.pct}%
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-3 text-center text-xs text-gray-300">Nenhum pedido entregue ainda</p>
        )}
      </div>

      {/* ── Payment ── */}
      <div className="px-5 py-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
          Pagamento preferido
        </p>
        {behavior.paymentDistribution.length > 0 ? (
          <div className="space-y-2">
            {behavior.paymentDistribution.map((p) => {
              const preferred = p.method === behavior.preferredPayment;
              return (
                <div key={p.method} className="flex items-center gap-2.5">
                  <span className="w-28 shrink-0 truncate text-xs text-gray-700">
                    {PAYMENT_LABELS[p.method] ?? p.method}
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        preferred ? "bg-orange-400" : "bg-gray-300"
                      }`}
                      style={{ width: `${p.pct}%` }}
                    />
                  </div>
                  <span className={`w-8 text-right text-xs font-medium ${preferred ? "text-orange-600" : "text-gray-400"}`}>
                    {p.pct}%
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="py-3 text-center text-xs text-gray-300">Nenhum pagamento registrado ainda</p>
        )}
      </div>
    </div>
  );
}

// ─── TagsPanel ────────────────────────────────────────────────────────────────

function TagsPanel({ tags }: { tags: CustomerTag[] }) {
  if (tags.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-6">
        <span className="text-xl">🏷️</span>
        <p className="mt-2 text-xs font-medium text-gray-400">Sem tags atribuídas</p>
        <p className="mt-0.5 text-xs text-gray-300">Tags são geradas automaticamente</p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-gray-100 bg-white px-4 py-4 shadow-sm">
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            key={tag.id}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${TAG_STYLES[tag.color].chip}`}
          >
            {tag.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Header section ───────────────────────────────────────────────────────────

type HeaderProps = Pick<
  Props,
  | "name" | "phone" | "email" | "isActive" | "createdAt"
  | "totalOrders" | "totalSpend" | "lastOrderAt"
  | "classification" | "purchaseFrequencyDays" | "favoriteProduct"
>;

function HeaderSection({
  name, phone, email, isActive, createdAt,
  totalOrders, totalSpend, lastOrderAt,
  classification, purchaseFrequencyDays, favoriteProduct,
}: HeaderProps) {
  const ts = TIER_STYLES[classification.tier];

  const stats = [
    {
      label: "Pedidos",
      value: String(totalOrders),
      sub:   totalOrders === 1 ? "pedido realizado" : "pedidos realizados",
    },
    {
      label: "Total gasto",
      value: fmtCurrency(totalSpend),
      sub:   "acumulado",
    },
    {
      label: "Último pedido",
      value: lastOrderAt ? fmtRelative(lastOrderAt) : "—",
      sub:   lastOrderAt
        ? new Date(lastOrderAt).toLocaleDateString("pt-BR")
        : "sem pedidos",
    },
    {
      label: "Frequência",
      value: purchaseFrequencyDays > 0 ? `${purchaseFrequencyDays}d` : "—",
      sub:   purchaseFrequencyDays > 0 ? "entre pedidos" : "dados insuficientes",
    },
    {
      label: "Produto favorito",
      value: favoriteProduct ?? "—",
      sub:   favoriteProduct ? "mais pedido" : "sem dados",
      truncate: true,
    },
  ];

  return (
    <div className="border-b border-[#E5E5E5] bg-white px-6 py-5">
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2 text-sm text-gray-400">
        <Link href="/customers" className="hover:text-gray-600 transition-colors">
          Clientes
        </Link>
        <span>/</span>
        <span className="font-medium text-gray-700">{name}</span>
        {!isActive && (
          <span className="ml-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
            Inativo
          </span>
        )}
      </div>

      {/* Identity row */}
      <div className="flex items-start gap-4">
        {/* Tier-colored avatar */}
        <div
          className={`h-14 w-14 shrink-0 rounded-2xl ${ts.avatarBg} flex items-center justify-center text-white text-xl font-bold shadow-sm ${ts.avatarRing}`}
        >
          {name.charAt(0).toUpperCase()}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">{name}</h1>

            {/* CRM tier badge */}
            <span className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-semibold ${ts.badge}`}>
              {classification.icon} {classification.tier}
            </span>
          </div>

          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-gray-400">
            <span>{phone}</span>
            {email && <><span>·</span><span>{email}</span></>}
            <span>·</span>
            <span>
              cliente desde{" "}
              {new Date(createdAt).toLocaleDateString("pt-BR", {
                month: "long",
                year:  "numeric",
              })}
            </span>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl bg-gray-50 px-4 py-3.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              {s.label}
            </p>
            <p
              className={`mt-1 text-lg font-bold leading-tight text-gray-900 ${s.truncate ? "truncate" : ""}`}
              title={s.truncate ? (s.value ?? "") : undefined}
            >
              {s.value}
            </p>
            <p className="truncate text-[11px] text-gray-400">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Tier progress bar */}
      {classification.nextTier && classification.nextThreshold && (
        <div className="mt-4 pb-1">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="text-gray-400">
              Progresso para{" "}
              <strong className="font-semibold text-gray-600">
                {classification.nextTier}
              </strong>
            </span>
            <span className="text-gray-400">
              {classification.progressPercent}%{" "}
              <span className="text-gray-300">
                — falta {fmtCurrency(classification.nextThreshold - totalSpend)}
              </span>
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-orange-500 transition-all duration-700"
              style={{ width: `${classification.progressPercent}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab nav ──────────────────────────────────────────────────────────────────

function TabNav({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <div className="border-b border-[#E5E5E5] bg-white px-6">
      <div className="flex">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
              active === t.id
                ? "border-orange-500 text-orange-600"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab({
  behavior,
  insights,
}: {
  behavior: BehaviorData;
  insights: InsightItem[];
}) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Left column — 2/3 */}
      <div className="lg:col-span-2 space-y-6">
        <Section title="IA — Insights" icon="✨">
          <AIInsights insights={insights} />
        </Section>

        <Section title="Perfil de Comportamento" icon="📊">
          <BehaviorProfile behavior={behavior} />
        </Section>
      </div>

      {/* Right column — 1/3 */}
      <div className="space-y-6">
        <Section title="Preferências" icon="❤️">
          <Placeholder label="Restrições · Alergias · Prato favorito" height="h-24" />
        </Section>

        <Section title="Endereços" icon="📍">
          <Placeholder label="Endereços cadastrados" height="h-28" />
        </Section>
      </div>
    </div>
  );
}

// ─── OrderHistory helpers ─────────────────────────────────────────────────────

function localDateKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dateGroupLabel(key: string): string {
  const now = new Date();
  const todayKey = localDateKey(now.toISOString());
  const yestKey  = localDateKey(new Date(now.getTime() - 86_400_000).toISOString());
  if (key === todayKey) return "Hoje";
  if (key === yestKey)  return "Ontem";
  return new Date(`${key}T12:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function groupOrdersByDate(
  orders: OrderHistoryItem[]
): Array<{ key: string; label: string; orders: OrderHistoryItem[] }> {
  const map: Record<string, OrderHistoryItem[]> = {};
  for (const o of orders) {
    const k = localDateKey(o.createdAt);
    if (!map[k]) map[k] = [];
    map[k]!.push(o);
  }
  return Object.keys(map)
    .sort((a, b) => b.localeCompare(a))
    .map((key) => ({ key, label: dateGroupLabel(key), orders: map[key]! }));
}

// ─── OrderHistory component ───────────────────────────────────────────────────

function OrderHistory({ orders }: { orders: OrderHistoryItem[] }) {
  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white py-16">
        <span className="text-3xl">📭</span>
        <p className="mt-2 text-sm font-medium text-gray-400">Nenhum pedido encontrado</p>
        <p className="mt-0.5 text-xs text-gray-300">Os pedidos aparecerão aqui após a primeira compra</p>
      </div>
    );
  }

  const groups  = groupOrdersByDate(orders);
  let globalIdx = 0;

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.key}>
          {/* Date separator */}
          <div className="mb-3 flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-100" />
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              {group.label}
            </span>
            <div className="h-px flex-1 bg-gray-100" />
          </div>

          <div className="space-y-2">
            {group.orders.map((order) => {
              const isLatest = globalIdx++ === 0;
              const meta     = STATUS_META[order.status] ?? STATUS_META["PENDING"]!;
              const shown    = order.items.slice(0, 3);
              const extra    = order.items.length - shown.length;
              const itemsStr = shown
                .map((i) => (i.quantity > 1 ? `${i.name} ×${i.quantity}` : i.name))
                .join(", ");
              const time = new Date(order.createdAt).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <div
                  key={order.id}
                  className={`flex items-center gap-3 rounded-2xl border bg-white px-4 py-3.5 transition-colors ${
                    isLatest
                      ? "border-orange-200 shadow-sm ring-1 ring-orange-100"
                      : "border-gray-100 hover:border-gray-200 hover:shadow-sm"
                  }`}
                >
                  {/* Status dot */}
                  <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />

                  {/* Time */}
                  <span className="w-10 shrink-0 font-mono text-xs text-gray-400">
                    {time}
                  </span>

                  {/* Items */}
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-700">
                    {itemsStr || "—"}
                    {extra > 0 && (
                      <span className="ml-1 text-xs text-gray-400">+{extra}</span>
                    )}
                  </span>

                  {/* Total */}
                  <span className="shrink-0 text-sm font-semibold text-gray-900">
                    {order.total.toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </span>

                  {/* Status badge */}
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${meta.badge}`}>
                    {meta.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── History tab ──────────────────────────────────────────────────────────────

function HistoryTab({ orders }: { orders: OrderHistoryItem[] }) {
  return (
    <div className="space-y-6">
      <Section title="Histórico de Pedidos" icon="🧾">
        <OrderHistory orders={orders} />
      </Section>
    </div>
  );
}

// ─── InteractionTimeline ─────────────────────────────────────────────────────

function InteractionTimeline({ interactions }: { interactions: InteractionItem[] }) {
  if (interactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white py-16">
        <span className="text-3xl">💬</span>
        <p className="mt-2 text-sm font-medium text-gray-400">Nenhuma interação registrada</p>
        <p className="mt-0.5 text-xs text-gray-300">Pedidos e mensagens aparecerão aqui</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white px-5 py-4 shadow-sm">
      <div className="relative">
        {/* Vertical connecting line */}
        <div className="absolute left-3 top-3 bottom-3 w-px bg-gray-100" />

        <div className="space-y-0">
          {interactions.map((item) => {
            const meta = INTERACTION_META[item.type];
            const d    = new Date(item.date);
            const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
            const date = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

            return (
              <div key={item.id} className="relative flex items-start gap-3 py-2.5">
                {/* Icon */}
                <div
                  className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs ${meta.iconBg}`}
                >
                  {meta.icon}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className={`truncate text-sm font-medium leading-snug ${meta.textColor}`}>
                    {item.description}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {time} · {date}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Interactions tab ─────────────────────────────────────────────────────────

function InteractionsTab({ interactions }: { interactions: InteractionItem[] }) {
  return (
    <div className="space-y-6">
      <Section title="Histórico de Interações" icon="🔔">
        <InteractionTimeline interactions={interactions} />
      </Section>
    </div>
  );
}

// ─── Actions tab ──────────────────────────────────────────────────────────────

const ACTION_CARDS = [
  {
    id:      "message",
    icon:    "💬",
    iconBg:  "bg-green-100",
    title:   "Enviar mensagem",
    desc:    "Inicie uma conversa direta com o cliente via WhatsApp.",
    btn:     "Abrir WhatsApp",
    btnCls:  "bg-green-500 hover:bg-green-600 text-white",
  },
  {
    id:      "campaign",
    icon:    "📣",
    iconBg:  "bg-blue-100",
    title:   "Criar campanha",
    desc:    "Adicione este cliente a uma campanha de marketing segmentada.",
    btn:     "Nova campanha",
    btnCls:  "bg-blue-500 hover:bg-blue-600 text-white",
  },
  {
    id:      "discount",
    icon:    "🎁",
    iconBg:  "bg-orange-100",
    title:   "Oferecer desconto",
    desc:    "Envie um cupom ou promoção exclusiva para este cliente.",
    btn:     "Criar cupom",
    btnCls:  "bg-orange-500 hover:bg-orange-600 text-white",
  },
  {
    id:      "reactivate",
    icon:    "🔔",
    iconBg:  "bg-rose-100",
    title:   "Reativar cliente",
    desc:    "Envie uma oferta de reativação personalizada para reconquistar o cliente.",
    btn:     "Reativar",
    btnCls:  "bg-rose-500 hover:bg-rose-600 text-white",
  },
] as const;

function ActionsTab({ tags }: { tags: CustomerTag[] }) {
  return (
    <div className="space-y-8">
      {/* Tags + Action Center together — hierarchy #6 */}
      <Section title="Tags do Cliente" icon="🏷️">
        <TagsPanel tags={tags} />
      </Section>

      <Section title="Central de Ações" icon="⚡">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {ACTION_CARDS.map((card) => (
            <div
              key={card.id}
              className="flex flex-col gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              {/* Icon + title row */}
              <div className="flex items-center gap-3">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl ${card.iconBg}`}>
                  {card.icon}
                </div>
                <p className="text-base font-bold text-gray-900">{card.title}</p>
              </div>

              {/* Description */}
              <p className="text-sm text-gray-500 leading-relaxed">{card.desc}</p>

              {/* Action button */}
              <button
                type="button"
                className={`mt-auto w-full rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${card.btnCls}`}
              >
                {card.btn}
              </button>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function CustomerProfileClient({
  name,
  phone,
  email,
  isActive,
  createdAt,
  totalOrders,
  totalSpend,
  lastOrderAt,
  classification,
  purchaseFrequencyDays,
  favoriteProduct,
  behavior,
  insights,
  orders,
  interactions,
  tags,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  return (
    <div className="min-h-screen bg-[#F5F5F5]">
      {/* Header */}
      <HeaderSection
        name={name}
        phone={phone}
        email={email}
        isActive={isActive}
        createdAt={createdAt}
        totalOrders={totalOrders}
        totalSpend={totalSpend}
        lastOrderAt={lastOrderAt}
        classification={classification}
        purchaseFrequencyDays={purchaseFrequencyDays}
        favoriteProduct={favoriteProduct}
      />

      {/* Tab navigation */}
      <TabNav active={activeTab} onChange={setActiveTab} />

      {/* Tab content */}
      <div className="p-6 max-w-7xl mx-auto">
        {activeTab === "overview"     && <OverviewTab behavior={behavior} insights={insights} />}
        {activeTab === "history"      && <HistoryTab orders={orders} />}
        {activeTab === "interactions" && <InteractionsTab interactions={interactions} />}
        {activeTab === "actions"      && <ActionsTab tags={tags} />}
      </div>
    </div>
  );
}
