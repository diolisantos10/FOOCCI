"use client";

/**
 * WaiterEvidencePanel — "Provas de Resultado" do Waiter.
 *
 * Commercial evidence hub, SEPARATE from training by design: here the operator
 * collects, reviews and approves documented proof that the Waiter sells more
 * (venda conduzida, upsell, recuperação, atrito resolvido, elogios, antes/depois).
 * Everything arrives sanitized (no PII) and starts as draft — nothing is used
 * commercially without explicit human approval.
 */

import { useCallback, useEffect, useState } from "react";
import {
  evidenceTypeLabel,
  evidenceStatusLabel,
  EVIDENCE_TYPE_LABELS,
} from "@/services/simulation/waiterTrainingDisplayLabels";

const BASE = "/api/admin/agents/waiter/evidence";

interface EvidenceRow {
  id: string; restaurantId: string; sourceType: string; sourceId: string | null;
  title: string; summary: string; evidenceType: string;
  valueBefore: string | null; valueAfter: string | null; incrementalValue: string | null; orderValue: string | null;
  customerSegment: string | null; sanitizedExcerpt: string | null; proofScore: number | null;
  status: string; isPublicCandidate: boolean; createdAt: string; metadata: { confidence?: string } | null;
}
interface Stats {
  total: number; approved: number; pending: number; countsByType: Record<string, number>;
  approvedIncrementalValue: number; documentedRevenue: number; documentedIncrementalValue: number;
}
const confidenceLabel = (c?: string) => (c === "HIGH" ? "Alta confiança" : c === "MEDIUM" ? "Confiança média" : c === "LOW" ? "Baixa confiança" : null);

function Pill({ tone, children }: { tone: string; children: React.ReactNode }) {
  const map: Record<string, string> = {
    green: "bg-green-100 text-green-800", gray: "bg-gray-100 text-gray-700",
    amber: "bg-amber-100 text-amber-800", red: "bg-red-100 text-red-800",
    blue: "bg-blue-100 text-blue-800", violet: "bg-violet-100 text-violet-800",
  };
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${map[tone] ?? map.gray}`}>{children}</span>;
}
const statusTone = (s: string) => (s === "APPROVED" ? "green" : s === "REJECTED" ? "red" : s === "BACKLOG" ? "violet" : "amber");
const fmtBRL = (v: string | number | null) => (v == null ? null : `R$ ${Number(v).toFixed(2)}`);

export function WaiterEvidencePanel() {
  const [items, setItems] = useState<EvidenceRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [typeFilter, setTypeFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [showForm, setShowForm] = useState(false);

  // manual evidence form
  const [fRestaurant, setFRestaurant] = useState("");
  const [fTitle, setFTitle] = useState("");
  const [fSummary, setFSummary] = useState("");
  const [fType, setFType] = useState("UPSELL");
  const [fExcerpt, setFExcerpt] = useState("");
  const [fBefore, setFBefore] = useState("");
  const [fAfter, setFAfter] = useState("");

  const load = useCallback(async () => {
    const qs = typeFilter ? `?evidenceType=${typeFilter}` : "";
    const res = await fetch(`${BASE}${qs}`).then((r) => r.json()).catch(() => ({ ok: false }));
    if (res.ok) { setItems(res.items ?? []); setStats(res.stats ?? null); }
  }, [typeFilter]);

  useEffect(() => { void load(); }, [load]);

  const review = useCallback(async (id: string, status: string) => {
    await fetch(`${BASE}/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    await load();
  }, [load]);

  const collect = useCallback(async () => {
    setBusy(true); setMsg("");
    try {
      const res = await fetch(`${BASE}/collect`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const json = await res.json();
      setMsg(json.ok ? `Busca em conversas: ${json.created} evidência(s) nova(s) de ${json.scanned} conversa(s).` : (json.error ?? "Falha."));
      await load();
    } finally { setBusy(false); }
  }, [load]);

  const collectOrders = useCallback(async () => {
    setBusy(true); setMsg("");
    try {
      const res = await fetch(`${BASE}/collect-orders`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const json = await res.json();
      setMsg(json.ok
        ? `Provas em pedidos: ${json.created} nova(s) de ${json.scanned} pedido(s) · receita documentada R$ ${Number(json.documentedRevenue ?? 0).toFixed(2)} · upsell R$ ${Number(json.documentedIncremental ?? 0).toFixed(2)}.`
        : (json.error ?? "Falha."));
      await load();
    } finally { setBusy(false); }
  }, [load]);

  const togglePublic = useCallback(async (id: string, isPublicCandidate: boolean) => {
    const res = await fetch(`${BASE}/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isPublicCandidate }) });
    const json = await res.json();
    if (!json.ok) setMsg(json.error ?? "Falha.");
    await load();
  }, [load]);

  const copyMiniCase = useCallback((e: EvidenceRow) => {
    const lines = [e.summary];
    if (e.sanitizedExcerpt) lines.push(`Trecho (sanitizado): “${e.sanitizedExcerpt}”`);
    if (e.incrementalValue && Number(e.incrementalValue) > 0) lines.push(`Resultado: upsell de R$ ${Number(e.incrementalValue).toFixed(2)}.`);
    else if (e.orderValue && Number(e.orderValue) > 0) lines.push(`Resultado: pedido de R$ ${Number(e.orderValue).toFixed(2)}.`);
    else lines.push("Resultado: atendimento conduzido pelo Waiter.");
    void navigator.clipboard?.writeText(lines.join("\n"));
    setMsg("Mini case copiado para a área de transferência.");
  }, []);

  const createManual = useCallback(async () => {
    setBusy(true); setMsg("");
    try {
      const res = await fetch(BASE, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantId: fRestaurant.trim(), title: fTitle.trim(), summary: fSummary.trim(),
          evidenceType: fType, excerpt: fExcerpt.trim() || undefined,
          valueBefore: fBefore.trim() ? Number(fBefore) : undefined,
          valueAfter: fAfter.trim() ? Number(fAfter) : undefined,
        }),
      });
      const json = await res.json();
      setMsg(json.ok ? "Evidência criada — aguardando sua revisão." : (json.error ?? "Falha."));
      if (json.ok) { setShowForm(false); setFTitle(""); setFSummary(""); setFExcerpt(""); setFBefore(""); setFAfter(""); }
      await load();
    } finally { setBusy(false); }
  }, [fRestaurant, fTitle, fSummary, fType, fExcerpt, fBefore, fAfter, load]);

  return (
    <div className="space-y-4">
      {/* resumo */}
      <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-gray-900">🏆 Provas de Resultado</h3>
            <p className="text-[11px] text-gray-700">Evidências documentadas de que o Waiter vende mais e atende melhor — para mostrar a restaurantes e usar comercialmente.</p>
          </div>
          <Pill tone="green">Dados sensíveis removidos antes de qualquer uso</Pill>
        </div>
        {stats && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatBox label="Evidências" value={String(stats.total)} />
            <StatBox label="Provas aprovadas" value={String(stats.approved)} />
            <StatBox label="Receita documentada" value={`R$ ${(stats.documentedRevenue ?? 0).toFixed(2)}`} />
            <StatBox label="Upsell documentado" value={`R$ ${(stats.documentedIncrementalValue ?? 0).toFixed(2)}`} />
          </div>
        )}
        <p className="mt-2 text-[10px] text-gray-500">
          Uma prova só pode ser usada comercialmente depois de <strong>aprovada por você</strong>. Valores incrementais só
          contam quando há números reais (nada é inventado).
        </p>
      </section>

      {/* ações */}
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={busy} onClick={() => void collectOrders()}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? "Buscando…" : "Buscar provas em pedidos e conversas"}
          </button>
          <button type="button" disabled={busy} onClick={() => void collect()}
            className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">
            Só conversas
          </button>
          <button type="button" onClick={() => setShowForm((v) => !v)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">
            {showForm ? "Fechar" : "+ Criar evidência manual"}
          </button>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
            className="ml-auto rounded-lg border border-gray-300 px-2 py-1.5 text-xs">
            <option value="">Todos os tipos</option>
            {Object.entries(EVIDENCE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <p className="mt-1.5 text-[10px] text-gray-400">
          A busca automática lê conversas reais (somente leitura), remove dados sensíveis e cria rascunhos para sua revisão.
          Upsell com valor e antes/depois ainda são capturados manualmente.
        </p>
        {msg && <p className="mt-2 text-[11px] text-gray-700">{msg}</p>}

        {showForm && (
          <div className="mt-3 space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input value={fRestaurant} onChange={(e) => setFRestaurant(e.target.value)} placeholder="restaurantId *"
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
              <select value={fType} onChange={(e) => setFType(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
                {Object.entries(EVIDENCE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <input value={fTitle} onChange={(e) => setFTitle(e.target.value)} placeholder="Título * (ex.: Upsell de sobremesa aceito)"
              className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
            <textarea value={fSummary} onChange={(e) => setFSummary(e.target.value)} rows={2} placeholder="O que aconteceu *"
              className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
            <textarea value={fExcerpt} onChange={(e) => setFExcerpt(e.target.value)} rows={2}
              placeholder="Trecho da conversa (opcional — dados sensíveis são removidos automaticamente)"
              className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <input value={fBefore} onChange={(e) => setFBefore(e.target.value)} placeholder="Valor antes (R$, opcional)"
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
              <input value={fAfter} onChange={(e) => setFAfter(e.target.value)} placeholder="Valor depois (R$, opcional)"
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
            </div>
            <button type="button" disabled={busy || !fRestaurant.trim() || !fTitle.trim() || !fSummary.trim()} onClick={() => void createManual()}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
              Salvar evidência
            </button>
          </div>
        )}
      </section>

      {/* lista */}
      <section className="space-y-2">
        {items.length === 0 && (
          <p className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-500">
            Nenhuma evidência ainda. Use “Buscar provas em pedidos e conversas” ou crie uma manualmente.
          </p>
        )}
        {items.map((e) => (
          <div key={e.id} className="rounded-xl border border-gray-200 bg-white p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone="blue">{evidenceTypeLabel(e.evidenceType)}</Pill>
              <span className="text-sm font-bold text-gray-900">{e.title}</span>
              <Pill tone={statusTone(e.status)}>{evidenceStatusLabel(e.status)}</Pill>
              {confidenceLabel(e.metadata?.confidence) && (
                <Pill tone={e.metadata?.confidence === "HIGH" ? "green" : e.metadata?.confidence === "MEDIUM" ? "amber" : "gray"}>{confidenceLabel(e.metadata?.confidence)}</Pill>
              )}
              {e.isPublicCandidate && <Pill tone="violet">Prova comercial</Pill>}
              {e.incrementalValue != null && <Pill tone="green">+{fmtBRL(e.incrementalValue)}</Pill>}
            </div>
            <p className="mt-1 text-[12px] text-gray-700">{e.summary}</p>
            {e.sanitizedExcerpt && (
              <p className="mt-1 rounded-lg bg-gray-50 px-2 py-1.5 text-[11px] italic text-gray-600">“{e.sanitizedExcerpt}”</p>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-gray-400">
              <span>Origem: {e.sourceType === "CONVERSATION" ? "Conversa real" : e.sourceType === "ORDER" ? "Pedido" : e.sourceType === "MANUAL_NOTE" ? "Registro manual" : e.sourceType}</span>
              {e.valueBefore != null && <span>Antes: {fmtBRL(e.valueBefore)}</span>}
              {e.valueAfter != null && <span>Depois: {fmtBRL(e.valueAfter)}</span>}
              {e.orderValue != null && <span>Pedido: {fmtBRL(e.orderValue)}</span>}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Btn onClick={() => copyMiniCase(e)}>Copiar resumo</Btn>
              {e.status === "APPROVED" && !e.isPublicCandidate && <Btn tone="green" onClick={() => void togglePublic(e.id, true)}>Marcar como prova comercial</Btn>}
              {e.isPublicCandidate && <Btn onClick={() => void togglePublic(e.id, false)}>Remover de prova comercial</Btn>}
            </div>
            {e.status === "DRAFT" && (
              <div className="mt-2 flex gap-1.5">
                <Btn tone="green" onClick={() => void review(e.id, "APPROVED")}>Aprovar prova</Btn>
                <Btn tone="red" onClick={() => void review(e.id, "REJECTED")}>Rejeitar</Btn>
                <Btn onClick={() => void review(e.id, "BACKLOG")}>Guardar para depois</Btn>
              </div>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-white px-2 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-gray-900">{value}</p>
    </div>
  );
}
function Btn({ children, onClick, tone }: { children: React.ReactNode; onClick: () => void; tone?: string }) {
  const cls = tone === "red" ? "border-red-300 text-red-700 hover:bg-red-50"
    : tone === "green" ? "border-green-300 text-green-700 hover:bg-green-50"
    : "border-gray-300 text-gray-700 hover:bg-gray-100";
  return <button type="button" onClick={onClick} className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{children}</button>;
}
