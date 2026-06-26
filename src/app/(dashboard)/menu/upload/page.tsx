"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";

// ── Types (mirrors of API types) ──────────────────────────────────────────────

type RowStatus = "valid" | "error" | "skipped";
type ImportMode = "replace" | "append";
type Step = "upload" | "parsing" | "preview" | "confirming" | "done";

type RowResult = {
  rowIndex: number;
  foto: string;
  categoria: string;
  nome: string;
  descricao: string;
  precoRaw: string;
  preco: number;
  status: RowStatus;
  errors: string[];
};

type ImportPreview = {
  rows: RowResult[];
  categories: string[];
  missingColumns: string[];
  stats: { total: number; valid: number; invalid: number; skipped: number };
};

type ImportSummary = {
  categoriesCreated: number;
  itemsCreated: number;
  skipped: number;
  duplicatesSkipped: number;
  failed: number;
  errors: string[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPrice(n: number) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

// ── Spinner ───────────────────────────────────────────────────────────────────

function Spinner({ size = "sm" }: { size?: "sm" | "lg" }) {
  const cls =
    size === "lg"
      ? "h-10 w-10 border-[3px]"
      : "h-3.5 w-3.5 border-2";
  return (
    <span
      className={`inline-block animate-spin rounded-full border-line2 border-t-orange-500 ${cls}`}
    />
  );
}

// ── Step indicator ────────────────────────────────────────────────────────────

function StepBadge({
  current,
}: {
  current: "upload" | "preview" | "done";
}) {
  const steps = [
    { key: "upload", label: "Upload" },
    { key: "preview", label: "Revisar" },
    { key: "done", label: "Concluído" },
  ];
  const idx = steps.findIndex((s) => s.key === current);
  return (
    <div className="flex items-center gap-1 text-xs text-muted">
      {steps.map((s, i) => (
        <span key={s.key} className="flex items-center gap-1">
          <span
            className={`rounded-full px-2 py-0.5 font-medium ${
              i === idx
                ? "bg-brand-100 text-brand-600"
                : i < idx
                ? "text-muted"
                : "text-muted"
            }`}
          >
            {s.label}
          </span>
          {i < steps.length - 1 && <span className="text-gray-200">›</span>}
        </span>
      ))}
    </div>
  );
}

// ── Upload zone ───────────────────────────────────────────────────────────────

function UploadZone({
  parsing,
  fileName,
  error,
  onFile,
}: {
  parsing: boolean;
  fileName: string;
  error: string;
  onFile: (f: File) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);
  const handleDragLeave = useCallback(() => setDragOver(false), []);
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) onFile(f);
    },
    [onFile]
  );

  return (
    <div className="min-h-screen bg-[#FAFAF8] px-4 py-10">
      <div className="mx-auto max-w-xl">
        {/* Header */}
        <div className="mb-1 flex items-center gap-2 text-sm">
          <Link href="/menu" className="text-muted hover:text-ink2">
            ← Cardápio
          </Link>
        </div>
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-ink">
              Importar planilha
            </h1>
            <p className="mt-1 text-sm text-muted">
              Envie uma planilha com seu cardápio e importe categorias e itens
              automaticamente
            </p>
          </div>
          <StepBadge current="upload" />
        </div>

        {parsing ? (
          <div className="flex flex-col items-center gap-4 rounded-xl border-2 border-line2 bg-paper px-8 py-16">
            <Spinner size="lg" />
            <p className="text-sm text-muted">
              Analisando{" "}
              <span className="font-medium text-ink2">{fileName}</span>…
            </p>
          </div>
        ) : (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
            className={`cursor-pointer rounded-xl border-2 border-dashed bg-paper px-8 py-14 text-center transition-all ${
              dragOver
                ? "border-orange-400 bg-brand-50"
                : "border-line2 hover:border-gray-400"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
                e.target.value = "";
              }}
            />
            <div className="mb-3 text-4xl">📊</div>
            <p className="text-sm font-semibold text-ink2">
              Arraste sua planilha aqui
            </p>
            <p className="mt-1 text-xs text-muted">
              Formatos aceitos: .xlsx · .xls · .csv — até 100 MB
            </p>
            <button
              type="button"
              className="mt-5 rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-600"
            >
              Selecionar arquivo
            </button>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Format reference */}
        {!parsing && (
          <div className="mt-6 rounded-xl border border-line bg-paper px-5 py-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
              Formato esperado
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-line">
                    {["Foto", "Categoria", "Nome do Item", "Descrição", "Preço"].map(
                      (h) => (
                        <th
                          key={h}
                          className="pb-2 pr-4 text-left font-semibold text-ink2"
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody className="text-muted">
                  <tr>
                    <td className="py-1.5 pr-4 italic">URL (opcional)</td>
                    <td className="py-1.5 pr-4">Pizzas</td>
                    <td className="py-1.5 pr-4">Pizza Margherita</td>
                    <td className="py-1.5 pr-4">Molho de tomate…</td>
                    <td className="py-1.5">R$ 42,90</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 pr-4"></td>
                    <td className="py-1.5 pr-4">Bebidas</td>
                    <td className="py-1.5 pr-4">Coca-Cola 350ml</td>
                    <td className="py-1.5 pr-4"></td>
                    <td className="py-1.5">8,00</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted">
              Colunas obrigatórias:{" "}
              <span className="font-medium text-ink2">
                Categoria, Nome do Item, Preço
              </span>
              . Foto e Descrição são opcionais.
            </p>
            <a
              href="/api/menu/import/template"
              download
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              ↓ Baixar planilha modelo (.xlsx)
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Preview table ─────────────────────────────────────────────────────────────

type Filter = "all" | "valid" | "error";

function PreviewTable({
  preview,
  confirming,
  error,
  onConfirm,
  onBack,
}: {
  preview: ImportPreview;
  confirming: boolean;
  error: string;
  onConfirm: (mode: ImportMode) => void;
  onBack: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [mode, setMode] = useState<ImportMode>("replace");

  const { rows, stats, missingColumns } = preview;

  const visibleRows =
    filter === "valid"
      ? rows.filter((r) => r.status === "valid")
      : filter === "error"
      ? rows.filter((r) => r.status === "error")
      : rows;

  // Group visible rows by category
  type GroupedCategory = {
    name: string;
    rows: RowResult[];
    errorCount: number;
  };

  const grouped: GroupedCategory[] = [];
  const groupMap = new Map<string, GroupedCategory>();
  const errorGroup: GroupedCategory = {
    name: "__errors__",
    rows: [],
    errorCount: 0,
  };

  for (const row of visibleRows) {
    if (row.status === "error" && !row.categoria) {
      errorGroup.rows.push(row);
      errorGroup.errorCount++;
    } else {
      const key = row.categoria || "(sem categoria)";
      if (!groupMap.has(key)) {
        const g: GroupedCategory = { name: key, rows: [], errorCount: 0 };
        groupMap.set(key, g);
        grouped.push(g);
      }
      const g = groupMap.get(key)!;
      g.rows.push(row);
      if (row.status === "error") g.errorCount++;
    }
  }
  if (errorGroup.rows.length > 0) grouped.push(errorGroup);

  const canConfirm = stats.valid > 0 && !confirming;

  return (
    <div className="min-h-screen bg-[#FAFAF8] px-4 py-8">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-ink">
              Revisar importação
            </h1>
            <p className="mt-0.5 text-sm text-muted">
              Confira os dados antes de importar
            </p>
          </div>
          <div className="flex items-center gap-3">
            <StepBadge current="preview" />
            <button
              onClick={onBack}
              className="text-sm text-muted hover:text-ink2"
            >
              ← Novo arquivo
            </button>
          </div>
        </div>

        {/* Missing columns warning */}
        {missingColumns.length > 0 && (
          <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3">
            <p className="text-sm font-medium text-yellow-800">
              Colunas não encontradas:{" "}
              <span className="font-semibold">
                {missingColumns.join(", ")}
              </span>
            </p>
            <p className="mt-1 text-xs text-yellow-700">
              Nomes aceitos (não diferencia maiúsculas/acentos):
            </p>
            <ul className="mt-0.5 text-xs text-yellow-700 list-disc list-inside space-y-0.5">
              {missingColumns.includes("Categoria") && (
                <li><span className="font-medium">Categoria:</span> Categoria, Grupo, Category</li>
              )}
              {missingColumns.includes("Nome do Item") && (
                <li><span className="font-medium">Nome do Item:</span> Nome, Nome do Item, Item, Produto, Title</li>
              )}
              {missingColumns.includes("Preço") && (
                <li><span className="font-medium">Preço:</span> Preço, Preco, Valor, Price, Preço Cardápio, Preço Delivery, Preço Site</li>
              )}
            </ul>
          </div>
        )}

        {/* Stats bar + filter tabs */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {/* Filter tabs */}
          <div className="flex rounded-lg border border-line2 bg-paper p-0.5 text-xs font-medium">
            {(
              [
                { key: "all", label: `Todas (${stats.total})` },
                {
                  key: "valid",
                  label: `Válidas (${stats.valid})`,
                  color: "text-green-600",
                },
                {
                  key: "error",
                  label: `Com erro (${stats.invalid})`,
                  color: "text-red-500",
                },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`rounded-md px-3 py-1.5 transition-colors ${
                  filter === tab.key
                    ? "bg-[#F4F4F2] text-ink shadow-sm"
                    : `text-muted hover:text-ink2 ${
                        "color" in tab ? tab.color : ""
                      }`
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Stats chips */}
          <div className="flex items-center gap-2 text-xs">
            {stats.skipped > 0 && (
              <span className="rounded-full bg-[#F4F4F2] px-2 py-1 text-muted">
                {stats.skipped} ignoradas (vazias)
              </span>
            )}
            <span className="rounded-full bg-green-50 px-2 py-1 text-green-700 font-medium">
              {stats.valid} válidas
            </span>
            {stats.invalid > 0 && (
              <span className="rounded-full bg-red-50 px-2 py-1 text-red-600 font-medium">
                {stats.invalid} com erro
              </span>
            )}
          </div>
        </div>

        {/* Grouped preview table */}
        <div className="max-h-[480px] overflow-y-auto rounded-xl border border-line2 bg-paper">
          {grouped.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted">
              Nenhuma linha para exibir.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 border-b border-line bg-[#FAFAF8] text-xs font-semibold text-muted">
                <tr>
                  <th className="w-10 px-3 py-2.5 text-left">#</th>
                  <th className="w-10 px-3 py-2.5 text-left hidden sm:table-cell">Foto</th>
                  <th className="px-3 py-2.5 text-left">Categoria</th>
                  <th className="px-3 py-2.5 text-left">Nome do Item</th>
                  <th className="hidden px-3 py-2.5 text-left md:table-cell">
                    Descrição
                  </th>
                  <th className="px-3 py-2.5 text-right">Preço</th>
                  <th className="px-3 py-2.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {grouped.map((group) => (
                  <>
                    {/* Category separator */}
                    <tr
                      key={`cat-${group.name}`}
                      className="border-t border-line bg-[#FAFAF8]"
                    >
                      <td colSpan={6} className="px-3 py-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-ink2">
                            {group.name === "__errors__"
                              ? "Linhas com erro de categoria"
                              : group.name}
                          </span>
                          <span className="text-xs text-muted">
                            {group.rows.length}{" "}
                            {group.rows.length === 1 ? "item" : "itens"}
                          </span>
                          {group.errorCount > 0 && (
                            <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-xs text-red-600">
                              {group.errorCount}{" "}
                              {group.errorCount === 1 ? "erro" : "erros"}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Item rows */}
                    {group.rows.map((row) => (
                      <tr
                        key={`row-${row.rowIndex}`}
                        className={
                          row.status === "error"
                            ? "bg-red-50"
                            : "hover:bg-[#FAFAF8]"
                        }
                      >
                        <td className="px-3 py-2 text-xs text-muted">
                          {row.rowIndex}
                        </td>
                        <td className="hidden px-3 py-2 sm:table-cell">
                          {row.foto ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={row.foto}
                              alt=""
                              className="h-8 w-8 rounded object-cover bg-[#F4F4F2]"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = "none";
                              }}
                            />
                          ) : (
                            <span className="flex h-8 w-8 items-center justify-center rounded bg-[#F4F4F2] text-xs text-muted">
                              —
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={
                              !row.categoria && row.status === "error"
                                ? "italic text-red-400"
                                : "text-ink2"
                            }
                          >
                            {row.categoria || "—"}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={
                              !row.nome && row.status === "error"
                                ? "italic text-red-400"
                                : "font-medium text-ink"
                            }
                          >
                            {row.nome || "—"}
                          </span>
                          {row.status === "error" && row.errors.length > 0 && (
                            <div className="mt-0.5 space-y-0.5">
                              {row.errors.map((e, i) => (
                                <p
                                  key={i}
                                  className="text-xs text-red-500"
                                >
                                  ✕ {e}
                                </p>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="hidden px-3 py-2 text-xs text-muted md:table-cell">
                          {truncate(row.descricao, 60) || "—"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {row.status === "error" &&
                          row.errors.some((e) => e.toLowerCase().includes("preço")) ? (
                            <span className="text-xs italic text-red-400">
                              {row.precoRaw || "—"}
                            </span>
                          ) : (
                            <span className="font-semibold text-ink2">
                              R$ {formatPrice(row.preco)}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {row.status === "valid" ? (
                            <span className="text-green-500 text-xs">✓</span>
                          ) : (
                            <span className="text-red-400 text-xs">✕</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Import mode + confirm */}
        <div className="mt-4 rounded-xl border border-line2 bg-paper px-5 py-4 space-y-4">
          {/* Mode selection */}
          <div>
            <p className="mb-2 text-sm font-semibold text-ink">
              Modo de importação
            </p>
            <div className="space-y-2">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="radio"
                  name="import-mode"
                  value="replace"
                  checked={mode === "replace"}
                  onChange={() => setMode("replace")}
                  className="mt-0.5 accent-orange-500"
                />
                <div>
                  <p className="text-sm font-medium text-ink">
                    Substituir cardápio atual
                  </p>
                  <p className="text-xs text-muted">
                    Remove todas as categorias e itens existentes antes de
                    importar
                  </p>
                </div>
              </label>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="radio"
                  name="import-mode"
                  value="append"
                  checked={mode === "append"}
                  onChange={() => setMode("append")}
                  className="mt-0.5 accent-orange-500"
                />
                <div>
                  <p className="text-sm font-medium text-ink">
                    Adicionar ao cardápio atual
                  </p>
                  <p className="text-xs text-muted">
                    Mantém o cardápio existente e adiciona os novos itens.
                    Categorias com o mesmo nome receberão os novos itens.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Validation notice */}
          {stats.invalid > 0 && (
            <p className="rounded-lg bg-yellow-50 px-3 py-2 text-xs text-yellow-700">
              ⚠ {stats.invalid} linha
              {stats.invalid !== 1 ? "s" : ""} com erro serão ignorada
              {stats.invalid !== 1 ? "s" : ""} na importação.{" "}
              {stats.valid === 0
                ? "Corrija os erros e tente novamente."
                : `Apenas ${stats.valid} ${stats.valid === 1 ? "linha válida será importada" : "linhas válidas serão importadas"}.`}
            </p>
          )}

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}

          {/* Confirm button */}
          <button
            onClick={() => onConfirm(mode)}
            disabled={!canConfirm}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-40"
          >
            {confirming ? (
              <>
                <Spinner /> Importando…
              </>
            ) : (
              `Confirmar importação (${stats.valid} ${stats.valid === 1 ? "item" : "itens"})`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Summary screen ────────────────────────────────────────────────────────────

function SummaryScreen({ summary }: { summary: ImportSummary }) {
  const hasErrors = summary.failed > 0 || summary.errors.length > 0;
  const [showErrors, setShowErrors] = useState(false);

  return (
    <div className="min-h-screen bg-[#FAFAF8] px-4 py-16">
      <div className="mx-auto max-w-md">
        {/* Icon + title */}
        <div className="mb-8 text-center">
          <div className="mb-3 text-5xl">{hasErrors ? "⚠️" : "✅"}</div>
          <h1 className="text-xl font-bold text-ink">
            {hasErrors
              ? "Importação concluída com avisos"
              : "Cardápio importado com sucesso"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            Seu cardápio foi atualizado.
          </p>
        </div>

        {/* Stats grid */}
        <div className="mb-6 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-line2 bg-paper px-4 py-4 text-center">
            <p className="text-2xl font-bold text-brand-600">
              {summary.categoriesCreated}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {summary.categoriesCreated === 1
                ? "Categoria criada"
                : "Categorias criadas"}
            </p>
          </div>
          <div className="rounded-xl border border-line2 bg-paper px-4 py-4 text-center">
            <p className="text-2xl font-bold text-brand-600">
              {summary.itemsCreated}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {summary.itemsCreated === 1 ? "Item criado" : "Itens criados"}
            </p>
          </div>
          <div className="rounded-xl border border-line2 bg-paper px-4 py-4 text-center">
            <p className="text-2xl font-bold text-muted">
              {summary.skipped}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {summary.skipped === 1
                ? "Linha ignorada"
                : "Linhas ignoradas"}
            </p>
          </div>
          {(summary.duplicatesSkipped ?? 0) > 0 && (
            <div className="col-span-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-4 text-center">
              <p className="text-2xl font-bold text-blue-500">
                {summary.duplicatesSkipped}
              </p>
              <p className="mt-0.5 text-xs text-blue-600">
                {summary.duplicatesSkipped === 1
                  ? "Duplicata ignorada (já existia)"
                  : "Duplicatas ignoradas (já existiam)"}
              </p>
            </div>
          )}
          <div
            className={`rounded-xl border bg-paper px-4 py-4 text-center ${
              summary.failed > 0
                ? "border-red-200"
                : "border-line2"
            }`}
          >
            <p
              className={`text-2xl font-bold ${
                summary.failed > 0 ? "text-red-500" : "text-muted"
              }`}
            >
              {summary.failed}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {summary.failed === 1 ? "Linha com falha" : "Linhas com falha"}
            </p>
          </div>
        </div>

        {/* Errors toggle */}
        {summary.errors.length > 0 && (
          <div className="mb-6 rounded-xl border border-red-100 bg-red-50 px-4 py-3">
            <button
              onClick={() => setShowErrors((v) => !v)}
              className="flex w-full items-center justify-between text-sm font-medium text-red-700"
            >
              <span>{summary.errors.length} erro(s) detalhado(s)</span>
              <span>{showErrors ? "▲" : "▼"}</span>
            </button>
            {showErrors && (
              <ul className="mt-2 space-y-1">
                {summary.errors.map((e, i) => (
                  <li key={i} className="text-xs text-red-600">
                    • {e}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <Link
            href="/menu"
            className="flex items-center justify-center rounded-lg bg-orange-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-orange-600"
          >
            Ver cardápio
          </Link>
          <Link
            href="/menu/upload"
            className="flex items-center justify-center rounded-lg border border-line2 bg-paper px-6 py-2.5 text-sm font-medium text-ink2 hover:bg-[#FAFAF8]"
          >
            Importar outra planilha
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MenuUploadPage() {
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState("");

  async function handleFile(file: File) {
    setFileName(file.name);
    setError("");
    setStep("parsing");

    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/menu/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error ?? "Erro ao processar arquivo.");
      }
      setPreview(data.data as ImportPreview);
      setStep("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido.");
      setStep("upload");
    }
  }

  async function handleConfirm(mode: ImportMode) {
    if (!preview) return;
    setError("");
    setStep("confirming");

    try {
      const res = await fetch("/api/menu/import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: preview.rows, mode }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error ?? "Erro ao importar cardápio.");
      }
      setSummary(data.data as ImportSummary);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido.");
      setStep("preview");
    }
  }

  function reset() {
    setStep("upload");
    setFileName("");
    setPreview(null);
    setSummary(null);
    setError("");
  }

  if (step === "done" && summary) {
    return <SummaryScreen summary={summary} />;
  }

  if ((step === "preview" || step === "confirming") && preview) {
    return (
      <PreviewTable
        preview={preview}
        confirming={step === "confirming"}
        error={error}
        onConfirm={handleConfirm}
        onBack={reset}
      />
    );
  }

  return (
    <UploadZone
      parsing={step === "parsing"}
      fileName={fileName}
      error={error}
      onFile={handleFile}
    />
  );
}
