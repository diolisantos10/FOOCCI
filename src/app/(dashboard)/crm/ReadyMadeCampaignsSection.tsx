"use client";

/**
 * ReadyMadeCampaignsSection — the pre-built campaign catalog for the Campanhas tab.
 *
 * 8 ready-made campaigns as cards with a one-click on/off switch. Each card explains
 * what it does and WHEN it fires. "Configurar" opens a modal to pick one of 5 ready
 * messages (or write your own), choose a coupon from Promoções, and set the schedule
 * — before OR after turning it on. Nothing sends from here.
 */

import { useState, useEffect, useCallback } from "react";
import { type ReadyMadeCoupon } from "@/services/crm/readyMadeCampaigns";

type Editable = Array<"message" | "schedule" | "dailyLimit" | "coupon" | "triggerDays">;

interface Timing { summary: string; fromSegmentation: boolean; }

export interface ReadyMadeState {
  id: string;
  emoji: string;
  name: string;
  tagline: string;
  description: string;
  objective: string;
  engine: "RECURRING" | "CART_RECOVERY";
  editable: Editable;
  messageVariants: string[];
  timing: Timing;
  triggerDays?: number;
  triggerDaysLabel?: string;
  active: boolean;
  status: string | null;
  campaignId: string | null;
  message: string;
  coupon: ReadyMadeCoupon | null;
  weekdays: number[];
  timeWindow: { start: string; end: string };
  dailyLimit: number;
  metaTemplate: { name: string; status: string; rejectedReason: string | null } | null;
}

export function ReadyMadeCampaignsSection({ onManage, reloadSignal }: {
  /** Open the full "Gerenciar" modal for a recurring campaign (unified interface). */
  onManage?: (campaignId: string) => void;
  /** Bump to force a reload (e.g. after the manage modal changed a campaign). */
  reloadSignal?: number;
} = {}) {
  const [items, setItems]     = useState<ReadyMadeState[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId]   = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const rmRes = await fetch("/api/crm/ready-made").then((r) => r.json()).catch(() => null);
      if (rmRes?.data?.campaigns) setItems(rmRes.data.campaigns as ReadyMadeState[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load, reloadSignal]);

  async function post(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    try {
      await fetch(`/api/crm/ready-made/${id}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  const toggle = (c: ReadyMadeState) => post(c.id, { action: c.active ? "deactivate" : "activate" });

  // Every catalog engine (RECURRING / CART_RECOVERY) configures through the ONE
  // unified "Gerenciar" modal. If no campaign row exists yet, create a PAUSED one
  // to hold the config first. (The legacy simple-config modal is gone.)
  async function configure(c: ReadyMadeState) {
    if (!onManage) return;
    let campaignId = c.campaignId;
    if (!campaignId) {
      setBusyId(c.id);
      try {
        await fetch(`/api/crm/ready-made/${c.id}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "update", overrides: {} }),
        });
        const fresh = await fetch("/api/crm/ready-made").then((r) => r.json()).catch(() => null);
        const rows = (fresh?.data?.campaigns as ReadyMadeState[] | undefined) ?? [];
        if (rows.length) setItems(rows);
        campaignId = rows.find((x) => x.id === c.id)?.campaignId ?? null;
      } finally {
        setBusyId(null);
      }
    }
    if (campaignId) onManage(campaignId);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <h3 className="mb-1 text-sm font-bold uppercase tracking-widest text-muted">Campanhas prontas</h3>
      <p className="mb-4 text-sm text-muted">
        Já vêm configuradas para qualquer restaurante. É só ligar — e ajustar antes ou depois, se quiser.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {items.map((c) => (
          <ReadyMadeCard
            key={c.id}
            c={c}
            busy={busyId === c.id}
            onToggle={() => void toggle(c)}
            onConfigure={() => void configure(c)}
          />
        ))}
      </div>

    </div>
  );
}

// ── Card ────────────────────────────────────────────────────────────────────────

function ReadyMadeCard({
  c, busy, onToggle, onConfigure,
}: {
  c: ReadyMadeState;
  busy: boolean;
  onToggle: () => void;
  onConfigure: () => void;
}) {
  return (
    <div className={`flex flex-col rounded-2xl border p-6 shadow-sm transition-shadow hover:shadow-md ${c.active ? "border-emerald-200 bg-emerald-50/40" : "border-line bg-paper"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="text-3xl leading-none">{c.emoji}</span>
          <div>
            <p className="text-lg font-bold leading-tight text-ink">{c.name}</p>
            <p className="mt-1 text-sm text-muted leading-snug">{c.tagline}</p>
          </div>
        </div>
        <button
          onClick={onToggle}
          disabled={busy}
          aria-label={c.active ? "Desligar" : "Ligar"}
          className={`shrink-0 relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${c.active ? "bg-emerald-500" : "bg-gray-300"}`}
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${c.active ? "translate-x-6" : "translate-x-1"}`} />
        </button>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-ink2">{c.description}</p>
      <p className="mt-1.5 text-xs text-muted"><span className="font-semibold">Objetivo:</span> {c.objective}</p>

      {/* When it fires */}
      {c.timing.summary && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-[#F4F4F2] px-3 py-2 text-sm text-ink2">
          <span className="text-base">🕒</span><span>{c.timing.summary}</span>
        </p>
      )}

      <div className="mt-3 flex items-center gap-3">
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${c.active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
          {c.active ? "Ligada" : "Desligada"}
        </span>
        <button onClick={onConfigure} className="text-sm font-semibold text-brand-600 hover:text-brand-700">
          Configurar
        </button>
      </div>
    </div>
  );
}
