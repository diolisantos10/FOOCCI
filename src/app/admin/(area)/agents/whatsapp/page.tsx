"use client";

/**
 * WhatsApp Text Order — Cockpit do simulador.
 *
 * Fonte principal de validação do anotador de pedido: o operador PROVA o fluxo
 * SEM celular e SEM teste manual. Roda a simulação completa (transcript +
 * comanda + ações traduzidas + segurança), mostra o checklist operacional e a
 * decisão do operador. Nada real é enviado/criado.
 */

import { useState } from "react";
import { CentralWhatsAppTabs } from "../../CentralWhatsAppTabs";
import {
  translateAction,
  buildCockpitChecklist,
  SIMULATOR_NEXT_ACTION,
  OPERATOR_DECISIONS,
  type OperatorDecision,
} from "@/services/whatsapp/ordering/cockpitPresentation";
import type {
  SimReport,
  SimScenarioResult,
} from "@/services/whatsapp/ordering/WhatsAppTextOrderSimulatorService";

type SimMode = "DRY_RUN" | "REPLY_ONLY" | "FULL_TEST";
type Status = "PASS" | "WARNING" | "FAIL";

interface Readiness {
  ok: boolean; restaurantName: string | null;
  replyOnlyReady: boolean; fullTestReady: boolean; restaurantWideReady: boolean;
  blockers: string[]; warnings: string[]; requiredNextActions: string[];
  flowDiagnostic: { status: string; passed: number; total: number; p0: number };
  config: {
    scope: string; mode: string; allowlistCount: number; riskLevel: string;
    canRunReplyOnly: boolean; canRunFullTest: boolean; rollbackSteps: string[];
  };
}

const STATUS_STYLE: Record<Status, string> = {
  PASS: "bg-emerald-900/50 text-emerald-300 border-emerald-700",
  WARNING: "bg-amber-900/50 text-amber-300 border-amber-700",
  FAIL: "bg-red-900/50 text-red-300 border-red-700",
};

const DECISION_STYLE: Record<OperatorDecision, string> = {
  "Aprovado para FULL_TEST controlado": "border-emerald-600 bg-emerald-900/40 text-emerald-200",
  "Precisa ajuste de mensagem": "border-amber-600 bg-amber-900/40 text-amber-200",
  "Bloqueado": "border-red-600 bg-red-900/40 text-red-200",
};

export default function WhatsAppCockpitPage() {
  const [mode, setMode] = useState<SimMode>("REPLY_ONLY");
  const [slug, setSlug] = useState("sushi-cazza");
  const [sim, setSim] = useState<SimReport | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  // Decisão do operador — estado local (ainda não executa ação real).
  const [decision, setDecision] = useState<OperatorDecision | null>(null);

  async function runAll() {
    setLoading(true); setError(null); setDecision(null);
    try {
      const [simRes, rdRes] = await Promise.all([
        fetch("/api/admin/diagnostics/whatsapp-text-ordering/simulator/full", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode }),
        }),
        fetch("/api/admin/diagnostics/whatsapp-text-ordering/readiness", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ restaurantSlug: slug }),
        }),
      ]);
      if (!simRes.ok) throw new Error(`Simulação falhou (${simRes.status})`);
      setSim(await simRes.json());
      setReadiness(rdRes.ok ? await rdRes.json() : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao rodar a simulação");
    } finally {
      setLoading(false);
    }
  }

  const checklist = sim ? buildCockpitChecklist(sim, readiness?.config) : null;

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 text-gray-100">
      <CentralWhatsAppTabs />
      <h1 className="text-2xl font-bold">WhatsApp · Pedido por Texto — Cockpit</h1>
      <p className="mt-1 text-sm text-gray-400">
        Esta tela é a validação principal do anotador de pedido: roda a conversa inteira num cardápio
        de teste e mostra o que o cliente veria, a comanda montada e o que aconteceria de verdade.
        O teste no celular é opcional, não obrigatório.
      </p>
      <div className="mt-2 rounded-lg border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-300">
        Seguro: não envia WhatsApp, não cria pedido, não gera Pix.
      </div>

      {/* Controls */}
      <div className="mt-5 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-gray-400">Modo simulado</span>
          <select value={mode} onChange={(e) => setMode(e.target.value as SimMode)}
            className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2">
            <option value="DRY_RUN">DRY_RUN (não responde)</option>
            <option value="REPLY_ONLY">REPLY_ONLY (responde, sem pedido/Pix)</option>
            <option value="FULL_TEST">FULL_TEST (simulado — sem efeito real)</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-gray-400">Restaurante (config/readiness)</span>
          <input value={slug} onChange={(e) => setSlug(e.target.value)}
            className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2" />
        </label>
        <button onClick={runAll} disabled={loading}
          className="rounded-md bg-violet-600 px-4 py-2 font-semibold hover:bg-violet-500 disabled:opacity-50">
          {loading ? "Rodando…" : "Rodar simulação completa"}
        </button>
      </div>

      {error && <p className="mt-4 rounded-md border border-red-700 bg-red-950/50 px-3 py-2 text-red-300">{error}</p>}

      {/* Decisão do operador */}
      {sim && (
        <div data-testid="operator-decision" className="mt-6 rounded-lg border border-gray-700 bg-gray-900/70 p-4">
          <p className="text-sm font-semibold text-gray-200">
            Status: {decision ?? "pronto para revisão no simulador"}
          </p>
          <p className="mt-1 text-xs text-gray-400">{SIMULATOR_NEXT_ACTION}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {OPERATOR_DECISIONS.map((d) => (
              <button key={d} onClick={() => setDecision(d)}
                className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                  decision === d ? DECISION_STYLE[d] : "border-gray-700 bg-gray-900 text-gray-300 hover:border-gray-500"
                }`}>
                {d}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-gray-500">
            A decisão fica registrada nesta tela (não executa nenhuma ação real ainda).
          </p>
        </div>
      )}

      {/* Summary */}
      {sim && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className={`rounded-md border px-3 py-1 text-sm font-bold ${STATUS_STYLE[sim.status]}`}>{sim.status}</span>
          <span className="text-sm text-gray-300">✅ {sim.passed} · ⚠ {sim.warned} · ❌ {sim.failed} · P0 {sim.p0}</span>
          <span className="text-xs text-gray-500">
            Segurança: {sim.safety.noWhatsAppSend ? "sem Evolution" : "⚠"} · {sim.safety.noRealOrder ? "sem pedido real" : "⚠"} · {sim.safety.noRealPix ? "sem Pix real" : "⚠"} · runtimeTouched={String(sim.safety.runtimeTouched)}
          </span>
        </div>
      )}

      {/* Checklist visual */}
      {checklist && (
        <div data-testid="cockpit-checklist" className="mt-4 rounded-lg border border-gray-800 bg-gray-900/60 p-4">
          <h2 className="text-sm font-semibold text-gray-300">Checklist do anotador</h2>
          <ul className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {checklist.map((item) => (
              <li key={item.label} className="flex items-start gap-2">
                <span className={item.passed === true ? "text-emerald-400" : item.passed === false ? "text-red-400" : "text-gray-500"}>
                  {item.passed === true ? "✓" : item.passed === false ? "✗" : "—"}
                </span>
                <span>
                  <span className="text-gray-200">{item.label}</span>
                  <span className="block text-[11px] text-gray-500">{item.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Readiness */}
      {readiness && readiness.ok && (
        <div className="mt-4 rounded-lg border border-gray-800 bg-gray-900/60 p-4">
          <h2 className="text-sm font-semibold text-gray-300">Config &amp; Readiness — {readiness.restaurantName}</h2>
          <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            <Info label="scope" value={readiness.config.scope} ok={readiness.config.scope === "PHONE_ALLOWLIST"} />
            <Info label="mode" value={readiness.config.mode} />
            <Info label="allowlist" value={String(readiness.config.allowlistCount)} />
            <Info label="riskLevel" value={readiness.config.riskLevel} ok={readiness.config.riskLevel !== "HIGH"} />
            <Info label="replyOnly pronto" value={String(readiness.replyOnlyReady)} ok={readiness.replyOnlyReady} />
            <Info label="fullTest pronto" value={String(readiness.fullTestReady)} ok={readiness.fullTestReady} />
            <Info label="restaurantWide pronto" value={String(readiness.restaurantWideReady)} ok={readiness.restaurantWideReady} />
            <Info label="fluxo" value={`${readiness.flowDiagnostic.status} ${readiness.flowDiagnostic.passed}/${readiness.flowDiagnostic.total} (p0=${readiness.flowDiagnostic.p0})`} ok={readiness.flowDiagnostic.status === "PASS"} />
          </div>
          {readiness.blockers.length > 0 && <List title="Bloqueios" items={readiness.blockers} tone="red" />}
          {readiness.warnings.length > 0 && <List title="Avisos" items={readiness.warnings} tone="amber" />}
          {readiness.requiredNextActions.length > 0 && <List title="Próximas ações" items={readiness.requiredNextActions} tone="gray" />}
          <details className="mt-2 text-xs text-gray-500">
            <summary className="cursor-pointer">Rollback (~30s)</summary>
            <ul className="mt-1 list-disc pl-5">{readiness.config.rollbackSteps.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </details>
        </div>
      )}

      {/* Scenarios */}
      {sim && (
        <div className="mt-6 space-y-2">
          {sim.scenarios.map((s) => (
            <ScenarioCard key={s.scenarioId} scenario={s} open={open === s.scenarioId}
              onToggle={() => setOpen(open === s.scenarioId ? null : s.scenarioId)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ScenarioCard({ scenario: s, open, onToggle }: { scenario: SimScenarioResult; open: boolean; onToggle: () => void }) {
  const firstCustomerMsg = s.transcript.find(t => t.actor === "CUSTOMER")?.text ?? "—";
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/50">
      <button onClick={onToggle} className="flex w-full items-center justify-between px-4 py-3 text-left">
        <span className="flex items-center gap-3">
          <span className={`rounded border px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[s.status]}`}>{s.status}</span>
          <span className="font-medium">{s.name}</span>
          <span className="rounded-full bg-gray-800 px-2 py-0.5 text-[10px] uppercase text-gray-400">{s.kind}</span>
        </span>
        <span className="text-xs text-gray-500">{open ? "fechar" : "abrir detalhe"}</span>
      </button>
      {open && (
        <div className="border-t border-gray-800 px-4 py-3 text-sm">
          <p className="text-xs text-gray-400">
            Mensagem do cliente: <span className="text-gray-200">&ldquo;{firstCustomerMsg}&rdquo;</span>
          </p>

          {s.kind === "FLOW" && (
            <div className="mt-2 space-y-1">
              {s.transcript.map((t, i) => (
                <div key={i} className={t.actor === "CUSTOMER" ? "text-right" : ""}>
                  <span className={`inline-block whitespace-pre-wrap rounded-lg px-3 py-1.5 ${t.actor === "CUSTOMER" ? "bg-emerald-800/60" : t.actor === "AGENT" ? "bg-gray-800" : "bg-gray-950 text-gray-400"}`}>
                    {t.text}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold text-gray-400">O que o fluxo entendeu</p>
              <ul className="mt-1 space-y-0.5 text-xs text-gray-300">
                <li>Itens na comanda: {s.summary.itemsFound.length > 0 ? s.summary.itemsFound.map(i => `${i.quantity}× ${i.name}`).join(", ") : "nenhum"}</li>
                <li>Itens ambíguos/pendentes: {s.summary.itemsAmbiguous.length > 0 ? s.summary.itemsAmbiguous.join(", ") : "nenhum"}</li>
                <li>Pagamento detectado: {s.summary.paymentMethod ?? "—"}</li>
                <li>Entrega/retirada: {s.summary.deliveryType ?? "—"}</li>
                <li>Endereço usado (simulado): {s.summary.addressUsed ?? "—"}</li>
              </ul>
              <p className="mt-2 text-xs font-semibold text-gray-400">O que aconteceria de verdade</p>
              {s.actions.length > 0 ? (
                <ul className="mt-1 space-y-0.5 text-xs text-gray-300">
                  {s.actions.map((a) => (
                    <li key={a}>
                      • {translateAction(a)} <span className="text-[10px] text-gray-600">({a})</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-gray-500">Nenhuma ação — só conversa, nada seria criado.</p>
              )}
              <p className="mt-2 text-[11px] text-gray-500">
                Segurança: {s.safety.noWhatsAppSend ? "✓ sem Evolution" : "✗ Evolution"} · {s.safety.noRealOrder ? "✓ sem pedido real" : "✗ pedido real"} · {s.safety.noRealPix ? "✓ sem Pix real" : "✗ Pix real"} · runtimeTouched={String(s.safety.runtimeTouched)}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400">Verificações</p>
              <ul className="mt-1 space-y-0.5 text-xs">
                {s.checks.map((c, i) => (
                  <li key={i} className={c.passed ? "text-emerald-400" : c.severity === "P0" ? "text-red-400" : "text-amber-400"}>
                    {c.passed ? "✓" : "✗"} [{c.severity}] {c.name}{c.passed ? "" : ` — ${c.message}`}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs font-semibold text-gray-400">Comanda montada</p>
              <pre className="mt-1 max-h-48 overflow-auto rounded bg-gray-950 p-2 text-[11px] text-gray-400">
                {JSON.stringify(s.orderDraft ?? s.extractedEntities ?? {}, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Info({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div>
      <span className="text-gray-500">{label}: </span>
      <span className={ok === undefined ? "text-gray-200" : ok ? "text-emerald-400" : "text-red-400"}>{value}</span>
    </div>
  );
}

function List({ title, items, tone }: { title: string; items: string[]; tone: "red" | "amber" | "gray" }) {
  const color = tone === "red" ? "text-red-400" : tone === "amber" ? "text-amber-400" : "text-gray-400";
  return (
    <div className="mt-2">
      <p className={`text-xs font-semibold ${color}`}>{title}</p>
      <ul className="mt-0.5 list-disc pl-5 text-xs text-gray-400">{items.map((s, i) => <li key={i}>{s}</li>)}</ul>
    </div>
  );
}
