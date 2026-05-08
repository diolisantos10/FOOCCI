"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type {
  TierStats,
  CloseToNextTierCustomer,
  TierSettingsInput,
  TierKey,
} from "@/services/crm/RelationshipProgramService";
import { DEFAULT_SETTINGS } from "@/services/crm/RelationshipProgramService";

// ─── Types ────────────────────────────────────────────────────────────────────

type Benefit = {
  id:          string;
  tier:        TierKey;
  title:       string;
  description: string | null;
  isActive:    boolean;
  sortOrder:   number;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const TIERS: TierKey[] = ["BRONZE", "PRATA", "OURO", "DIAMANTE"];

const TIER_META: Record<TierKey, {
  label: string; icon: string; bg: string; border: string; text: string; badgeBg: string;
}> = {
  BRONZE:   { label: "Bronze",   icon: "🥉", bg: "bg-orange-50",  border: "border-orange-200", text: "text-orange-700", badgeBg: "bg-orange-100" },
  PRATA:    { label: "Prata",    icon: "🥈", bg: "bg-gray-50",    border: "border-gray-200",   text: "text-gray-700",   badgeBg: "bg-gray-100"   },
  OURO:     { label: "Ouro",     icon: "🥇", bg: "bg-amber-50",   border: "border-amber-200",  text: "text-amber-700",  badgeBg: "bg-amber-100"  },
  DIAMANTE: { label: "Diamante", icon: "💎", bg: "bg-cyan-50",    border: "border-cyan-200",   text: "text-cyan-700",   badgeBg: "bg-cyan-100"   },
};

const SEGMENT_LABEL: Record<string, string> = {
  QUENTE:      "Quente 🔥",
  MORNO:       "Morno 🌤️",
  FRIO:        "Frio ❄️",
  SEM_PEDIDOS: "Sem pedidos",
};

// Deterministic action suggestions per tier
const TIER_ACTIONS: Record<TierKey, Array<{ objective: string; label: string; segment: string }>> = {
  BRONZE: [
    { label: "Incentivar segunda compra",       objective: "RECOMPRA",  segment: "TODOS" },
    { label: "Apresentar produtos mais vendidos", objective: "RECOMPRA",  segment: "TODOS" },
    { label: "Boas-vindas ao clube",             objective: "OUTRO",     segment: "TODOS" },
  ],
  PRATA: [
    { label: "Estimular recorrência semanal",   objective: "RECOMPRA",  segment: "MORNO" },
    { label: "Oferecer combo ou complemento",   objective: "TICKET",    segment: "QUENTE" },
    { label: "Reconhecer fidelidade crescente", objective: "RECOMPRA",  segment: "TODOS" },
  ],
  OURO: [
    { label: "Valorizar cliente frequente",     objective: "VIP",       segment: "QUENTE" },
    { label: "Oferecer experiência personalizada", objective: "VIP",    segment: "TODOS" },
    { label: "Bebida exclusiva ou brinde simbólico", objective: "BEBIDA", segment: "QUENTE" },
  ],
  DIAMANTE: [
    { label: "Mensagem VIP exclusiva do restaurante", objective: "VIP",      segment: "QUENTE" },
    { label: "Pedir avaliação no Google/iFood",       objective: "AVALIACAO", segment: "QUENTE" },
    { label: "Ação especial para clientes top",       objective: "VIP",       segment: "TODOS"  },
  ],
};

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtBRL(v: number) {
  return "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtNum(v: number, dec = 1) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: dec === 0 ? 0 : dec, maximumFractionDigits: dec === 0 ? 0 : dec });
}

function fmtPhone(phone: string) {
  const d = phone.replace(/\D/g, "");
  if (d.length === 13) return `+${d.slice(0,2)} (${d.slice(2,4)}) ${d.slice(4,9)}-${d.slice(9)}`;
  if (d.length === 12) return `+${d.slice(0,2)} (${d.slice(2,4)}) ${d.slice(4,8)}-${d.slice(8)}`;
  return phone;
}

function relDays(date: Date | null | string): string {
  if (!date) return "—";
  const d = Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
  if (d === 0) return "Hoje";
  if (d === 1) return "Ontem";
  if (d < 30)  return `${d}d atrás`;
  if (d < 365) return `${Math.floor(d / 30)}m atrás`;
  return `${Math.floor(d / 365)}a atrás`;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-4 rounded bg-gray-100" style={{ width: `${60 + (i % 3) * 15}%` }} />
      ))}
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, subtitle, children }: {
  title: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-bold text-gray-800">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

// ─── Tier overview cards ──────────────────────────────────────────────────────

function TierCard({ stat }: { stat: TierStats }) {
  const m = TIER_META[stat.tier];
  return (
    <div className={`rounded-xl border p-4 ${m.bg} ${m.border}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xl">{m.icon}</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${m.badgeBg} ${m.text}`}>
          {stat.customerCount} {stat.customerCount === 1 ? "cliente" : "clientes"}
        </span>
      </div>
      <p className={`text-sm font-bold ${m.text}`}>{m.label}</p>
      <p className="text-[11px] text-gray-500 mt-0.5 leading-tight">{stat.description}</p>
      <div className="mt-3 space-y-1 border-t border-gray-200 pt-2">
        <p className="text-[11px] text-gray-500">
          Receita total: <span className="font-semibold text-gray-700">{fmtBRL(stat.totalRevenue)}</span>
        </p>
        <p className="text-[11px] text-gray-500">
          Ticket médio: <span className="font-semibold text-gray-700">{fmtBRL(stat.avgTicket)}</span>
        </p>
        <p className="text-[11px] text-gray-500">
          Pedidos médios: <span className="font-semibold text-gray-700">{fmtNum(stat.avgOrders)}</span>
        </p>
        {stat.tier !== "BRONZE" && (
          <p className="text-[11px] text-gray-400 mt-1">
            A partir de {fmtBRL(stat.minSpend)}
            {stat.minOrders > 0 ? ` ou ${stat.minOrders} pedidos` : ""}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Tier settings form ───────────────────────────────────────────────────────

function TierSettingsForm({
  initial,
  onSaved,
}: {
  initial: TierSettingsInput;
  onSaved: (settings: TierSettingsInput) => void;
}) {
  const [form, setForm]     = useState<TierSettingsInput>(initial);
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  useEffect(() => { setForm(initial); }, [initial]);

  function set(key: keyof TierSettingsInput, value: string) {
    setForm((prev) => ({ ...prev, [key]: Number(value) }));
    setSaved(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res  = await fetch("/api/crm/relationship/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json() as { data?: TierSettingsInput; error?: string };
      if (!res.ok || json.error) { setError(json.error ?? "Erro ao salvar"); return; }
      setSaved(true);
      onSaved(json.data!);
    } catch {
      setError("Falha de rede. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  const ROWS: Array<{ key: keyof TierSettingsInput; label: string; spendKey: keyof TierSettingsInput; ordersKey: keyof TierSettingsInput; tier: TierKey }> = [
    { key: "silverMinSpend", label: "Prata",    spendKey: "silverMinSpend",   ordersKey: "silverMinOrders",   tier: "PRATA"    },
    { key: "goldMinSpend",   label: "Ouro",     spendKey: "goldMinSpend",     ordersKey: "goldMinOrders",     tier: "OURO"     },
    { key: "diamondMinSpend",label: "Diamante", spendKey: "diamondMinSpend",  ordersKey: "diamondMinOrders",  tier: "DIAMANTE" },
  ];

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-xs text-gray-400">
              <th className="px-4 py-2.5 font-medium">Nível</th>
              <th className="px-4 py-2.5 font-medium">Gasto mínimo (R$)</th>
              <th className="px-4 py-2.5 font-medium">Pedidos mínimos</th>
              <th className="px-4 py-2.5 font-medium text-gray-300">Lógica</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            <tr>
              <td className="px-4 py-3 text-orange-600 font-medium text-sm">🥉 Bronze</td>
              <td className="px-4 py-3 text-gray-400 text-xs" colSpan={3}>Padrão — todos os novos clientes</td>
            </tr>
            {ROWS.map((row) => {
              const m = TIER_META[row.tier];
              return (
                <tr key={row.tier}>
                  <td className={`px-4 py-3 font-medium text-sm ${m.text}`}>{m.icon} {row.label}</td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min={0}
                      step={50}
                      value={form[row.spendKey]}
                      onChange={(e) => set(row.spendKey, e.target.value)}
                      className="w-28 rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:border-indigo-400 focus:outline-none"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={form[row.ordersKey]}
                      onChange={(e) => set(row.ordersKey, e.target.value)}
                      className="w-20 rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:border-indigo-400 focus:outline-none"
                      placeholder="0 = off"
                    />
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">OU</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">
        Regra: cliente sobe de nível se atingir o gasto mínimo <strong>OU</strong> o número de pedidos mínimos (se configurado). 0 pedidos = considera apenas o gasto.
      </p>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? "Salvando…" : "Salvar configurações"}
        </button>
        {saved && <span className="text-xs text-green-600 font-medium">✓ Salvo com sucesso</span>}
      </div>
    </form>
  );
}

// ─── Benefits panel ───────────────────────────────────────────────────────────

const DEFAULT_BENEFITS: Record<TierKey, Array<{ title: string; description: string }>> = {
  BRONZE:   [{ title: "Acesso ao Clube de Clientes",                description: "Bem-vindo à comunidade do restaurante" }],
  PRATA:    [{ title: "Condições especiais em campanhas selecionadas", description: "Acesso antecipado a promoções" }],
  OURO:     [{ title: "Atendimento prioritário e ações exclusivas",  description: "Reconhecimento de cliente fiel" }],
  DIAMANTE: [{ title: "Benefícios VIP e ofertas personalizadas",     description: "Experiência exclusiva para clientes top" }],
};

function BenefitsPanel({
  tier,
  benefits,
  onAdded,
  onDeleted,
  onToggled,
}: {
  tier:      TierKey;
  benefits:  Benefit[];
  onAdded:   (b: Benefit) => void;
  onDeleted: (id: string) => void;
  onToggled: (id: string, active: boolean) => void;
}) {
  const m = TIER_META[tier];
  const [adding, setAdding]   = useState(false);
  const [title,  setTitle]    = useState("");
  const [desc,   setDesc]     = useState("");
  const [saving, setSaving]   = useState(false);
  const [error,  setError]    = useState<string | null>(null);

  async function handleAdd() {
    if (!title.trim()) return;
    setSaving(true); setError(null);
    try {
      const res  = await fetch("/api/crm/relationship/benefits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, title: title.trim(), description: desc.trim() || undefined }),
      });
      const json = await res.json() as { data?: Benefit; error?: string };
      if (!res.ok || json.error) { setError(json.error ?? "Erro"); return; }
      onAdded(json.data!);
      setTitle(""); setDesc(""); setAdding(false);
    } catch {
      setError("Falha de rede.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/crm/relationship/benefits/${id}`, { method: "DELETE" });
    if (res.ok) onDeleted(id);
  }

  async function handleToggle(id: string, current: boolean) {
    const res = await fetch(`/api/crm/relationship/benefits/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !current }),
    });
    if (res.ok) onToggled(id, !current);
  }

  return (
    <div className={`rounded-xl border p-4 ${m.border} ${m.bg}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">{m.icon}</span>
          <span className={`text-sm font-bold ${m.text}`}>{m.label}</span>
        </div>
        <button
          onClick={() => setAdding((v) => !v)}
          className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
        >
          + Adicionar
        </button>
      </div>

      {benefits.length === 0 && !adding && (
        <div className="space-y-1">
          {DEFAULT_BENEFITS[tier].map((d) => (
            <div key={d.title} className="rounded-lg border border-dashed border-gray-200 bg-white px-3 py-2 opacity-50">
              <p className="text-xs font-medium text-gray-600">{d.title}</p>
              {d.description && <p className="text-[10px] text-gray-400">{d.description}</p>}
            </div>
          ))}
          <p className="text-[10px] text-gray-400 mt-1">Sugestões — clique em "+ Adicionar" para personalizar</p>
        </div>
      )}

      <div className="space-y-1.5">
        {benefits.map((b) => (
          <div key={b.id} className={`flex items-start justify-between gap-2 rounded-lg border bg-white px-3 py-2 ${b.isActive ? "border-gray-200" : "border-gray-100 opacity-50"}`}>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-800 truncate">{b.title}</p>
              {b.description && <p className="text-[10px] text-gray-500 truncate">{b.description}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                onClick={() => handleToggle(b.id, b.isActive)}
                className={`text-[10px] font-medium ${b.isActive ? "text-green-600" : "text-gray-400"}`}
                title={b.isActive ? "Ativo" : "Inativo"}
              >
                {b.isActive ? "✓ Ativo" : "Inativo"}
              </button>
              <button
                onClick={() => handleDelete(b.id)}
                className="text-[10px] text-red-400 hover:text-red-600"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      {adding && (
        <div className="mt-3 space-y-2 rounded-lg border border-indigo-100 bg-white p-3">
          <input
            type="text"
            placeholder="Título do benefício"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:border-indigo-400 focus:outline-none"
            maxLength={120}
          />
          <input
            type="text"
            placeholder="Descrição (opcional)"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:border-indigo-400 focus:outline-none"
            maxLength={300}
          />
          {error && <p className="text-[10px] text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={saving || !title.trim()}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? "Salvando…" : "Salvar"}
            </button>
            <button
              onClick={() => { setAdding(false); setTitle(""); setDesc(""); setError(null); }}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-[11px] font-medium text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Close to next tier table ─────────────────────────────────────────────────

function CloseToNextTierTable({ customers }: { customers: CloseToNextTierCustomer[] }) {
  if (customers.length === 0) {
    return (
      <div className="rounded-xl border border-gray-100 bg-gray-50 py-10 text-center">
        <p className="text-sm text-gray-400">Nenhum cliente próximo de subir de nível no momento.</p>
        <p className="text-xs text-gray-300 mt-1">Os clientes aparecerão aqui quando estiverem a até 15% do próximo nível.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b bg-gray-50 text-left text-gray-400">
            <th className="px-4 py-2.5 font-medium">Cliente</th>
            <th className="px-4 py-2.5 font-medium">Nível atual</th>
            <th className="px-4 py-2.5 font-medium">Próximo</th>
            <th className="px-4 py-2.5 font-medium text-right">Gasto</th>
            <th className="px-4 py-2.5 font-medium text-right">Falta</th>
            <th className="px-4 py-2.5 font-medium">Segmento</th>
            <th className="px-4 py-2.5 font-medium">Último pedido</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {customers.map((c) => {
            const curr = TIER_META[c.currentTier];
            const next = TIER_META[c.nextTier];
            return (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-800">{c.name}</p>
                  <p className="text-gray-400">{fmtPhone(c.phone)}</p>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${curr.badgeBg} ${curr.text}`}>
                    {curr.icon} {curr.label}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${next.badgeBg} ${next.text}`}>
                    {next.icon} {next.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-medium text-gray-700">{fmtBRL(c.totalSpend)}</td>
                <td className="px-4 py-3 text-right">
                  <span className="font-semibold text-rose-600">{fmtBRL(c.missingSpend)}</span>
                  {c.missingOrders > 0 && (
                    <span className="block text-[10px] text-gray-400">ou {c.missingOrders} pedidos</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-500">{SEGMENT_LABEL[c.segment] ?? c.segment}</td>
                <td className="px-4 py-3 text-gray-400">{relDays(c.lastOrderAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Recommended actions ──────────────────────────────────────────────────────

function RecommendedActions() {
  const router = useRouter();

  function goToAcoes(objective: string, segment: string) {
    router.push(`/crm?tab=acoes&objective=${objective}&segment=${segment}`);
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {TIERS.map((tier) => {
        const m       = TIER_META[tier];
        const actions = TIER_ACTIONS[tier];
        return (
          <div key={tier} className={`rounded-xl border p-4 ${m.border} ${m.bg}`}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base">{m.icon}</span>
              <span className={`text-sm font-bold ${m.text}`}>{m.label}</span>
            </div>
            <ul className="space-y-2">
              {actions.map((action) => (
                <li key={action.label}>
                  <button
                    onClick={() => goToAcoes(action.objective, action.segment)}
                    className="w-full rounded-lg border border-white bg-white px-3 py-2 text-left text-xs font-medium text-gray-700 shadow-sm hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                  >
                    {action.label} →
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

// ─── Recalculate button ───────────────────────────────────────────────────────

function RecalculateButton({ onDone }: { onDone: () => void }) {
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState<string | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  async function handleClick() {
    setLoading(true); setResult(null); setError(null);
    try {
      const res  = await fetch("/api/crm/relationship/recalculate", { method: "POST" });
      const json = await res.json() as { data?: { updated: number }; error?: string };
      if (!res.ok || json.error) { setError(json.error ?? "Erro"); return; }
      setResult(`${json.data!.updated} clientes recalculados.`);
      onDone();
    } catch {
      setError("Falha de rede.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={handleClick}
        disabled={loading}
        className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
      >
        {loading ? "Recalculando…" : "🔄 Recalcular níveis"}
      </button>
      {result && <span className="text-xs text-green-600 font-medium">✓ {result}</span>}
      {error  && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ProgramaTab() {
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [tiers,       setTiers]       = useState<TierStats[]>([]);
  const [closeList,   setCloseList]   = useState<CloseToNextTierCustomer[]>([]);
  const [settings,    setSettings]    = useState<TierSettingsInput>(DEFAULT_SETTINGS);
  const [benefits,    setBenefits]    = useState<Benefit[]>([]);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const loadOverview = useCallback(async () => {
    try {
      const res  = await fetch("/api/crm/relationship/overview");
      const json = await res.json() as { data?: { tiers: TierStats[]; closeToNextTier: CloseToNextTierCustomer[] }; error?: string };
      if (res.ok && json.data) {
        setTiers(json.data.tiers);
        setCloseList(json.data.closeToNextTier);
      }
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    async function loadAll() {
      setLoading(true); setError(null);
      try {
        const [ovRes, sRes, bRes] = await Promise.all([
          fetch("/api/crm/relationship/overview"),
          fetch("/api/crm/relationship/settings"),
          fetch("/api/crm/relationship/benefits"),
        ]);
        const [ovJson, sJson, bJson] = await Promise.all([
          ovRes.json() as Promise<{ data?: { tiers: TierStats[]; closeToNextTier: CloseToNextTierCustomer[] }; error?: string }>,
          sRes.json()  as Promise<{ data?: TierSettingsInput; error?: string }>,
          bRes.json()  as Promise<{ data?: Benefit[]; error?: string }>,
        ]);
        if (ovJson.data) { setTiers(ovJson.data.tiers); setCloseList(ovJson.data.closeToNextTier); }
        if (sJson.data)  { setSettings(sJson.data); setSettingsLoaded(true); }
        if (bJson.data)  setBenefits(bJson.data);
      } catch (err) {
        setError("Falha ao carregar programa de relacionamento.");
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    void loadAll();
  }, []);

  // Benefits helpers
  function handleBenefitAdded(b: Benefit) {
    setBenefits((prev) => [...prev, b]);
  }
  function handleBenefitDeleted(id: string) {
    setBenefits((prev) => prev.filter((b) => b.id !== id));
  }
  function handleBenefitToggled(id: string, active: boolean) {
    setBenefits((prev) => prev.map((b) => b.id === id ? { ...b, isActive: active } : b));
  }

  const totalCustomers = tiers.reduce((s, t) => s + t.customerCount, 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-purple-50 px-5 py-5">
        <div className="flex items-center gap-3 mb-1.5">
          <span className="text-3xl">🤝</span>
          <div>
            <h2 className="text-base font-bold text-gray-900">Programa de Relacionamento</h2>
            <p className="text-xs text-gray-500">Configure níveis, benefícios e estratégias para aumentar a recorrência dos seus clientes.</p>
          </div>
        </div>
        {!loading && totalCustomers > 0 && (
          <p className="text-xs text-indigo-600 font-medium mt-2">
            {totalCustomers} clientes ativos classificados em 4 níveis
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* 1. Resumo dos níveis */}
      <Section
        title="Resumo dos níveis"
        subtitle="Distribuição atual dos clientes por nível de relacionamento"
      >
        {loading ? <Skeleton rows={4} /> : tiers.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">
            Os níveis serão preenchidos conforme os clientes fizerem pedidos ou uma base for importada.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {tiers.map((t) => <TierCard key={t.tier} stat={t} />)}
          </div>
        )}
      </Section>

      {/* 2. Regras dos níveis + configuração */}
      <Section
        title="Regras dos níveis"
        subtitle={
          settingsLoaded
            ? "Configuração personalizada ativa. Edite abaixo e clique em Salvar."
            : "Usando regras padrão. Você pode personalizar os limiares abaixo."
        }
      >
        {loading ? <Skeleton rows={5} /> : (
          <TierSettingsForm
            initial={settings}
            onSaved={(s) => { setSettings(s); setSettingsLoaded(true); }}
          />
        )}
      </Section>

      {/* Recalculate */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-xs font-semibold text-gray-700 mb-2">Recalcular todos os níveis</p>
        <p className="text-xs text-gray-500 mb-3">
          Aplica as regras atuais a todos os clientes. Use após salvar novas configurações.
        </p>
        <RecalculateButton onDone={loadOverview} />
      </div>

      {/* 3. Benefícios por nível */}
      <Section
        title="Benefícios por nível"
        subtitle="Configure o que cada nível oferece. Uso interno por enquanto — visibilidade pública em breve."
      >
        {loading ? <Skeleton rows={4} /> : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {TIERS.map((tier) => (
              <BenefitsPanel
                key={tier}
                tier={tier}
                benefits={benefits.filter((b) => b.tier === tier)}
                onAdded={handleBenefitAdded}
                onDeleted={handleBenefitDeleted}
                onToggled={handleBenefitToggled}
              />
            ))}
          </div>
        )}
      </Section>

      {/* 4. Próximos do próximo nível */}
      <Section
        title="Próximos do próximo nível"
        subtitle="Clientes a menos de 15% de subir de tier — oportunidade de ação imediata"
      >
        {loading ? <Skeleton rows={5} /> : <CloseToNextTierTable customers={closeList} />}
      </Section>

      {/* 5. Ações recomendadas */}
      <Section
        title="Ações recomendadas por nível"
        subtitle="Clique em uma ação para criar no CRM > Ações"
      >
        <RecommendedActions />
      </Section>
    </div>
  );
}
