"use client";

/**
 * Editor em lote dos campos fiscais do cardápio — padrão dirty-diff + batch PATCH
 * (igual à precificação). Só envia as linhas alteradas para PATCH /api/menu/fiscal.
 * Placeholder de cada célula = o valor herdado (categoria ou padrão da loja).
 */

import { useMemo, useState } from "react";
import { apiFetch, INPUT, Feedback } from "../../_shared";

interface FiscalFields {
  fiscalNcm: string | null;
  fiscalCest: string | null;
  fiscalCfop: string | null;
  fiscalCsosn: string | null;
  fiscalCst: string | null;
  fiscalOrigem: string | null;
  fiscalUnidade: string | null;
}
interface Item extends FiscalFields {
  id: string;
  name: string;
}
interface Category extends FiscalFields {
  id: string;
  name: string;
  items: Item[];
}
type FiscalField = "ncm" | "cfop" | "csosn" | "cst" | "cest";

const SCHEMA_KEY: Record<FiscalField, keyof FiscalFields> = {
  ncm: "fiscalNcm",
  cfop: "fiscalCfop",
  csosn: "fiscalCsosn",
  cst: "fiscalCst",
  cest: "fiscalCest",
};
const LABEL: Record<FiscalField, string> = { ncm: "NCM", cfop: "CFOP", csosn: "CSOSN", cst: "CST", cest: "CEST" };

export function MenuFiscalClient({
  categories,
  regime,
  defaults,
}: {
  categories: Category[];
  regime: string;
  defaults: { ncm: string; cfop: string; csosn: string; cst: string };
}) {
  const [cats, setCats] = useState<Category[]>(categories);
  const [edits, setEdits] = useState<Record<string, Partial<Record<FiscalField, string>>>>({});
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const taxField: FiscalField = regime === "REGIME_NORMAL" ? "cst" : "csosn";
  const fields: FiscalField[] = ["ncm", "cfop", taxField, "cest"];

  const saved = (row: FiscalFields, f: FiscalField): string => row[SCHEMA_KEY[f]] ?? "";
  const cell = (key: string, row: FiscalFields, f: FiscalField): string => edits[key]?.[f] ?? saved(row, f);

  function setCell(key: string, f: FiscalField, val: string) {
    setEdits((e) => ({ ...e, [key]: { ...e[key], [f]: val } }));
  }
  function rowChanges(key: string, row: FiscalFields): Partial<Record<FiscalField, string>> {
    const e = edits[key];
    if (!e) return {};
    const out: Partial<Record<FiscalField, string>> = {};
    for (const f of fields) if (e[f] !== undefined && e[f] !== saved(row, f)) out[f] = e[f]!;
    return out;
  }

  const dirty = useMemo(() => {
    const catRows: { id: string; changes: Partial<Record<FiscalField, string>> }[] = [];
    const itemRows: { id: string; changes: Partial<Record<FiscalField, string>> }[] = [];
    for (const c of cats) {
      const cc = rowChanges(`cat:${c.id}`, c);
      if (Object.keys(cc).length) catRows.push({ id: c.id, changes: cc });
      for (const it of c.items) {
        const ic = rowChanges(`item:${it.id}`, it);
        if (Object.keys(ic).length) itemRows.push({ id: it.id, changes: ic });
      }
    }
    return { catRows, itemRows, count: catRows.length + itemRows.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cats, edits, regime]);

  async function save() {
    setSaving(true);
    setSuccess(null);
    setError(null);
    const payload = {
      categories: dirty.catRows.map((r) => ({ id: r.id, ...r.changes })),
      items: dirty.itemRows.map((r) => ({ id: r.id, ...r.changes })),
    };
    const res = await apiFetch("/api/menu/fiscal", "PATCH", payload);
    if (res.ok) {
      // Aplica os edits na baseline e limpa.
      setCats((prev) =>
        prev.map((c) => {
          const ce = edits[`cat:${c.id}`];
          const nc: Category = { ...c };
          if (ce) for (const f of fields) if (ce[f] !== undefined) nc[SCHEMA_KEY[f]] = ce[f]!.trim() || null;
          nc.items = c.items.map((it) => {
            const ie = edits[`item:${it.id}`];
            const ni: Item = { ...it };
            if (ie) for (const f of fields) if (ie[f] !== undefined) ni[SCHEMA_KEY[f]] = ie[f]!.trim() || null;
            return ni;
          });
          return nc;
        }),
      );
      setEdits({});
      setSuccess(`Salvo. ${dirty.count} ${dirty.count === 1 ? "linha atualizada" : "linhas atualizadas"}.`);
    } else {
      setError((res.data as { error?: string })?.error ?? "Erro ao salvar.");
    }
    setSaving(false);
  }

  const q = search.trim().toLowerCase();
  const visible = q
    ? cats
        .map((c) => ({ ...c, items: c.items.filter((it) => it.name.toLowerCase().includes(q)) }))
        .filter((c) => c.name.toLowerCase().includes(q) || c.items.length > 0)
    : cats;

  function CellInput({ rowKey, row, f, placeholder }: { rowKey: string; row: FiscalFields; f: FiscalField; placeholder: string }) {
    const changed = edits[rowKey]?.[f] !== undefined && edits[rowKey]?.[f] !== saved(row, f);
    return (
      <input
        className={`${INPUT} ${changed ? "border-brand-400 ring-1 ring-brand-200" : ""} px-2 py-1.5`}
        value={cell(rowKey, row, f)}
        placeholder={placeholder}
        onChange={(e) => setCell(rowKey, f, e.target.value)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <Feedback success={success} error={error} onDismiss={() => setError(null)} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          className={`${INPUT} max-w-xs`}
          placeholder="Buscar item ou categoria…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || dirty.count === 0}
          className="rounded-xl bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition"
        >
          {saving ? "Salvando…" : dirty.count ? `Salvar (${dirty.count})` : "Salvar"}
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-paper shadow-sm">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-medium">Item / Categoria</th>
              {fields.map((f) => (
                <th key={f} className="px-3 py-3 font-medium">
                  {LABEL[f]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((c) => {
              const catKey = `cat:${c.id}`;
              const catDefault = (f: FiscalField): string =>
                f === "cest" ? "" : (defaults as Record<string, string>)[f] ?? "";
              return (
                <FragmentRows key={c.id}>
                  {/* Category row */}
                  <tr className="border-b border-line bg-[#FAFAF8]">
                    <td className="px-4 py-2.5 font-semibold text-ink">{c.name}</td>
                    {fields.map((f) => (
                      <td key={f} className="px-3 py-2">
                        <CellInput rowKey={catKey} row={c} f={f} placeholder={catDefault(f) || "padrão"} />
                      </td>
                    ))}
                  </tr>
                  {/* Item rows */}
                  {c.items.map((it) => {
                    const itemKey = `item:${it.id}`;
                    const inherited = (f: FiscalField): string => saved(c, f) || catDefault(f);
                    return (
                      <tr key={it.id} className="border-b border-line last:border-0">
                        <td className="px-4 py-2 pl-8 text-ink2">{it.name}</td>
                        {fields.map((f) => (
                          <td key={f} className="px-3 py-1.5">
                            <CellInput rowKey={itemKey} row={it} f={f} placeholder={inherited(f) || "herda"} />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </FragmentRows>
              );
            })}
          </tbody>
        </table>
      </div>

      {visible.length === 0 && <p className="py-6 text-center text-sm text-muted">Nada encontrado.</p>}
    </div>
  );
}

function FragmentRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
