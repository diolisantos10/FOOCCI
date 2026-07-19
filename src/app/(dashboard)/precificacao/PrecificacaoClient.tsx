"use client";

/**
 * CMV & Precificação — painel do lojista (/precificacao).
 *
 * Bloco A · Custos & Fórmula — premissas do negócio → markup ao vivo + CMV do período
 * Bloco B · Preços do cardápio — custo por item, CMV%, preço ideal, aplicar (1 ou em massa)
 * Bloco C · Automação — dispositivo de reprecificação (Desligado / Sugerir / Automático),
 *           arredondamento, trava de variação e histórico auditado
 *
 * A tabela calcula as sugestões com as premissas SALVAS (o servidor recalcula
 * tudo ao aplicar — o cliente nunca envia preço). O preview do markup no Bloco A
 * reage ao rascunho em edição.
 */

import { useMemo, useState } from "react";
import { Button, Card, ConfirmDialog, EmptyState, Pill } from "@/components/ui";
import {
  CMV_HEALTHY_MAX_PCT,
  CMV_HEALTHY_MIN_PCT,
  classifyPrice,
  cmvPct,
  computeFixedPct,
  computeMarkup,
  idealPrice,
  periodCmvPct,
  type PriceStatus,
  type RoundingMode,
} from "@/services/menu/PricingEngine";

// ── DTOs (serialized by the RSC / API routes) ─────────────────────────────────

export type AutoMode = "OFF" | "SUGGEST" | "AUTO";

export interface PricingConfigDTO {
  monthlyRevenue: number | null;
  fixedExpensesMonthly: number | null;
  taxesFeesPct: number;
  targetProfitPct: number;
  autoRepriceMode: AutoMode;
  rounding: RoundingMode;
  maxAutoChangePct: number;
  periodOpeningStock: number | null;
  periodPurchases: number | null;
  periodClosingStock: number | null;
  periodRevenue: number | null;
}

export interface PricingItemDTO {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  price: number;
  cost: number | null;
  hasVariants: boolean;
}

export interface PriceLogDTO {
  id: string;
  itemName: string;
  oldPrice: number | null;
  newPrice: number | null;
  oldCost: number | null;
  newCost: number | null;
  source: "MANUAL" | "APPLIED" | "AUTO" | "COST_EDIT";
  createdAt: string;
}

interface ItemStateDTO {
  id: string;
  price: number;
  cost: number | null;
}

interface RepriceOutcomeDTO {
  applied: number;
  heldByGuardrail: number;
  skipped: number;
  changedIds: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function apiFetch(url: string, method: string, body?: object) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error ?? `Request failed (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtPct = (n: number) =>
  `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/** "" → null; anything else → number (2 dp) or null when unparseable. */
function parseMoney(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

const numToInput = (n: number | null): string => (n === null ? "" : String(n));

const INPUT_CLS =
  "w-full rounded-lg border border-line2 bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-brand-400 disabled:bg-[#F4F4F2] disabled:text-muted";

function InlineError({ message }: { message: string }) {
  return (
    <p className="mt-2 rounded bg-red-50 px-3 py-1.5 text-xs text-red-600">{message}</p>
  );
}

function InlineSuccess({ message }: { message: string }) {
  return (
    <p className="mt-2 rounded bg-green-50 px-3 py-1.5 text-xs text-green-700">{message}</p>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12.5px] font-semibold text-ink2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11.5px] text-muted">{hint}</span>}
    </label>
  );
}

// ── Config draft (string-typed for inputs) ────────────────────────────────────

interface ConfigDraft {
  monthlyRevenue: string;
  fixedExpensesMonthly: string;
  taxesFeesPct: string;
  targetProfitPct: string;
  autoRepriceMode: AutoMode;
  rounding: RoundingMode;
  maxAutoChangePct: string;
  periodOpeningStock: string;
  periodPurchases: string;
  periodClosingStock: string;
  periodRevenue: string;
}

function toDraft(c: PricingConfigDTO): ConfigDraft {
  return {
    monthlyRevenue: numToInput(c.monthlyRevenue),
    fixedExpensesMonthly: numToInput(c.fixedExpensesMonthly),
    taxesFeesPct: String(c.taxesFeesPct),
    targetProfitPct: String(c.targetProfitPct),
    autoRepriceMode: c.autoRepriceMode,
    rounding: c.rounding,
    maxAutoChangePct: String(c.maxAutoChangePct),
    periodOpeningStock: numToInput(c.periodOpeningStock),
    periodPurchases: numToInput(c.periodPurchases),
    periodClosingStock: numToInput(c.periodClosingStock),
    periodRevenue: numToInput(c.periodRevenue),
  };
}

function toPayload(d: ConfigDraft) {
  return {
    monthlyRevenue: parseMoney(d.monthlyRevenue),
    fixedExpensesMonthly: parseMoney(d.fixedExpensesMonthly),
    taxesFeesPct: parseMoney(d.taxesFeesPct) ?? 0,
    targetProfitPct: parseMoney(d.targetProfitPct) ?? 0,
    autoRepriceMode: d.autoRepriceMode,
    rounding: d.rounding,
    maxAutoChangePct: parseMoney(d.maxAutoChangePct) ?? 15,
    periodOpeningStock: parseMoney(d.periodOpeningStock),
    periodPurchases: parseMoney(d.periodPurchases),
    periodClosingStock: parseMoney(d.periodClosingStock),
    periodRevenue: parseMoney(d.periodRevenue),
  };
}

// ── Derived row ───────────────────────────────────────────────────────────────

interface Row extends PricingItemDTO {
  cmv: number | null;
  ideal: number | null;
  diff: number | null; // ideal − price
  status: PriceStatus | null;
}

const SOURCE_LABEL: Record<PriceLogDTO["source"], string> = {
  MANUAL: "manual",
  APPLIED: "sugestão aplicada",
  AUTO: "automático",
  COST_EDIT: "custo atualizado",
};

// ── Component ─────────────────────────────────────────────────────────────────

export function PrecificacaoClient({
  initialConfig,
  initialItems,
  initialLogs,
  canEdit,
}: {
  initialConfig: PricingConfigDTO;
  initialItems: PricingItemDTO[];
  initialLogs: PriceLogDTO[];
  canEdit: boolean;
}) {
  const [savedConfig, setSavedConfig] = useState<PricingConfigDTO>(initialConfig);
  const [draft, setDraft] = useState<ConfigDraft>(() => toDraft(initialConfig));
  const [items, setItems] = useState<PricingItemDTO[]>(initialItems);
  const [costDrafts, setCostDrafts] = useState<Record<string, string>>({});
  const [logs, setLogs] = useState<PriceLogDTO[]>(initialLogs);

  const [tab, setTab] = useState<"formula" | "precos" | "automacao">("formula");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const [savingConfig, setSavingConfig] = useState(false);
  const [savingCosts, setSavingCosts] = useState(false);
  const [applyingIds, setApplyingIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [autoModeConfirmOpen, setAutoModeConfirmOpen] = useState(false);

  const [configMsg, setConfigMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [tableMsg, setTableMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const set = (patch: Partial<ConfigDraft>) => setDraft((d) => ({ ...d, ...patch }));

  // ── Derived: markup (draft = live preview; saved = what the table uses) ──
  const draftFixedPct = computeFixedPct(
    parseMoney(draft.monthlyRevenue),
    parseMoney(draft.fixedExpensesMonthly)
  );
  const draftMarkup = computeMarkup({
    fixedPct: draftFixedPct ?? 0,
    taxesFeesPct: parseMoney(draft.taxesFeesPct) ?? 0,
    targetProfitPct: parseMoney(draft.targetProfitPct) ?? 0,
  });
  const draftMarkupValue =
    draftMarkup && draftMarkup.totalPct > 0 ? draftMarkup.markup : null;

  const savedMarkup = useMemo(() => {
    const fixedPct =
      computeFixedPct(savedConfig.monthlyRevenue, savedConfig.fixedExpensesMonthly) ?? 0;
    const r = computeMarkup({
      fixedPct,
      taxesFeesPct: savedConfig.taxesFeesPct,
      targetProfitPct: savedConfig.targetProfitPct,
    });
    return r && r.totalPct > 0 ? r.markup : null;
  }, [savedConfig]);

  const configDirty = useMemo(
    () => JSON.stringify(toPayload(draft)) !== JSON.stringify(toPayload(toDraft(savedConfig))),
    [draft, savedConfig]
  );

  const periodCmv = periodCmvPct({
    openingStock: parseMoney(draft.periodOpeningStock),
    purchases: parseMoney(draft.periodPurchases),
    closingStock: parseMoney(draft.periodClosingStock),
    revenue: parseMoney(draft.periodRevenue),
  });

  // ── Derived: table rows ──
  const rows: Row[] = useMemo(
    () =>
      items.map((item) => {
        const ideal = idealPrice(item.cost, savedMarkup, savedConfig.rounding);
        return {
          ...item,
          cmv: cmvPct(item.cost, item.price),
          ideal,
          diff: ideal === null ? null : Math.round((ideal - item.price) * 100) / 100,
          status: ideal === null ? null : classifyPrice(item.price, ideal),
        };
      }),
    [items, savedMarkup, savedConfig.rounding]
  );

  const belowRows = rows.filter((r) => r.status === "BELOW");
  const pendingCount = belowRows.length;
  const pendingGain = belowRows.reduce((sum, r) => sum + (r.diff ?? 0), 0);

  const categories = useMemo(() => {
    const map = new Map<string, string>();
    items.forEach((i) => map.set(i.categoryId, i.categoryName));
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [items]);

  const visibleRows = rows.filter((r) => {
    if (categoryFilter && r.categoryId !== categoryFilter) return false;
    if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const dirtyCosts = useMemo(() => {
    const changes: Array<{ id: string; cost: number | null }> = [];
    for (const [id, value] of Object.entries(costDrafts)) {
      const item = items.find((i) => i.id === id);
      if (!item) continue;
      const parsed = parseMoney(value);
      if (parsed !== item.cost) changes.push({ id, cost: parsed });
    }
    return changes;
  }, [costDrafts, items]);

  // ── Actions ──
  function mergeItems(updates: ItemStateDTO[]) {
    if (updates.length === 0) return;
    const byId = new Map(updates.map((u) => [u.id, u]));
    setItems((prev) =>
      prev.map((item) => {
        const u = byId.get(item.id);
        return u ? { ...item, price: u.price, cost: u.cost } : item;
      })
    );
  }

  async function refreshLogs() {
    try {
      const res = await apiFetch("/api/pricing/history", "GET");
      if (res?.success) setLogs(res.data);
    } catch {
      // histórico é informativo — não bloqueia a ação principal
    }
  }

  async function saveConfig() {
    // Switching the device to AUTO deserves an explicit confirmation.
    if (draft.autoRepriceMode === "AUTO" && savedConfig.autoRepriceMode !== "AUTO") {
      setAutoModeConfirmOpen(true);
      return;
    }
    await doSaveConfig();
  }

  async function doSaveConfig() {
    setAutoModeConfirmOpen(false);
    setSavingConfig(true);
    setConfigMsg(null);
    try {
      const res = await apiFetch("/api/pricing/config", "PUT", toPayload(draft));
      const { config, auto, items: freshItems } = res.data as {
        config: PricingConfigDTO;
        auto: RepriceOutcomeDTO | null;
        items: ItemStateDTO[];
      };
      setSavedConfig(config);
      setDraft(toDraft(config));
      mergeItems(freshItems);
      let text = "Premissas salvas.";
      if (auto && auto.applied > 0) text += ` ${auto.applied} preço(s) atualizados automaticamente.`;
      if (auto && auto.heldByGuardrail > 0)
        text += ` ${auto.heldByGuardrail} ficaram como sugestão (variação acima da trava).`;
      setConfigMsg({ ok: true, text });
      if (auto && auto.applied > 0) void refreshLogs();
    } catch (err) {
      setConfigMsg({ ok: false, text: err instanceof Error ? err.message : "Erro ao salvar." });
    } finally {
      setSavingConfig(false);
    }
  }

  async function saveCosts() {
    if (dirtyCosts.length === 0) return;
    setSavingCosts(true);
    setTableMsg(null);
    try {
      const res = await apiFetch("/api/pricing/costs", "PATCH", { items: dirtyCosts });
      const { updated, auto, items: freshItems } = res.data as {
        updated: number;
        auto: RepriceOutcomeDTO | null;
        items: ItemStateDTO[];
      };
      mergeItems(freshItems);
      setCostDrafts({});
      let text = `${updated} custo(s) salvos.`;
      if (auto && auto.applied > 0) text += ` ${auto.applied} preço(s) atualizados automaticamente.`;
      if (auto && auto.heldByGuardrail > 0)
        text += ` ${auto.heldByGuardrail} ficaram como sugestão (variação acima da trava de ${fmtPct(savedConfig.maxAutoChangePct)}).`;
      setTableMsg({ ok: true, text });
      void refreshLogs();
    } catch (err) {
      setTableMsg({ ok: false, text: err instanceof Error ? err.message : "Erro ao salvar custos." });
    } finally {
      setSavingCosts(false);
    }
  }

  async function applyPrices(ids: string[]) {
    setTableMsg(null);
    setApplyingIds((prev) => new Set([...Array.from(prev), ...ids]));
    try {
      const res = await apiFetch("/api/pricing/apply", "POST", { itemIds: ids });
      const data = res.data as RepriceOutcomeDTO & { items: ItemStateDTO[] };
      mergeItems(data.items);
      setTableMsg({
        ok: true,
        text:
          data.applied > 0
            ? `${data.applied} preço(s) atualizados para o ideal.`
            : "Nenhum preço precisou mudar.",
      });
      void refreshLogs();
    } catch (err) {
      setTableMsg({ ok: false, text: err instanceof Error ? err.message : "Erro ao aplicar." });
    } finally {
      setApplyingIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    }
  }

  // ── Render ──
  const tabs = [
    { key: "formula" as const, label: "Custos & Fórmula" },
    { key: "precos" as const, label: "Preços do cardápio", badge: pendingCount },
    { key: "automacao" as const, label: "Automação" },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 lg:p-6">
      {!canEdit && (
        <Card className="border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-700">
          Somente o dono ou gerente pode editar custos, premissas e aplicar preços. Você está
          em modo de visualização.
        </Card>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-[13.5px] font-semibold transition-colors ${
              tab === t.key
                ? "border-brand-500 text-brand-600"
                : "border-transparent text-ink2 hover:text-ink"
            }`}
          >
            {t.label}
            {t.badge !== undefined && t.badge > 0 && (
              <span className="rounded-full bg-brand-500 px-1.5 text-[10.5px] font-bold text-white">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── BLOCO A · Custos & Fórmula ─────────────────────────────────── */}
      {tab === "formula" && (
        <div className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
            <Card className="p-5">
              <h3 className="text-[15px] font-bold text-ink">Premissas do negócio</h3>
              <p className="mt-0.5 text-[12.5px] text-muted">
                Percentuais sobre o preço de venda. Eles alimentam a fórmula do markup:
                preço ideal = custo × markup.
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field
                  label="Faturamento médio mensal (R$)"
                  hint="Usado para converter suas despesas fixas em %"
                >
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className={INPUT_CLS}
                    value={draft.monthlyRevenue}
                    onChange={(e) => set({ monthlyRevenue: e.target.value })}
                    disabled={!canEdit}
                    placeholder="85000"
                  />
                </Field>
                <Field
                  label="Despesas fixas mensais (R$)"
                  hint={
                    draftFixedPct !== null
                      ? `Equivale a ${fmtPct(draftFixedPct)} do faturamento`
                      : "Aluguel, equipe, luz, contador…"
                  }
                >
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className={INPUT_CLS}
                    value={draft.fixedExpensesMonthly}
                    onChange={(e) => set({ fixedExpensesMonthly: e.target.value })}
                    disabled={!canEdit}
                    placeholder="17000"
                  />
                </Field>
                <Field label="Impostos + taxas (%)" hint="Simples, cartão, apps de entrega">
                  <input
                    type="number"
                    min={0}
                    max={99}
                    step="0.1"
                    className={INPUT_CLS}
                    value={draft.taxesFeesPct}
                    onChange={(e) => set({ taxesFeesPct: e.target.value })}
                    disabled={!canEdit}
                  />
                </Field>
                <Field label="Margem de lucro desejada (%)" hint="Quanto deve sobrar de cada venda">
                  <input
                    type="number"
                    min={0}
                    max={99}
                    step="0.1"
                    className={INPUT_CLS}
                    value={draft.targetProfitPct}
                    onChange={(e) => set({ targetProfitPct: e.target.value })}
                    disabled={!canEdit}
                  />
                </Field>
              </div>
              {draftMarkup === null && (
                <InlineError message="As premissas somam 100% ou mais do preço — impossível precificar. Reduza algum percentual." />
              )}
            </Card>

            <Card className="flex flex-col items-center justify-center gap-1.5 p-5 text-center">
              <p className="text-[11.5px] font-semibold uppercase tracking-[.06em] text-muted">
                Seu markup
              </p>
              <p className="text-[44px] font-extrabold leading-none tracking-[-.03em] text-ink">
                {draftMarkupValue !== null
                  ? `${draftMarkupValue.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}×`
                  : "—"}
              </p>
              <p className="max-w-[24ch] text-[12.5px] text-muted">
                {draftMarkupValue !== null
                  ? `Cada R$ 1,00 de custo deve virar ${fmtBRL(draftMarkupValue)} de preço no cardápio.`
                  : "Preencha as premissas para calcular o multiplicador."}
              </p>
              {draftMarkupValue !== null && (
                <p className="text-[11.5px] text-muted">
                  Referência do setor: 2,5× a 3× (bebidas e sobremesas até 4–5×)
                </p>
              )}
            </Card>
          </div>

          <Card className="p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h3 className="text-[15px] font-bold text-ink">CMV do período (opcional)</h3>
                <p className="mt-0.5 text-[12.5px] text-muted">
                  Estoque inicial + compras − estoque final, dividido pelo faturamento do mesmo
                  período. O termômetro do negócio inteiro.
                </p>
              </div>
              {periodCmv !== null && (
                <Pill
                  tone={
                    periodCmv <= CMV_HEALTHY_MAX_PCT && periodCmv >= CMV_HEALTHY_MIN_PCT
                      ? "green"
                      : periodCmv < CMV_HEALTHY_MIN_PCT
                        ? "blue"
                        : "amber"
                  }
                >
                  CMV {fmtPct(periodCmv)}
                  {periodCmv > CMV_HEALTHY_MAX_PCT && " — acima da faixa saudável"}
                  {periodCmv < CMV_HEALTHY_MIN_PCT && " — abaixo da faixa"}
                </Pill>
              )}
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Estoque inicial (R$)">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className={INPUT_CLS}
                  value={draft.periodOpeningStock}
                  onChange={(e) => set({ periodOpeningStock: e.target.value })}
                  disabled={!canEdit}
                />
              </Field>
              <Field label="Compras do período (R$)">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className={INPUT_CLS}
                  value={draft.periodPurchases}
                  onChange={(e) => set({ periodPurchases: e.target.value })}
                  disabled={!canEdit}
                />
              </Field>
              <Field label="Estoque final (R$)">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className={INPUT_CLS}
                  value={draft.periodClosingStock}
                  onChange={(e) => set({ periodClosingStock: e.target.value })}
                  disabled={!canEdit}
                />
              </Field>
              <Field label="Faturamento do período (R$)">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className={INPUT_CLS}
                  value={draft.periodRevenue}
                  onChange={(e) => set({ periodRevenue: e.target.value })}
                  disabled={!canEdit}
                />
              </Field>
            </div>
            {periodCmv !== null && (
              <div className="mt-4">
                <div className="relative h-2.5 overflow-hidden rounded-full bg-[linear-gradient(90deg,#DCFCE7_0_50%,#22C55E_50%_70%,#FEF3C7_70%_90%,#F59E0B_90%_100%)]">
                  <div
                    className="absolute top-[-3px] h-4 w-[3px] rounded bg-ink"
                    style={{ left: `${Math.min((periodCmv / 50) * 100, 99)}%` }}
                  />
                </div>
                <p className="mt-1.5 text-[11.5px] text-muted">
                  Faixa saudável do setor: {CMV_HEALTHY_MIN_PCT}–{CMV_HEALTHY_MAX_PCT}% do
                  faturamento · acima de 40% a margem líquida fica comprometida
                </p>
              </div>
            )}
          </Card>

          {canEdit && (
            <div className="flex items-center gap-3">
              <Button variant="primary" onClick={() => void saveConfig()} disabled={savingConfig || !configDirty}>
                {savingConfig ? "Salvando…" : "Salvar premissas"}
              </Button>
              {configDirty && (
                <span className="text-[12.5px] text-muted">
                  Alterações não salvas — a tabela de preços usa as premissas salvas.
                </span>
              )}
            </div>
          )}
          {configMsg &&
            (configMsg.ok ? (
              <InlineSuccess message={configMsg.text} />
            ) : (
              <InlineError message={configMsg.text} />
            ))}
        </div>
      )}

      {/* ── BLOCO B · Preços do cardápio ───────────────────────────────── */}
      {tab === "precos" && (
        <div className="space-y-4">
          {savedMarkup === null ? (
            <Card>
              <EmptyState
                icon="🧮"
                title="Defina as premissas primeiro"
                sub="Preencha e salve o bloco Custos & Fórmula — o markup calculado é o que gera o preço ideal de cada item."
              />
            </Card>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <input
                    type="search"
                    placeholder="Buscar item…"
                    className={`${INPUT_CLS} max-w-56`}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <select
                    className={`${INPUT_CLS} max-w-56`}
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                  >
                    <option value="">Todas as categorias</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  {canEdit && dirtyCosts.length > 0 && (
                    <Button variant="secondary" onClick={() => void saveCosts()} disabled={savingCosts}>
                      {savingCosts ? "Salvando…" : `Salvar custos (${dirtyCosts.length})`}
                    </Button>
                  )}
                  {canEdit && pendingCount > 0 && (
                    <Button variant="primary" onClick={() => setBulkOpen(true)}>
                      Aplicar sugeridos ({pendingCount})
                    </Button>
                  )}
                </div>
              </div>

              {configDirty && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] text-amber-700">
                  Você alterou premissas sem salvar — esta tabela ainda usa as premissas salvas
                  (markup {savedMarkup.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}×).
                </p>
              )}

              {pendingCount > 0 && (
                <p className="text-[12.5px] text-muted">
                  <b className="text-ink">{pendingCount}</b> item(ns) abaixo do preço ideal ·
                  potencial de <b className="text-ink">{fmtBRL(pendingGain)}</b> somando uma venda
                  de cada
                </p>
              )}

              <Card className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-[13.5px]">
                  <thead>
                    <tr className="border-b border-line text-left text-[11.5px] uppercase tracking-[.05em] text-muted">
                      <th className="px-4 py-3 font-semibold">Item</th>
                      <th className="px-4 py-3 text-right font-semibold">Custo (R$)</th>
                      <th className="px-4 py-3 text-right font-semibold">Preço atual</th>
                      <th className="px-4 py-3 text-right font-semibold">CMV</th>
                      <th className="px-4 py-3 text-right font-semibold">Preço ideal</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.length === 0 && (
                      <tr>
                        <td colSpan={7}>
                          <EmptyState title="Nenhum item encontrado" sub="Ajuste a busca ou o filtro de categoria." />
                        </td>
                      </tr>
                    )}
                    {visibleRows.map((row) => {
                      const draftValue = costDrafts[row.id] ?? numToInput(row.cost);
                      const isDirty = dirtyCosts.some((c) => c.id === row.id);
                      const applying = applyingIds.has(row.id);
                      return (
                        <tr key={row.id} className="border-b border-line last:border-b-0">
                          <td className="px-4 py-2.5">
                            <span className="font-medium text-ink">{row.name}</span>
                            <span className="mt-0.5 block text-[11.5px] text-muted">
                              {row.categoryName}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              placeholder="—"
                              className={`${INPUT_CLS} w-24 text-right tabular-nums ${isDirty ? "border-brand-400 ring-1 ring-brand-200" : ""}`}
                              value={draftValue}
                              onChange={(e) =>
                                setCostDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))
                              }
                              disabled={!canEdit}
                            />
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-ink">
                            {fmtBRL(row.price)}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            {row.cmv === null ? (
                              <span className="text-muted">—</span>
                            ) : (
                              <span
                                className={
                                  row.cmv > 40
                                    ? "font-semibold text-red-600"
                                    : row.cmv > CMV_HEALTHY_MAX_PCT
                                      ? "font-semibold text-amber-700"
                                      : "text-ink"
                                }
                              >
                                {fmtPct(row.cmv)}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-ink">
                            {row.ideal === null ? (
                              <span className="font-normal text-muted">—</span>
                            ) : (
                              fmtBRL(row.ideal)
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            {row.status === null && <Pill tone="neutral">Sem custo</Pill>}
                            {row.status === "BELOW" && (
                              <Pill tone="amber">Subir {fmtBRL(row.diff ?? 0)}</Pill>
                            )}
                            {row.status === "ON_TARGET" && <Pill tone="green">No alvo</Pill>}
                            {row.status === "ABOVE" && <Pill tone="blue">Margem extra</Pill>}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {canEdit &&
                              row.ideal !== null &&
                              row.status !== "ON_TARGET" &&
                              row.ideal !== row.price && (
                                <button
                                  type="button"
                                  onClick={() => void applyPrices([row.id])}
                                  disabled={applying}
                                  className="rounded-lg border border-line2 px-2.5 py-1 text-[12px] font-semibold text-brand-600 hover:bg-brand-50 disabled:opacity-50"
                                >
                                  {applying ? "…" : "Aplicar"}
                                </button>
                              )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>

              {tableMsg &&
                (tableMsg.ok ? (
                  <InlineSuccess message={tableMsg.text} />
                ) : (
                  <InlineError message={tableMsg.text} />
                ))}
            </>
          )}
        </div>
      )}

      {/* ── BLOCO C · Automação ────────────────────────────────────────── */}
      {tab === "automacao" && (
        <div className="space-y-5">
          <Card className="p-5">
            <h3 className="text-[15px] font-bold text-ink">Dispositivo de reprecificação</h3>
            <p className="mt-0.5 text-[12.5px] text-muted">
              O que acontece com o preço quando um custo (ou uma premissa) muda. Preço alterado
              vale imediatamente no cardápio e no agente do WhatsApp.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {(
                [
                  {
                    mode: "OFF" as const,
                    title: "Desligado",
                    desc: "Nada muda sozinho. A página só mostra os preços ideais.",
                  },
                  {
                    mode: "SUGGEST" as const,
                    title: "Sugerir",
                    desc: "Custo mudou → o novo preço ideal fica pendente e você aprova com 1 clique.",
                    recommended: true,
                  },
                  {
                    mode: "AUTO" as const,
                    title: "Automático",
                    desc: "Custo mudou → preço atualizado na hora, dentro da trava de variação.",
                  },
                ] as const
              ).map((opt) => {
                const selected = draft.autoRepriceMode === opt.mode;
                return (
                  <button
                    key={opt.mode}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => set({ autoRepriceMode: opt.mode })}
                    className={`rounded-xl border p-3.5 text-left transition-colors disabled:cursor-not-allowed ${
                      selected
                        ? "border-brand-500 bg-brand-50"
                        : "border-line2 bg-paper hover:border-brand-200"
                    }`}
                  >
                    {"recommended" in opt && opt.recommended && (
                      <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-[.08em] text-brand-600">
                        Recomendado
                      </span>
                    )}
                    <span className="block text-[13.5px] font-bold text-ink">{opt.title}</span>
                    <span className="mt-0.5 block text-[12px] leading-snug text-muted">
                      {opt.desc}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field
                label="Arredondamento do preço sugerido"
                hint="Sempre para cima — nunca corta a margem pedida"
              >
                <select
                  className={INPUT_CLS}
                  value={draft.rounding}
                  onChange={(e) => set({ rounding: e.target.value as RoundingMode })}
                  disabled={!canEdit}
                >
                  <option value="ENDING_90">Terminar em ,90 (ex.: R$ 48,05 → R$ 48,90)</option>
                  <option value="ENDING_99">Terminar em ,99 (ex.: R$ 48,05 → R$ 48,99)</option>
                  <option value="NONE">Sem arredondamento (valor exato)</option>
                </select>
              </Field>
              <Field
                label="Trava do modo Automático (%)"
                hint="Variações maiores que isso nunca são aplicadas sozinhas — viram sugestão"
              >
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="1"
                  className={INPUT_CLS}
                  value={draft.maxAutoChangePct}
                  onChange={(e) => set({ maxAutoChangePct: e.target.value })}
                  disabled={!canEdit}
                />
              </Field>
            </div>

            <p className="mt-4 rounded-lg bg-[#F6F6F4] px-3 py-2 text-[12px] text-ink2">
              Travas permanentes: o preço sugerido nunca fica abaixo do custo, e toda alteração —
              manual ou automática — é registrada no histórico abaixo.
            </p>

            {canEdit && (
              <div className="mt-4 flex items-center gap-3">
                <Button
                  variant="primary"
                  onClick={() => void saveConfig()}
                  disabled={savingConfig || !configDirty}
                >
                  {savingConfig ? "Salvando…" : "Salvar automação"}
                </Button>
                {configDirty && (
                  <span className="text-[12.5px] text-muted">Alterações não salvas.</span>
                )}
              </div>
            )}
            {configMsg &&
              (configMsg.ok ? (
                <InlineSuccess message={configMsg.text} />
              ) : (
                <InlineError message={configMsg.text} />
              ))}
          </Card>

          <Card className="p-5">
            <h3 className="text-[15px] font-bold text-ink">Histórico de alterações</h3>
            <p className="mt-0.5 text-[12.5px] text-muted">
              Auditoria completa: toda mudança de custo ou preço, com origem e horário.
            </p>
            {logs.length === 0 ? (
              <EmptyState
                icon="🗒️"
                title="Nenhuma alteração registrada ainda"
                sub="Assim que um custo ou preço mudar por aqui, a trilha aparece nesta lista."
              />
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {logs.map((log) => {
                  const when = new Date(log.createdAt).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  const priceChanged =
                    log.oldPrice !== null && log.newPrice !== null && log.oldPrice !== log.newPrice;
                  const costChanged = log.oldCost !== log.newCost;
                  return (
                    <li key={log.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2.5 text-[13px]">
                      <span className="w-32 shrink-0 tabular-nums text-[12px] text-muted">{when}</span>
                      <span className="font-medium text-ink">{log.itemName}</span>
                      <span className="text-ink2">
                        {log.source === "COST_EDIT" ? (
                          costChanged && log.newCost !== null && log.oldCost !== null ? (
                            <>custo {fmtBRL(log.oldCost)} → {fmtBRL(log.newCost)}</>
                          ) : log.newCost !== null ? (
                            <>custo definido: {fmtBRL(log.newCost)}</>
                          ) : (
                            <>custo removido</>
                          )
                        ) : priceChanged ? (
                          <>
                            preço {fmtBRL(log.oldPrice!)} → {fmtBRL(log.newPrice!)}
                          </>
                        ) : (
                          <>sem mudança de preço</>
                        )}
                      </span>
                      <Pill tone={log.source === "AUTO" ? "brand" : "neutral"} className="ml-auto">
                        {SOURCE_LABEL[log.source]}
                      </Pill>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      )}

      {/* ── Dialogs ────────────────────────────────────────────────────── */}
      {bulkOpen && (
        <ConfirmDialog
          tone="brand"
          icon={<span>🧮</span>}
          title={`Aplicar ${pendingCount} preço(s) sugerido(s)?`}
          subtitle={`Os itens abaixo do ideal sobem para o preço calculado (markup ${
            savedMarkup?.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) ?? "—"
          }×). Potencial de ${fmtBRL(pendingGain)} somando uma venda de cada. Vale imediatamente no cardápio e no WhatsApp.`}
          footer={
            <>
              <Button className="flex-1" onClick={() => setBulkOpen(false)}>
                Cancelar
              </Button>
              <Button
                className="flex-1"
                variant="primary"
                onClick={() => {
                  setBulkOpen(false);
                  void applyPrices(belowRows.map((r) => r.id));
                }}
              >
                Aplicar todos
              </Button>
            </>
          }
        />
      )}

      {autoModeConfirmOpen && (
        <ConfirmDialog
          tone="caution"
          icon={<span>⚡</span>}
          title="Ligar a reprecificação automática?"
          subtitle={`Com o modo Automático, toda mudança de custo atualiza o preço na hora (variações de até ${
            parseMoney(draft.maxAutoChangePct) ?? 15
          }%). Acima disso, vira sugestão para você aprovar. Tudo fica registrado no histórico.`}
          footer={
            <>
              <Button className="flex-1" onClick={() => setAutoModeConfirmOpen(false)}>
                Cancelar
              </Button>
              <Button className="flex-1" variant="primary" onClick={() => void doSaveConfig()}>
                Ligar automático
              </Button>
            </>
          }
        />
      )}
    </div>
  );
}
