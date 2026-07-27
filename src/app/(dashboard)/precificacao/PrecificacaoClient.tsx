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

import { useEffect, useMemo, useRef, useState } from "react";
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
  source: "MANUAL" | "APPLIED" | "AUTO" | "COST_EDIT" | "RECIPE";
  createdAt: string;
}

export interface IngredientDTO {
  id: string;
  name: string;
  unit: string;
  costPerUnit: number | null;
  usedIn: number;
}

export interface RecipeLineDTO {
  menuItemId: string;
  ingredientId: string;
  quantity: number | null;
}

export interface CategoryDTO {
  id: string;
  name: string;
  markupOverride: number | null; // null = segue o markup global das premissas
}

interface InvoiceProposalDTO {
  extractedName: string;
  extractedUnit: string | null;
  extractedUnitPrice: number | null;
  matchedIngredientId: string | null;
  matchedIngredientName: string | null;
  confidence: "high" | "medium" | "none";
  suggestedCost: number | null;
  conversionNote: string | null;
}

interface InvoiceRow {
  include: boolean;
  extractedName: string;
  extractedUnit: string | null;
  extractedUnitPrice: number | null;
  /** "" = sem destino · "__new__" = criar insumo novo · senão id do insumo */
  ingredientId: string;
  cost: string;
  note: string | null;
  confidence: "high" | "medium" | "none";
}

function titleCasePt(s: string): string {
  return s
    .toLocaleLowerCase("pt-BR")
    .replace(/(^|\s)\S/g, (c) => c.toLocaleUpperCase("pt-BR"))
    .trim()
    .slice(0, 60);
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

/** 4-dp variant for ingredient unit costs and quantities (g/ml precision). */
function parseNum4(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 10000) / 10000 : null;
}

const fmtQty = (n: number) =>
  n.toLocaleString("pt-BR", { maximumFractionDigits: 4 });

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
  RECIPE: "ficha de insumos",
};

const UNIT_OPTIONS = ["un", "g", "kg", "ml", "L", "fatia", "porção"];

// ── Component ─────────────────────────────────────────────────────────────────

type PricingTab = "formula" | "markup" | "precos" | "insumos" | "automacao";

export function PrecificacaoClient({
  initialConfig,
  initialItems,
  initialLogs,
  initialIngredients,
  initialRecipeLines,
  initialCategories,
  canEdit,
  initialTab,
  initialFichaItemId,
}: {
  initialConfig: PricingConfigDTO;
  initialItems: PricingItemDTO[];
  initialLogs: PriceLogDTO[];
  initialIngredients: IngredientDTO[];
  initialRecipeLines: RecipeLineDTO[];
  initialCategories: CategoryDTO[];
  canEdit: boolean;
  initialTab?: PricingTab;
  initialFichaItemId?: string;
}) {
  const [savedConfig, setSavedConfig] = useState<PricingConfigDTO>(initialConfig);
  const [draft, setDraft] = useState<ConfigDraft>(() => toDraft(initialConfig));
  const [items, setItems] = useState<PricingItemDTO[]>(initialItems);
  const [costDrafts, setCostDrafts] = useState<Record<string, string>>({});
  const [logs, setLogs] = useState<PriceLogDTO[]>(initialLogs);

  // ── Insumos (ingredient catalog + ficha por produto) ──
  const [ingredients, setIngredients] = useState<IngredientDTO[]>(initialIngredients);
  const [recipeLines, setRecipeLines] = useState<RecipeLineDTO[]>(initialRecipeLines);
  const [ingCostDrafts, setIngCostDrafts] = useState<Record<string, string>>({});
  const [ingUnitDrafts, setIngUnitDrafts] = useState<Record<string, string>>({});
  const [ingSearch, setIngSearch] = useState("");
  const [newIng, setNewIng] = useState({ name: "", unit: "un", cost: "" });
  const [fichaItemId, setFichaItemId] = useState(initialFichaItemId ?? "");
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({}); // key `${itemId}:${ingId}`
  const [addLine, setAddLine] = useState({ ingredientId: "", quantity: "" });
  const [savingIngredients, setSavingIngredients] = useState(false);
  const [importing, setImporting] = useState(false);
  const [deleteIngId, setDeleteIngId] = useState<string | null>(null);
  const [insumosMsg, setInsumosMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // ── Importador de nota de compra (foto/PDF) ──
  const invoiceFileRef = useRef<HTMLInputElement>(null);
  const [readingInvoice, setReadingInvoice] = useState(false);
  const [applyingInvoice, setApplyingInvoice] = useState(false);
  const [invoiceRows, setInvoiceRows] = useState<InvoiceRow[] | null>(null);

  // ── Markup por categoria ──
  const [cats, setCats] = useState<CategoryDTO[]>(initialCategories);
  const [markupDrafts, setMarkupDrafts] = useState<Record<string, string>>({});
  const [savingMarkups, setSavingMarkups] = useState(false);
  const [markupMsg, setMarkupMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [tab, setTab] = useState<PricingTab>(initialTab ?? "formula");
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

  /** Abre a aba Insumos com a ficha do produto selecionada e rola até ela. */
  function scrollToFicha(delay: number) {
    setTimeout(
      () =>
        document
          .getElementById("ficha-produto")
          ?.scrollIntoView({ behavior: "smooth", block: "start" }),
      delay
    );
  }

  function goToFicha(itemId: string) {
    setFichaItemId(itemId);
    setAddLine({ ingredientId: "", quantity: "" });
    setTab("insumos");
    scrollToFicha(60);
  }

  // Chegou por deep-link (?ficha=…): já entra na aba Insumos — rola até a ficha.
  useEffect(() => {
    if (initialFichaItemId) scrollToFicha(120);
    // Só no mount — o alvo inicial não muda depois.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // ── Derived: markup efetivo por categoria (override da aba Markup > global) ──
  const catOverrideById = useMemo(
    () => new Map(cats.map((c) => [c.id, c.markupOverride])),
    [cats]
  );
  const hasAnyMarkup = savedMarkup !== null || cats.some((c) => c.markupOverride !== null);

  // ── Derived: table rows ──
  const rows: Row[] = useMemo(
    () =>
      items.map((item) => {
        const effectiveMarkup = catOverrideById.get(item.categoryId) ?? savedMarkup;
        const ideal = idealPrice(item.cost, effectiveMarkup, savedConfig.rounding);
        return {
          ...item,
          cmv: cmvPct(item.cost, item.price),
          ideal,
          diff: ideal === null ? null : Math.round((ideal - item.price) * 100) / 100,
          status: ideal === null ? null : classifyPrice(item.price, ideal),
        };
      }),
    [items, savedMarkup, savedConfig.rounding, catOverrideById]
  );

  const belowRows = rows.filter((r) => r.status === "BELOW");
  const pendingCount = belowRows.length;
  const pendingGain = belowRows.reduce((sum, r) => sum + (r.diff ?? 0), 0);

  const categories = useMemo(
    () => cats.filter((c) => items.some((i) => i.categoryId === c.id)),
    [cats, items]
  );

  const dirtyMarkups = useMemo(() => {
    const changes: Array<{ categoryId: string; markupOverride: number | null }> = [];
    for (const [categoryId, raw] of Object.entries(markupDrafts)) {
      const cat = cats.find((c) => c.id === categoryId);
      if (!cat) continue;
      const parsed = parseNum4(raw);
      if (parsed !== cat.markupOverride) changes.push({ categoryId, markupOverride: parsed });
    }
    return changes;
  }, [markupDrafts, cats]);

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

  // ── Derived: insumos & fichas ──
  const ingredientById = useMemo(
    () => new Map(ingredients.map((i) => [i.id, i])),
    [ingredients]
  );

  const linesByItem = useMemo(() => {
    const m = new Map<string, RecipeLineDTO[]>();
    for (const l of recipeLines) {
      const arr = m.get(l.menuItemId);
      if (arr) arr.push(l);
      else m.set(l.menuItemId, [l]);
    }
    return m;
  }, [recipeLines]);

  /** Ficha state per product: complete = every line has qty + ingredient cost. */
  const recipeStateByItem = useMemo(() => {
    const m = new Map<string, { complete: boolean; cost: number | null; lines: number }>();
    for (const [itemId, lines] of Array.from(linesByItem.entries())) {
      let total = 0;
      let complete = lines.length > 0;
      for (const l of lines) {
        const ing = ingredientById.get(l.ingredientId);
        if (l.quantity === null || !ing || ing.costPerUnit === null) complete = false;
        else total += l.quantity * ing.costPerUnit;
      }
      m.set(itemId, {
        complete,
        cost: complete ? Math.round(total * 100) / 100 : null,
        lines: lines.length,
      });
    }
    return m;
  }, [linesByItem, ingredientById]);

  const ingredientsWithoutCost = ingredients.filter((i) => i.costPerUnit === null).length;

  const visibleIngredients = ingredients.filter(
    (i) => !ingSearch || i.name.toLowerCase().includes(ingSearch.toLowerCase())
  );

  const dirtyIngredients = useMemo(() => {
    const changes: Array<{ id: string; costPerUnit?: number | null; unit?: string }> = [];
    const ids = new Set([...Object.keys(ingCostDrafts), ...Object.keys(ingUnitDrafts)]);
    for (const id of Array.from(ids)) {
      const ing = ingredients.find((i) => i.id === id);
      if (!ing) continue;
      const change: { id: string; costPerUnit?: number | null; unit?: string } = { id };
      const rawCost = ingCostDrafts[id];
      if (rawCost !== undefined) {
        const parsed = parseNum4(rawCost);
        if (parsed !== ing.costPerUnit) change.costPerUnit = parsed;
      }
      const rawUnit = ingUnitDrafts[id];
      if (rawUnit !== undefined && rawUnit !== ing.unit) change.unit = rawUnit;
      if (change.costPerUnit !== undefined || change.unit !== undefined) changes.push(change);
    }
    return changes;
  }, [ingCostDrafts, ingUnitDrafts, ingredients]);

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

  // ── Actions: insumos ──
  type PropagationDTO = {
    updated: number;
    auto: RepriceOutcomeDTO | null;
    items: ItemStateDTO[];
  } | null;

  /** Merge product-cost recomputes into the table and describe them. */
  function absorbPropagation(prop: PropagationDTO): string {
    if (!prop || prop.updated === 0) return "";
    mergeItems(prop.items);
    void refreshLogs();
    let text = ` · ${prop.updated} produto(s) com custo recalculado pela ficha`;
    if (prop.auto && prop.auto.applied > 0)
      text += ` · ${prop.auto.applied} preço(s) atualizados automaticamente`;
    if (prop.auto && prop.auto.heldByGuardrail > 0)
      text += ` · ${prop.auto.heldByGuardrail} como sugestão (acima da trava)`;
    return text;
  }

  async function refreshIngredients() {
    const res = await apiFetch("/api/pricing/ingredients", "GET");
    if (res?.success) {
      setIngredients(res.data.ingredients);
      setRecipeLines(res.data.lines);
    }
  }

  async function saveIngredients() {
    if (dirtyIngredients.length === 0) return;
    setSavingIngredients(true);
    setInsumosMsg(null);
    try {
      const res = await apiFetch("/api/pricing/ingredients", "PATCH", {
        items: dirtyIngredients,
      });
      const { updated, propagation } = res.data as {
        updated: number;
        propagation: PropagationDTO;
      };
      setIngredients((prev) =>
        prev.map((ing) => {
          const change = dirtyIngredients.find((c) => c.id === ing.id);
          if (!change) return ing;
          return {
            ...ing,
            ...(change.costPerUnit !== undefined && { costPerUnit: change.costPerUnit }),
            ...(change.unit !== undefined && { unit: change.unit }),
          };
        })
      );
      setIngCostDrafts({});
      setIngUnitDrafts({});
      setInsumosMsg({ ok: true, text: `${updated} insumo(s) salvos${absorbPropagation(propagation)}.` });
    } catch (err) {
      setInsumosMsg({ ok: false, text: err instanceof Error ? err.message : "Erro ao salvar insumos." });
    } finally {
      setSavingIngredients(false);
    }
  }

  async function createIngredientAction() {
    const name = newIng.name.trim();
    if (name.length < 2) {
      setInsumosMsg({ ok: false, text: "Dê um nome ao insumo (mínimo 2 letras)." });
      return;
    }
    setInsumosMsg(null);
    try {
      const res = await apiFetch("/api/pricing/ingredients", "POST", {
        name,
        unit: newIng.unit,
        costPerUnit: parseNum4(newIng.cost),
      });
      const { id } = res.data as { id: string };
      setIngredients((prev) =>
        [...prev, { id, name, unit: newIng.unit, costPerUnit: parseNum4(newIng.cost), usedIn: 0 }].sort(
          (a, b) => a.name.localeCompare(b.name, "pt-BR")
        )
      );
      setNewIng({ name: "", unit: "un", cost: "" });
      setInsumosMsg({ ok: true, text: `Insumo "${name}" cadastrado.` });
    } catch (err) {
      setInsumosMsg({ ok: false, text: err instanceof Error ? err.message : "Erro ao cadastrar." });
    }
  }

  async function doDeleteIngredient(id: string) {
    setDeleteIngId(null);
    setInsumosMsg(null);
    try {
      const res = await apiFetch(`/api/pricing/ingredients/${id}`, "DELETE");
      const { productsRecalculated } = res.data as { productsRecalculated: PropagationDTO };
      const name = ingredientById.get(id)?.name ?? "insumo";
      setIngredients((prev) => prev.filter((i) => i.id !== id));
      setRecipeLines((prev) => prev.filter((l) => l.ingredientId !== id));
      setInsumosMsg({ ok: true, text: `"${name}" removido${absorbPropagation(productsRecalculated)}.` });
    } catch (err) {
      setInsumosMsg({ ok: false, text: err instanceof Error ? err.message : "Erro ao remover." });
    }
  }

  async function runImport() {
    setImporting(true);
    setInsumosMsg(null);
    try {
      const res = await apiFetch("/api/pricing/ingredients/import", "POST", {});
      const o = res.data as {
        ingredientsCreated: number;
        linksCreated: number;
        itemsLinked: number;
        itemsWithoutText: number;
      };
      await refreshIngredients();
      let text = `Importação concluída: ${o.ingredientsCreated} insumo(s) novos, ${o.linksCreated} vínculo(s) com produtos.`;
      if (o.itemsWithoutText > 0)
        text += ` ${o.itemsWithoutText} produto(s) do cardápio não têm ingredientes preenchidos.`;
      setInsumosMsg({ ok: true, text });
    } catch (err) {
      setInsumosMsg({ ok: false, text: err instanceof Error ? err.message : "Erro na importação." });
    } finally {
      setImporting(false);
    }
  }

  async function saveQty(menuItemId: string, ingredientId: string, raw: string) {
    const key = `${menuItemId}:${ingredientId}`;
    const parsed = parseNum4(raw);
    const current = recipeLines.find(
      (l) => l.menuItemId === menuItemId && l.ingredientId === ingredientId
    );
    if (!current || parsed === current.quantity) return;
    if (parsed !== null && parsed <= 0) {
      setInsumosMsg({ ok: false, text: "Quantidade deve ser maior que zero (ou vazia)." });
      setQtyDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }
    setInsumosMsg(null);
    try {
      const res = await apiFetch("/api/pricing/recipe", "PUT", {
        menuItemId,
        ingredientId,
        quantity: parsed,
      });
      const { propagation } = res.data as { propagation: PropagationDTO };
      setRecipeLines((prev) =>
        prev.map((l) =>
          l.menuItemId === menuItemId && l.ingredientId === ingredientId
            ? { ...l, quantity: parsed }
            : l
        )
      );
      setQtyDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      const suffix = absorbPropagation(propagation);
      if (suffix) setInsumosMsg({ ok: true, text: `Quantidade salva${suffix}.` });
    } catch (err) {
      setInsumosMsg({ ok: false, text: err instanceof Error ? err.message : "Erro ao salvar quantidade." });
    }
  }

  async function addLineAction() {
    if (!fichaItemId || !addLine.ingredientId) return;
    setInsumosMsg(null);
    try {
      const quantity = parseNum4(addLine.quantity);
      const res = await apiFetch("/api/pricing/recipe", "PUT", {
        menuItemId: fichaItemId,
        ingredientId: addLine.ingredientId,
        quantity,
      });
      const { propagation } = res.data as { propagation: PropagationDTO };
      setRecipeLines((prev) => [
        ...prev.filter(
          (l) => !(l.menuItemId === fichaItemId && l.ingredientId === addLine.ingredientId)
        ),
        { menuItemId: fichaItemId, ingredientId: addLine.ingredientId, quantity },
      ]);
      setIngredients((prev) =>
        prev.map((i) => (i.id === addLine.ingredientId ? { ...i, usedIn: i.usedIn + 1 } : i))
      );
      setAddLine({ ingredientId: "", quantity: "" });
      setInsumosMsg({ ok: true, text: `Insumo adicionado à ficha${absorbPropagation(propagation)}.` });
    } catch (err) {
      setInsumosMsg({ ok: false, text: err instanceof Error ? err.message : "Erro ao adicionar." });
    }
  }

  async function uploadInvoice(file: File) {
    setReadingInvoice(true);
    setInsumosMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/pricing/ingredients/import-invoice", {
        method: "POST",
        body: fd,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? `Falha na leitura (${res.status})`);
      const proposals = json.data.proposals as InvoiceProposalDTO[];
      setInvoiceRows(
        proposals.map((p) => ({
          // Pré-marca apenas o que tem destino E custo convertido com segurança
          include: p.matchedIngredientId !== null && p.suggestedCost !== null,
          extractedName: p.extractedName,
          extractedUnit: p.extractedUnit,
          extractedUnitPrice: p.extractedUnitPrice,
          ingredientId: p.matchedIngredientId ?? "",
          cost: p.suggestedCost !== null ? String(p.suggestedCost) : "",
          note: p.conversionNote,
          confidence: p.confidence,
        }))
      );
    } catch (err) {
      setInsumosMsg({ ok: false, text: err instanceof Error ? err.message : "Erro ao ler a nota." });
    } finally {
      setReadingInvoice(false);
      if (invoiceFileRef.current) invoiceFileRef.current.value = "";
    }
  }

  async function applyInvoice() {
    if (!invoiceRows) return;
    const rowsToApply = invoiceRows.filter(
      (r) => r.include && r.ingredientId !== "" && parseNum4(r.cost) !== null
    );
    if (rowsToApply.length === 0) {
      setInsumosMsg({ ok: false, text: "Nenhuma linha marcada com insumo e custo válidos." });
      return;
    }
    setApplyingInvoice(true);
    setInsumosMsg(null);
    try {
      let createdCount = 0;
      const existingChanges: Array<{ id: string; costPerUnit: number | null }> = [];

      for (const row of rowsToApply) {
        const cost = parseNum4(row.cost)!;
        if (row.ingredientId === "__new__") {
          await apiFetch("/api/pricing/ingredients", "POST", {
            name: titleCasePt(row.extractedName),
            unit: row.extractedUnit ?? "un",
            costPerUnit: cost,
          });
          createdCount++;
        } else {
          existingChanges.push({ id: row.ingredientId, costPerUnit: cost });
        }
      }

      let suffix = "";
      if (existingChanges.length > 0) {
        const res = await apiFetch("/api/pricing/ingredients", "PATCH", {
          items: existingChanges,
        });
        const { propagation } = res.data as { updated: number; propagation: PropagationDTO };
        suffix = absorbPropagation(propagation);
      }

      await refreshIngredients();
      setInvoiceRows(null);
      setInsumosMsg({
        ok: true,
        text: `Nota aplicada: ${existingChanges.length} custo(s) atualizados${
          createdCount > 0 ? `, ${createdCount} insumo(s) novos` : ""
        }${suffix}.`,
      });
    } catch (err) {
      setInsumosMsg({ ok: false, text: err instanceof Error ? err.message : "Erro ao aplicar a nota." });
    } finally {
      setApplyingInvoice(false);
    }
  }

  async function removeLineAction(menuItemId: string, ingredientId: string) {
    setInsumosMsg(null);
    try {
      const res = await apiFetch("/api/pricing/recipe", "DELETE", { menuItemId, ingredientId });
      const { propagation } = res.data as { propagation: PropagationDTO };
      setRecipeLines((prev) =>
        prev.filter((l) => !(l.menuItemId === menuItemId && l.ingredientId === ingredientId))
      );
      setIngredients((prev) =>
        prev.map((i) => (i.id === ingredientId ? { ...i, usedIn: Math.max(0, i.usedIn - 1) } : i))
      );
      setInsumosMsg({ ok: true, text: `Insumo removido da ficha${absorbPropagation(propagation)}.` });
    } catch (err) {
      setInsumosMsg({ ok: false, text: err instanceof Error ? err.message : "Erro ao remover da ficha." });
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

  async function saveMarkups() {
    if (dirtyMarkups.length === 0) return;
    const invalid = dirtyMarkups.find(
      (c) => c.markupOverride !== null && c.markupOverride < 1
    );
    if (invalid) {
      setMarkupMsg({ ok: false, text: "Markup deve ser no mínimo 1× (abaixo disso vende no prejuízo)." });
      return;
    }
    setSavingMarkups(true);
    setMarkupMsg(null);
    try {
      const res = await apiFetch("/api/pricing/markup", "PATCH", { items: dirtyMarkups });
      const { auto, items: freshItems } = res.data as {
        updated: number;
        auto: RepriceOutcomeDTO | null;
        items: ItemStateDTO[];
      };
      setCats((prev) =>
        prev.map((c) => {
          const change = dirtyMarkups.find((d) => d.categoryId === c.id);
          return change ? { ...c, markupOverride: change.markupOverride } : c;
        })
      );
      setMarkupDrafts({});
      mergeItems(freshItems);
      let text = `${dirtyMarkups.length} categoria(s) salvas.`;
      if (auto && auto.applied > 0) text += ` ${auto.applied} preço(s) atualizados automaticamente.`;
      if (auto && auto.heldByGuardrail > 0)
        text += ` ${auto.heldByGuardrail} ficaram como sugestão (acima da trava).`;
      setMarkupMsg({ ok: true, text });
      if (auto && auto.applied > 0) void refreshLogs();
    } catch (err) {
      setMarkupMsg({ ok: false, text: err instanceof Error ? err.message : "Erro ao salvar markups." });
    } finally {
      setSavingMarkups(false);
    }
  }

  // ── Render ──
  const tabs = [
    { key: "formula" as const, label: "Custos & Fórmula" },
    { key: "markup" as const, label: "Markup" },
    { key: "precos" as const, label: "Preços do cardápio", badge: pendingCount },
    { key: "insumos" as const, label: "Insumos", badge: ingredientsWithoutCost },
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

      {/* ── ABA · Markup ───────────────────────────────────────────────── */}
      {tab === "markup" && (
        <div className="space-y-5">
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-[15px] font-bold text-ink">Markup por categoria</h3>
                <p className="mt-0.5 max-w-2xl text-[12.5px] text-muted">
                  O markup global vem das premissas (Custos & Fórmula). Aqui você pode dar a cada
                  categoria um multiplicador próprio — prática do setor: pratos 2,5–3× · bebidas e
                  sobremesas 4–5×. Categoria sem valor segue o global.
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11.5px] font-semibold uppercase tracking-[.06em] text-muted">
                  Markup global
                </p>
                <p className="text-[28px] font-extrabold leading-tight tracking-[-.02em] text-ink">
                  {savedMarkup !== null
                    ? `${savedMarkup.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}×`
                    : "—"}
                </p>
                {savedMarkup === null && (
                  <p className="max-w-44 text-[11px] text-muted">
                    defina as premissas em Custos & Fórmula
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[680px] text-[13.5px]">
                <thead>
                  <tr className="border-b border-line text-left text-[11.5px] uppercase tracking-[.05em] text-muted">
                    <th className="px-3 py-2.5 font-semibold">Categoria</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Itens</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Markup da categoria</th>
                    <th className="px-3 py-2.5 text-right font-semibold">CMV alvo</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Custo R$ 10 vira</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {cats.map((cat) => {
                    const draftVal = markupDrafts[cat.id] ?? numToInput(cat.markupOverride);
                    const parsed = parseNum4(draftVal);
                    const effective = parsed ?? savedMarkup;
                    const itemCount = items.filter((i) => i.categoryId === cat.id).length;
                    const isDirty = dirtyMarkups.some((d) => d.categoryId === cat.id);
                    const example =
                      effective !== null && effective >= 1
                        ? idealPrice(10, effective, savedConfig.rounding)
                        : null;
                    return (
                      <tr key={cat.id} className="border-b border-line last:border-b-0">
                        <td className="px-3 py-2 font-medium text-ink">
                          {cat.name}
                          {parsed === null && (
                            <Pill tone="neutral" className="ml-2">
                              global
                            </Pill>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted">{itemCount}</td>
                        <td className="px-3 py-2 text-right">
                          <span className="inline-flex items-center gap-1">
                            <input
                              type="number"
                              min={1}
                              step="0.01"
                              placeholder={
                                savedMarkup !== null
                                  ? savedMarkup.toLocaleString("pt-BR", { maximumFractionDigits: 2 })
                                  : "—"
                              }
                              className={`${INPUT_CLS} w-24 text-right tabular-nums ${isDirty ? "border-brand-400 ring-1 ring-brand-200" : ""}`}
                              value={draftVal}
                              onChange={(e) =>
                                setMarkupDrafts((prev) => ({ ...prev, [cat.id]: e.target.value }))
                              }
                              disabled={!canEdit}
                            />
                            <span className="text-[12px] text-muted">×</span>
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted">
                          {effective !== null && effective >= 1 ? fmtPct(100 / effective) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-ink">
                          {example !== null ? fmtBRL(example) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {canEdit && (parsed !== null || draftVal !== "") && (
                            <button
                              type="button"
                              onClick={() => setMarkupDrafts((prev) => ({ ...prev, [cat.id]: "" }))}
                              className="rounded-lg px-2 py-1 text-[12px] text-muted hover:bg-[#F4F4F2] hover:text-ink"
                              title="Voltar ao markup global"
                            >
                              limpar
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {canEdit && (
              <div className="mt-4 flex items-center gap-3">
                <Button
                  variant="primary"
                  onClick={() => void saveMarkups()}
                  disabled={savingMarkups || dirtyMarkups.length === 0}
                >
                  {savingMarkups ? "Salvando…" : `Salvar markups (${dirtyMarkups.length})`}
                </Button>
                <span className="text-[12.5px] text-muted">
                  Os preços ideais da aba Preços passam a usar o markup da categoria.
                </span>
              </div>
            )}
            {markupMsg &&
              (markupMsg.ok ? (
                <InlineSuccess message={markupMsg.text} />
              ) : (
                <InlineError message={markupMsg.text} />
              ))}
          </Card>
        </div>
      )}

      {/* ── BLOCO B · Preços do cardápio ───────────────────────────────── */}
      {tab === "precos" && (
        <div className="space-y-4">
          {!hasAnyMarkup ? (
            <Card>
              <EmptyState
                icon="🧮"
                title="Defina as premissas primeiro"
                sub="Preencha e salve o bloco Custos & Fórmula (ou um markup por categoria na aba Markup) — é isso que gera o preço ideal de cada item."
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
                  {savedMarkup !== null &&
                    ` (markup global ${savedMarkup.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}×)`}
                  .
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
                      const fichaComplete = recipeStateByItem.get(row.id)?.complete === true;
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
                              title={
                                fichaComplete
                                  ? "Custo calculado pela ficha de insumos — edite na aba Insumos"
                                  : undefined
                              }
                              className={`${INPUT_CLS} w-24 text-right tabular-nums ${isDirty ? "border-brand-400 ring-1 ring-brand-200" : ""}`}
                              value={draftValue}
                              onChange={(e) =>
                                setCostDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))
                              }
                              disabled={!canEdit || fichaComplete}
                            />
                            <button
                              type="button"
                              onClick={() => goToFicha(row.id)}
                              className="mt-1 block w-full text-right text-[10.5px] font-semibold text-brand-600 hover:underline"
                              title="Montar a ficha de insumos e calcular o custo pelo CMV"
                            >
                              {fichaComplete ? "🧾 ver ficha" : "＋ montar ficha"}
                            </button>
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

      {/* ── ABA · Insumos ──────────────────────────────────────────────── */}
      {tab === "insumos" && (
        <div className="space-y-5">
          {/* Catálogo de insumos */}
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-[15px] font-bold text-ink">Lista de insumos</h3>
                <p className="mt-0.5 text-[12.5px] text-muted">
                  Todos os ingredientes que o restaurante usa, importados do cardápio. Atualize o
                  custo quando a compra subir — os produtos com ficha completa recalculam sozinhos
                  e o dispositivo de preço entra em ação.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {canEdit && (
                  <>
                    <input
                      ref={invoiceFileRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void uploadInvoice(f);
                      }}
                    />
                    <Button
                      variant="primary"
                      onClick={() => invoiceFileRef.current?.click()}
                      disabled={readingInvoice}
                    >
                      {readingInvoice ? "Lendo a nota…" : "📷 Ler nota de compra"}
                    </Button>
                  </>
                )}
                {canEdit && (
                  <Button onClick={() => void runImport()} disabled={importing}>
                    {importing ? "Importando…" : "↻ Importar do cardápio"}
                  </Button>
                )}
                {canEdit && dirtyIngredients.length > 0 && (
                  <Button
                    variant="primary"
                    onClick={() => void saveIngredients()}
                    disabled={savingIngredients}
                  >
                    {savingIngredients ? "Salvando…" : `Salvar insumos (${dirtyIngredients.length})`}
                  </Button>
                )}
              </div>
            </div>

            {canEdit && (
              <div className="mt-4 flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-line2 p-3">
                <div className="min-w-40 flex-1">
                  <span className="mb-1 block text-[11.5px] font-semibold text-ink2">Novo insumo</span>
                  <input
                    type="text"
                    placeholder="ex.: Salmão fresco"
                    className={INPUT_CLS}
                    value={newIng.name}
                    onChange={(e) => setNewIng((p) => ({ ...p, name: e.target.value }))}
                  />
                </div>
                <div>
                  <span className="mb-1 block text-[11.5px] font-semibold text-ink2">Unidade</span>
                  <select
                    className={INPUT_CLS}
                    value={newIng.unit}
                    onChange={(e) => setNewIng((p) => ({ ...p, unit: e.target.value }))}
                  >
                    {UNIT_OPTIONS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <span className="mb-1 block text-[11.5px] font-semibold text-ink2">
                    Custo por unidade (R$)
                  </span>
                  <input
                    type="number"
                    min={0}
                    step="0.0001"
                    placeholder="0,00"
                    className={`${INPUT_CLS} w-32`}
                    value={newIng.cost}
                    onChange={(e) => setNewIng((p) => ({ ...p, cost: e.target.value }))}
                  />
                </div>
                <Button variant="secondary" onClick={() => void createIngredientAction()}>
                  ＋ Cadastrar
                </Button>
              </div>
            )}

            <div className="mt-4">
              <input
                type="search"
                placeholder="Buscar insumo…"
                className={`${INPUT_CLS} max-w-56`}
                value={ingSearch}
                onChange={(e) => setIngSearch(e.target.value)}
              />
            </div>

            {ingredients.length === 0 ? (
              <EmptyState
                icon="🧺"
                title="Nenhum insumo ainda"
                sub="Use “Importar do cardápio” para puxar os ingredientes dos produtos, ou cadastre manualmente acima."
              />
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[640px] text-[13.5px]">
                  <thead>
                    <tr className="border-b border-line text-left text-[11.5px] uppercase tracking-[.05em] text-muted">
                      <th className="px-3 py-2.5 font-semibold">Insumo</th>
                      <th className="px-3 py-2.5 font-semibold">Unidade</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Custo por unidade (R$)</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Usado em</th>
                      <th className="px-3 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {visibleIngredients.map((ing) => {
                      const costDraft = ingCostDrafts[ing.id] ?? numToInput(ing.costPerUnit);
                      const unitDraft = ingUnitDrafts[ing.id] ?? ing.unit;
                      const isDirty = dirtyIngredients.some((c) => c.id === ing.id);
                      return (
                        <tr key={ing.id} className="border-b border-line last:border-b-0">
                          <td className="px-3 py-2 font-medium text-ink">
                            {ing.name}
                            {ing.costPerUnit === null && (
                              <Pill tone="amber" className="ml-2">
                                sem custo
                              </Pill>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <select
                              className={`${INPUT_CLS} w-24`}
                              value={unitDraft}
                              onChange={(e) =>
                                setIngUnitDrafts((prev) => ({ ...prev, [ing.id]: e.target.value }))
                              }
                              disabled={!canEdit}
                            >
                              {(UNIT_OPTIONS.includes(unitDraft)
                                ? UNIT_OPTIONS
                                : [unitDraft, ...UNIT_OPTIONS]
                              ).map((u) => (
                                <option key={u} value={u}>
                                  {u}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              min={0}
                              step="0.0001"
                              placeholder="—"
                              className={`${INPUT_CLS} w-28 text-right tabular-nums ${isDirty ? "border-brand-400 ring-1 ring-brand-200" : ""}`}
                              value={costDraft}
                              onChange={(e) =>
                                setIngCostDrafts((prev) => ({ ...prev, [ing.id]: e.target.value }))
                              }
                              disabled={!canEdit}
                            />
                          </td>
                          <td className="px-3 py-2 text-right text-[12.5px] text-muted">
                            {ing.usedIn} produto(s)
                          </td>
                          <td className="px-3 py-2 text-right">
                            {canEdit && (
                              <button
                                type="button"
                                aria-label={`Remover ${ing.name}`}
                                onClick={() =>
                                  ing.usedIn > 0 ? setDeleteIngId(ing.id) : void doDeleteIngredient(ing.id)
                                }
                                className="rounded-lg px-2 py-1 text-[12px] text-muted hover:bg-red-50 hover:text-red-600"
                              >
                                🗑
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {insumosMsg &&
              (insumosMsg.ok ? (
                <InlineSuccess message={insumosMsg.text} />
              ) : (
                <InlineError message={insumosMsg.text} />
              ))}
          </Card>

          {/* Ficha por produto */}
          <Card id="ficha-produto" className="scroll-mt-4 p-5">
            <h3 className="text-[15px] font-bold text-ink">Ficha por produto</h3>
            <p className="mt-0.5 text-[12.5px] text-muted">
              Informe a quantidade de cada insumo no produto. Ficha completa (todas as quantidades
              + todos os custos) → o custo do produto passa a ser calculado automaticamente.
              Enquanto estiver incompleta, vale o custo digitado na aba Preços.
            </p>

            <div className="mt-4 max-w-md">
              <select
                className={INPUT_CLS}
                value={fichaItemId}
                onChange={(e) => {
                  setFichaItemId(e.target.value);
                  setAddLine({ ingredientId: "", quantity: "" });
                }}
              >
                <option value="">Escolha um produto…</option>
                {categories.map((c) => (
                  <optgroup key={c.id} label={c.name}>
                    {items
                      .filter((i) => i.categoryId === c.id)
                      .map((i) => {
                        const st = recipeStateByItem.get(i.id);
                        return (
                          <option key={i.id} value={i.id}>
                            {i.name}
                            {st ? ` (${st.lines} insumo${st.lines > 1 ? "s" : ""}${st.complete ? " · ficha completa" : ""})` : ""}
                          </option>
                        );
                      })}
                  </optgroup>
                ))}
              </select>
            </div>

            {fichaItemId &&
              (() => {
                const lines = linesByItem.get(fichaItemId) ?? [];
                const st = recipeStateByItem.get(fichaItemId);
                const item = items.find((i) => i.id === fichaItemId);
                const availableToAdd = ingredients.filter(
                  (ing) => !lines.some((l) => l.ingredientId === ing.id)
                );
                return (
                  <div className="mt-4 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {st?.complete ? (
                        <Pill tone="green">
                          Ficha completa · custo calculado: {fmtBRL(st.cost ?? 0)}
                        </Pill>
                      ) : (
                        <Pill tone="amber">
                          Ficha incompleta — faltam quantidades ou custos de insumos
                        </Pill>
                      )}
                      {item?.cost !== null && item?.cost !== undefined && (
                        <span className="text-[12.5px] text-muted">
                          custo atual do produto: {fmtBRL(item.cost)}
                        </span>
                      )}
                    </div>

                    {lines.length === 0 ? (
                      <EmptyState
                        title="Este produto ainda não tem insumos na ficha"
                        sub="Adicione abaixo, ou preencha os ingredientes do produto no Cardápio e reimporte."
                      />
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[560px] text-[13.5px]">
                          <thead>
                            <tr className="border-b border-line text-left text-[11.5px] uppercase tracking-[.05em] text-muted">
                              <th className="px-3 py-2 font-semibold">Insumo</th>
                              <th className="px-3 py-2 text-right font-semibold">Quantidade</th>
                              <th className="px-3 py-2 text-right font-semibold">Custo da linha</th>
                              <th className="px-3 py-2" />
                            </tr>
                          </thead>
                          <tbody>
                            {lines.map((line) => {
                              const ing = ingredientById.get(line.ingredientId);
                              if (!ing) return null;
                              const key = `${line.menuItemId}:${line.ingredientId}`;
                              const qtyValue = qtyDrafts[key] ?? numToInput(line.quantity);
                              const lineCost =
                                line.quantity !== null && ing.costPerUnit !== null
                                  ? line.quantity * ing.costPerUnit
                                  : null;
                              return (
                                <tr key={key} className="border-b border-line last:border-b-0">
                                  <td className="px-3 py-2 font-medium text-ink">
                                    {ing.name}
                                    {ing.costPerUnit === null && (
                                      <Pill tone="amber" className="ml-2">
                                        sem custo
                                      </Pill>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    <span className="inline-flex items-center gap-1.5">
                                      <input
                                        type="number"
                                        min={0}
                                        step="0.0001"
                                        placeholder="—"
                                        className={`${INPUT_CLS} w-24 text-right tabular-nums`}
                                        value={qtyValue}
                                        onChange={(e) =>
                                          setQtyDrafts((prev) => ({ ...prev, [key]: e.target.value }))
                                        }
                                        onBlur={(e) =>
                                          void saveQty(line.menuItemId, line.ingredientId, e.target.value)
                                        }
                                        disabled={!canEdit}
                                      />
                                      <span className="w-10 text-left text-[12px] text-muted">{ing.unit}</span>
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums">
                                    {lineCost === null ? (
                                      <span className="text-muted">—</span>
                                    ) : (
                                      fmtBRL(lineCost)
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    {canEdit && (
                                      <button
                                        type="button"
                                        aria-label={`Remover ${ing.name} da ficha`}
                                        onClick={() =>
                                          void removeLineAction(line.menuItemId, line.ingredientId)
                                        }
                                        className="rounded-lg px-2 py-1 text-[12px] text-muted hover:bg-red-50 hover:text-red-600"
                                      >
                                        ✕
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {canEdit && availableToAdd.length > 0 && (
                      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-line2 p-3">
                        <div className="min-w-44 flex-1">
                          <span className="mb-1 block text-[11.5px] font-semibold text-ink2">
                            Adicionar insumo à ficha
                          </span>
                          <select
                            className={INPUT_CLS}
                            value={addLine.ingredientId}
                            onChange={(e) => setAddLine((p) => ({ ...p, ingredientId: e.target.value }))}
                          >
                            <option value="">Escolha…</option>
                            {availableToAdd.map((ing) => (
                              <option key={ing.id} value={ing.id}>
                                {ing.name} ({ing.unit})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <span className="mb-1 block text-[11.5px] font-semibold text-ink2">Quantidade</span>
                          <input
                            type="number"
                            min={0}
                            step="0.0001"
                            placeholder="opcional"
                            className={`${INPUT_CLS} w-28`}
                            value={addLine.quantity}
                            onChange={(e) => setAddLine((p) => ({ ...p, quantity: e.target.value }))}
                          />
                        </div>
                        <Button
                          variant="secondary"
                          onClick={() => void addLineAction()}
                          disabled={!addLine.ingredientId}
                        >
                          ＋ Adicionar
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })()}
          </Card>
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
          subtitle={`Os itens abaixo do ideal sobem para o preço calculado pelo markup vigente (global ou o da categoria). Potencial de ${fmtBRL(pendingGain)} somando uma venda de cada. Vale imediatamente no cardápio e no WhatsApp.`}
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

      {invoiceRows && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4 backdrop-blur-sm">
          <div className="flex max-h-[88vh] w-full max-w-3xl flex-col rounded-2xl border border-line bg-paper shadow-2xl">
            <div className="border-b border-line px-5 py-4">
              <h3 className="text-[15px] font-bold text-ink">Revisar preços da nota</h3>
              <p className="mt-0.5 text-[12.5px] text-muted">
                A IA leu {invoiceRows.length} item(ns). Confira insumo e custo de cada linha —
                nada muda sem a sua confirmação. Depois de aplicar, fichas completas recalculam o
                CMV e o dispositivo cuida do preço do cardápio.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-3">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-[13px]">
                  <thead>
                    <tr className="border-b border-line text-left text-[11px] uppercase tracking-[.05em] text-muted">
                      <th className="px-2 py-2" />
                      <th className="px-2 py-2 font-semibold">Item da nota</th>
                      <th className="px-2 py-2 font-semibold">Insumo</th>
                      <th className="px-2 py-2 text-right font-semibold">Novo custo (R$/unid.)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoiceRows.map((row, idx) => {
                      const targetUnit =
                        row.ingredientId === "__new__"
                          ? (row.extractedUnit ?? "un")
                          : (ingredientById.get(row.ingredientId)?.unit ?? "");
                      const setRow = (patch: Partial<InvoiceRow>) =>
                        setInvoiceRows((prev) =>
                          prev ? prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)) : prev
                        );
                      return (
                        <tr key={idx} className="border-b border-line align-top last:border-b-0">
                          <td className="px-2 py-2.5">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-brand-500"
                              checked={row.include}
                              onChange={(e) => setRow({ include: e.target.checked })}
                              aria-label={`Incluir ${row.extractedName}`}
                            />
                          </td>
                          <td className="px-2 py-2.5">
                            <span className="font-medium text-ink">{row.extractedName}</span>
                            <span className="mt-0.5 block text-[11.5px] text-muted">
                              {row.extractedUnitPrice !== null
                                ? `${fmtBRL(row.extractedUnitPrice)}${row.extractedUnit ? ` / ${row.extractedUnit}` : ""} na nota`
                                : "preço não identificado na nota"}
                              {row.confidence === "medium" && row.ingredientId && (
                                <Pill tone="amber" className="ml-1.5">
                                  confira
                                </Pill>
                              )}
                            </span>
                            {row.note && (
                              <span className="mt-0.5 block text-[11px] text-muted">{row.note}</span>
                            )}
                          </td>
                          <td className="px-2 py-2.5">
                            <select
                              className={`${INPUT_CLS} min-w-40`}
                              value={row.ingredientId}
                              onChange={(e) => setRow({ ingredientId: e.target.value, include: true })}
                            >
                              <option value="">— ignorar —</option>
                              <option value="__new__">➕ Criar insumo novo</option>
                              {ingredients.map((ing) => (
                                <option key={ing.id} value={ing.id}>
                                  {ing.name} ({ing.unit})
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-2.5 text-right">
                            <span className="inline-flex items-center gap-1">
                              <input
                                type="number"
                                min={0}
                                step="0.0001"
                                placeholder="—"
                                className={`${INPUT_CLS} w-28 text-right tabular-nums`}
                                value={row.cost}
                                onChange={(e) => setRow({ cost: e.target.value })}
                              />
                              {targetUnit && (
                                <span className="w-10 text-left text-[11.5px] text-muted">/ {targetUnit}</span>
                              )}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-4">
              <span className="text-[12.5px] text-muted">
                {invoiceRows.filter((r) => r.include && r.ingredientId !== "" && parseNum4(r.cost) !== null).length}{" "}
                linha(s) prontas para aplicar
              </span>
              <div className="flex gap-2">
                <Button onClick={() => setInvoiceRows(null)} disabled={applyingInvoice}>
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  onClick={() => void applyInvoice()}
                  disabled={applyingInvoice}
                >
                  {applyingInvoice ? "Aplicando…" : "Aplicar preços marcados"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteIngId && (
        <ConfirmDialog
          tone="danger"
          icon={<span>🗑</span>}
          title={`Remover "${ingredientById.get(deleteIngId)?.name ?? "insumo"}"?`}
          subtitle={`Este insumo está na ficha de ${ingredientById.get(deleteIngId)?.usedIn ?? 0} produto(s). As linhas dessas fichas serão removidas — os custos dos produtos não mudam sozinhos por isso, a menos que a ficha continue completa.`}
          footer={
            <>
              <Button className="flex-1" onClick={() => setDeleteIngId(null)}>
                Cancelar
              </Button>
              <Button
                className="flex-1"
                variant="primary"
                onClick={() => void doDeleteIngredient(deleteIngId)}
              >
                Remover
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
