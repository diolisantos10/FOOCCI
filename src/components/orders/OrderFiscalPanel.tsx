"use client";

/**
 * OrderFiscalPanel — the NFC-e status + actions on the order detail screen.
 *
 * Reads/acts through /api/orders/[id]/fiscal. Shows exactly where the note is
 * (autorizada nº / processando / rejeitada com motivo / cancelada / pendente) and
 * the one relevant action: emitir, atualizar, ver DANFCE, cancelar. Rendered only
 * when the restaurant has fiscal enabled or a note already exists for the order.
 */

import { useState } from "react";

export interface FiscalDocView {
  status: string;
  serie: number | null;
  numero: number | null;
  chave: string | null;
  danfceUrl: string | null;
  urlConsulta: string | null;
  qrCodeData: string | null;
  rejeicaoMotivo: string | null;
  lastError: string | null;
  emitidaAt: string | null;
  canceladaAt: string | null;
}

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  NENHUMA: { label: "Ainda não emitida", cls: "bg-line2 text-ink2" },
  PENDENTE: { label: "Pendente", cls: "bg-amber-100 text-amber-800" },
  PROCESSANDO: { label: "Processando…", cls: "bg-blue-100 text-blue-700" },
  AUTORIZADA: { label: "Autorizada", cls: "bg-green-100 text-green-700" },
  REJEITADA: { label: "Rejeitada", cls: "bg-red-100 text-red-700" },
  CONTINGENCIA: { label: "Contingência", cls: "bg-amber-100 text-amber-800" },
  ERRO: { label: "Erro", cls: "bg-red-100 text-red-700" },
  CANCELADA: { label: "Cancelada", cls: "bg-line2 text-muted" },
};

const BTN = "rounded-xl border border-line2 bg-paper px-3 py-1.5 text-xs font-medium text-ink2 hover:bg-[#FAFAF8] disabled:opacity-50 transition";
const BTN_PRIMARY = "rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition";

export function OrderFiscalPanel({ orderId, initialDoc }: { orderId: string; initialDoc: FiscalDocView | null }) {
  const [doc, setDoc] = useState<FiscalDocView | null>(initialDoc);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const status = doc?.status ?? "NENHUMA";
  const style = STATUS_STYLE[status] ?? STATUS_STYLE.NENHUMA!;

  async function call(path: string, method: "GET" | "POST", body?: object) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(path, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      return json?.data ?? null;
    } finally {
      setBusy(false);
    }
  }

  async function emit() {
    setDoc((await call(`/api/orders/${orderId}/fiscal`, "POST")) as FiscalDocView | null);
  }
  async function refresh() {
    setDoc((await call(`/api/orders/${orderId}/fiscal`, "GET")) as FiscalDocView | null);
  }
  async function cancel() {
    const j = window.prompt("Justificativa do cancelamento (mínimo 15 caracteres):") ?? "";
    if (j.trim().length < 15) {
      setMsg("A justificativa precisa ter ao menos 15 caracteres.");
      return;
    }
    const result = (await call(`/api/orders/${orderId}/fiscal/cancel`, "POST", { justificativa: j.trim() })) as
      | { ok: boolean; message: string }
      | null;
    if (result) setMsg(result.message);
    await refresh();
  }

  const canEmit = status === "NENHUMA" || status === "PENDENTE" || status === "REJEITADA" || status === "ERRO";

  return (
    <div className="rounded-xl border border-line2 bg-paper p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Nota Fiscal (NFC-e)</h2>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${style.cls}`}>{style.label}</span>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        {doc?.numero != null && (
          <div>
            <dt className="text-muted">Número / série</dt>
            <dd className="font-medium">
              {doc.numero} / {doc.serie ?? "—"}
            </dd>
          </div>
        )}
        {doc?.emitidaAt && (
          <div>
            <dt className="text-muted">Autorizada em</dt>
            <dd className="font-medium">{new Date(doc.emitidaAt).toLocaleString("pt-BR")}</dd>
          </div>
        )}
        {doc?.chave && (
          <div className="col-span-2">
            <dt className="text-muted">Chave de acesso</dt>
            <dd className="break-all font-mono text-xs font-medium">{doc.chave}</dd>
          </div>
        )}
        {(status === "REJEITADA" || status === "ERRO") && (doc?.rejeicaoMotivo || doc?.lastError) && (
          <div className="col-span-2">
            <dt className="text-muted">Motivo</dt>
            <dd className="text-xs font-medium text-red-600">{doc?.rejeicaoMotivo ?? doc?.lastError}</dd>
          </div>
        )}
        {status === "PENDENTE" && doc?.lastError && (
          <div className="col-span-2">
            <dt className="text-muted">Falta</dt>
            <dd className="text-xs font-medium text-amber-700">{doc.lastError}</dd>
          </div>
        )}
      </dl>

      {msg && <p className="mt-3 text-xs text-ink2">{msg}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {canEmit && (
          <button type="button" onClick={() => void emit()} disabled={busy} className={BTN_PRIMARY}>
            {busy ? "…" : status === "NENHUMA" ? "Emitir nota" : "Tentar de novo"}
          </button>
        )}
        {status === "PROCESSANDO" && (
          <button type="button" onClick={() => void refresh()} disabled={busy} className={BTN}>
            {busy ? "…" : "Atualizar status"}
          </button>
        )}
        {status === "AUTORIZADA" && doc?.danfceUrl && (
          <a href={doc.danfceUrl} target="_blank" rel="noopener noreferrer" className={BTN}>
            Ver DANFCE
          </a>
        )}
        {status === "AUTORIZADA" && (
          <button type="button" onClick={() => void cancel()} disabled={busy} className={BTN}>
            Cancelar nota
          </button>
        )}
      </div>
    </div>
  );
}
