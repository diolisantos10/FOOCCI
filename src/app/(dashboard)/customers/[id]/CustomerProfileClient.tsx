"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isGuestIdentifier } from "@/lib/guest";
import { formatOrderNumber } from "@/lib/order-number";
import type { CustomerIntelligenceReport } from "@/services/crm/CustomerIntelligenceService";
import type { NextBestAction } from "@/services/crm/CustomerIntelligenceSnapshotService";

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
  segment: string;
  classification: Classification;
  purchaseFrequencyDays: number;
  favoriteProduct: string | null;
  behavior: BehaviorData;
  insights: InsightItem[];
  orders: OrderHistoryItem[];
  interactions: InteractionItem[];
  tags: CustomerTag[];
  addresses: AddressItem[];
  notes: string | null;
  document: string | null;
  financialBalance: number | null;
  importedOrderCount: number | null;
  importedTotalSpent: number | null;
  importedLastOrderAt: string | null;
  averageTicket: number | null;
  intelligence: CustomerIntelligenceReport;
  nextBestAction: NextBestAction | null;
}

export interface InteractionItem {
  id: string;
  type: "order_placed" | "order_delivered" | "order_cancelled" | "message_in" | "message_out";
  description: string;
  date: string;
}

export interface OrderHistoryItem {
  id: string;
  orderNumber?: number | null;
  status: string;
  total: number;
  createdAt: string;
  items: Array<{ name: string; quantity: number; price?: number }>;
  payment: string | null;
  deliveryFee?: number;
  discount?: number;
  subtotal?: number;
  type?: string;
  notes?: string | null;
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

export interface AddressItem {
  id:           string;
  label:        string | null;
  street:       string;
  number:       string;
  complement:   string | null;
  neighborhood: string;
  city:         string;
  state:        string;
  zipCode:      string;
  isDefault:    boolean;
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

const SEGMENT_CONFIG: Record<string, { label: string; emoji: string; bg: string; text: string }> = {
  QUENTE:      { label: "Quente",      emoji: "🔥", bg: "bg-red-50",    text: "text-red-700"    },
  MORNO:       { label: "Morno",       emoji: "🌡️", bg: "bg-amber-50",  text: "text-amber-700"  },
  FRIO:        { label: "Frio",        emoji: "🥶", bg: "bg-blue-50",    text: "text-blue-700"   },
  PERDIDO:     { label: "Perdido",     emoji: "👻", bg: "bg-purple-50",  text: "text-purple-700" },
  SEM_PEDIDOS: { label: "Sem pedidos", emoji: "💤", bg: "bg-gray-100",   text: "text-gray-500"   },
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
  | "importedOrderCount" | "importedTotalSpent" | "importedLastOrderAt" | "averageTicket"
  | "classification" | "purchaseFrequencyDays" | "favoriteProduct" | "segment"
> & {
  onEdit: () => void;
  onDelete: () => void;
};

function HeaderSection({
  name, phone, email, isActive, createdAt,
  totalOrders, totalSpend, lastOrderAt,
  importedOrderCount, importedTotalSpent, importedLastOrderAt, averageTicket,
  classification, purchaseFrequencyDays, favoriteProduct, segment,
  onEdit, onDelete,
}: HeaderProps) {
  const ts = TIER_STYLES[classification.tier];

  // Use real Foocci orders when available; fall back to imported historical summary
  const usingImported = totalOrders === 0 && (importedOrderCount !== null || importedTotalSpent !== null || importedLastOrderAt !== null);
  const displayOrders  = totalOrders > 0 ? totalOrders  : (importedOrderCount ?? 0);
  const displaySpend   = totalOrders > 0 ? totalSpend   : (importedTotalSpent  ?? 0);
  const displayLast    = lastOrderAt ?? importedLastOrderAt;
  const displayTicket  = totalOrders > 0
    ? (totalOrders > 0 ? displaySpend / displayOrders : 0)
    : (averageTicket ?? (displayOrders > 0 ? displaySpend / displayOrders : 0));

  // When stored segment is SEM_PEDIDOS but we have imported data, derive from importedLastOrderAt.
  // lostMinDays defaults to 120 here since we don't have access to the restaurant's SegmentConfig.
  const effectiveSegment = (segment === "SEM_PEDIDOS" && importedLastOrderAt)
    ? (() => {
        const days = Math.floor((Date.now() - new Date(importedLastOrderAt).getTime()) / 86_400_000);
        if (days <= 30)  return "QUENTE";
        if (days <= 60)  return "MORNO";
        if (days < 120)  return "FRIO";
        return "PERDIDO";
      })()
    : segment;
  const segCfg = SEGMENT_CONFIG[effectiveSegment] ?? SEGMENT_CONFIG["SEM_PEDIDOS"]!;
  const importedSub = usingImported ? " (importado)" : "";

  const stats = [
    {
      label: "Pedidos",
      value: String(displayOrders),
      sub:   usingImported
        ? "histórico Saipos/Nemo"
        : (displayOrders === 1 ? "pedido realizado" : "pedidos realizados"),
    },
    {
      label: "Total gasto",
      value: fmtCurrency(displaySpend),
      sub:   usingImported ? "histórico importado" : "acumulado",
    },
    {
      label: "Último pedido",
      value: displayLast ? fmtRelative(displayLast) : "—",
      sub:   displayLast
        ? new Date(displayLast).toLocaleDateString("pt-BR") + importedSub
        : "sem pedidos",
    },
    {
      label: "Ticket médio",
      value: displayOrders > 0 ? fmtCurrency(displayTicket) : "—",
      sub:   displayOrders > 0 ? (usingImported ? "histórico importado" : "por pedido") : "sem pedidos",
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
      {/* Breadcrumb + actions */}
      <div className="mb-4 flex items-center gap-2 text-sm text-gray-400">
        <Link href="/customers" className="transition-colors hover:text-gray-600">
          Clientes
        </Link>
        <span>/</span>
        <span className="font-medium text-gray-700">{name}</span>
        {!isActive && (
          <span className="ml-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
            Inativo
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onEdit}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-50"
          >
            ✏️ Editar
          </button>
          <button
            onClick={onDelete}
            className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100"
          >
            🗑️ Excluir cliente
          </button>
        </div>
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
            {/* CRM segment badge */}
            <span className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-semibold ${segCfg.bg} ${segCfg.text}`}>
              {segCfg.emoji} {segCfg.label}
            </span>
          </div>

          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-gray-400">
            <span>{isGuestIdentifier(phone) ? "Conta de convidado" : phone}</span>
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

      {/* Imported data notice */}
      {usingImported && (
        <div className="mt-3 flex items-center gap-1.5 rounded-xl bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700">
          <span>📦</span>
          <span>Métricas baseadas em histórico importado (Saipos/Nemo) — não representa pedidos individuais no Foocci</span>
        </div>
      )}

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

// ─── AddressList ──────────────────────────────────────────────────────────────

function AddressList({ addresses }: { addresses: AddressItem[] }) {
  if (addresses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-6">
        <span className="text-xl">📍</span>
        <p className="mt-2 text-xs font-medium text-gray-400">Nenhum endereço cadastrado</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {addresses.map((a) => (
        <div
          key={a.id}
          className={`rounded-2xl border bg-white px-4 py-3 shadow-sm ${
            a.isDefault ? "border-orange-200 ring-1 ring-orange-100" : "border-gray-100"
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-gray-800">
              {a.street}, {a.number}
              {a.complement && ` — ${a.complement}`}
            </p>
            {a.isDefault && (
              <span className="shrink-0 rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-600">
                padrão
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-gray-500">
            {a.neighborhood} · {a.city} / {a.state}
          </p>
          <p className="mt-0.5 text-xs text-gray-400">{a.zipCode}</p>
          {a.label && (
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-gray-300">
              {a.label}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Overview tab ─────────────────────────────────────────────────────────────

// ─── Intelligence section ─────────────────────────────────────────────────────

const CONTACTABILITY_STYLE: Record<string, { badge: string; label: string }> = {
  CONTACTABLE:     { badge: "bg-green-100 text-green-700",  label: "Contatável"       },
  NON_CONTACTABLE: { badge: "bg-red-100 text-red-700",      label: "Não contatável"   },
  OPT_OUT:         { badge: "bg-gray-200 text-gray-600",    label: "Opt-out"          },
  NEEDS_REVIEW:    { badge: "bg-amber-100 text-amber-700",  label: "Revisar"          },
};

const PRIORITY_STYLE: Record<string, { bar: string; label: string }> = {
  NONE:   { bar: "bg-gray-200",   label: "Completo"  },
  LOW:    { bar: "bg-blue-400",   label: "Baixa"     },
  MEDIUM: { bar: "bg-amber-400",  label: "Média"     },
  HIGH:   { bar: "bg-red-500",    label: "Alta"      },
};

const SIGNAL_STATUS_STYLE: Record<string, { chip: string }> = {
  INFERRED:     { chip: "bg-blue-50 text-blue-700"   },
  CONFIRMED:    { chip: "bg-green-50 text-green-700" },
  REJECTED:     { chip: "bg-gray-100 text-gray-500"  },
  NEEDS_REVIEW: { chip: "bg-amber-50 text-amber-700" },
};

const SIGNAL_STATUS_LABEL: Record<string, string> = {
  INFERRED:     "Inferido",
  CONFIRMED:    "Confirmado",
  REJECTED:     "Descartado",
  NEEDS_REVIEW: "Revisar",
};

function IntelligenceSection({ intel }: { intel: CustomerIntelligenceReport }) {
  const contactStyle = CONTACTABILITY_STYLE[intel.contactabilityStatus] ?? CONTACTABILITY_STYLE.NEEDS_REVIEW!;
  const priorityStyle = PRIORITY_STYLE[intel.enrichmentPriority] ?? PRIORITY_STYLE.NONE!;
  const scoreBarWidth = `${intel.completenessScore}%`;
  const scoreColor =
    intel.completenessScore >= 85 ? "bg-green-500"
    : intel.completenessScore >= 50 ? "bg-amber-400"
    : "bg-red-500";

  const fieldLabels: Record<string, string> = {
    phone:       "Telefone",
    name:        "Nome completo",
    email:       "E-mail",
    document:    "CPF / CNPJ",
    birthDate:   "Aniversário",
    address:     "Endereço",
    preferences: "Preferências",
  };

  const channelLabel: Record<string, string> = {
    WHATSAPP: "WhatsApp",
    INTERNAL: "Interno",
    MANUAL:   "Manual",
  };

  const visibleSignals = intel.signals.filter((s) => s.status !== "REJECTED").slice(0, 5);

  return (
    <div className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      {/* Score bar */}
      <div className="px-4 py-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-gray-500">Completude do cadastro</span>
          <span className="text-xs font-bold text-gray-700">{intel.completenessScore}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-gray-100">
          <div
            className={`h-2 rounded-full transition-all ${scoreColor}`}
            style={{ width: scoreBarWidth }}
          />
        </div>
      </div>

      {/* Contactability + enrichment priority */}
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-xs text-gray-500">Contatabilidade</span>
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${contactStyle.badge}`}>
          {contactStyle.label}
        </span>
      </div>

      {!intel.campaignEligible && (
        <div className="px-4 py-2">
          <p className="text-[11px] text-red-600 leading-snug">
            {intel.contactabilityStatus === "NON_CONTACTABLE"
              ? "Cliente sem telefone — não entra em campanhas WhatsApp."
              : intel.contactabilityStatus === "OPT_OUT"
              ? "Cliente solicitou opt-out de comunicações."
              : "Cliente inelegível para campanhas WhatsApp."}
          </p>
        </div>
      )}

      {/* Enrichment priority */}
      {intel.enrichmentPriority !== "NONE" && (
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-xs text-gray-500">Prioridade de enriquecimento</span>
          <span className={`inline-flex h-2 w-2 rounded-full ${priorityStyle.bar}`} title={priorityStyle.label} />
        </div>
      )}

      {/* Recommended next action */}
      {intel.recommendedNextDataToCollect && (
        <div className="px-4 py-3">
          <p className="text-[11px] text-gray-500 mb-0.5">Próximo dado sugerido</p>
          <p className="text-xs font-medium text-gray-700 capitalize">{intel.recommendedNextDataToCollect}</p>
        </div>
      )}

      {/* Missing fields */}
      {intel.missingFields.length > 0 && (
        <div className="px-4 py-3">
          <p className="text-[11px] text-gray-500 mb-1.5">Dados ausentes</p>
          <div className="flex flex-wrap gap-1">
            {intel.missingFields.map((f) => (
              <span key={f} className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">
                {fieldLabels[f] ?? f}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Enrichment opportunities */}
      {intel.enrichmentOpportunities.length > 0 && (
        <div className="px-4 py-3">
          <p className="text-[11px] text-gray-500 mb-1.5">Oportunidades de enriquecimento</p>
          <ul className="space-y-2">
            {intel.enrichmentOpportunities.slice(0, 3).map((op) => (
              <li key={op.id} className="text-[11px] text-gray-600 leading-snug">
                <span className="font-medium text-gray-700">{op.title}</span>
                {" — "}
                <span className="text-gray-500">{op.description}</span>
                {" "}
                <span className="text-[10px] text-gray-400">({channelLabel[op.channel] ?? op.channel})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Inferred signals */}
      {visibleSignals.length > 0 && (
        <div className="px-4 py-3">
          <p className="text-[11px] text-gray-500 mb-1.5">Sinais de dados</p>
          <ul className="space-y-1.5">
            {visibleSignals.map((s) => {
              const style = SIGNAL_STATUS_STYLE[s.status] ?? SIGNAL_STATUS_STYLE.INFERRED!;
              return (
                <li key={s.id} className="flex items-start gap-2">
                  <span className={`mt-0.5 inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${style.chip}`}>
                    {SIGNAL_STATUS_LABEL[s.status] ?? s.status}
                  </span>
                  <span className="text-[11px] text-gray-600 leading-snug">
                    {s.value
                      ? <>Possível preferência: <span className="font-medium">{s.value}</span>{s.notes ? ` — ${s.notes}` : ""}</>
                      : s.notes ?? s.type}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Next Best Action card ──────────────────────────────────────────────────────

const NBA_PRIORITY_STYLE: Record<string, { badge: string; label: string }> = {
  HIGH:   { badge: "bg-red-100 text-red-700",     label: "Alta"  },
  MEDIUM: { badge: "bg-amber-100 text-amber-700", label: "Média" },
  LOW:    { badge: "bg-blue-100 text-blue-700",   label: "Baixa" },
  NONE:   { badge: "bg-gray-100 text-gray-500",   label: "—"     },
};

const NBA_ACTION_LABEL: Record<string, string> = {
  WELCOME_FIRST_ORDER: "Boas-vindas / 1º pedido",
  VIP_APPRECIATION:    "Reconhecimento VIP",
  REVIEW_REQUEST:      "Pedir avaliação",
  PREMIUM_OFFER:       "Oferta premium",
  GENTLE_REMINDER:     "Lembrete leve",
  REACTIVATION:        "Reativação",
  WINBACK:             "Reconquista",
  LOYALTY_THANK_YOU:   "Agradecimento / fidelização",
  DATA_ENRICHMENT:     "Enriquecer cadastro",
  NO_ACTION:           "Nenhuma ação",
};

const NBA_CHANNEL_LABEL: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  INTERNAL: "Interno",
  NONE:     "—",
};

function NextBestActionCard({ nba }: { nba: NextBestAction }) {
  const ps = NBA_PRIORITY_STYLE[nba.priority] ?? NBA_PRIORITY_STYLE.NONE!;
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <span className="text-sm font-semibold text-gray-800">
          {NBA_ACTION_LABEL[nba.actionType] ?? nba.actionType}
        </span>
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${ps.badge}`}>
          {ps.label}
        </span>
      </div>
      <div className="px-4 py-3 space-y-2">
        <p className="text-xs text-gray-600 leading-snug">{nba.reason}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">
            Canal: {NBA_CHANNEL_LABEL[nba.recommendedChannel] ?? nba.recommendedChannel}
          </span>
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] ${nba.safeToContact ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
            {nba.safeToContact ? "Seguro contatar" : "Não contatar"}
          </span>
        </div>
        <div className="pt-1">
          <p className="text-[11px] text-gray-500 mb-0.5">Objetivo da mensagem</p>
          <p className="text-xs text-gray-700 leading-snug">{nba.suggestedMessageGoal}</p>
        </div>
      </div>
    </div>
  );
}

function OverviewTab({
  behavior,
  insights,
  addresses,
  notes,
  document,
  financialBalance,
  importedOrderCount,
  importedTotalSpent,
  importedLastOrderAt,
  averageTicket,
  intelligence,
  nextBestAction,
}: {
  behavior: BehaviorData;
  insights: InsightItem[];
  addresses: AddressItem[];
  notes: string | null;
  document: string | null;
  financialBalance: number | null;
  importedOrderCount: number | null;
  importedTotalSpent: number | null;
  importedLastOrderAt: string | null;
  averageTicket: number | null;
  intelligence: CustomerIntelligenceReport;
  nextBestAction: NextBestAction | null;
}) {
  const hasImported = document !== null || financialBalance !== null || importedOrderCount !== null || importedTotalSpent !== null || importedLastOrderAt !== null || averageTicket !== null || notes !== null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Left column — 2/3 */}
      <div className="space-y-6 lg:col-span-2">
        <Section title="IA — Insights" icon="✨">
          <AIInsights insights={insights} />
        </Section>

        <Section title="Perfil de Comportamento" icon="📊">
          <BehaviorProfile behavior={behavior} />
        </Section>
      </div>

      {/* Right column — 1/3 */}
      <div className="space-y-6">
        {nextBestAction && (
          <Section title="Próxima melhor ação" icon="🎯">
            <NextBestActionCard nba={nextBestAction} />
          </Section>
        )}

        <Section title="Inteligência do cliente" icon="🧠">
          <IntelligenceSection intel={intelligence} />
        </Section>

        <Section title="Endereços" icon="📍">
          <AddressList addresses={addresses} />
        </Section>

        {hasImported && (
          <Section title="Dados Importados" icon="📥">
            <div className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
              {document !== null && (
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-xs text-gray-500">CPF / CNPJ</span>
                  <span className="text-sm font-semibold text-gray-800">{document}</span>
                </div>
              )}
              {financialBalance !== null && (
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-xs text-gray-500">Saldo financeiro</span>
                  <span className="text-sm font-semibold text-gray-800">{fmtCurrency(financialBalance)}</span>
                </div>
              )}
              {importedOrderCount !== null && (
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-xs text-gray-500">Pedidos (importado)</span>
                  <span className="text-sm font-semibold text-gray-800">{importedOrderCount}</span>
                </div>
              )}
              {importedTotalSpent !== null && (
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-xs text-gray-500">Total gasto (importado)</span>
                  <span className="text-sm font-semibold text-gray-800">{fmtCurrency(importedTotalSpent)}</span>
                </div>
              )}
              {averageTicket !== null && (
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-xs text-gray-500">Ticket médio (importado)</span>
                  <span className="text-sm font-semibold text-gray-800">{fmtCurrency(averageTicket)}</span>
                </div>
              )}
              {importedLastOrderAt !== null && (
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-xs text-gray-500">Última compra (importado)</span>
                  <span className="text-sm font-semibold text-gray-800">{new Date(importedLastOrderAt).toLocaleDateString("pt-BR")}</span>
                </div>
              )}
              {notes !== null && (
                <div className="px-4 py-3">
                  <p className="text-xs text-gray-500 mb-1">Observações</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{notes}</p>
                </div>
              )}
            </div>
          </Section>
        )}
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

// ─── OrderDetailModal ─────────────────────────────────────────────────────────

const ORDER_TYPE_LABEL: Record<string, string> = {
  DELIVERY: "Entrega",
  PICKUP:   "Retirada",
  DINE_IN:  "Mesa",
};

function OrderDetailModal({
  order,
  onClose,
}: {
  order: OrderHistoryItem;
  onClose: () => void;
}) {
  const meta = STATUS_META[order.status] ?? STATUS_META["PENDING"]!;
  const date = new Date(order.createdAt).toLocaleString("pt-BR", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Pedido {formatOrderNumber(order.orderNumber, order.id)}
            </p>
            <p className="text-sm text-gray-500 mt-0.5">{date}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${meta.badge}`}>
              {meta.label}
            </span>
            <button
              onClick={onClose}
              className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4 max-h-[65vh] overflow-y-auto">
          {/* Meta row */}
          <div className="flex flex-wrap gap-2">
            {order.type && (
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">
                {ORDER_TYPE_LABEL[order.type] ?? order.type}
              </span>
            )}
            {order.payment && (
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">
                {PAYMENT_LABELS[order.payment] ?? order.payment}
              </span>
            )}
          </div>

          {/* Items */}
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Itens</p>
            <div className="divide-y divide-gray-50 rounded-xl border border-gray-100 bg-gray-50 overflow-hidden">
              {order.items.map((item, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="shrink-0 rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-bold text-gray-600">
                      {item.quantity}×
                    </span>
                    <p className="text-sm text-gray-800 truncate">{item.name}</p>
                  </div>
                  {item.price !== undefined && (
                    <p className="shrink-0 text-sm font-medium text-gray-600 ml-3">
                      {fmtCurrency(item.price * item.quantity)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          {order.notes && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Observações</p>
              <p className="text-sm text-gray-600 italic">{order.notes}</p>
            </div>
          )}

          {/* Totals */}
          <div className="rounded-xl border border-gray-100 overflow-hidden">
            {order.subtotal !== undefined && (
              <div className="flex justify-between px-4 py-2 text-sm text-gray-600">
                <span>Subtotal</span>
                <span>{fmtCurrency(order.subtotal)}</span>
              </div>
            )}
            {order.deliveryFee !== undefined && order.deliveryFee > 0 && (
              <div className="flex justify-between px-4 py-2 text-sm text-gray-600 border-t border-gray-50">
                <span>Entrega</span>
                <span>{fmtCurrency(order.deliveryFee)}</span>
              </div>
            )}
            {order.discount !== undefined && order.discount > 0 && (
              <div className="flex justify-between px-4 py-2 text-sm text-green-600 border-t border-gray-50">
                <span>Desconto</span>
                <span>−{fmtCurrency(order.discount)}</span>
              </div>
            )}
            <div className="flex justify-between px-4 py-3 font-bold text-gray-900 bg-gray-50 border-t border-gray-100">
              <span>Total</span>
              <span>{fmtCurrency(order.total)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── OrderHistory component ───────────────────────────────────────────────────

function OrderHistory({ orders, onOrderClick }: { orders: OrderHistoryItem[]; onOrderClick: (o: OrderHistoryItem) => void }) {
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
                <button
                  key={order.id}
                  type="button"
                  onClick={() => onOrderClick(order)}
                  className={`w-full flex items-center gap-3 rounded-2xl border bg-white px-4 py-3.5 text-left transition-colors cursor-pointer ${
                    isLatest
                      ? "border-orange-200 shadow-sm ring-1 ring-orange-100 hover:shadow-md"
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
                  {/* Click cue */}
                  <svg className="shrink-0 h-3.5 w-3.5 text-gray-300" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
                  </svg>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── History tab ──────────────────────────────────────────────────────────────

function HistoryTab({ orders, onOrderClick }: { orders: OrderHistoryItem[]; onOrderClick: (o: OrderHistoryItem) => void }) {
  return (
    <div className="space-y-6">
      <Section title="Histórico de Pedidos" icon="🧾">
        <p className="text-xs text-gray-400">Clique em um pedido para ver os detalhes.</p>
        <OrderHistory orders={orders} onOrderClick={onOrderClick} />
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
  id,
  name,
  phone,
  email,
  isActive,
  createdAt,
  totalOrders,
  totalSpend,
  lastOrderAt,
  segment,
  classification,
  purchaseFrequencyDays,
  favoriteProduct,
  behavior,
  insights,
  orders,
  interactions,
  tags,
  addresses,
  notes,
  document,
  financialBalance,
  importedOrderCount,
  importedTotalSpent,
  importedLastOrderAt,
  averageTicket,
  intelligence,
  nextBestAction,
}: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [selectedOrder, setSelectedOrder] = useState<OrderHistoryItem | null>(null);

  // ── Edit modal ──────────────────────────────────────────────────────────────
  const [editOpen,  setEditOpen]  = useState(false);
  const [editName,  setEditName]  = useState(name);
  const [editPhone, setEditPhone] = useState(phone);
  const [editEmail, setEditEmail] = useState(email ?? "");
  const [editErr,   setEditErr]   = useState("");
  const [editBusy,  setEditBusy]  = useState(false);

  const isGuest = isGuestIdentifier(phone);

  function openEdit() {
    setEditName(name);
    setEditPhone(isGuest ? "" : phone);
    setEditEmail(email ?? "");
    setEditErr("");
    setEditOpen(true);
  }

  async function submitEdit() {
    setEditBusy(true);
    setEditErr("");
    try {
      const phoneValue = editPhone.trim();
      const res = await fetch(`/api/customers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:  editName.trim(),
          ...(phoneValue ? { phone: phoneValue } : {}),
          email: editEmail.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setEditErr((body as { message?: string }).message ?? "Erro ao salvar");
        return;
      }
      setEditOpen(false);
      router.refresh();
    } finally {
      setEditBusy(false);
    }
  }

  // ── Delete modal ────────────────────────────────────────────────────────────
  const [delOpen, setDelOpen] = useState(false);
  const [delBusy, setDelBusy] = useState(false);

  async function confirmDelete() {
    setDelBusy(true);
    try {
      const res = await fetch(`/api/customers/${id}`, { method: "DELETE" });
      if (res.ok || res.status === 204) {
        router.push("/customers");
      }
    } finally {
      setDelBusy(false);
    }
  }

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
        importedOrderCount={importedOrderCount}
        importedTotalSpent={importedTotalSpent}
        importedLastOrderAt={importedLastOrderAt}
        averageTicket={averageTicket}
        segment={segment}
        classification={classification}
        purchaseFrequencyDays={purchaseFrequencyDays}
        favoriteProduct={favoriteProduct}
        onEdit={openEdit}
        onDelete={() => setDelOpen(true)}
      />

      {/* Tab navigation */}
      <TabNav active={activeTab} onChange={setActiveTab} />

      {/* Tab content */}
      <div className="mx-auto max-w-7xl p-6">
        {activeTab === "overview"     && <OverviewTab behavior={behavior} insights={insights} addresses={addresses} notes={notes} document={document} financialBalance={financialBalance} importedOrderCount={importedOrderCount} importedTotalSpent={importedTotalSpent} importedLastOrderAt={importedLastOrderAt} averageTicket={averageTicket} intelligence={intelligence} nextBestAction={nextBestAction} />}
        {activeTab === "history"      && <HistoryTab orders={orders} onOrderClick={setSelectedOrder} />}
        {activeTab === "interactions" && <InteractionsTab interactions={interactions} />}
        {activeTab === "actions"      && <ActionsTab tags={tags} />}
      </div>

      {/* ── Order detail modal ──────────────────────────────────────────────── */}
      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
        />
      )}

      {/* ── Edit modal ──────────────────────────────────────────────────────── */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-bold text-gray-900">Editar cliente</h2>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600">Nome</label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600">
                  Telefone {isGuest && <span className="font-normal text-gray-400">(opcional)</span>}
                </label>
                <input
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder={isGuest ? "Ex: +5511999990000" : undefined}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600">
                  Email <span className="font-normal text-gray-400">(opcional)</span>
                </label>
                <input
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  type="email"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
            </div>
            {editErr && <p className="mt-2 text-xs text-red-500">{editErr}</p>}
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setEditOpen(false)}
                disabled={editBusy}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={submitEdit}
                disabled={editBusy || !editName.trim() || (!isGuest && !editPhone.trim())}
                className="flex-1 rounded-xl bg-orange-500 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50"
              >
                {editBusy ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm modal ─────────────────────────────────────────────── */}
      {delOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-2xl">
              🗑️
            </div>
            <h2 className="mb-1 text-lg font-bold text-gray-900">Excluir cliente</h2>
            <p className="mb-5 text-sm text-gray-500">
              Tem certeza que deseja excluir{" "}
              <strong className="text-gray-900">{name}</strong>? Esta ação não pode ser desfeita.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDelOpen(false)}
                disabled={delBusy}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                disabled={delBusy}
                className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-50"
              >
                {delBusy ? "Excluindo…" : "Excluir"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
