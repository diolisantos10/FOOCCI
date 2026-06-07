"use client";

/**
 * WA Pedido Texto — admin diagnostic simulator.
 *
 * Simulates a WhatsApp free-text order WITHOUT sending any real message,
 * creating any real order, or generating any real Pix.
 * Internal testing only.
 */

import { useState, useCallback } from "react";

// ── Response types (mirror WhatsAppTextOrderService) ─────────────────────────

interface ParsedItem {
  rawText:  string;
  quantity: number;
  name:     string;
}

interface OrderItem {
  rawText:      string;
  quantity:     number;
  menuItemId:   string;
  menuItemName: string;
  variantName?: string;
  unitPrice:    number;
  lineTotal:    number;
  options:      { optionName: string }[];
  extras:       { extraName: string }[];
}

interface UnresolvedItem {
  rawText:    string;
  quantity:   number;
  reason:     "NOT_FOUND" | "AMBIGUOUS" | "UNAVAILABLE";
  candidates: string[];
}

interface MissingQuestion {
  itemName:  string;
  groupName: string;
  required:  boolean;
  options:   string[];
}

interface DraftLine {
  name:      string;
  quantity:  number;
  variant?:  string;
  options:   string[];
  extras:    string[];
  unitPrice: number;
  lineTotal: number;
}

interface DraftSummary {
  subtotal:            number;
  items:               DraftLine[];
  missingRequirements: string[];
}

interface SimResult {
  restaurant:       { id: string; name: string; slug: string };
  messageText:      string;
  detectedIntent:   string;
  parsedItems:      ParsedItem[];
  matchedItems:     OrderItem[];
  unresolvedItems:  UnresolvedItem[];
  missingQuestions: MissingQuestion[];
  draftSummary:     DraftSummary | null;
  estimatedTotal:   number;
  nextStage:        string;
  suggestedReply:   string;
  actions:          string[];
  safetyNotes:      string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const INTENT_CLS: Record<string, string> = {
  ORDER_REQUEST: "bg-green-900/40 text-green-300 border-green-700",
  QUESTION:      "bg-blue-900/40 text-blue-300 border-blue-700",
  HUMAN_NEEDED:  "bg-amber-900/40 text-amber-300 border-amber-700",
  UNKNOWN:       "bg-gray-800 text-gray-400 border-gray-700",
};

function Badge({ text, cls }: { text: string; cls?: string }) {
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${cls ?? "bg-gray-800 text-gray-300 border-gray-600"}`}>
      {text}
    </span>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-700 bg-gray-900/60 p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">{title}</h3>
      {children}
    </div>
  );
}

function fmtBRL(v: number) {
  return `R$ ${v.toFixed(2)}`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function WaTextOrderingPage() {
  const [slug, setSlug]         = useState("sushi-cazza");
  const [message, setMessage]   = useState("Quero 2 yakisoba e uma Coca");
  const [session, setSession]   = useState("");
  const [result, setResult]     = useState<SimResult | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true); setError(null); setResult(null);
    try {
      let currentSession: Record<string, unknown> | undefined;
      if (session.trim()) {
        currentSession = JSON.parse(session);
      }
      const res = await fetch("/api/admin/diagnostics/whatsapp-text-ordering/run", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          restaurantSlug: slug,
          messageText:    message,
          mode:           "dry_run",
          currentSession,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setResult(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido.");
    } finally {
      setLoading(false);
    }
  }, [slug, message, session]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 text-gray-200">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-lg">🧾</span>
        <h1 className="text-xl font-bold text-white">WA Pedido Texto</h1>
        <Badge text="DRY-RUN" cls="bg-violet-900/50 text-violet-300 border-violet-700" />
      </div>
      <p className="mt-1 text-sm text-gray-400">
        Simula um pedido por WhatsApp via texto livre. Nenhuma mensagem enviada,
        nenhum pedido criado, nenhum Pix gerado.
      </p>

      {/* Input form */}
      <div className="mt-6 space-y-3 rounded-xl border border-gray-700 bg-gray-900/60 p-4">
        <label className="flex flex-col gap-1 text-xs text-gray-400">
          Slug do restaurante
          <input
            value={slug}
            onChange={e => setSlug(e.target.value)}
            className="rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100"
            placeholder="sushi-cazza"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-400">
          Mensagem do cliente
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            rows={3}
            className="rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 font-mono"
            placeholder="Quero 2 yakisoba e uma Coca"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-400">
          Sessão atual (JSON opcional)
          <textarea
            value={session}
            onChange={e => setSession(e.target.value)}
            rows={2}
            className="rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 font-mono"
            placeholder='{"stage":"REVIEWING_ORDER"}'
          />
        </label>
        <button
          onClick={run}
          disabled={loading || !slug.trim() || !message.trim()}
          className="rounded-lg bg-violet-700 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-600 disabled:opacity-50"
        >
          {loading ? "Simulando…" : "Simular pedido por WhatsApp"}
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-700 bg-red-900/40 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-6 space-y-4">
          {/* Restaurant + meta */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-white">{result.restaurant.name}</span>
            <Badge text={result.restaurant.slug} />
            <Badge text={result.nextStage} cls="bg-gray-800 text-gray-300 border-gray-600" />
          </div>

          {/* 1. Intent */}
          <Panel title="Intent detectado">
            <div className="flex items-center gap-3">
              <Badge text={result.detectedIntent} cls={INTENT_CLS[result.detectedIntent] ?? ""} />
              {result.actions.map(a => (
                <Badge key={a} text={a} cls="bg-gray-800 text-gray-400 border-gray-700" />
              ))}
            </div>
          </Panel>

          {/* 2. Parsed items */}
          <Panel title={`Itens parseados (${result.parsedItems.length})`}>
            {result.parsedItems.length === 0 ? (
              <p className="text-xs text-gray-500">Nenhum item detectado na mensagem.</p>
            ) : (
              <ul className="space-y-1">
                {result.parsedItems.map((p, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <span className="tabular-nums text-gray-500 text-xs w-4">{p.quantity}×</span>
                    <span className="text-gray-200">{p.name}</span>
                    <span className="text-gray-600 text-xs">({p.rawText})</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* 3. Menu matches */}
          <Panel title={`Matches no cardápio (${result.matchedItems.length})`}>
            {result.matchedItems.length === 0 ? (
              <p className="text-xs text-gray-500">Nenhum item confirmado no cardápio.</p>
            ) : (
              <ul className="space-y-1.5">
                {result.matchedItems.map((m, i) => (
                  <li key={i} className="flex items-center justify-between text-sm">
                    <span>
                      <span className="text-gray-500 text-xs">{m.quantity}×</span>{" "}
                      <span className="text-gray-100 font-medium">{m.menuItemName}</span>
                      {m.variantName && <span className="text-gray-400 ml-1 text-xs">({m.variantName})</span>}
                    </span>
                    <span className="text-gray-300 tabular-nums">{fmtBRL(m.lineTotal)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* 4. Unresolved + missing questions */}
          {(result.unresolvedItems.length > 0 || result.missingQuestions.length > 0) && (
            <Panel title="Pendências">
              {result.unresolvedItems.map((u, i) => (
                <div key={i} className="mb-2 flex items-start gap-2">
                  <Badge
                    text={u.reason}
                    cls={
                      u.reason === "NOT_FOUND"
                        ? "bg-red-900/40 text-red-300 border-red-700"
                        : u.reason === "AMBIGUOUS"
                        ? "bg-amber-900/40 text-amber-300 border-amber-700"
                        : "bg-gray-800 text-gray-400 border-gray-700"
                    }
                  />
                  <span className="text-sm text-gray-300">
                    &quot;{u.rawText}&quot;
                    {u.candidates.length > 0 && (
                      <span className="text-gray-500"> → {u.candidates.join(", ")}</span>
                    )}
                  </span>
                </div>
              ))}
              {result.missingQuestions.map((q, i) => (
                <div key={i} className="mb-2 flex items-start gap-2">
                  <Badge text="MISSING" cls="bg-amber-900/40 text-amber-300 border-amber-700" />
                  <span className="text-sm text-gray-300">
                    {q.itemName} — {q.groupName}
                    {q.options.length > 0 && (
                      <span className="text-gray-500"> ({q.options.join(", ")})</span>
                    )}
                  </span>
                </div>
              ))}
            </Panel>
          )}

          {/* 5. Draft / comanda */}
          {result.draftSummary && (
            <Panel title="Comanda preliminar">
              <ul className="space-y-1 mb-3">
                {result.draftSummary.items.map((l, i) => (
                  <li key={i} className="flex items-center justify-between text-sm">
                    <span className="text-gray-200">
                      {l.quantity}× {l.name}
                      {l.variant && <span className="text-gray-500"> {l.variant}</span>}
                      {l.options.length > 0 && <span className="text-gray-500"> ({l.options.join(", ")})</span>}
                    </span>
                    <span className="tabular-nums text-gray-300">{fmtBRL(l.lineTotal)}</span>
                  </li>
                ))}
              </ul>
              <div className="border-t border-gray-700 pt-2 flex justify-between text-sm font-semibold">
                <span className="text-gray-300">Subtotal</span>
                <span className="text-white">{fmtBRL(result.draftSummary.subtotal)}</span>
              </div>
              {result.draftSummary.missingRequirements.length > 0 && (
                <p className="mt-2 text-xs text-amber-400">
                  ⚠ Faltando: {result.draftSummary.missingRequirements.join(", ")}
                </p>
              )}
            </Panel>
          )}

          {/* 6. Suggested reply */}
          <Panel title="Resposta sugerida (não enviada)">
            <p className="rounded-lg bg-gray-800 px-4 py-3 text-sm text-gray-100 whitespace-pre-wrap">
              {result.suggestedReply}
            </p>
          </Panel>

          {/* 7. Safety notes */}
          <Panel title="Notas de segurança">
            <ul className="space-y-1">
              {result.safetyNotes.map((n, i) => (
                <li key={i} className="flex items-center gap-2 text-xs text-gray-400">
                  <span className="text-green-500">✓</span> {n}
                </li>
              ))}
            </ul>
          </Panel>

          {/* 8. Raw JSON */}
          <Panel title="JSON bruto">
            <pre className="overflow-auto rounded-lg bg-gray-950 p-3 text-[11px] text-gray-400 max-h-64">
              {JSON.stringify(result, null, 2)}
            </pre>
          </Panel>
        </div>
      )}
    </div>
  );
}
