"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { CRMCustomer, Opportunity, CustomerTier, OverviewStats } from "@/services/crm/CRMService";
import { ImportModal } from "./ImportModal";
import { OverviewTab, type DateFilterPreset } from "./OverviewTab";

// ── Label maps ─────────────────────────────────────────────────────────────────

const TIER_CONFIG: Record<CustomerTier, { label: string; bg: string; text: string; icon: string }> = {
  DIAMANTE: { label: "Diamante", bg: "bg-cyan-100",   text: "text-cyan-700",   icon: "💎" },
  OURO:     { label: "Ouro",     bg: "bg-amber-100",  text: "text-amber-700",  icon: "🥇" },
  PRATA:    { label: "Prata",    bg: "bg-gray-200",   text: "text-gray-700",   icon: "🥈" },
  BRONZE:   { label: "Bronze",   bg: "bg-orange-100", text: "text-orange-700", icon: "🥉" },
};

const PRIORITY_CONFIG: Record<string, { label: string; dot: string }> = {
  HIGH:   { label: "Alta",  dot: "bg-red-500"    },
  MEDIUM: { label: "Média", dot: "bg-yellow-500"  },
  LOW:    { label: "Baixa", dot: "bg-green-500"   },
};

const CUSTOMER_FILTER_LABELS: Record<string, string> = {
  all:          "Top Gasto",
  inactive:     "Inativos 30d+",
  neverOrdered: "Nunca pediu",
  vip:          "Clientes VIP",
  firstTime:    "1º pedido",
  recent:       "Recentes",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatPhone(phone: string) {
  const d = phone.replace(/\D/g, "");
  if (d.length === 13) return `+${d.slice(0,2)} (${d.slice(2,4)}) ${d.slice(4,9)}-${d.slice(9)}`;
  return phone;
}

function formatCurrency(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function relativeDate(iso: string | null): string {
  if (!iso) return "—";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return "Hoje";
  if (days === 1) return "Ontem";
  if (days < 30)  return `${days}d atrás`;
  if (days < 365) return `${Math.floor(days / 30)}m atrás`;
  return `${Math.floor(days / 365)}a atrás`;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: CustomerTier }) {
  const cfg = TIER_CONFIG[tier];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${cfg.bg} ${cfg.text}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

// ── Opportunities Tab ─────────────────────────────────────────────────────────

function OpportunitiesTab({ opportunities }: { opportunities: Opportunity[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editingMsg, setEditingMsg] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);

  function getMessage(opp: Opportunity) {
    return editingMsg[opp.type] ?? opp.suggestedMessage;
  }

  function copyMessage(opp: Opportunity) {
    navigator.clipboard.writeText(getMessage(opp));
    setCopied(opp.type);
    setTimeout(() => setCopied(null), 2000);
  }

  if (opportunities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <span className="mb-3 text-5xl">🎉</span>
        <p className="text-sm font-semibold text-gray-700">Nenhuma oportunidade identificada agora</p>
        <p className="mt-1 text-xs text-gray-400">
          Quando houver clientes inativos, aniversariantes ou VIPs em risco, eles aparecerão aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        {opportunities.length} oportunidade{opportunities.length > 1 ? "s" : ""} identificada{opportunities.length > 1 ? "s" : ""} hoje
      </p>

      {opportunities.map((opp) => {
        const pCfg = PRIORITY_CONFIG[opp.priority] ?? PRIORITY_CONFIG.MEDIUM!;
        const isOpen = expanded === opp.type;
        const msg = getMessage(opp);

        return (
          <div key={opp.type} className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
            {/* Header */}
            <div className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className={`h-2 w-2 rounded-full ${pCfg.dot} shrink-0 mt-0.5`} />
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                      Prioridade {pCfg.label}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-gray-900">{opp.title}</p>
                  <p className="mt-0.5 text-xs text-gray-500">{opp.description}</p>
                </div>
                <span className="shrink-0 rounded-xl bg-brand-50 px-2.5 py-1 text-sm font-bold text-brand-700">
                  {opp.count}
                </span>
              </div>

              {/* Actions */}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => setExpanded(isOpen ? null : opp.type)}
                  className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200 transition-colors"
                >
                  {isOpen ? "Fechar" : "Ver mensagem + clientes"}
                </button>
                <button
                  onClick={() => copyMessage(opp)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    copied === opp.type
                      ? "bg-green-100 text-green-700"
                      : "bg-brand-50 text-brand-700 hover:bg-brand-100"
                  }`}
                >
                  {copied === opp.type ? "✓ Copiado!" : "Copiar mensagem"}
                </button>
              </div>
            </div>

            {/* Expanded: message editor + customer list */}
            {isOpen && (
              <div className="border-t border-gray-100 bg-gray-50 p-4 space-y-4">
                {/* Message editor */}
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-gray-600">
                    Mensagem sugerida <span className="font-normal text-gray-400">(edite à vontade)</span>
                  </p>
                  <textarea
                    rows={4}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 resize-none"
                    value={msg}
                    onChange={(e) =>
                      setEditingMsg((prev) => ({ ...prev, [opp.type]: e.target.value }))
                    }
                  />
                  <p className="mt-1 text-[10px] text-gray-400">
                    Use <code className="bg-gray-100 px-1 rounded">{"{nome}"}</code> para inserir o nome do cliente automaticamente.
                  </p>
                </div>

                {/* Customer list */}
                <div>
                  <p className="mb-2 text-xs font-semibold text-gray-600">
                    Clientes ({opp.customers.length}{opp.count > opp.customers.length ? ` de ${opp.count}` : ""})
                  </p>
                  <div className="space-y-1.5">
                    {opp.customers.map((c) => (
                      <div key={c.id} className="flex items-center justify-between rounded-xl bg-white border border-gray-100 px-3 py-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <TierBadge tier={c.tier} />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-gray-900 truncate">{c.name}</p>
                            <p className="text-[10px] text-gray-400">{formatPhone(c.phone)}</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-3">
                          <p className="text-xs text-gray-500">{relativeDate(c.lastOrderAt)}</p>
                          <p className="text-[10px] text-gray-400">R${formatCurrency(c.totalSpend)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── CSV Export ────────────────────────────────────────────────────────────────

function exportCSV(customers: CRMCustomer[]) {
  const header = "Nome,Telefone,Último pedido,Gasto total (R$)";
  const rows = customers.map((c) => [
    `"${c.name.replace(/"/g, '""')}"`,
    c.phone,
    c.lastOrderAt ? new Date(c.lastOrderAt).toLocaleDateString("pt-BR") : "",
    c.totalSpend.toFixed(2).replace(".", ","),
  ].join(","));
  const csv = "﻿" + [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `clientes_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Copy Phone ────────────────────────────────────────────────────────────────

function CopyPhoneButton({ phone }: { phone: string }) {
  const [copied, setCopied] = useState(false);
  function copy(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(phone);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      onClick={copy}
      title="Copiar telefone"
      className={`ml-1 rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${
        copied ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
      }`}
    >
      {copied ? "✓" : "copiar"}
    </button>
  );
}

// ── Reactivation Helper ───────────────────────────────────────────────────────

function ReactivationHelper({
  customers,
  reviewLinks,
}: {
  customers: CRMCustomer[];
  reviewLinks: { google: string | null; ifood: string | null };
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState(
    "Fala {nome}, tudo bem? 👋\nTemos uma condição especial hoje pra você voltar — quer ver?"
  );
  const [copied, setCopied] = useState<string | null>(null);

  function copyFor(c: CRMCustomer) {
    navigator.clipboard.writeText(message.replace(/\{nome\}/gi, c.name));
    setCopied(c.id);
    setTimeout(() => setCopied(null), 2000);
  }

  function copyTemplate() {
    navigator.clipboard.writeText(message);
    setCopied("__template__");
    setTimeout(() => setCopied(null), 2000);
  }

  function appendLink(url: string) {
    setMessage((m) => m.trimEnd() + "\n" + url);
  }

  const hasLinks = reviewLinks.google || reviewLinks.ifood;

  return (
    <div className="rounded-2xl border border-brand-100 bg-brand-50 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-xs font-bold text-brand-800">
          Mensagem rápida de reativação
        </span>
        <svg
          className={`h-4 w-4 text-brand-600 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-brand-100 bg-white p-4 space-y-3">
          <textarea
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 focus:border-brand-400 focus:outline-none resize-none"
          />
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[10px] text-gray-400 flex-1 min-w-0">
              Use <code className="bg-gray-100 px-1 rounded">{"{nome}"}</code> para personalizar.
            </p>
            <button
              onClick={copyTemplate}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                copied === "__template__"
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {copied === "__template__" ? "✓ Copiado!" : "Copiar modelo"}
            </button>
            {hasLinks && (
              <>
                {reviewLinks.google && (
                  <button
                    onClick={() => appendLink(reviewLinks.google!)}
                    className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
                  >
                    + Google
                  </button>
                )}
                {reviewLinks.ifood && (
                  <button
                    onClick={() => appendLink(reviewLinks.ifood!)}
                    className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors"
                  >
                    + iFood
                  </button>
                )}
              </>
            )}
          </div>

          {customers.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Copiar mensagem personalizada para cada cliente
              </p>
              <div className="max-h-52 overflow-y-auto space-y-1.5">
                {customers.slice(0, 30).map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-900 truncate">{c.name}</p>
                      <p className="text-[10px] text-gray-400">{formatPhone(c.phone)}</p>
                    </div>
                    <button
                      onClick={() => copyFor(c)}
                      className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                        copied === c.id
                          ? "bg-green-100 text-green-700"
                          : "bg-brand-50 text-brand-700 hover:bg-brand-100"
                      }`}
                    >
                      {copied === c.id ? "✓ Copiado" : "Copiar"}
                    </button>
                  </div>
                ))}
                {customers.length > 30 && (
                  <p className="text-center text-[10px] text-gray-400 py-1.5">
                    +{customers.length - 30} clientes. Use &quot;Exportar CSV&quot; para ver todos.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Customers Tab ─────────────────────────────────────────────────────────────

type CRMFilter = "all" | "inactive" | "neverOrdered" | "vip" | "firstTime" | "recent";

function CustomersTab({
  initialCustomers,
  initialFilter = "all",
  onImportOpen,
  reviewLinks,
}: {
  initialCustomers: CRMCustomer[];
  initialFilter?: CRMFilter;
  onImportOpen: () => void;
  reviewLinks: { google: string | null; ifood: string | null };
}) {
  const [filter, setFilter] = useState<CRMFilter>(initialFilter);
  const [customers, setCustomers] = useState<CRMCustomer[]>(
    initialFilter === "all" ? initialCustomers : []
  );
  const [loading, setLoading] = useState(initialFilter !== "all");

  useEffect(() => {
    if (initialFilter !== "all") {
      fetch(`/api/crm/customers?filter=${initialFilter}`)
        .then((r) => r.json())
        .then((json) => { setCustomers(json.data ?? []); setLoading(false); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function applyFilter(f: CRMFilter) {
    setFilter(f);
    setLoading(true);
    const res = await fetch(`/api/crm/customers?filter=${f}`);
    if (res.ok) {
      const json = await res.json();
      setCustomers(json.data ?? []);
    }
    setLoading(false);
  }

  const tierOrder: CustomerTier[] = ["DIAMANTE", "OURO", "PRATA", "BRONZE"];
  const filterKeys = Object.keys(CUSTOMER_FILTER_LABELS) as CRMFilter[];

  return (
    <div className="space-y-4">
      {/* Filter pills + actions */}
      <div className="flex flex-wrap items-center gap-2">
        {filterKeys.map((f) => (
          <button
            key={f}
            onClick={() => applyFilter(f)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
              filter === f
                ? "bg-brand-600 text-white shadow-sm"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {CUSTOMER_FILTER_LABELS[f]}
          </button>
        ))}
        <span className="text-xs text-gray-400 ml-1">{customers.length} clientes</span>
        <div className="ml-auto flex items-center gap-2">
          {customers.length > 0 && (
            <button
              onClick={() => exportCSV(customers)}
              className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Exportar CSV
            </button>
          )}
          <button
            onClick={onImportOpen}
            className="flex items-center gap-1.5 rounded-full bg-brand-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
            </svg>
            Importar
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400">Carregando…</div>
      ) : customers.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-400">Nenhum cliente neste filtro.</div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Tier</th>
                  <th className="px-4 py-3 text-right">Gasto total</th>
                  <th className="px-4 py-3 text-right">Pedidos</th>
                  <th className="px-4 py-3 text-right">Último pedido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/customers/${c.id}`} className="hover:text-brand-600 transition-colors">
                        <p className="font-semibold text-gray-900 text-sm">{c.name}</p>
                        <span className="text-[11px] text-gray-400">
                          {formatPhone(c.phone)}
                          <CopyPhoneButton phone={c.phone} />
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <TierBadge tier={c.tier} />
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      R${formatCurrency(c.totalSpend)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {c.totalOrders}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={c.daysSinceLastOrder != null && c.daysSinceLastOrder > 30
                        ? "text-red-500 font-medium"
                        : "text-gray-600"
                      }>
                        {relativeDate(c.lastOrderAt)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Tier legend */}
            <div className="border-t border-gray-50 px-4 py-3 flex flex-wrap gap-3">
              {tierOrder.map((t) => {
                const cfg = TIER_CONFIG[t];
                const count = customers.filter((c) => c.tier === t).length;
                return (
                  <span key={t} className="text-[11px] text-gray-500">
                    {cfg.icon} {cfg.label}: <strong>{count}</strong>
                  </span>
                );
              })}
            </div>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-2">
            {customers.map((c) => (
              <Link key={c.id} href={`/customers/${c.id}`}>
                <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">{c.name}</p>
                      <span className="text-xs text-gray-400">
                        {formatPhone(c.phone)}
                        <CopyPhoneButton phone={c.phone} />
                      </span>
                    </div>
                    <TierBadge tier={c.tier} />
                  </div>
                  <div className="mt-2 flex gap-4 text-xs text-gray-500">
                    <span>R${formatCurrency(c.totalSpend)}</span>
                    <span>{c.totalOrders} pedido{c.totalOrders !== 1 ? "s" : ""}</span>
                    <span className={c.daysSinceLastOrder != null && c.daysSinceLastOrder > 30 ? "text-red-500 font-medium" : ""}>
                      {relativeDate(c.lastOrderAt)}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {/* Reactivation Helper */}
      <ReactivationHelper customers={customers} reviewLinks={reviewLinks} />
    </div>
  );
}

// ── Main CRM Component ────────────────────────────────────────────────────────

// ── Avaliações Tab ────────────────────────────────────────────────────────────

const MOCK_REVIEWS = [
  { author: "Maria S.", stars: 5, text: "Comida incrível, entrega rápida! Voltarei com certeza.", date: "há 2 dias" },
  { author: "João P.",  stars: 5, text: "Atendimento excelente e pedido chegou quente.",          date: "há 5 dias" },
  { author: "Ana L.",   stars: 4, text: "Muito bom! Apenas a embalagem poderia ser melhor.",       date: "há 1 semana" },
];

function StarRating({ count }: { count: number }) {
  return (
    <span className="text-amber-400 text-base leading-none">
      {"★".repeat(count)}{"☆".repeat(5 - count)}
    </span>
  );
}

function AvaliacoesTab({
  googleReviewUrl,
  ifoodReviewUrl,
}: {
  googleReviewUrl: string | null;
  ifoodReviewUrl: string | null;
}) {
  const hasAnyLink = googleReviewUrl || ifoodReviewUrl;

  return (
    <div className="space-y-5">
      {/* Plataformas */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Google */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🌐</span>
            <h3 className="text-sm font-semibold text-gray-900">Google Reviews</h3>
          </div>
          {googleReviewUrl ? (
            <a
              href={googleReviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition"
            >
              Ver no Google →
            </a>
          ) : (
            <p className="text-xs text-gray-400">
              Link não configurado.{" "}
              <Link href="/settings/marca" className="text-brand-600 underline">Adicionar →</Link>
            </p>
          )}
          {/* Mocked reviews */}
          <div className="space-y-2 pt-1">
            {MOCK_REVIEWS.map((r) => (
              <div key={r.author} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-gray-800">{r.author}</p>
                  <span className="text-[10px] text-gray-400">{r.date}</span>
                </div>
                <StarRating count={r.stars} />
                <p className="mt-1 text-xs text-gray-600">{r.text}</p>
              </div>
            ))}
            <p className="text-[10px] text-gray-400 pt-1">
              * Avaliações de exemplo — integração real com a API do Google em breve.
            </p>
          </div>
        </div>

        {/* iFood */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🛵</span>
            <h3 className="text-sm font-semibold text-gray-900">iFood Avaliações</h3>
          </div>
          {ifoodReviewUrl ? (
            <a
              href={ifoodReviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 transition"
            >
              Ver no iFood →
            </a>
          ) : (
            <p className="text-xs text-gray-400">
              Link não configurado.{" "}
              <Link href="/settings/marca" className="text-brand-600 underline">Adicionar →</Link>
            </p>
          )}
          {/* Mocked reviews */}
          <div className="space-y-2 pt-1">
            {MOCK_REVIEWS.map((r) => (
              <div key={r.author} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-gray-800">{r.author}</p>
                  <span className="text-[10px] text-gray-400">{r.date}</span>
                </div>
                <StarRating count={r.stars} />
                <p className="mt-1 text-xs text-gray-600">{r.text}</p>
              </div>
            ))}
            <p className="text-[10px] text-gray-400 pt-1">
              * Avaliações de exemplo — integração real com a API do iFood em breve.
            </p>
          </div>
        </div>
      </div>

      {/* CTA para configurar links */}
      {!hasAnyLink && (
        <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50 p-4 text-center">
          <p className="text-sm font-medium text-amber-800">Configure seus links de avaliação</p>
          <p className="mt-1 text-xs text-amber-600">
            Acesse <Link href="/settings/marca" className="underline font-semibold">Configurações → Marca</Link>{" "}
            e cole os links do Google e iFood.
          </p>
        </div>
      )}

      {/* Template pós-venda */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">📨 Template Pós-Venda</h3>
        <p className="text-xs text-gray-500">Use este template nas campanhas de WhatsApp após o pedido.</p>
        <div className="rounded-lg border border-green-100 bg-green-50 p-4 font-mono text-xs text-green-800 whitespace-pre-wrap">
{`Olá {nome}, o que achou do seu pedido? 😊
Se puder, nos avalie — sua opinião faz toda a diferença!
${googleReviewUrl ? `\n⭐ Google: ${googleReviewUrl}` : "⭐ Google: [configure o link nas configurações]"}${ifoodReviewUrl ? `\n🛵 iFood: ${ifoodReviewUrl}` : ""}`}
        </div>
        <button
          onClick={() => {
            const txt = `Olá {nome}, o que achou do seu pedido? 😊\nSe puder, nos avalie — sua opinião faz toda a diferença!\n${googleReviewUrl ? `\n⭐ Google: ${googleReviewUrl}` : ""}${ifoodReviewUrl ? `\n🛵 iFood: ${ifoodReviewUrl}` : ""}`.trim();
            navigator.clipboard.writeText(txt);
          }}
          className="text-xs text-brand-600 underline hover:text-brand-700"
        >
          Copiar template
        </button>
      </div>
    </div>
  );
}

// ── Main CRM Component ────────────────────────────────────────────────────────

type Tab = "overview" | "opportunities" | "customers" | "agente" | "avaliacoes";

export function CRMClient({
  initialCustomers,
  initialOpportunities,
  overviewStats,
  opportunitiesCount,
  reviewLinks = { google: null, ifood: null },
}: {
  initialCustomers:     CRMCustomer[];
  initialOpportunities: Opportunity[];
  restaurantName:       string;
  overviewStats:        OverviewStats;
  opportunitiesCount:   number;
  reviewLinks?:         { google: string | null; ifood: string | null };
}) {
  const googleReviewUrl = reviewLinks.google;
  const ifoodReviewUrl  = reviewLinks.ifood;
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [showImport, setShowImport] = useState(false);
  const [customerFilter, setCustomerFilter] = useState<CRMFilter>("all");

  // ── Overview stats with date filter ────────────────────────────────────────
  const [currentStats, setCurrentStats] = useState<OverviewStats>(overviewStats);
  const [statsLoading, setStatsLoading] = useState(false);
  const [datePreset, setDatePreset] = useState<DateFilterPreset>("total");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo,   setCustomTo]   = useState("");

  async function handleDateChange(
    preset: DateFilterPreset,
    cfrom?: string,
    cto?: string,
  ) {
    setDatePreset(preset);
    if (cfrom !== undefined) setCustomFrom(cfrom);
    if (cto   !== undefined) setCustomTo(cto);

    if (preset === "custom" && (!cfrom || !cto)) return;

    let url = "/api/crm/overview-stats";
    if (preset !== "total") {
      const now = new Date();
      let from: string;
      let to: string;
      if (preset === "month") {
        from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        to   = now.toISOString();
      } else if (preset === "year") {
        from = new Date(now.getFullYear(), 0, 1).toISOString();
        to   = now.toISOString();
      } else {
        from = new Date(cfrom!).toISOString();
        to   = new Date(cto!  ).toISOString();
      }
      url += `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    }

    setStatsLoading(true);
    try {
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        setCurrentStats(json.data);
      }
    } finally {
      setStatsLoading(false);
    }
  }

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: "overview",      label: "Visão Geral" },
    { id: "opportunities", label: "Oportunidades", badge: initialOpportunities.length || undefined },
    { id: "customers",     label: "Clientes" },
    { id: "avaliacoes",    label: "Avaliações" },
    { id: "agente",        label: "Agente IA" },
  ];

  function goToInactive() {
    setCustomerFilter("inactive");
    setTab("customers");
  }

  function goToOpportunities() {
    setTab("opportunities");
  }

  return (
    <div className="p-6 max-w-4xl">

      {/* Tabs */}
      <div className="mb-5 flex gap-1 rounded-xl bg-gray-100 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-all ${
              tab === t.id
                ? "bg-white shadow-sm text-gray-900"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
            {t.badge != null && t.badge > 0 && (
              <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "overview" && (
        <OverviewTab
          stats={currentStats}
          opportunitiesCount={opportunitiesCount}
          loading={statsLoading}
          datePreset={datePreset}
          customFrom={customFrom}
          customTo={customTo}
          onDateChange={handleDateChange}
        />
      )}
      {tab === "opportunities" && (
        <OpportunitiesTab opportunities={initialOpportunities} />
      )}
      {tab === "customers" && (
        <CustomersTab
          key={customerFilter}
          initialCustomers={initialCustomers}
          initialFilter={customerFilter}
          onImportOpen={() => setShowImport(true)}
          reviewLinks={reviewLinks}
        />
      )}
      {tab === "avaliacoes" && (
        <AvaliacoesTab
          googleReviewUrl={googleReviewUrl}
          ifoodReviewUrl={ifoodReviewUrl}
        />
      )}
      {tab === "agente" && (
        <div className="space-y-6">

          {/* Dados coletados */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Dados coletados pelo agente</h2>
              <p className="mt-0.5 text-xs text-gray-500">O agente registra automaticamente cada interação.</p>
            </div>
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 space-y-2">
              <p className="text-sm font-medium text-blue-800">O agente coleta automaticamente:</p>
              <ul className="space-y-1.5 text-sm text-blue-700">
                {[
                  "Nome do cliente",
                  "Número de telefone",
                  "Última interação",
                  "Histórico de pedidos",
                  "Preferências alimentares (quando informadas)",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="text-green-500 font-bold">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-blue-500 pt-1">
                Veja os dados em{" "}
                <Link href="/customers" className="underline font-medium hover:text-blue-700">Clientes</Link>.
              </p>
            </div>
          </div>

          {/* Segmentação automática */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Segmentação automática</h2>
              <p className="mt-0.5 text-xs text-gray-500">O CRM agrupa clientes com base no comportamento de compra.</p>
            </div>
            <div className="space-y-2">
              {[
                { icon: "👑", label: "VIP",        desc: "Alto valor de compra e alta frequência" },
                { icon: "💤", label: "Inativos",    desc: "Sem pedidos nos últimos 30 dias" },
                { icon: "🌟", label: "Novos",       desc: "Primeiro pedido nos últimos 7 dias" },
                { icon: "🔁", label: "Recorrentes", desc: "Mais de 2 pedidos no histórico" },
              ].map((s) => (
                <div key={s.label} className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <span className="text-lg leading-none mt-0.5">{s.icon}</span>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{s.label}</p>
                    <p className="text-xs text-gray-500">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400">
              Configure reativação e aniversário em{" "}
              <Link href="/promotions" className="text-brand-600 underline hover:text-brand-700">
                Promoções
              </Link>.
            </p>
          </div>

          {/* Em breve */}
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Em breve</p>
            <p className="text-sm font-medium text-gray-700">Comportamentos automáticos de CRM</p>
            <p className="mt-1 text-xs text-gray-400">
              Reativação de inativos, mensagem de aniversário e follow-up pós-pedido configuráveis aqui.
            </p>
          </div>

        </div>
      )}

      <ImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onComplete={() => { setShowImport(false); router.refresh(); }}
      />
    </div>
  );
}
