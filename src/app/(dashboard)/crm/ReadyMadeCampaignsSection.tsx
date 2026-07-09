"use client";

/**
 * ReadyMadeCampaignsSection — the pre-built campaign catalog for the Campanhas tab.
 *
 * Shows the 8 ready-made campaigns as cards with a one-click on/off switch. Each
 * editable campaign can be opened to tweak message / coupon / schedule — the live
 * preview uses the same renderer that actually sends. Nothing sends from here;
 * turning a campaign on just enables it for the safe runner.
 */

import { useState, useEffect, useCallback } from "react";
import { renderCrmMessage } from "@/services/crm/renderCrmMessage";

type Editable = Array<"message" | "schedule" | "dailyLimit" | "coupon">;

interface ReadyMadeState {
  id: string;
  emoji: string;
  name: string;
  tagline: string;
  description: string;
  engine: "RECURRING" | "CART_RECOVERY";
  editable: Editable;
  suggestedCoupon?: string;
  active: boolean;
  status: string | null;
  campaignId: string | null;
  message: string;
  couponCode: string | null;
  weekdays: number[];
  timeWindow: { start: string; end: string };
  dailyLimit: number;
}

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const PREVIEW_CUSTOMER = { name: "Diego", tier: "OURO", lastOrderAt: new Date(Date.now() - 3 * 86_400_000).toISOString() };
const PREVIEW_CTX = { restaurantName: "seu restaurante", pedidoUrl: "https://foocci.com.br", googleReviewUrl: null, instagramUrl: null };

export function ReadyMadeCampaignsSection() {
  const [items, setItems]     = useState<ReadyMadeState[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId]   = useState<string | null>(null);
  const [openId, setOpenId]   = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res  = await fetch("/api/crm/ready-made");
      const json = await res.json();
      if (json?.data?.campaigns) setItems(json.data.campaigns as ReadyMadeState[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <h3 className="mb-1 text-xs font-bold uppercase tracking-widest text-muted">Campanhas prontas</h3>
      <p className="mb-3 text-xs text-muted">
        Já vêm configuradas para qualquer restaurante. É só ligar — e ajustar depois, se quiser.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {items.map((c) => (
          <ReadyMadeCard
            key={c.id}
            c={c}
            busy={busyId === c.id}
            open={openId === c.id}
            onToggle={() => void toggle(c)}
            onOpen={() => setOpenId(openId === c.id ? null : c.id)}
            onSave={(ov) => post(c.id, { action: "update", overrides: ov }).then(() => setOpenId(null))}
          />
        ))}
      </div>
    </div>
  );
}

// ── Card ────────────────────────────────────────────────────────────────────────

function ReadyMadeCard({
  c, busy, open, onToggle, onOpen, onSave,
}: {
  c: ReadyMadeState;
  busy: boolean;
  open: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onSave: (overrides: Record<string, unknown>) => void;
}) {
  const canEdit = c.editable.length > 0;

  return (
    <div className={`flex flex-col rounded-2xl border p-4 shadow-sm transition-shadow hover:shadow-md ${c.active ? "border-emerald-200 bg-emerald-50/40" : "border-line bg-paper"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <span className="text-xl leading-none">{c.emoji}</span>
          <div>
            <p className="text-sm font-bold leading-tight text-ink">{c.name}</p>
            <p className="mt-0.5 text-[11px] text-muted leading-snug">{c.tagline}</p>
          </div>
        </div>
        {/* On/off switch */}
        <button
          onClick={onToggle}
          disabled={busy}
          aria-label={c.active ? "Desligar" : "Ligar"}
          className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${c.active ? "bg-emerald-500" : "bg-gray-300"}`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${c.active ? "translate-x-6" : "translate-x-1"}`} />
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${c.active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
          {c.active ? "Ligada" : "Desligada"}
        </span>
        {c.active && canEdit && (
          <button onClick={onOpen} className="text-[11px] font-semibold text-brand-600 hover:text-brand-700">
            {open ? "Fechar" : "Editar"}
          </button>
        )}
        {c.engine === "CART_RECOVERY" && (
          <span className="text-[10px] text-muted">mensagem gerenciada pelo sistema</span>
        )}
      </div>

      {open && canEdit && <ReadyMadeEditor c={c} busy={busy} onSave={onSave} />}
    </div>
  );
}

// ── Inline editor ─────────────────────────────────────────────────────────────────

function ReadyMadeEditor({
  c, busy, onSave,
}: {
  c: ReadyMadeState;
  busy: boolean;
  onSave: (overrides: Record<string, unknown>) => void;
}) {
  const [message, setMessage]     = useState(c.message);
  const [coupon, setCoupon]       = useState(c.couponCode ?? "");
  const [weekdays, setWeekdays]   = useState<number[]>(c.weekdays);
  const [start, setStart]         = useState(c.timeWindow.start);
  const [end, setEnd]             = useState(c.timeWindow.end);
  const [dailyLimit, setDaily]    = useState(c.dailyLimit);

  const has = (k: Editable[number]) => c.editable.includes(k);
  const toggleDay = (d: number) => setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d].sort()));

  function save() {
    const ov: Record<string, unknown> = {};
    if (has("message"))    ov.message    = message;
    if (has("coupon"))     ov.couponCode = coupon.trim();
    if (has("dailyLimit")) ov.dailyLimit = dailyLimit;
    if (has("schedule"))   { ov.weekdays = weekdays; ov.timeWindow = { start, end }; }
    onSave(ov);
  }

  const preview = renderCrmMessage(message, PREVIEW_CUSTOMER, PREVIEW_CTX);

  return (
    <div className="mt-3 space-y-3 border-t border-line pt-3">
      {has("message") && (
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">Mensagem</label>
          <textarea
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full resize-none rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand-400 focus:outline-none"
          />
          <p className="mt-1 text-[10px] text-muted">
            Use <code className="rounded bg-gray-100 px-1">{"{nome}"}</code>, <code className="rounded bg-gray-100 px-1">{"{restaurante}"}</code>, <code className="rounded bg-gray-100 px-1">{"{link_cardapio}"}</code>.
          </p>
          <div className="mt-2 rounded-lg bg-emerald-50/60 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Prévia</p>
            <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-ink">{preview}</p>
          </div>
        </div>
      )}

      {has("coupon") && (
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">Cupom (opcional)</label>
          <input
            value={coupon}
            onChange={(e) => setCoupon(e.target.value.toUpperCase())}
            placeholder="Ex: VOLTEI10"
            className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand-400 focus:outline-none"
          />
        </div>
      )}

      {has("schedule") && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">Dias de envio</label>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((label, d) => (
                <button
                  key={d}
                  onClick={() => toggleDay(d)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${weekdays.includes(d) ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-500"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">Início</label>
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)}
              className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand-400 focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">Fim</label>
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)}
              className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand-400 focus:outline-none" />
          </div>
        </div>
      )}

      {has("dailyLimit") && (
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">Máximo por dia</label>
          <input
            type="number" min={1} max={200}
            value={dailyLimit}
            onChange={(e) => setDaily(Math.max(1, parseInt(e.target.value, 10) || 1))}
            className="w-32 rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand-400 focus:outline-none"
          />
          <span className="ml-2 text-[10px] text-muted">o limite global de segurança ainda vale</span>
        </div>
      )}

      <button
        onClick={save}
        disabled={busy}
        className="rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {busy ? "Salvando…" : "Salvar alterações"}
      </button>
    </div>
  );
}
