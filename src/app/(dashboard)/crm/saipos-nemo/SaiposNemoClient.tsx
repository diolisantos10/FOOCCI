"use client";

import { useState, useRef, type RefObject } from "react";
import type { SaiposNemoPreview, SaiposNemoExecuteResult } from "@/services/crm/SaiposNemoImportService";

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = "upload" | "preview" | "importing" | "done";

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtNum(v: number) {
  return v.toLocaleString("pt-BR");
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-line2 bg-paper p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold text-ink">{typeof value === "number" ? fmtNum(value) : value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-3">{children}</p>
  );
}

function FileInput({
  label,
  hint,
  required,
  inputRef,
}: {
  label: string;
  hint: string;
  required?: boolean;
  inputRef: RefObject<HTMLInputElement>;
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-ink2">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      <div
        className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-line2 px-4 py-3 transition hover:border-brand-300 hover:bg-brand-50"
        onClick={() => inputRef.current?.click()}
      >
        <span className="text-2xl">{fileName ? "📄" : "📂"}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink2">
            {fileName ?? "Clique para selecionar"}
          </p>
          <p className="text-xs text-muted">{hint}</p>
        </div>
        {fileName && (
          <button
            type="button"
            className="shrink-0 rounded-full p-1 text-muted hover:bg-[#F4F4F2] hover:text-ink2"
            onClick={(e) => {
              e.stopPropagation();
              setFileName(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
          >
            ✕
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
      />
    </div>
  );
}

// ── Preview report rendering ───────────────────────────────────────────────────

function PreviewReport({
  preview,
  onConfirm,
  onBack,
  loading,
}: {
  preview: SaiposNemoPreview;
  onConfirm: () => void;
  onBack: () => void;
  loading: boolean;
}) {
  const { stats } = preview;

  return (
    <div className="space-y-6">
      {/* Customer match stats */}
      <div>
        <SectionTitle>Clientes — Resultado do cruzamento</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Stat label="Total Saipos"        value={stats.saiposTotal} />
          <Stat label="Total Nemo"          value={stats.nemoTotal} />
          <Stat label="Saipos c/ telefone"  value={stats.saiposWithPhone} />
          <Stat label="Nemo c/ telefone"    value={stats.nemoWithPhone} />
          <Stat label="Cruzados (phone)"    value={stats.phoneMatches}   sub="Encontrados em ambas as bases" />
          <Stat label="Só Saipos"           value={stats.saiposOnly} />
          <Stat label="Só Nemo"             value={stats.nemoOnly} />
          <Stat label="Sem telefone"        value={stats.noPhoneCount}   sub="Serão ignorados na importação" />
          <Stat label="Prontos p/ importar" value={stats.readyCount}     sub="Status READY" />
          <Stat label="Revisão sugerida"    value={stats.needsReviewCount} sub="Só Nemo / incompletos" />
        </div>
      </div>

      {/* Product aggregate stats */}
      {preview.categoryCount > 0 && (
        <div>
          <SectionTitle>Itens Vendidos Saipos — Agrupamento de vendas</SectionTitle>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Período início"  value={preview.periodStart ?? "—"} />
            <Stat label="Período fim"     value={preview.periodEnd   ?? "—"} />
            <Stat label="Categorias"      value={preview.categoryCount} />
            <Stat label="Produtos"        value={preview.productCount} />
            <Stat label="Qtd. vendida"    value={fmtNum(preview.totalQuantity)} />
            <Stat label="Receita bruta"   value={fmtBRL(preview.totalRevenue)} />
          </div>
        </div>
      )}

      {/* Top 10 products */}
      {preview.topProducts.length > 0 && (
        <div>
          <SectionTitle>Top produtos por receita</SectionTitle>
          <div className="overflow-x-auto rounded-xl border border-line2 bg-paper">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-muted">
                  <th className="px-4 py-2 font-medium">#</th>
                  <th className="px-4 py-2 font-medium">Produto</th>
                  <th className="px-4 py-2 font-medium">Categoria</th>
                  <th className="px-4 py-2 font-medium text-right">Qtd</th>
                  <th className="px-4 py-2 font-medium text-right">Receita</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {preview.topProducts.map((p, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2 text-muted">{i + 1}</td>
                    <td className="px-4 py-2 font-medium text-ink">{p.productName}</td>
                    <td className="px-4 py-2 text-muted">{p.categoryName}</td>
                    <td className="px-4 py-2 text-right text-ink2">{fmtNum(p.quantitySold)}</td>
                    <td className="px-4 py-2 text-right font-medium">{fmtBRL(p.grossRevenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sample merged customers */}
      {preview.sampleMerged.length > 0 && (
        <div>
          <SectionTitle>Amostra — primeiros clientes mesclados</SectionTitle>
          <div className="overflow-x-auto rounded-xl border border-line2 bg-paper">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-muted">
                  <th className="px-4 py-2 font-medium">Nome</th>
                  <th className="px-4 py-2 font-medium">Telefone</th>
                  <th className="px-4 py-2 font-medium">Fontes</th>
                  <th className="px-4 py-2 font-medium text-right">Pedidos</th>
                  <th className="px-4 py-2 font-medium text-right">Total gasto</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {preview.sampleMerged.map((c, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2 font-medium text-ink">{c.name}</td>
                    <td className="px-4 py-2 text-ink2">{c.phone}</td>
                    <td className="px-4 py-2">
                      {c.sourceSystems.map(s => (
                        <span key={s} className="mr-1 rounded bg-[#F4F4F2] px-1.5 py-0.5 text-[10px] font-semibold text-ink2">{s}</span>
                      ))}
                    </td>
                    <td className="px-4 py-2 text-right text-ink2">{c.importedOrderCount ?? "—"}</td>
                    <td className="px-4 py-2 text-right text-ink2">
                      {c.importedTotalSpent != null ? fmtBRL(c.importedTotalSpent) : "—"}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        c.importStatus === "READY"
                          ? "bg-green-100 text-green-700"
                          : "bg-amber-100 text-amber-700"
                      }`}>
                        {c.importStatus === "READY" ? "PRONTO" : "REVISÃO"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* No-phone warning */}
      {stats.noPhoneCount > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-800">
            ⚠️ {fmtNum(stats.noPhoneCount)} registro{stats.noPhoneCount !== 1 ? "s" : ""} sem telefone válido
          </p>
          <p className="mt-1 text-xs text-amber-700">
            Esses clientes não serão importados e não aparecerão em campanhas WhatsApp.
            Eles constam apenas neste relatório de prévia.
          </p>
          {preview.sampleNoPhone.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-amber-700">
              {preview.sampleNoPhone.slice(0, 5).map((r, i) => (
                <li key={i}>
                  {r.nome ?? "Sem nome"}{r.cpfCnpj ? ` · CPF/CNPJ: ${r.cpfCnpj}` : ""}
                  {r.rawPhone ? ` · Tel raw: "${r.rawPhone}"` : " · Sem telefone"}
                </li>
              ))}
              {preview.sampleNoPhone.length < stats.noPhoneCount && (
                <li className="italic">… e mais {fmtNum(stats.noPhoneCount - preview.sampleNoPhone.length)}</li>
              )}
            </ul>
          )}
        </div>
      )}

      {/* Safety note */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs text-blue-800">
        <p className="font-semibold mb-1">ℹ️ O que será importado:</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>Clientes (upsert por telefone normalizado)</li>
          <li>Endereços estruturados do Nemo + texto do Saipos</li>
          <li>Métricas históricas do Saipos como campo importado (não inflam pedidos reais)</li>
          {preview.categoryCount > 0 && <li>Agregado de vendas por produto/categoria (analytics apenas)</li>}
        </ul>
        <p className="mt-2">
          <strong>Não serão criados:</strong> pedidos fictícios, vínculos produto→cliente,
          mensagens WhatsApp, movimentos financeiros.
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={onBack}
          disabled={loading}
          className="rounded-xl border border-line2 px-5 py-2.5 text-sm font-medium text-ink2 hover:bg-[#FAFAF8] disabled:opacity-50"
        >
          ← Voltar
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading || stats.readyCount + stats.needsReviewCount === 0}
          className="flex-1 rounded-xl bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50 sm:flex-none sm:px-8"
        >
          {loading ? "Importando…" : `Confirmar e importar ${fmtNum(stats.readyCount + stats.needsReviewCount)} clientes`}
        </button>
      </div>
    </div>
  );
}

// ── Done screen ────────────────────────────────────────────────────────────────

function DoneScreen({
  result,
  onReset,
}: {
  result: SaiposNemoExecuteResult;
  onReset: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-green-200 bg-green-50 p-5 text-center">
        <p className="text-3xl mb-2">✅</p>
        <p className="text-lg font-bold text-green-800">Importação concluída</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Clientes contactáveis criados"   value={result.contactableCustomersCreated} />
        <Stat label="Clientes contactáveis atualizados" value={result.contactableCustomersUpdated} />
        <Stat label="Sem telefone — importados no CRM" value={result.nonContactableCustomersCreated} sub="Não contatáveis" />
        <Stat label="Sem telefone — atualizados" value={result.nonContactableCustomersUpdated} sub="Não contatáveis" />
        <Stat label="Sem telefone — ignorados" value={result.noPhoneSkippedInsufficientData} sub="Dados insuficientes" />
        <Stat label="Endereços criados"  value={result.addressesCreated} />
        {result.productAggregatesCreated > 0 && (
          <Stat label="Agregados de vendas" value={result.productAggregatesCreated} sub="Produtos/categorias" />
        )}
        {result.productAggregatesSkipped > 0 && (
          <Stat label="Agregados ignorados" value={result.productAggregatesSkipped} sub="Já existiam" />
        )}
      </div>

      <div className="flex gap-3">
        <a
          href="/crm"
          className="flex-1 rounded-xl border border-line2 py-2.5 text-center text-sm font-medium text-ink2 hover:bg-[#FAFAF8]"
        >
          Ver CRM →
        </a>
        <button
          type="button"
          onClick={onReset}
          className="rounded-xl border border-line2 px-5 py-2.5 text-sm font-medium text-ink2 hover:bg-[#FAFAF8]"
        >
          Nova importação
        </button>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function SaiposNemoClient() {
  const [step, setStep] = useState<Step>("upload");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [preview, setPreview]   = useState<SaiposNemoPreview | null>(null);
  const [jobId, setJobId]       = useState<string | null>(null);
  const [result, setResult]     = useState<SaiposNemoExecuteResult | null>(null);

  const saiposRef = useRef<HTMLInputElement>(null) as RefObject<HTMLInputElement>;
  const nemoRef   = useRef<HTMLInputElement>(null) as RefObject<HTMLInputElement>;
  const soldRef   = useRef<HTMLInputElement>(null)  as RefObject<HTMLInputElement>;

  async function handlePreview(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const saiposFile = saiposRef.current?.files?.[0];
    const nemoFile   = nemoRef.current?.files?.[0];
    const soldFile   = soldRef.current?.files?.[0];

    if (!saiposFile) { setError("Selecione o arquivo de clientes Saipos."); return; }
    if (!nemoFile)   { setError("Selecione o arquivo de clientes Nemo."); return; }

    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("saiposFile", saiposFile);
      fd.append("nemoFile",   nemoFile);
      if (soldFile) fd.append("soldFile", soldFile);

      const res  = await fetch("/api/crm/saipos-nemo/preview", { method: "POST", body: fd });
      const json = await res.json() as { jobId?: string; preview?: SaiposNemoPreview; error?: string };

      if (!res.ok || json.error) { setError(json.error ?? "Erro ao processar arquivos."); return; }

      setJobId(json.jobId!);
      setPreview(json.preview!);
      setStep("preview");
    } catch {
      setError("Falha de rede. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  async function handleExecute() {
    if (!jobId) return;
    setLoading(true);
    setError(null);
    setStep("importing");
    try {
      const res  = await fetch("/api/crm/saipos-nemo/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const json = await res.json() as { result?: SaiposNemoExecuteResult; error?: string };
      if (!res.ok || json.error) {
        setError(json.error ?? "Erro durante importação.");
        setStep("preview");
        return;
      }
      setResult(json.result!);
      setStep("done");
    } catch {
      setError("Falha de rede durante importação.");
      setStep("preview");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setStep("upload");
    setPreview(null);
    setJobId(null);
    setResult(null);
    setError(null);
    if (saiposRef.current) saiposRef.current.value = "";
    if (nemoRef.current)   nemoRef.current.value   = "";
    if (soldRef.current)   soldRef.current.value   = "";
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-ink">Importação Saipos + Nemo</h1>
        <p className="mt-1 text-sm text-muted">
          Cruzamento inteligente de bases de clientes Saipos e Nemo + análise agregada de vendas.
          Prévia obrigatória antes da execução.
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs">
        {(["upload", "preview", "done"] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            {i > 0 && <div className="h-px w-8 bg-line2" />}
            <span className={`rounded-full px-2.5 py-1 font-semibold ${
              step === s || (step === "importing" && s === "preview")
                ? "bg-brand-500 text-white"
                : step === "done" && s !== "done"
                  ? "bg-green-100 text-green-700"
                  : "bg-[#F4F4F2] text-muted"
            }`}>
              {i + 1}. {s === "upload" ? "Upload" : s === "preview" ? "Prévia" : "Concluído"}
            </span>
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Upload step */}
      {step === "upload" && (
        <form onSubmit={handlePreview} className="space-y-6">
          <div className="rounded-xl border border-line2 bg-paper p-6 space-y-5">
            <FileInput
              label="Base de Clientes Saipos"
              hint="BASE CLIENTES SAIPOS.xlsx — planilha de clientes do POS"
              required
              inputRef={saiposRef}
            />
            <FileInput
              label="Relatório de Clientes Nemo"
              hint="RelatórioClientesDetalhado NEMO.xlsx — clientes do app de delivery"
              required
              inputRef={nemoRef}
            />
            <FileInput
              label="Itens Vendidos Saipos (opcional)"
              hint="ItensVendidos SAIPOS.xlsx — relatório agregado de vendas"
              inputRef={soldRef}
            />
          </div>

          <div className="rounded-xl border border-line bg-[#FAFAF8] p-4 text-xs text-muted space-y-1">
            <p className="font-semibold text-ink2">O que acontece na prévia:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Os três arquivos são lidos e analisados localmente no servidor</li>
              <li>Clientes são cruzados por telefone normalizado (principal) e CPF/CNPJ</li>
              <li>Saipos é master: métricas de Nemo complementam apenas campos ausentes</li>
              <li>Nenhum dado é gravado até você confirmar</li>
            </ul>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-brand-500 py-3 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {loading ? "Processando arquivos…" : "Gerar prévia →"}
          </button>
        </form>
      )}

      {/* Preview step */}
      {(step === "preview" || step === "importing") && preview && (
        <PreviewReport
          preview={preview}
          onConfirm={handleExecute}
          onBack={reset}
          loading={loading}
        />
      )}

      {/* Importing spinner */}
      {step === "importing" && loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45">
          <div className="rounded-2xl bg-paper p-8 shadow-2xl text-center space-y-3">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-line2 border-t-brand-500" />
            <p className="text-sm font-semibold text-ink2">Importando clientes e dados de vendas…</p>
            <p className="text-xs text-muted">Isso pode levar alguns segundos.</p>
          </div>
        </div>
      )}

      {/* Done step */}
      {step === "done" && result && (
        <DoneScreen result={result} onReset={reset} />
      )}
    </div>
  );
}
