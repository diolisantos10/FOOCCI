"use client";

/**
 * AgentLibraryPanel — the live Agent Library embedded inside an Agent Room tab.
 *
 * Self-contained: fetches its own data (GET sources/stats + detail) and performs
 * mutations via the existing admin API routes (upload / techniques / extract).
 * Fixed to a single agent (e.g. waiter) — this is that agent's "private
 * university". Read-only vs. runtime: "ativas no runtime" is always 0.
 *
 * Upload First: PDF/TXT/MD upload is the primary flow; the source is created
 * first and survives parsing/AI failures (yellow partial state + retry).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  SOURCE_TYPES,
  SOURCE_TYPE_LABELS,
  SOURCE_STATUS_LABELS,
  EXTRACTION_STATUS_LABELS,
  TECHNIQUE_STATUS_LABELS,
  libraryAgentName,
  friendlyUploadMessage,
  classifyUploadOutcome,
} from "@/services/agentLibrary/agentLibraryHelpers";

// ── DTOs (mirror the API responses) ─────────────────────────────────────────────

interface StatsDTO { sources: number; techniques: number; activeInRuntime: number; pendingExtraction: number; }
interface SourceDTO {
  id: string; title: string; author: string | null; sourceType: string; category: string | null;
  status: string; extractionStatus: string; techniqueCount: number; createdAt: string;
}
interface TechniqueDTO {
  id: string; techniqueName: string; category: string | null; purpose: string | null; principle: string | null;
  application: string | null; usageRule: string | null; qualityTest: string | null; goodExample: string | null;
  badExample: string | null; confidence: number | null; status: string;
}
interface SourceDetailDTO {
  id: string; title: string; author: string | null; sourceType: string; category: string | null;
  description: string | null; fileName: string | null; rawTextPreview: string | null; rawTextTruncated: boolean;
  status: string; extractionStatus: string; createdAt: string; techniques: TechniqueDTO[];
}

// ── small UI helpers ────────────────────────────────────────────────────────────

type Tone = "gray" | "green" | "amber" | "blue" | "violet";
function Pill({ children, tone = "gray" }: { children: React.ReactNode; tone?: Tone }) {
  const cls = {
    gray: "bg-gray-100 text-gray-600",
    green: "bg-green-50 text-green-700",
    amber: "bg-amber-50 text-amber-700",
    blue: "bg-blue-50 text-blue-700",
    violet: "bg-violet-50 text-violet-700",
  }[tone];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{children}</span>;
}
function extractionTone(s: string): Tone {
  return s === "EXTRACTED" ? "green" : s === "FAILED" ? "amber" : s === "EXTRACTING" ? "amber" : "gray";
}
function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString("pt-BR"); } catch { return iso; }
}
async function postJSON(url: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || data.ok !== true) throw new Error(typeof data.error === "string" ? data.error : "Falha na operação.");
  return data;
}

// ── component ───────────────────────────────────────────────────────────────────

export function AgentLibraryPanel({ agentSlug }: { agentSlug: string }) {
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(false);
  const [stats, setStats] = useState<StatsDTO>({ sources: 0, techniques: 0, activeInRuntime: 0, pendingExtraction: 0 });
  const [sources, setSources] = useState<SourceDTO[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<SourceDetailDTO | null>(null);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // upload form
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fName, setFName] = useState("");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [type, setType] = useState("BOOK");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [rawText, setRawText] = useState("");

  // manual technique form
  const [showAddTech, setShowAddTech] = useState(false);
  const [tName, setTName] = useState("");
  const [tCategory, setTCategory] = useState("");
  const [tPurpose, setTPurpose] = useState("");
  const [tApplication, setTApplication] = useState("");
  const [tUsageRule, setTUsageRule] = useState("");
  const [tQualityTest, setTQualityTest] = useState("");

  const loadList = useCallback(async () => {
    setLoading(true); setDbError(false);
    try {
      const res = await fetch(`/api/admin/agents/library/sources?agentSlug=${agentSlug}`);
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.status === 503 || data.dbError === true) { setDbError(true); return; }
      if (!res.ok || data.ok !== true) { setErr(typeof data.error === "string" ? data.error : "Falha ao carregar a Library."); return; }
      setStats(data.stats as StatsDTO);
      setSources((data.sources as SourceDTO[]) ?? []);
    } catch {
      setErr("Falha ao carregar a Library.");
    } finally {
      setLoading(false);
    }
  }, [agentSlug]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/admin/agents/library/sources/${id}`);
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.ok && data.ok === true) setSelected(data.source as SourceDetailDTO);
    } catch { /* keep previous */ }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { if (selectedId) loadDetail(selectedId); else setSelected(null); }, [selectedId, loadDetail]);

  function resetForm() {
    setTitle(""); setAuthor(""); setType("BOOK"); setCategory(""); setDescription(""); setRawText(""); setFName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }
  function resetTech() {
    setTName(""); setTCategory(""); setTPurpose(""); setTApplication(""); setTUsageRule(""); setTQualityTest("");
  }

  async function submitUpload(extract: boolean) {
    setErr(null); setWarn(null); setNotice(null); setBusy(true);
    try {
      const fd = new FormData();
      fd.append("agentSlug", agentSlug);
      fd.append("sourceType", type);
      fd.append("title", title);
      fd.append("author", author);
      fd.append("category", category);
      fd.append("description", description);
      fd.append("rawText", rawText);
      fd.append("extract", extract ? "1" : "0");
      const f = fileInputRef.current?.files?.[0];
      if (f) fd.append("file", f);

      let res: Response;
      try { res = await fetch("/api/admin/agents/library/upload", { method: "POST", body: fd }); }
      catch { setErr(friendlyUploadMessage(0)); return; }

      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const outcome = classifyUploadOutcome(data);
      const newId = typeof data.sourceId === "string" ? data.sourceId : null;
      const serverMessage = typeof data.message === "string" ? data.message : null;
      const stage = typeof data.stage === "string" ? data.stage : "";

      const withStage = (m: string) => (stage ? `${m} (estágio: ${stage})` : m);
      if (outcome === "success") setNotice(serverMessage || "Fonte criada.");
      else if (outcome === "partial") setWarn(withStage(serverMessage || "Fonte criada, mas a extração falhou."));
      else { setErr(withStage(friendlyUploadMessage(res.status, serverMessage))); return; }

      resetForm(); setShowForm(false);
      await loadList();
      if (newId) setSelectedId(newId);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Erro ao enviar conteúdo.");
    } finally {
      setBusy(false);
    }
  }

  async function submitTechnique(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    setErr(null); setWarn(null); setNotice(null); setBusy(true);
    try {
      await postJSON("/api/admin/agents/library/techniques", {
        sourceId: selectedId, techniqueName: tName, category: tCategory,
        purpose: tPurpose, application: tApplication, usageRule: tUsageRule, qualityTest: tQualityTest,
      });
      resetTech(); setShowAddTech(false); setNotice("Técnica adicionada.");
      await Promise.all([loadList(), loadDetail(selectedId)]);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Erro ao criar técnica.");
    } finally {
      setBusy(false);
    }
  }

  async function runExtraction() {
    if (!selectedId) return;
    setErr(null); setWarn(null); setNotice(null); setBusy(true);
    try {
      const data = await postJSON(`/api/admin/agents/library/sources/${selectedId}/extract`, {});
      const created = typeof data.created === "number" ? data.created : 0;
      setNotice(created > 0 ? `${created} técnica(s) extraída(s) por IA.` : "Nenhuma técnica extraída — revise o conteúdo.");
      await Promise.all([loadList(), loadDetail(selectedId)]);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Erro na extração.");
    } finally {
      setBusy(false);
    }
  }

  const agentName = libraryAgentName(agentSlug);

  return (
    <div className="space-y-4">
      {/* 1. Biblioteca do {agente} — resumo */}
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-900">Biblioteca do {agentName}</h3>
            <p className="text-xs text-gray-500">A universidade privada do {agentName} — fontes e técnicas (read-only vs. runtime).</p>
          </div>
          <button type="button" onClick={() => { setShowForm((v) => !v); setErr(null); setWarn(null); }}
            className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-700">
            {showForm ? "Fechar" : "+ Adicionar conteúdo"}
          </button>
        </div>

        {dbError && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Migration da Agent Library ainda não aplicada. Rode <span className="font-mono">prisma migrate deploy</span>.
          </div>
        )}
        {err && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>}
        {warn && <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">⚠️ {warn}</div>}
        {notice && <div className="mb-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">{notice}</div>}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "Fontes cadastradas", value: stats.sources },
            { label: "Técnicas extraídas", value: stats.techniques },
            { label: "Ativas no runtime", value: stats.activeInRuntime },
            { label: "Fontes pendentes", value: stats.pendingExtraction },
          ].map((k) => (
            <div key={k.label} className="rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-xl font-bold text-gray-900">{k.value}</p>
              <p className="text-[11px] uppercase tracking-wide text-gray-400">{k.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 2. Adicionar conteúdo ao {agente} */}
      {showForm && (
        <form onSubmit={(e) => e.preventDefault()} className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm font-semibold">Adicionar conteúdo ao <span className="text-orange-600">{agentName}</span></p>

          <label className="block rounded-lg border-2 border-dashed border-orange-300 bg-white p-3 text-xs font-medium text-gray-700">
            📎 Upload de arquivo (PDF, TXT ou MD) — fluxo principal
            <input ref={fileInputRef} type="file"
              accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown"
              onChange={(e) => setFName(e.target.files?.[0]?.name ?? "")}
              className="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-orange-600 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-orange-700" />
            {fName && <span className="mt-1 block text-[11px] text-gray-500">Selecionado: {fName}</span>}
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-gray-600">
              Tipo da fonte
              <select value={type} onChange={(e) => setType(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
                {SOURCE_TYPES.map((t) => <option key={t} value={t}>{SOURCE_TYPE_LABELS[t]}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-gray-600">
              Categoria
              <input value={category} onChange={(e) => setCategory(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs font-medium text-gray-600">
              Título (opcional — detectado do arquivo)
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200}
                className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs font-medium text-gray-600">
              Autor (opcional)
              <input value={author} onChange={(e) => setAuthor(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
            </label>
          </div>
          <label className="block text-xs font-medium text-gray-600">
            Descrição / essência (opcional)
            <input value={description} onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
          </label>
          <label className="block text-xs font-medium text-gray-600">
            Ou cole o conteúdo / manualmente (opcional — síntese/notas, não obras inteiras)
            <textarea value={rawText} onChange={(e) => setRawText(e.target.value)} rows={4}
              className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
          </label>
          <p className="text-[11px] text-gray-400">
            🔒 O arquivo original <strong>não é armazenado</strong> (fica privado): o sistema extrai apenas o texto
            (amostra inicial em PDFs grandes) para gerar a síntese e as técnicas. Nada vai para o runtime.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => submitUpload(false)} disabled={busy}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              {busy ? "Processando…" : "Salvar"}
            </button>
            <button type="button" onClick={() => submitUpload(true)} disabled={busy}
              className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50">
              {busy ? "Processando…" : "Salvar e extrair técnicas"}
            </button>
            <button type="button" onClick={() => { setShowForm(false); resetForm(); }}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Lista de fontes */}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Fontes ({sources.length})</h3>
          {loading && <p className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-500">Carregando…</p>}
          {!loading && sources.length === 0 && !dbError && (
            <p className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-500">
              Nenhuma fonte para {agentName} ainda. Use “+ Adicionar conteúdo”.
            </p>
          )}
          {sources.map((s) => {
            const isSel = selectedId === s.id;
            return (
              <button key={s.id} type="button" onClick={() => setSelectedId(s.id)}
                className={`block w-full rounded-xl border bg-white p-3 text-left transition hover:border-orange-300 ${isSel ? "border-orange-400 ring-1 ring-orange-200" : "border-gray-200"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{s.title}</p>
                    <p className="truncate text-xs text-gray-500">{s.author || "—"} · {SOURCE_TYPE_LABELS[s.sourceType as keyof typeof SOURCE_TYPE_LABELS] ?? s.sourceType}</p>
                  </div>
                  <Pill tone={extractionTone(s.extractionStatus)}>{EXTRACTION_STATUS_LABELS[s.extractionStatus] ?? s.extractionStatus}</Pill>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {s.category && <Pill tone="violet">{s.category}</Pill>}
                  <Pill tone="gray">{SOURCE_STATUS_LABELS[s.status] ?? s.status}</Pill>
                  <Pill tone="green">{s.techniqueCount} técnica(s)</Pill>
                  <span className="ml-auto text-[11px] text-gray-400">{fmtDate(s.createdAt)}</span>
                </div>
              </button>
            );
          })}
        </section>

        {/* Detalhe da fonte */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Detalhe da fonte</h3>
          {!selected && (
            <p className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-500">
              Selecione uma fonte para ver a essência e as técnicas.
            </p>
          )}
          {selected && (
            <div className="space-y-3">
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-base font-bold">{selected.title}</p>
                    <p className="text-xs text-gray-500">
                      {selected.author || "—"} · {SOURCE_TYPE_LABELS[selected.sourceType as keyof typeof SOURCE_TYPE_LABELS] ?? selected.sourceType}
                      {selected.fileName ? ` · ${selected.fileName}` : ""}
                    </p>
                  </div>
                  <Pill tone={extractionTone(selected.extractionStatus)}>{EXTRACTION_STATUS_LABELS[selected.extractionStatus] ?? selected.extractionStatus}</Pill>
                </div>
                {selected.description && (
                  <>
                    <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Essência</p>
                    <p className="text-sm text-gray-700">{selected.description}</p>
                  </>
                )}
                {selected.rawTextPreview && (
                  <>
                    <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Conteúdo extraído (prévia · privado)</p>
                    <p className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-2 text-xs text-gray-600">
                      {selected.rawTextPreview}{selected.rawTextTruncated ? "…" : ""}
                    </p>
                  </>
                )}
                {selected.extractionStatus === "FAILED" && (
                  <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                    A última extração falhou. A fonte está salva — tente extrair novamente ou adicione técnicas manualmente.
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={runExtraction} disabled={busy}
                    className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-50">
                    {busy ? "Processando…" : selected.extractionStatus === "FAILED" ? "↻ Tentar extrair novamente" : "✨ Gerar técnicas com IA"}
                  </button>
                  <button type="button" onClick={() => { setShowAddTech((v) => !v); setErr(null); }}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                    {showAddTech ? "Fechar" : "+ Técnica manual"}
                  </button>
                </div>
              </div>

              {showAddTech && (
                <form onSubmit={submitTechnique} className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
                  <input value={tName} onChange={(e) => setTName(e.target.value)} required placeholder="Nome da técnica *" maxLength={200}
                    className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
                  <input value={tCategory} onChange={(e) => setTCategory(e.target.value)} placeholder="Categoria"
                    className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
                  <input value={tPurpose} onChange={(e) => setTPurpose(e.target.value)} placeholder="Para que serve"
                    className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
                  <input value={tApplication} onChange={(e) => setTApplication(e.target.value)} placeholder="Como o agente aplica"
                    className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
                  <input value={tUsageRule} onChange={(e) => setTUsageRule(e.target.value)} placeholder="Regra de uso"
                    className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
                  <input value={tQualityTest} onChange={(e) => setTQualityTest(e.target.value)} placeholder="Teste de qualidade"
                    className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
                  <button type="submit" disabled={busy}
                    className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-50">
                    {busy ? "Salvando…" : "Adicionar técnica"}
                  </button>
                </form>
              )}

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Técnicas ({selected.techniques.length})</p>
                {selected.techniques.length === 0 && (
                  <p className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3 text-xs text-gray-500">
                    Sem técnicas ainda. Gere com IA ou adicione manualmente.
                  </p>
                )}
                {selected.techniques.map((t) => (
                  <div key={t.id} className="rounded-xl border border-gray-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold">{t.techniqueName}</p>
                      <Pill tone="amber">{TECHNIQUE_STATUS_LABELS[t.status] ?? t.status}</Pill>
                    </div>
                    {t.category && <p className="mt-0.5"><Pill tone="violet">{t.category}</Pill></p>}
                    {t.application && <p className="mt-1 text-sm text-gray-800">{t.application}</p>}
                    <dl className="mt-1.5 space-y-0.5 text-[11px] leading-snug text-gray-600">
                      {t.purpose && <div><dt className="inline font-semibold text-gray-400">Para que serve: </dt><dd className="inline">{t.purpose}</dd></div>}
                      {t.principle && <div><dt className="inline font-semibold text-gray-400">Princípio: </dt><dd className="inline">{t.principle}</dd></div>}
                      {t.usageRule && <div><dt className="inline font-semibold text-amber-600">Regra de uso: </dt><dd className="inline">{t.usageRule}</dd></div>}
                      {t.qualityTest && <div><dt className="inline font-semibold text-blue-600">Teste de qualidade: </dt><dd className="inline">{t.qualityTest}</dd></div>}
                      {t.goodExample && <div><dt className="inline font-semibold text-green-600">Bom exemplo: </dt><dd className="inline">{t.goodExample}</dd></div>}
                      {t.badExample && <div><dt className="inline font-semibold text-gray-400">Evitar: </dt><dd className="inline">{t.badExample}</dd></div>}
                    </dl>
                    {typeof t.confidence === "number" && (
                      <p className="mt-1 text-[10px] text-gray-400">confiança: {(t.confidence * 100).toFixed(0)}%</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      <p className="text-[11px] text-gray-400">
        🔒 A Library é a formação do {agentName} e <strong>não está conectada ao runtime</strong>. “Ativas no runtime”
        permanece 0. Sínteses e técnicas são curadas — sem reprodução de obras completas.
      </p>
    </div>
  );
}
