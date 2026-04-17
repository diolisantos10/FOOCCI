"use client";

import { useState, useCallback, useRef } from "react";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

type ParsedItem = { name: string; description: string; price: number };
type ParsedCategory = { name: string; items: ParsedItem[] };
type ParseResult = { categories: ParsedCategory[]; warnings: string[] };

type EditItem = { id: string; name: string; description: string; price: string };
type EditCategory = { id: string; name: string; items: EditItem[] };

type Step = "idle" | "parsing" | "preview" | "saving" | "done";

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function toEditCategories(cats: ParsedCategory[]): EditCategory[] {
  return cats.map((c) => ({
    id: uid(),
    name: c.name,
    items: c.items.map((it) => ({
      id: uid(),
      name: it.name,
      description: it.description,
      price: it.price > 0 ? it.price.toFixed(2) : "",
    })),
  }));
}

function toConfirmPayload(cats: EditCategory[]): ParsedCategory[] {
  return cats
    .filter((c) => c.name.trim())
    .map((c) => ({
      name: c.name.trim(),
      items: c.items
        .filter((it) => it.name.trim())
        .map((it) => ({
          name: it.name.trim(),
          description: it.description.trim(),
          price: parseFloat(it.price.replace(",", ".")) || 0,
        })),
    }))
    .filter((c) => c.items.length > 0);
}

// ── Primitives ────────────────────────────────────────────────────────────────

function Spinner({ large }: { large?: boolean }) {
  const size = large ? "h-8 w-8 border-[3px]" : "h-3.5 w-3.5 border-2";
  return (
    <span
      className={`inline-block animate-spin rounded-full border-gray-300 border-t-orange-500 ${size}`}
    />
  );
}

// ── Upload zone (idle / parsing) ──────────────────────────────────────────────

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
    <div className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="mx-auto max-w-lg">
        {/* Header */}
        <div className="mb-2 flex items-center gap-2">
          <Link
            href="/dashboard/menu"
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            ← Cardápio
          </Link>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Importar Cardápio</h1>
        <p className="mt-1 text-sm text-gray-500">
          Envie uma planilha ou PDF e montamos seu cardápio automaticamente
        </p>

        <div className="mt-8 space-y-4">
          {parsing ? (
            <div className="flex flex-col items-center gap-4 rounded-xl border-2 border-gray-200 bg-white px-8 py-16">
              <Spinner large />
              <p className="text-sm text-gray-500">
                Processando <span className="font-medium">{fileName}</span>…
              </p>
            </div>
          ) : (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={`cursor-pointer rounded-xl border-2 border-dashed bg-white px-8 py-16 text-center transition-all ${
                dragOver
                  ? "border-orange-400 bg-orange-50"
                  : "border-gray-300 hover:border-gray-400"
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls,.csv,.pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                  e.target.value = "";
                }}
              />
              <div className="mb-3 text-4xl">📄</div>
              <p className="text-sm font-medium text-gray-700">
                Arraste seu arquivo aqui
              </p>
              <p className="mt-1 text-xs text-gray-400">
                .xlsx · .xls · .csv · .pdf — até 20 MB
              </p>
              <button
                type="button"
                className="mt-6 rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-600"
              >
                Selecionar arquivo
              </button>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Hint card */}
          {!parsing && (
            <div className="rounded-lg border border-gray-100 bg-white px-4 py-3 text-xs text-gray-500 space-y-1">
              <p className="font-semibold text-gray-700">
                Como preparar sua planilha
              </p>
              <p>
                • Colunas:{" "}
                <span className="font-medium text-gray-600">
                  Categoria | Nome | Descrição | Preço
                </span>
              </p>
              <p>• Uma linha por item</p>
              <p>
                • Preço:{" "}
                <span className="font-medium text-gray-600">
                  42,90
                </span>{" "}
                ou{" "}
                <span className="font-medium text-gray-600">R$ 42,90</span>
              </p>
              <p>• Linhas vazias são ignoradas</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Preview / edit screen ─────────────────────────────────────────────────────

function PreviewScreen({
  editCats,
  warnings,
  saving,
  error,
  onChange,
  onConfirm,
  onBack,
}: {
  editCats: EditCategory[];
  warnings: string[];
  saving: boolean;
  error: string;
  onChange: (cats: EditCategory[]) => void;
  onConfirm: (clearExisting: boolean) => void;
  onBack: () => void;
}) {
  const [clearExisting, setClearExisting] = useState(true);

  const totalItems = editCats.reduce((s, c) => s + c.items.length, 0);

  function setCatName(id: string, name: string) {
    onChange(editCats.map((c) => (c.id === id ? { ...c, name } : c)));
  }

  function removeCategory(id: string) {
    onChange(editCats.filter((c) => c.id !== id));
  }

  function patchItem(
    catId: string,
    itemId: string,
    patch: Partial<EditItem>
  ) {
    onChange(
      editCats.map((c) =>
        c.id === catId
          ? {
              ...c,
              items: c.items.map((it) =>
                it.id === itemId ? { ...it, ...patch } : it
              ),
            }
          : c
      )
    );
  }

  function removeItem(catId: string, itemId: string) {
    onChange(
      editCats.map((c) =>
        c.id === catId
          ? { ...c, items: c.items.filter((it) => it.id !== itemId) }
          : c
      )
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              Revisar cardápio
            </h1>
            <p className="mt-0.5 text-sm text-gray-500">
              {editCats.length}{" "}
              {editCats.length === 1 ? "categoria" : "categorias"} ·{" "}
              {totalItems} {totalItems === 1 ? "item" : "itens"}
            </p>
          </div>
          <button
            onClick={onBack}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            ← Novo arquivo
          </button>
        </div>

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="mb-5 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 space-y-1">
            {warnings.map((w, i) => (
              <p key={i} className="text-xs text-yellow-800">
                ⚠ {w}
              </p>
            ))}
          </div>
        )}

        {/* Category cards */}
        <div className="space-y-4">
          {editCats.map((cat) => (
            <div
              key={cat.id}
              className="overflow-hidden rounded-xl border border-gray-200 bg-white"
            >
              {/* Category header row */}
              <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2.5">
                <input
                  value={cat.name}
                  onChange={(e) => setCatName(cat.id, e.target.value)}
                  className="flex-1 rounded bg-transparent px-1 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-1 focus:ring-orange-400"
                  placeholder="Nome da categoria"
                />
                <span className="shrink-0 text-xs text-gray-400">
                  {cat.items.length}{" "}
                  {cat.items.length === 1 ? "item" : "itens"}
                </span>
                <button
                  onClick={() => removeCategory(cat.id)}
                  title="Remover categoria"
                  className="ml-1 shrink-0 text-sm text-gray-300 hover:text-red-400"
                >
                  ×
                </button>
              </div>

              {/* Item rows */}
              <div className="divide-y divide-gray-50">
                {cat.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 px-4 py-2.5"
                  >
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <input
                        value={item.name}
                        onChange={(e) =>
                          patchItem(cat.id, item.id, { name: e.target.value })
                        }
                        className="w-full border-b border-transparent text-sm font-medium text-gray-800 focus:border-orange-300 focus:outline-none"
                        placeholder="Nome do item"
                      />
                      <input
                        value={item.description}
                        onChange={(e) =>
                          patchItem(cat.id, item.id, {
                            description: e.target.value,
                          })
                        }
                        className="w-full border-b border-transparent text-xs text-gray-400 focus:border-orange-200 focus:outline-none"
                        placeholder="Descrição (opcional)"
                      />
                    </div>
                    {/* Price */}
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="text-xs text-gray-400">R$</span>
                      <input
                        value={item.price}
                        onChange={(e) =>
                          patchItem(cat.id, item.id, { price: e.target.value })
                        }
                        className="w-16 border-b border-transparent text-right text-sm font-semibold text-gray-700 focus:border-orange-300 focus:outline-none"
                        placeholder="0,00"
                      />
                    </div>
                    <button
                      onClick={() => removeItem(cat.id, item.id)}
                      title="Remover item"
                      className="shrink-0 text-sm text-gray-200 hover:text-red-400"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {editCats.length === 0 && (
          <p className="py-10 text-center text-sm text-gray-400">
            Nenhuma categoria. Volte e envie outro arquivo.
          </p>
        )}

        {/* Confirm panel */}
        <div className="mt-6 space-y-3 rounded-xl border border-gray-200 bg-white px-4 py-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={clearExisting}
              onChange={(e) => setClearExisting(e.target.checked)}
              className="mt-0.5 accent-orange-500"
            />
            <div>
              <p className="text-sm font-medium text-gray-800">
                Substituir cardápio atual
              </p>
              <p className="text-xs text-gray-400">
                As categorias e itens existentes serão removidos antes de
                importar
              </p>
            </div>
          </label>

          {error && (
            <p className="rounded bg-red-50 px-3 py-2 text-xs text-red-600">
              {error}
            </p>
          )}

          <button
            onClick={() => onConfirm(clearExisting)}
            disabled={saving || editCats.length === 0}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {saving ? (
              <>
                <Spinner /> Importando…
              </>
            ) : (
              "Confirmar importação"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Success screen ────────────────────────────────────────────────────────────

function SuccessScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="text-center">
        <div className="mb-4 text-5xl">✅</div>
        <h1 className="text-xl font-bold text-gray-900">
          Cardápio importado com sucesso
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Seus itens estão disponíveis no cardápio.
        </p>
        <Link
          href="/dashboard/menu"
          className="mt-6 inline-block rounded-lg bg-orange-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-orange-600"
        >
          Ver cardápio
        </Link>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MenuUploadPage() {
  const [step, setStep] = useState<Step>("idle");
  const [fileName, setFileName] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [editCats, setEditCats] = useState<EditCategory[]>([]);
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
      const result: ParseResult = data.data;
      setWarnings(result.warnings);
      setEditCats(toEditCategories(result.categories));
      setStep("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido.");
      setStep("idle");
    }
  }

  async function handleConfirm(clearExisting: boolean) {
    setError("");
    setStep("saving");

    const categories = toConfirmPayload(editCats);
    if (categories.length === 0) {
      setError("Nenhum item válido para importar.");
      setStep("preview");
      return;
    }

    try {
      const res = await fetch("/api/menu/import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categories, clearExisting }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error ?? "Erro ao salvar cardápio.");
      }
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido.");
      setStep("preview");
    }
  }

  if (step === "done") return <SuccessScreen />;

  if (step === "preview" || step === "saving") {
    return (
      <PreviewScreen
        editCats={editCats}
        warnings={warnings}
        saving={step === "saving"}
        error={error}
        onChange={setEditCats}
        onConfirm={handleConfirm}
        onBack={() => {
          setStep("idle");
          setEditCats([]);
          setWarnings([]);
          setError("");
        }}
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
