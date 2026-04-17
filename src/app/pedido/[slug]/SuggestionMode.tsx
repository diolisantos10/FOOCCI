"use client";

import { useState } from "react";

// ── Shared types (mirror PedidoClient) ────────────────────────────────────────

interface MenuItem {
  id: string;
  name: string;
  price: number;
  description: string | null;
  imageUrl: string | null;
  hasVariants: boolean;
  variants: { id: string; name: string; price: number }[];
}

interface MenuCategory {
  id: string;
  name: string;
  imageUrl: string | null;
  items: MenuItem[];
}

// ── Preference types ──────────────────────────────────────────────────────────

type ProteinPref = "carne" | "frango" | "vegetariano" | "qualquer";
type StylePref   = "leve" | "recheado" | "qualquer";
type SuggStep    = "protein" | "style" | "ingredient" | "results";

// ── Suggestion logic ──────────────────────────────────────────────────────────

// ── Keyword maps ──────────────────────────────────────────────────────────────

const PROTEIN_KW: Record<Exclude<ProteinPref, "qualquer">, string[]> = {
  carne:       ["carne", "boi", "bovino", "picanha", "fraldinha", "hambúrgu", "burger",
                "costela", "steak", "alcatra", "churrasco", "smash", "angus"],
  frango:      ["frango", "chicken", "galinha", "peito de fr", "filé de fr"],
  vegetariano: ["vegan", "vegetar", "legum", "salada", "veggie", "tofu", "cogumelo",
                "caprese", "margherita", "primavera", "napolitana", "brócoli", "brocoli"],
};

/**
 * Keywords whose presence EXCLUDES an item when the given protein preference is active.
 * Vegetarians must never see meat/chicken items; other preferences have no hard exclusions.
 */
const EXCLUSION_KW: Partial<Record<Exclude<ProteinPref, "qualquer">, string[]>> = {
  vegetariano: [...PROTEIN_KW.carne, ...PROTEIN_KW.frango],
};

const LEVE_KW  = ["grelhad", "light", "wrap", "fresc", "salada", "cozid", "fit", "vapor"];
const RECHD_KW = ["queijo", "cheese", "recheado", "gratinado", "especial", "duplo",
                  "triplo", "extra", "calabresa", "4 queijos", "quatro queij"];

function getSuggestions(
  categories: MenuCategory[],
  protein: ProteinPref,
  style: StylePref,
  keyword: string
): MenuItem[] {
  type Scored = MenuItem & { score: number };

  const exclusions = protein !== "qualquer" ? (EXCLUSION_KW[protein] ?? []) : [];

  const allItems = categories.flatMap((c) =>
    c.items.map((i) => ({ ...i, catName: c.name }))
  );

  // ── Step 1: Exclusion (hard filter, applied before any scoring) ───────────
  const eligible = exclusions.length > 0
    ? allItems.filter((item) => {
        const text = `${item.catName} ${item.name} ${item.description ?? ""}`.toLowerCase();
        return !exclusions.some((kw) => text.includes(kw));
      })
    : allItems;

  // ── Step 2: Scoring ───────────────────────────────────────────────────────
  const scored: Scored[] = eligible.map((item) => {
    const text = `${item.catName} ${item.name} ${item.description ?? ""}`.toLowerCase();
    let score = 0;

    if (item.imageUrl)    score += 8;
    if (item.description) score += 3;

    if (protein !== "qualquer") {
      score += PROTEIN_KW[protein].filter((kw) => text.includes(kw)).length * 20;
    }

    if (style === "leve")     score += LEVE_KW.filter((kw)  => text.includes(kw)).length * 12;
    if (style === "recheado") score += RECHD_KW.filter((kw) => text.includes(kw)).length * 12;

    const kw = keyword.trim().toLowerCase();
    if (kw && text.includes(kw)) score += 40;

    return { ...item, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // Prefer items with positive score; fall back to full eligible list if not enough
  const pool = scored.filter((i) => i.score > 0).length >= 2
    ? scored.filter((i) => i.score > 0)
    : scored;

  const seen = new Set<string>();
  const out: MenuItem[] = [];
  for (const item of pool) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      out.push(item);
      if (out.length === 3) break;
    }
  }
  return out;
}

// ── Entry Modal ───────────────────────────────────────────────────────────────

export function EntryModal({
  restaurantName,
  onMenu,
  onSuggest,
}: {
  restaurantName: string;
  onMenu: () => void;
  onSuggest: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onMenu} />

      {/* Sheet */}
      <div className="relative z-10 w-full rounded-t-3xl bg-white px-5 pb-8 pt-6 shadow-2xl">
        {/* Handle */}
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-gray-200" />

        {/* Greeting */}
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-gray-400">
          Bem-vindo ao
        </p>
        <p className="mb-5 text-xl font-extrabold text-gray-900 leading-tight">
          {restaurantName}
        </p>
        <p className="mb-6 text-base text-gray-600">
          Como posso te ajudar hoje?
        </p>

        {/* Primary actions */}
        <div className="space-y-3">
          <button
            onClick={onMenu}
            className="flex w-full items-center gap-3 rounded-2xl border-2 border-gray-200 bg-white px-5 py-4 text-left transition active:scale-[.98]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-xl">
              🍽️
            </span>
            <div>
              <p className="text-sm font-bold text-gray-900">Ver cardápio</p>
              <p className="text-xs text-gray-500">Explorar todos os pratos</p>
            </div>
            <svg className="ml-auto h-5 w-5 text-gray-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
            </svg>
          </button>

          <button
            onClick={onSuggest}
            className="flex w-full items-center gap-3 rounded-2xl border-2 border-green-500 bg-green-500 px-5 py-4 text-left transition active:scale-[.98]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-400 text-xl">
              ✨
            </span>
            <div>
              <p className="text-sm font-bold text-white">Quero uma sugestão</p>
              <p className="text-xs text-green-100">Vou te indicar o melhor prato</p>
            </div>
            <svg className="ml-auto h-5 w-5 text-green-200" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
            </svg>
          </button>
        </div>

        <button
          onClick={onMenu}
          className="mt-4 w-full py-2 text-sm text-gray-400 underline-offset-2 hover:underline"
        >
          Pular
        </button>
      </div>
    </div>
  );
}

// ── Floating Sugestão button ──────────────────────────────────────────────────

export function SuggestionButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-20 left-4 z-30 flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-bold text-green-700 shadow-lg ring-1 ring-green-200 transition active:scale-95 hover:shadow-xl"
    >
      <span className="text-base leading-none">✨</span>
      Sugestão
    </button>
  );
}

// ── Suggestion Sheet ──────────────────────────────────────────────────────────

function ProteinChip({
  label, emoji, active, onClick,
}: { label: string; emoji: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 flex-col items-center gap-1.5 rounded-2xl border-2 px-3 py-3 transition active:scale-95 ${
        active
          ? "border-green-500 bg-green-50 text-green-700"
          : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
      }`}
    >
      <span className="text-2xl">{emoji}</span>
      <span className="text-xs font-semibold">{label}</span>
    </button>
  );
}

function StyleChip({
  label, desc, emoji, active, onClick,
}: { label: string; desc: string; emoji: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 flex-col items-center gap-1 rounded-2xl border-2 px-3 py-3 transition active:scale-95 ${
        active
          ? "border-green-500 bg-green-50 text-green-700"
          : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
      }`}
    >
      <span className="text-2xl">{emoji}</span>
      <span className="text-xs font-bold">{label}</span>
      <span className="text-[10px] text-gray-400">{desc}</span>
    </button>
  );
}

function SuggestionCard({
  item,
  onView,
  onAdd,
}: {
  item: MenuItem;
  onView: () => void;
  onAdd: () => void;
}) {
  const price = item.price.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

  return (
    <div className="flex gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
      {/* Image */}
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-gray-100">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl">
            🍽️
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <div>
          <p className="text-sm font-bold text-gray-900 leading-tight line-clamp-1">
            {item.name}
          </p>
          {item.description && (
            <p className="mt-0.5 text-xs text-gray-500 line-clamp-2">
              {item.description}
            </p>
          )}
          <p className="mt-1 text-sm font-extrabold text-green-700">{price}</p>
        </div>

        {/* Actions */}
        <div className="mt-2 flex gap-2">
          <button
            onClick={onView}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 active:scale-95"
          >
            Ver
          </button>
          <button
            onClick={onAdd}
            className="flex-1 rounded-lg bg-green-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-green-600 active:scale-95"
          >
            + Adicionar
          </button>
        </div>
      </div>
    </div>
  );
}

export function SuggestionSheet({
  categories,
  onAdd,
  onView,
  onClose,
}: {
  categories: MenuCategory[];
  onAdd: (item: MenuItem) => void;
  onView: (item: MenuItem) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<SuggStep>("protein");
  const [protein, setProtein] = useState<ProteinPref | null>(null);
  const [style, setStyle] = useState<StylePref | null>(null);
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<MenuItem[]>([]);

  const stepIndex = { protein: 0, style: 1, ingredient: 2, results: 3 }[step];
  const totalSteps = 3; // show 3 dots (protein, style, ingredient) before results

  function goResults(kw: string) {
    const suggestions = getSuggestions(
      categories,
      protein ?? "qualquer",
      style  ?? "qualquer",
      kw
    );
    setResults(suggestions);
    setStep("results");
  }

  function reset() {
    setStep("protein");
    setProtein(null);
    setStyle(null);
    setKeyword("");
    setResults([]);
  }

  function handleAddAndClose(item: MenuItem) {
    onAdd(item);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Sheet */}
      <div className="relative z-10 w-full rounded-t-3xl bg-gray-50 shadow-2xl max-h-[85dvh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 bg-white rounded-t-3xl border-b border-gray-100">
          <div>
            {step !== "results" ? (
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                Passo {stepIndex + 1} de {totalSteps}
              </p>
            ) : (
              <p className="text-[10px] font-semibold uppercase tracking-widest text-green-600">
                Sugestões para você
              </p>
            )}
            <p className="mt-0.5 text-base font-extrabold text-gray-900">
              {step === "protein"    && "Qual é a sua preferência?"}
              {step === "style"      && "Como você está com fome?"}
              {step === "ingredient" && "Algum ingrediente especial?"}
              {step === "results"    && "Aqui estão minhas sugestões ✨"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Step dots */}
        {step !== "results" && (
          <div className="flex justify-center gap-2 py-3 bg-white">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === stepIndex
                    ? "w-6 bg-green-500"
                    : i < stepIndex
                    ? "w-1.5 bg-green-300"
                    : "w-1.5 bg-gray-200"
                }`}
              />
            ))}
          </div>
        )}

        {/* Content */}
        <div className="overflow-y-auto px-5 py-5 flex-1">

          {/* Step 1 — Protein */}
          {step === "protein" && (
            <div className="flex gap-2">
              {([
                { value: "carne",       label: "Carne",        emoji: "🥩" },
                { value: "frango",      label: "Frango",       emoji: "🍗" },
                { value: "vegetariano", label: "Vegetariano",  emoji: "🥗" },
                { value: "qualquer",    label: "Tanto faz",    emoji: "😋" },
              ] as { value: ProteinPref; label: string; emoji: string }[]).map((o) => (
                <ProteinChip
                  key={o.value}
                  label={o.label}
                  emoji={o.emoji}
                  active={protein === o.value}
                  onClick={() => {
                    setProtein(o.value);
                    setStep("style");
                  }}
                />
              ))}
            </div>
          )}

          {/* Step 2 — Style */}
          {step === "style" && (
            <div className="space-y-4">
              <div className="flex gap-2">
                {([
                  { value: "leve",     label: "Levinho",      desc: "Algo mais leve",    emoji: "🥙" },
                  { value: "recheado", label: "Bem recheado", desc: "Bom e farto",       emoji: "🍔" },
                  { value: "qualquer", label: "Tanto faz",    desc: "Qualquer coisa",    emoji: "😄" },
                ] as { value: StylePref; label: string; desc: string; emoji: string }[]).map((o) => (
                  <StyleChip
                    key={o.value}
                    label={o.label}
                    desc={o.desc}
                    emoji={o.emoji}
                    active={style === o.value}
                    onClick={() => {
                      setStyle(o.value);
                      setStep("ingredient");
                    }}
                  />
                ))}
              </div>
              <button
                onClick={() => setStep("protein")}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                ← Voltar
              </button>
            </div>
          )}

          {/* Step 3 — Ingredient */}
          {step === "ingredient" && (
            <div className="space-y-4">
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") goResults(keyword); }}
                placeholder="Ex: pepperoni, cream cheese, bacon…"
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-100"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={() => goResults("")}
                  className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition"
                >
                  Pular
                </button>
                <button
                  onClick={() => goResults(keyword)}
                  className="flex-1 rounded-xl bg-green-500 py-3 text-sm font-bold text-white hover:bg-green-600 transition"
                >
                  Ver sugestões ✨
                </button>
              </div>
              <button
                onClick={() => setStep("style")}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                ← Voltar
              </button>
            </div>
          )}

          {/* Step 4 — Results */}
          {step === "results" && (
            <div className="space-y-4">
              {results.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-3xl mb-3">🤷</p>
                  <p className="text-sm text-gray-500">
                    Não encontrei itens que combinem exatamente com isso.
                  </p>
                  <button
                    onClick={reset}
                    className="mt-4 text-sm font-semibold text-green-600 hover:underline"
                  >
                    Tentar novamente
                  </button>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {results.map((item) => (
                      <SuggestionCard
                        key={item.id}
                        item={item}
                        onView={() => { onView(item); onClose(); }}
                        onAdd={() => handleAddAndClose(item)}
                      />
                    ))}
                  </div>
                  <button
                    onClick={reset}
                    className="w-full py-3 text-sm font-semibold text-gray-500 hover:text-gray-700"
                  >
                    Refazer sugestão
                  </button>
                </>
              )}

              <button
                onClick={onClose}
                className="w-full rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition"
              >
                Voltar ao cardápio
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
