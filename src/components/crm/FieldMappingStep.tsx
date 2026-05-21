"use client";

import { useState, useCallback } from "react";
import {
  CANONICAL_FIELDS,
  ColumnMapping,
  DetectedMapping,
  ConfidenceLevel,
  validateMapping,
  FieldGroup,
} from "@/services/crm/UniversalFieldMapper";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FieldMappingStepProps {
  sourceHeaders:  string[];
  detected:       DetectedMapping[];
  sampleRows:     Record<string, string>[];
  importType:     "customers" | "products" | "generic";
  onConfirm:      (mappings: ColumnMapping[]) => void;
  onSaveTemplate: (name: string, mappings: ColumnMapping[]) => Promise<void>;
  savedTemplates: Array<{ id: string; name: string; sourceSystem: string; mappings: unknown }>;
  onLoadTemplate: (id: string) => void;
  onDeleteTemplate: (id: string) => Promise<void>;
}

// ── Confidence dot ────────────────────────────────────────────────────────────
// Score-based color: GREEN ≥85, YELLOW 70-84, AMBER 50-69, GRAY <50 or conflict.

function ConfidenceDot({
  score,
  conflict,
  tooltip,
}: {
  score:     number;
  conflict?: boolean;
  tooltip?:  string;
}) {
  const dotColor = conflict
    ? "bg-red-400"
    : score >= 85 ? "bg-emerald-500"
    : score >= 70 ? "bg-yellow-400"
    : score >= 50 ? "bg-amber-500"
    : "bg-gray-300";

  const label = conflict
    ? "Conflito"
    : score >= 85 ? "Alta"
    : score >= 70 ? "Média"
    : "Baixa";

  return (
    <span className="inline-flex items-center gap-1.5" title={tooltip}>
      <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${dotColor}`} />
      <span className="text-xs text-gray-500">{label}</span>
    </span>
  );
}

// kept for type-checking only — no longer rendered
const _CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  high:     "Alta",
  medium:   "Média",
  low:      "Baixa",
  conflict: "Conflito",
};
void _CONFIDENCE_LABELS;

// ── Group labels ──────────────────────────────────────────────────────────────

const GROUP_LABELS: Record<FieldGroup, string> = {
  identity: "Identidade",
  metrics:  "Métricas",
  contact:  "Contato",
  address:  "Endereço",
  product:  "Produto",
  system:   "Sistema",
};

// ── Main component ────────────────────────────────────────────────────────────

export function FieldMappingStep({
  sourceHeaders,
  detected,
  sampleRows,
  importType,
  onConfirm,
  onSaveTemplate,
  savedTemplates,
  onLoadTemplate,
  onDeleteTemplate,
}: FieldMappingStepProps) {
  // Build initial mappings from auto-detected results
  const buildInitialMappings = useCallback((): ColumnMapping[] => {
    return sourceHeaders.map((header) => {
      const d = detected.find((d) => d.sourceHeader === header);
      // Auto-fill only high/medium confidence non-conflicting matches
      const autoKey = d && d.confidence !== "conflict" && d.confidence !== "low"
        ? d.canonicalKey
        : "";
      return { sourceHeader: header, canonicalKey: autoKey };
    });
  }, [sourceHeaders, detected]);

  const [mappings, setMappings] = useState<ColumnMapping[]>(buildInitialMappings);
  const [templateName, setTemplateName]   = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateSaved, setTemplateSaved]   = useState(false);
  const [deletingId, setDeletingId]         = useState<string | null>(null);
  const [showSave, setShowSave]             = useState(false);

  const validation = validateMapping(mappings, importType);

  function setMapping(sourceHeader: string, canonicalKey: string) {
    setMappings((prev) =>
      prev.map((m) => m.sourceHeader === sourceHeader ? { ...m, canonicalKey } : m)
    );
  }

  // Detect duplicate canonical targets for UI warning
  const targetCount = new Map<string, number>();
  for (const { canonicalKey } of mappings) {
    if (canonicalKey) targetCount.set(canonicalKey, (targetCount.get(canonicalKey) ?? 0) + 1);
  }

  async function handleSaveTemplate() {
    if (!templateName.trim()) return;
    setSavingTemplate(true);
    try {
      await onSaveTemplate(templateName.trim(), mappings);
      setTemplateSaved(true);
      setTemplateName("");
      setShowSave(false);
      setTimeout(() => setTemplateSaved(false), 3000);
    } finally {
      setSavingTemplate(false);
    }
  }

  async function handleDeleteTemplate(id: string) {
    setDeletingId(id);
    try {
      await onDeleteTemplate(id);
    } finally {
      setDeletingId(null);
    }
  }

  function handleLoadTemplate(id: string) {
    const tpl = savedTemplates.find((t) => t.id === id);
    if (!tpl) return;
    const tplMappings = tpl.mappings as ColumnMapping[];
    // Apply template: match source headers that exist in current file
    setMappings((prev) =>
      prev.map((m) => {
        const tplEntry = tplMappings.find((t) => t.sourceHeader === m.sourceHeader);
        return tplEntry ? { ...m, canonicalKey: tplEntry.canonicalKey } : m;
      })
    );
    onLoadTemplate(id);
  }

  // Group canonical fields for the dropdown options
  const groupedOptions = CANONICAL_FIELDS.reduce<Record<FieldGroup, typeof CANONICAL_FIELDS>>(
    (acc, f) => {
      (acc[f.group] ??= []).push(f);
      return acc;
    },
    {} as Record<FieldGroup, typeof CANONICAL_FIELDS>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* ── Saved templates strip ─────────────────────────────────────────── */}
      {savedTemplates.length > 0 && (
        <div className="rounded-xl border border-brand-100 bg-brand-50 px-4 py-3">
          <p className="mb-2 text-xs font-semibold text-brand-700">Templates salvos</p>
          <div className="flex flex-wrap gap-2">
            {savedTemplates.map((tpl) => (
              <div key={tpl.id} className="flex items-center gap-1 rounded-lg border border-brand-200 bg-white px-2 py-1 text-xs">
                <button
                  className="font-medium text-brand-700 hover:underline"
                  onClick={() => handleLoadTemplate(tpl.id)}
                >
                  {tpl.name}
                </button>
                <button
                  className="ml-1 text-gray-400 hover:text-red-500"
                  disabled={deletingId === tpl.id}
                  onClick={() => handleDeleteTemplate(tpl.id)}
                  title="Excluir template"
                >
                  {deletingId === tpl.id ? "…" : "×"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Validation errors / warnings ─────────────────────────────────── */}
      {validation.errors.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {validation.errors.map((e, i) => <p key={i}>{e}</p>)}
        </div>
      )}
      {validation.warnings.length > 0 && (
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-700">
          {validation.warnings.map((w, i) => <p key={i}>⚠ {w}</p>)}
        </div>
      )}

      {/* ── Mapping table ─────────────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-500">
              <th className="px-4 py-2 w-[180px]">Coluna do arquivo</th>
              <th className="px-4 py-2 w-[80px]">Confiança</th>
              <th className="px-4 py-2">Campo Foocci</th>
              <th className="px-4 py-2 max-w-[240px]">Exemplos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {mappings.map((m, idx) => {
              const detectedEntry = detected.find((d) => d.sourceHeader === m.sourceHeader);
              const isDuplicate = m.canonicalKey
                ? (targetCount.get(m.canonicalKey) ?? 0) > 1
                : false;

              const samples = sampleRows
                .map((r) => r[m.sourceHeader] ?? "")
                .filter(Boolean)
                .slice(0, 3);

              return (
                <tr key={idx} className={isDuplicate ? "bg-red-50" : ""}>
                  {/* Source header */}
                  <td className="px-4 py-2 font-medium text-gray-800">
                    {m.sourceHeader}
                    {isDuplicate && (
                      <span className="ml-1 text-xs text-red-600">(duplicado)</span>
                    )}
                  </td>

                  {/* Confidence dot */}
                  <td className="px-4 py-2">
                    {detectedEntry ? (
                      <ConfidenceDot
                        score={detectedEntry.score}
                        conflict={detectedEntry.confidence === "conflict"}
                        tooltip={`${detectedEntry.score}/100 — "${detectedEntry.matchedAlias}" → ${detectedEntry.canonicalLabel}`}
                      />
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-gray-200" />
                        <span className="text-xs text-gray-400">—</span>
                      </span>
                    )}
                  </td>

                  {/* Canonical field selector */}
                  <td className="px-4 py-2">
                    <select
                      className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                      value={m.canonicalKey}
                      onChange={(e) => setMapping(m.sourceHeader, e.target.value)}
                    >
                      <option value="">— Ignorar —</option>
                      {(Object.entries(groupedOptions) as [FieldGroup, typeof CANONICAL_FIELDS][]).map(
                        ([group, fields]) => (
                          <optgroup key={group} label={GROUP_LABELS[group]}>
                            {fields.map((f) => (
                              <option key={f.key} value={f.key}>
                                {f.label}
                              </option>
                            ))}
                          </optgroup>
                        )
                      )}
                    </select>
                  </td>

                  {/* Sample values */}
                  <td className="px-4 py-2 max-w-[240px]">
                    <div className="flex flex-wrap gap-1">
                      {samples.length > 0
                        ? samples.map((s, si) => (
                            <span
                              key={si}
                              className="inline-block max-w-[100px] truncate rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600"
                              title={s}
                            >
                              {s}
                            </span>
                          ))
                        : <span className="text-xs text-gray-400">vazio</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Save template ─────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3">
        {!showSave ? (
          <button
            className="text-xs text-brand-600 hover:underline"
            onClick={() => setShowSave(true)}
          >
            + Salvar como template
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Nome do template…"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
            <button
              className="rounded-lg bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              disabled={savingTemplate || !templateName.trim()}
              onClick={handleSaveTemplate}
            >
              {savingTemplate ? "Salvando…" : "Salvar"}
            </button>
            <button
              className="text-xs text-gray-500 hover:underline"
              onClick={() => { setShowSave(false); setTemplateName(""); }}
            >
              Cancelar
            </button>
          </div>
        )}
        {templateSaved && (
          <span className="text-xs text-emerald-600">Template salvo!</span>
        )}
      </div>

      {/* ── Confirm button ────────────────────────────────────────────────── */}
      <div className="flex justify-end pt-2">
        <button
          className="rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!validation.valid}
          onClick={() => onConfirm(mappings)}
        >
          Confirmar mapeamento →
        </button>
      </div>
    </div>
  );
}
