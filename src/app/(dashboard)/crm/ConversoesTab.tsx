"use client";

import { useEffect, useState } from "react";
import type { ConversionsResult, ConversionProof } from "@/services/crm/CRMService";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function fmtDelay(hours: number | null): string {
  if (hours == null) return "";
  if (hours < 1)  return `em ${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `em ${Math.round(hours)} h`;
  return `em ${Math.round(hours / 24)} dias`;
}

/**
 * Conversões — prova social do CRM.
 * Histórico real de campanhas que viraram pedido: a mensagem enviada, quando,
 * quanto tempo levou e a receita gerada. Prova concreta de que o CRM converte.
 */
export function ConversoesTab() {
  const [data, setData]       = useState<ConversionsResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/crm/conversions")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json: { data?: ConversionsResult }) => setData(json.data ?? null))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  const summary = data?.summary;
  const proofs  = data?.proofs ?? [];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-ink">Conversões do CRM</h2>
        <p className="mt-0.5 text-sm text-muted">
          Prova real de quem recebeu uma campanha e <strong>comprou</strong> — a mensagem enviada, quando e quanto gerou.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-green-50 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-green-600">Conversões comprovadas</p>
          <p className="mt-1 text-2xl font-extrabold text-green-700">
            {loading ? "…" : (summary?.totalConversions ?? 0).toLocaleString("pt-BR")}
          </p>
        </div>
        <div className="rounded-xl bg-brand-50 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-600">Receita gerada pelo CRM</p>
          <p className="mt-1 text-2xl font-extrabold text-brand-700">
            {loading ? "…" : brl(summary?.totalRevenue ?? 0)}
          </p>
        </div>
        <div className="rounded-xl bg-blue-50 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-600">Taxa de conversão</p>
          <p className="mt-1 text-2xl font-extrabold text-blue-700">
            {loading ? "…" : `${(summary?.conversionRate ?? 0).toLocaleString("pt-BR")}%`}
          </p>
          <p className="mt-0.5 text-[10px] text-blue-400">
            {loading ? "" : `${(summary?.totalSent ?? 0).toLocaleString("pt-BR")} mensagens enviadas`}
          </p>
        </div>
      </div>

      {/* Timeline of proofs */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-[#F4F4F2]" />)}
        </div>
      ) : proofs.length === 0 ? (
        <div className="rounded-xl border border-line bg-paper p-8 text-center">
          <p className="text-sm font-semibold text-ink">Ainda não há conversões comprovadas</p>
          <p className="mt-1 text-xs text-muted">
            Assim que um cliente que recebeu uma campanha fizer um pedido, a prova aparece aqui automaticamente.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {proofs.map((p) => <ProofCard key={p.id} proof={p} />)}
        </div>
      )}
    </div>
  );
}

function ProofCard({ proof: p }: { proof: ConversionProof }) {
  return (
    <div className="rounded-xl border border-line bg-paper p-4 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-ink">{p.customerName}</p>
          <p className="text-[11px] text-muted">
            Campanha: <span className="font-semibold text-ink2">{p.campaignName}</span>
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-green-50 px-3 py-1 text-sm font-extrabold text-green-700">
          + {brl(p.revenue)}
        </span>
      </div>

      {p.messageText && (
        <blockquote className="mb-2 rounded-lg border-l-2 border-brand-300 bg-[#FAFAF8] px-3 py-2 text-[13px] italic text-ink2">
          “{p.messageText}”
        </blockquote>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
        <span>📤 Enviada {fmtDateTime(p.sentAt)}</span>
        <span>🛒 Pedido {fmtDateTime(p.convertedAt)}</span>
        {p.hoursToConvert != null && (
          <span className="font-semibold text-green-700">Converteu {fmtDelay(p.hoursToConvert)}</span>
        )}
      </div>
    </div>
  );
}
