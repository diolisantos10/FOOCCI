"use client";

/**
 * LibraryWorkbench — the Agent Library bench (client).
 *
 * "Universidade privada dos agentes": cadastra fontes de formação técnica e suas
 * técnicas, por agente. Leituras vêm do server (props); mutações vão pelas rotas
 * admin (/api/admin/agents/library/*). Nada aqui toca runtime — o contador
 * "ativas no runtime" é sempre 0 nesta fase.
 *
 * Copyright-safe: a UI foca em essência/técnica/aplicação; o texto colado é
 * exibido apenas como prévia curta (privado), nunca a obra inteira.
 */

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  SOURCE_TYPES,
  SOURCE_TYPE_LABELS,
  SOURCE_STATUS_LABELS,
  EXTRACTION_STATUS_LABELS,
  TECHNIQUE_STATUS_LABELS,
  libraryAgentName,
  type LibraryAgent,
} from "@/services/agentLibrary/agentLibraryHelpers";

// ── DTOs (plain, serializable) ──────────────────────────────────────────────────

export interface StatsDTO {
  sources: number;
  techniques: number;
  activeInRuntime: number;
  pendingExtraction: number;
}

export interface SourceDTO {
  id: string;
  title: string;
  author: string | null;
  sourceType: string;
  category: string | null;
  status: string;
  extractionStatus: string;
  techniqueCount: number;
  createdAt: string;
}

export interface TechniqueDTO {
  id: string;
  techniqueName: string;
  category: string | null;
  purpose: string | null;
  principle: string | null;
  application: string | null;
  usageRule: string | null;
  qualityTest: string | null;
  goodExample: string | null;
  badExample: string | null;
  confidence: number | null;
  status: string;
}

export interface SourceDetailDTO {
  id: string;
  title: string;
  author: string | null;
  sourceType: string;
  category: string | null;
  description: string | null;
  rawTextPreview: string | null;
  rawTextTruncated: boolean;
  status: string;
  extractionStatus: string;
  createdAt: string;
  techniques: TechniqueDTO[];
}

interface Props {
  agents: LibraryAgent[];
  agentSlug: string;
  stats: StatsDTO;
  sources: SourceDTO[];
  selected: SourceDetailDTO | null;
  dbError: boolean;
}

// ── small helpers ───────────────────────────────────────────────────────────────

async function postJSON(url: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || data.ok !== true) {
    throw new Error(typeof data.error === "string" ? data.error : "Falha na operação.");
  }
  return data;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("pt-BR");
  } catch {
    return iso;
  }
}

function Pill({ children, tone = "gray" }: { children: React.ReactNode; tone?: "gray" | "green" | "amber" | "blue" | "violet" }) {
  const cls = {
    gray: "bg-gray-100 text-gray-600",
    green: "bg-green-50 text-green-700",
    amber: "bg-amber-50 text-amber-700",
    blue: "bg-blue-50 text-blue-700",
    violet: "bg-violet-50 text-violet-700",
  }[tone];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{children}</span>;
}

function extractionTone(s: string): "gray" | "green" | "amber" {
  return s === "EXTRACTED" ? "green" : s === "FAILED" ? "amber" : s === "EXTRACTING" ? "amber" : "gray";
}

// ── component ───────────────────────────────────────────────────────────────────

export function LibraryWorkbench({ agents, agentSlug, stats, sources, selected, dbError }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const [showNewSource, setShowNewSource] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // new source form
  const [nsTitle, setNsTitle] = useState("");
  const [nsAuthor, setNsAuthor] = useState("");
  const [nsType, setNsType] = useState<string>("INTERNAL_NOTE");
  const [nsCategory, setNsCategory] = useState("");
  const [nsDescription, setNsDescription] = useState("");
  const [nsRawText, setNsRawText] = useState("");

  // add technique form
  const [showAddTech, setShowAddTech] = useState(false);
  const [tName, setTName] = useState("");
  const [tCategory, setTCategory] = useState("");
  const [tPurpose, setTPurpose] = useState("");
  const [tApplication, setTApplication] = useState("");
  const [tUsageRule, setTUsageRule] = useState("");
  const [tQualityTest, setTQualityTest] = useState("");

  function resetNewSource() {
    setNsTitle(""); setNsAuthor(""); setNsType("INTERNAL_NOTE");
    setNsCategory(""); setNsDescription(""); setNsRawText("");
  }
  function resetTech() {
    setTName(""); setTCategory(""); setTPurpose(""); setTApplication(""); setTUsageRule(""); setTQualityTest("");
  }

  async function submitNewSource(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setNotice(null); setBusy(true);
    try {
      await postJSON("/api/admin/agents/library/sources", {
        agentSlug, title: nsTitle, author: nsAuthor, sourceType: nsType,
        category: nsCategory, description: nsDescription, rawText: nsRawText,
      });
      resetNewSource(); setShowNewSource(false); setNotice("Fonte criada.");
      router.refresh();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Erro ao criar fonte.");
    } finally {
      setBusy(false);
    }
  }

  async function submitTechnique(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setErr(null); setNotice(null); setBusy(true);
    try {
      await postJSON("/api/admin/agents/library/techniques", {
        sourceId: selected.id, techniqueName: tName, category: tCategory,
        purpose: tPurpose, application: tApplication, usageRule: tUsageRule, qualityTest: tQualityTest,
      });
      resetTech(); setShowAddTech(false); setNotice("Técnica adicionada.");
      router.refresh();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Erro ao criar técnica.");
    } finally {
      setBusy(false);
    }
  }

  async function runExtraction() {
    if (!selected) return;
    setErr(null); setNotice(null); setBusy(true);
    try {
      const data = await postJSON(`/api/admin/agents/library/sources/${selected.id}/extract`, {});
      const created = typeof data.created === "number" ? data.created : 0;
      setNotice(created > 0 ? `${created} técnica(s) extraída(s) por IA.` : "Nenhuma técnica extraída — revise o conteúdo.");
      router.refresh();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Erro na extração.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full space-y-5 bg-white px-8 py-6 text-gray-900">
      {/* Topo */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Agent Library</h1>
          <p className="text-sm text-gray-500">Universidade privada dos agentes · formação técnica (read-only vs. runtime)</p>
        </div>
        <button
          type="button"
          onClick={() => { setShowNewSource((v) => !v); setErr(null); }}
          className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-700"
        >
          {showNewSource ? "Fechar" : "+ Nova fonte"}
        </button>
      </header>

      {/* seletor de agente */}
      <nav className="flex flex-wrap gap-1 rounded-xl border border-gray-200 bg-white p-1">
        {agents.map((a) => {
          const isActive = a.slug === agentSlug;
          return (
            <Link
              key={a.slug}
              href={`${pathname}?agent=${a.slug}`}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                isActive ? "bg-orange-600 text-white" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {a.name}
            </Link>
          );
        })}
      </nav>

      {dbError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          As tabelas da Library ainda não estão disponíveis neste ambiente (migration pendente). A tela carrega vazia
          até a migration <span className="font-mono">add_agent_library</span> ser aplicada.
        </div>
      )}
      {err && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>}
      {notice && <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">{notice}</div>}

      {/* Dashboard */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Fontes cadastradas", value: stats.sources },
          { label: "Técnicas extraídas", value: stats.techniques },
          { label: "Ativas no runtime", value: stats.activeInRuntime },
          { label: "Fontes pendentes", value: stats.pendingExtraction },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-2xl font-bold">{k.value}</p>
            <p className="text-[11px] uppercase tracking-wide text-gray-400">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Nova fonte */}
      {showNewSource && (
        <form onSubmit={submitNewSource} className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm font-semibold">Nova fonte para <span className="text-orange-600">{libraryAgentName(agentSlug)}</span></p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-gray-600">
              Título *
              <input value={nsTitle} onChange={(e) => setNsTitle(e.target.value)} required maxLength={200}
                className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs font-medium text-gray-600">
              Autor
              <input value={nsAuthor} onChange={(e) => setNsAuthor(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs font-medium text-gray-600">
              Tipo
              <select value={nsType} onChange={(e) => setNsType(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
                {SOURCE_TYPES.map((t) => <option key={t} value={t}>{SOURCE_TYPE_LABELS[t]}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-gray-600">
              Categoria
              <input value={nsCategory} onChange={(e) => setNsCategory(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
            </label>
          </div>
          <label className="block text-xs font-medium text-gray-600">
            Descrição / essência (opcional)
            <input value={nsDescription} onChange={(e) => setNsDescription(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
          </label>
          <label className="block text-xs font-medium text-gray-600">
            Conteúdo colado (síntese / notas — não cole obras inteiras)
            <textarea value={nsRawText} onChange={(e) => setNsRawText(e.target.value)} rows={5}
              className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
          </label>
          <p className="text-[11px] text-gray-400">
            Upload de PDF chega em fase futura (arquivo original fica privado). Por ora, cole uma síntese/notas e gere as
            técnicas — ou cadastre técnicas manualmente depois.
          </p>
          <div className="flex gap-2">
            <button type="submit" disabled={busy}
              className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50">
              {busy ? "Salvando…" : "Salvar fonte"}
            </button>
            <button type="button" onClick={() => { setShowNewSource(false); resetNewSource(); }}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Lista de fontes */}
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Fontes ({sources.length})</h2>
          {sources.length === 0 && !dbError && (
            <p className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-500">
              Nenhuma fonte para {libraryAgentName(agentSlug)} ainda. Use “+ Nova fonte”.
            </p>
          )}
          {sources.map((s) => {
            const isSel = selected?.id === s.id;
            return (
              <Link
                key={s.id}
                href={`${pathname}?agent=${agentSlug}&source=${s.id}`}
                className={`block rounded-xl border bg-white p-3 transition hover:border-orange-300 ${isSel ? "border-orange-400 ring-1 ring-orange-200" : "border-gray-200"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{s.title}</p>
                    <p className="truncate text-xs text-gray-500">{s.author || "—"} · {SOURCE_TYPE_LABELS[s.sourceType as keyof typeof SOURCE_TYPE_LABELS] ?? s.sourceType}</p>
                  </div>
                  <Pill tone={extractionTone(s.extractionStatus)}>{EXTRACTION_STATUS_LABELS[s.extractionStatus] ?? s.extractionStatus}</Pill>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Pill tone="blue">{libraryAgentName(agentSlug)}</Pill>
                  {s.category && <Pill tone="violet">{s.category}</Pill>}
                  <Pill tone="gray">{SOURCE_STATUS_LABELS[s.status] ?? s.status}</Pill>
                  <Pill tone="green">{s.techniqueCount} técnica(s)</Pill>
                  <span className="ml-auto text-[11px] text-gray-400">{fmtDate(s.createdAt)}</span>
                </div>
              </Link>
            );
          })}
        </section>

        {/* Detalhe da fonte */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Detalhe da fonte</h2>
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
                    <p className="text-xs text-gray-500">{selected.author || "—"} · {SOURCE_TYPE_LABELS[selected.sourceType as keyof typeof SOURCE_TYPE_LABELS] ?? selected.sourceType}</p>
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
                    <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Conteúdo colado (prévia · privado)</p>
                    <p className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-2 text-xs text-gray-600">
                      {selected.rawTextPreview}{selected.rawTextTruncated ? "…" : ""}
                    </p>
                  </>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={runExtraction} disabled={busy}
                    className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-50">
                    {busy ? "Processando…" : "✨ Gerar técnicas com IA"}
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
        🔒 A Library é a formação dos agentes e <strong>não está conectada ao runtime</strong> (Waiter/CRM/WhatsApp).
        “Ativas no runtime” permanece 0. Sínteses e técnicas são curadas — sem reprodução de obras completas.
      </p>
    </div>
  );
}
