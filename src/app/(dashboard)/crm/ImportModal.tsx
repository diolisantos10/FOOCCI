"use client";

import { useState, useRef } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ParsedFile {
  columns: string[];
  rows: Record<string, string>[];
  totalRows: number;
  fileName: string;
}

interface FieldMapping {
  phone: string;
  name?: string;
  email?: string;
  birthday?: string;
}

interface PreviewData {
  totalRows: number;
  newCount: number;
  updateCount: number;
  invalidCount: number;
  dupesInFile: number;
  sample: Array<{
    name: string | null;
    phone: string;
    email: string | null;
    status: "new" | "update" | "invalid";
    reason?: string;
  }>;
}

interface DoneData {
  created: number;
  updated: number;
  invalid: number;
  total: number;
}

type Step = "upload" | "map" | "preview" | "importing" | "done";

// ── Field auto-detection ──────────────────────────────────────────────────────

const PHONE_HINTS    = ["telefone", "phone", "celular", "fone", "tel", "whatsapp", "mobile"];
const NAME_HINTS     = ["nome", "name", "cliente", "customer", "razao", "razão"];
const EMAIL_HINTS    = ["email", "e-mail", "mail", "correio"];
const BIRTHDAY_HINTS = ["aniversario", "aniversário", "nascimento", "birthday", "data_nascimento", "birth"];

function autoDetect(columns: string[]): FieldMapping {
  const lower = columns.map((c) => c.toLowerCase().replace(/\s/g, "_"));

  function find(hints: string[]) {
    const idx = lower.findIndex((c) => hints.some((h) => c.includes(h)));
    return idx >= 0 ? columns[idx] : undefined;
  }

  const phone = find(PHONE_HINTS) ?? columns[0] ?? "";
  return {
    phone,
    name:     find(NAME_HINTS),
    email:    find(EMAIL_HINTS),
    birthday: find(BIRTHDAY_HINTS),
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StepDots({ step }: { step: Step }) {
  const steps: Step[] = ["upload", "map", "preview", "done"];
  const current = steps.indexOf(step === "importing" ? "preview" : step);
  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {steps.map((s, i) => (
        <span
          key={s}
          className={`h-2 rounded-full transition-all ${
            i === current
              ? "w-6 bg-brand-600"
              : i < current
              ? "w-2 bg-brand-300"
              : "w-2 bg-gray-200"
          }`}
        />
      ))}
    </div>
  );
}

// ── Step 1: Upload ────────────────────────────────────────────────────────────

function UploadStep({
  onParsed,
}: {
  onParsed: (data: ParsedFile) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setLoading(true);

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/crm/import/parse", {
      method: "POST",
      body: formData,
    });

    const json = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(json.error ?? "Falha ao processar arquivo");
      return;
    }

    onParsed({
      columns: json.columns,
      rows: json.rows,
      totalRows: json.totalRows,
      fileName: file.name,
    });
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-gray-800">Importar clientes</p>
        <p className="text-xs text-gray-500 mt-0.5">
          Envie um arquivo CSV ou XLSX com sua lista de clientes.
        </p>
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        disabled={loading}
        className={`w-full rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragging
            ? "border-brand-400 bg-brand-50"
            : "border-gray-200 bg-gray-50 hover:border-brand-300 hover:bg-brand-50/50"
        } disabled:opacity-60`}
      >
        <div className="flex flex-col items-center gap-3">
          <svg className="h-10 w-10 text-gray-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.338-2.32 5.75 5.75 0 0 1 1.14 11.093" />
          </svg>
          {loading ? (
            <span className="text-sm text-gray-500">Processando…</span>
          ) : (
            <>
              <span className="text-sm font-semibold text-gray-700">
                Arraste o arquivo aqui ou clique para selecionar
              </span>
              <span className="text-xs text-gray-400">CSV ou XLSX • máx. 50 000 linhas</span>
            </>
          )}
        </div>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        className="hidden"
        onChange={onInputChange}
      />

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 border border-red-100">
          {error}
        </p>
      )}
    </div>
  );
}

// ── Step 2: Map fields ────────────────────────────────────────────────────────

function MapStep({
  parsed,
  onConfirm,
  onBack,
}: {
  parsed: ParsedFile;
  onConfirm: (mapping: FieldMapping) => void;
  onBack: () => void;
}) {
  const [mapping, setMapping] = useState<FieldMapping>(() =>
    autoDetect(parsed.columns)
  );

  const none = "";
  const options = [{ value: none, label: "— não importar —" }, ...parsed.columns.map((c) => ({ value: c, label: c }))];

  function set(field: keyof FieldMapping, value: string) {
    setMapping((prev) => ({ ...prev, [field]: value || undefined }));
  }

  const canContinue = !!mapping.phone;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold text-gray-800">Mapeie as colunas</p>
        <p className="text-xs text-gray-500 mt-0.5">
          Arquivo: <strong>{parsed.fileName}</strong> • {parsed.totalRows} linhas
        </p>
      </div>

      <div className="space-y-3">
        {/* Phone — required */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Telefone <span className="text-red-500">*</span>
          </label>
          <select
            value={mapping.phone}
            onChange={(e) => set("phone", e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            {parsed.columns.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <p className="mt-1 text-[10px] text-gray-400">
            Usado como identificador único para deduplicação.
          </p>
        </div>

        {/* Name */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Nome</label>
          <select
            value={mapping.name ?? none}
            onChange={(e) => set("name", e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Email */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">E-mail</label>
          <select
            value={mapping.email ?? none}
            onChange={(e) => set("email", e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Birthday */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Aniversário <span className="text-gray-400 font-normal">(DD/MM/AAAA)</span>
          </label>
          <select
            value={mapping.birthday ?? none}
            onChange={(e) => set("birthday", e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* Sample preview */}
      {parsed.rows.length > 0 && (
        <div className="rounded-xl border border-gray-100 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {parsed.columns.slice(0, 5).map((c) => (
                  <th key={c} className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parsed.rows.slice(0, 3).map((row, i) => (
                <tr key={i} className="border-b border-gray-50 last:border-0">
                  {parsed.columns.slice(0, 5).map((c) => (
                    <td key={c} className="px-3 py-2 text-gray-700 max-w-[120px] truncate">{row[c] ?? ""}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-1.5 text-[10px] text-gray-400 border-t border-gray-50">
            Prévia das primeiras 3 linhas
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={onBack} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
          Voltar
        </button>
        <button
          onClick={() => onConfirm(mapping)}
          disabled={!canContinue}
          className="flex-1 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
        >
          Ver prévia da importação
        </button>
      </div>
    </div>
  );
}

// ── Step 3: Preview ───────────────────────────────────────────────────────────

function PreviewStep({
  preview,
  onConfirm,
  onBack,
  loading,
}: {
  preview: PreviewData;
  onConfirm: () => void;
  onBack: () => void;
  loading: boolean;
}) {
  const stats = [
    { label: "Total de linhas",         value: preview.totalRows,    color: "text-gray-900" },
    { label: "Novos clientes",           value: preview.newCount,     color: "text-green-700" },
    { label: "Clientes a atualizar",     value: preview.updateCount,  color: "text-blue-700" },
    { label: "Duplicatas no arquivo",    value: preview.dupesInFile,  color: "text-orange-600" },
    { label: "Linhas inválidas",         value: preview.invalidCount, color: "text-red-600" },
  ];

  const importCount = preview.newCount + preview.updateCount;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold text-gray-800">Confirmar importação</p>
        <p className="text-xs text-gray-500 mt-0.5">
          Revise os dados antes de prosseguir.
        </p>
      </div>

      {/* Stats */}
      <div className="rounded-2xl border border-gray-100 bg-gray-50 divide-y divide-gray-100">
        {stats.map((s) => (
          <div key={s.label} className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-gray-600">{s.label}</span>
            <span className={`text-sm font-bold ${s.color}`}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* Sample rows */}
      {preview.sample.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-600 mb-2">Amostra de dados processados</p>
          <div className="space-y-1.5">
            {preview.sample.map((row, i) => (
              <div key={i} className={`flex items-center gap-3 rounded-xl px-3 py-2 text-xs border ${
                row.status === "new"    ? "bg-green-50 border-green-100" :
                row.status === "update" ? "bg-blue-50 border-blue-100"  :
                "bg-red-50 border-red-100"
              }`}>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  row.status === "new"    ? "bg-green-200 text-green-800" :
                  row.status === "update" ? "bg-blue-200 text-blue-800"  :
                  "bg-red-200 text-red-800"
                }`}>
                  {row.status === "new" ? "NOVO" : row.status === "update" ? "ATUALIZAR" : "INVÁLIDO"}
                </span>
                <span className="font-medium text-gray-800 truncate">{row.name ?? "Sem nome"}</span>
                <span className="text-gray-500 truncate">{row.phone}</span>
                {row.reason && <span className="ml-auto text-red-500 truncate">{row.reason}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {importCount === 0 && (
        <p className="rounded-xl bg-yellow-50 border border-yellow-100 px-4 py-3 text-sm text-yellow-700">
          Nenhum dado válido encontrado para importar.
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={onBack}
          disabled={loading}
          className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          Voltar
        </button>
        <button
          onClick={onConfirm}
          disabled={loading || importCount === 0}
          className="flex-1 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
        >
          {loading ? "Importando…" : `Importar ${importCount} cliente${importCount !== 1 ? "s" : ""}`}
        </button>
      </div>
    </div>
  );
}

// ── Step 4: Done ──────────────────────────────────────────────────────────────

function DoneStep({ done, onClose }: { done: DoneData; onClose: () => void }) {
  return (
    <div className="flex flex-col items-center gap-5 py-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
        <svg className="h-8 w-8 text-green-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
      </div>

      <div>
        <p className="text-base font-bold text-gray-900">Importação concluída!</p>
        <p className="mt-1 text-sm text-gray-500">{done.total} linhas processadas</p>
      </div>

      <div className="w-full rounded-2xl border border-gray-100 bg-gray-50 divide-y divide-gray-100">
        <div className="flex justify-between px-4 py-3 text-sm">
          <span className="text-gray-600">Clientes criados</span>
          <span className="font-bold text-green-700">{done.created}</span>
        </div>
        <div className="flex justify-between px-4 py-3 text-sm">
          <span className="text-gray-600">Clientes atualizados</span>
          <span className="font-bold text-blue-700">{done.updated}</span>
        </div>
        {done.invalid > 0 && (
          <div className="flex justify-between px-4 py-3 text-sm">
            <span className="text-gray-600">Linhas ignoradas</span>
            <span className="font-bold text-red-600">{done.invalid}</span>
          </div>
        )}
      </div>

      <button
        onClick={onClose}
        className="w-full rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700 transition-colors"
      >
        Concluir
      </button>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export function ImportModal({
  open,
  onClose,
  onComplete,
}: {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}) {
  const [step, setStep] = useState<Step>("upload");
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<FieldMapping | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [done, setDone] = useState<DoneData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  function reset() {
    setStep("upload");
    setParsed(null);
    setMapping(null);
    setPreview(null);
    setDone(null);
    setError(null);
    setImporting(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleParsed(data: ParsedFile) {
    setParsed(data);
    setStep("map");
  }

  async function handleMappingConfirm(m: FieldMapping) {
    if (!parsed) return;
    setMapping(m);
    setError(null);

    const res = await fetch("/api/crm/import/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: parsed.rows, mapping: m, dryRun: true }),
    });

    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Falha ao calcular prévia");
      return;
    }

    setPreview(json.data as PreviewData);
    setStep("preview");
  }

  async function handleImportConfirm() {
    if (!parsed || !mapping) return;
    setImporting(true);
    setError(null);

    const res = await fetch("/api/crm/import/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: parsed.rows, mapping, dryRun: false }),
    });

    const json = await res.json();
    setImporting(false);

    if (!res.ok) {
      setError(json.error ?? "Falha na importação");
      return;
    }

    setDone(json.data as DoneData);
    setStep("done");
  }

  function handleDoneClose() {
    reset();
    onClose();
    onComplete();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={step !== "importing" ? handleClose : undefined}
      />

      {/* Panel */}
      <div className="relative z-10 w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Handle */}
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
            {step === "upload" ? "Importar clientes"
            : step === "map"  ? "Mapear colunas"
            : step === "preview" ? "Prévia"
            : step === "importing" ? "Importando…"
            : "Concluído"}
          </p>
          {step !== "importing" && (
            <button
              onClick={handleClose}
              className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 transition-colors"
              aria-label="Fechar"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <div className="px-5 pb-6">
          <StepDots step={step} />

          {error && (
            <div className="mb-4 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {step === "upload" && (
            <UploadStep onParsed={handleParsed} />
          )}

          {step === "map" && parsed && (
            <MapStep
              parsed={parsed}
              onConfirm={handleMappingConfirm}
              onBack={() => setStep("upload")}
            />
          )}

          {(step === "preview" || step === "importing") && preview && (
            <PreviewStep
              preview={preview}
              onConfirm={handleImportConfirm}
              onBack={() => setStep("map")}
              loading={importing}
            />
          )}

          {step === "done" && done && (
            <DoneStep done={done} onClose={handleDoneClose} />
          )}
        </div>
      </div>
    </div>
  );
}
