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
import { renderCrmMessage } from "@/services/crm/renderCrmMessage";
import { CADENCE_EXPLAINER } from "@/services/crm/readyMadeCampaigns";

type Editable = Array<"message" | "schedule" | "dailyLimit" | "coupon">;

interface Timing { summary: string; fromSegmentation: boolean; }

interface ReadyMadeState {
  id: string;
  emoji: string;
  name: string;
  tagline: string;
  description: string;
  objective: string;
  engine: "RECURRING" | "CART_RECOVERY";
  editable: Editable;
  suggestedCoupon?: string;
  messageVariants: string[];
  timing: Timing;
  active: boolean;
  status: string | null;
  campaignId: string | null;
  message: string;
  couponCode: string | null;
  weekdays: number[];
  timeWindow: { start: string; end: string };
  dailyLimit: number;
}

interface CouponOption { code: string; name: string; label: string; }

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const PREVIEW_CUSTOMER = { name: "Diego", tier: "OURO", lastOrderAt: new Date(Date.now() - 3 * 86_400_000).toISOString() };
const PREVIEW_CTX = { restaurantName: "seu restaurante", pedidoUrl: "https://foocci.com.br", googleReviewUrl: null, instagramUrl: null };

export function ReadyMadeCampaignsSection() {
  const [items, setItems]     = useState<ReadyMadeState[]>([]);
  const [coupons, setCoupons] = useState<CouponOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId]   = useState<string | null>(null);
  const [openId, setOpenId]   = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [rmRes, cpRes] = await Promise.all([
        fetch("/api/crm/ready-made").then((r) => r.json()).catch(() => null),
        fetch("/api/crm/coupons").then((r) => r.json()).catch(() => null),
      ]);
      if (rmRes?.data?.campaigns) setItems(rmRes.data.campaigns as ReadyMadeState[]);
      if (cpRes?.data?.coupons)   setCoupons(cpRes.data.coupons as CouponOption[]);
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
  const openItem = items.find((c) => c.id === openId) ?? null;

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
        Já vêm configuradas para qualquer restaurante. É só ligar — e ajustar antes ou depois, se quiser.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {items.map((c) => (
          <ReadyMadeCard
            key={c.id}
            c={c}
            busy={busyId === c.id}
            onToggle={() => void toggle(c)}
            onConfigure={() => setOpenId(c.id)}
          />
        ))}
      </div>

      {openItem && (
        <ReadyMadeConfigModal
          c={openItem}
          coupons={coupons}
          busy={busyId === openItem.id}
          onClose={() => setOpenId(null)}
          onToggle={() => void toggle(openItem)}
          onSave={(ov) => post(openItem.id, { action: "update", overrides: ov })}
        />
      )}
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
    <div className={`flex flex-col rounded-2xl border p-4 shadow-sm transition-shadow hover:shadow-md ${c.active ? "border-emerald-200 bg-emerald-50/40" : "border-line bg-paper"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <span className="text-xl leading-none">{c.emoji}</span>
          <div>
            <p className="text-sm font-bold leading-tight text-ink">{c.name}</p>
            <p className="mt-0.5 text-[11px] text-muted leading-snug">{c.tagline}</p>
          </div>
        </div>
        <button
          onClick={onToggle}
          disabled={busy}
          aria-label={c.active ? "Desligar" : "Ligar"}
          className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${c.active ? "bg-emerald-500" : "bg-gray-300"}`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${c.active ? "translate-x-6" : "translate-x-1"}`} />
        </button>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-ink2">{c.description}</p>
      <p className="mt-1 text-[10px] text-muted"><span className="font-semibold">Objetivo:</span> {c.objective}</p>

      {/* When it fires */}
      {c.timing.summary && (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-[#F4F4F2] px-2.5 py-1.5 text-[10px] text-ink2">
          <span>🕒</span><span>{c.timing.summary}</span>
        </p>
      )}

      <div className="mt-2 flex items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${c.active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
          {c.active ? "Ligada" : "Desligada"}
        </span>
        <button onClick={onConfigure} className="text-[11px] font-semibold text-brand-600 hover:text-brand-700">
          Configurar
        </button>
      </div>
    </div>
  );
}

// ── Config modal ──────────────────────────────────────────────────────────────────

function ReadyMadeConfigModal({
  c, coupons, busy, onClose, onToggle, onSave,
}: {
  c: ReadyMadeState;
  coupons: CouponOption[];
  busy: boolean;
  onClose: () => void;
  onToggle: () => void;
  onSave: (overrides: Record<string, unknown>) => Promise<void>;
}) {
  const canEdit = c.editable.length > 0;
  const [message, setMessage]   = useState(c.message);
  const [coupon, setCoupon]     = useState(c.couponCode ?? "");
  const [weekdays, setWeekdays] = useState<number[]>(c.weekdays);
  const [start, setStart]       = useState(c.timeWindow.start);
  const [end, setEnd]           = useState(c.timeWindow.end);
  const [dailyLimit, setDaily]  = useState(c.dailyLimit);
  const [saved, setSaved]       = useState(false);

  const has = (k: Editable[number]) => c.editable.includes(k);
  const toggleDay = (d: number) => setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d].sort()));

  async function save() {
    const ov: Record<string, unknown> = {};
    if (has("message"))    ov.message    = message;
    if (has("coupon"))     ov.couponCode = coupon.trim();
    if (has("dailyLimit")) ov.dailyLimit = dailyLimit;
    if (has("schedule"))   { ov.weekdays = weekdays; ov.timeWindow = { start, end }; }
    await onSave(ov);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const preview = renderCrmMessage(message, PREVIEW_CUSTOMER, PREVIEW_CTX);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex items-start gap-2.5">
            <span className="text-2xl leading-none">{c.emoji}</span>
            <div>
              <p className="text-base font-bold text-ink">{c.name}</p>
              <p className="mt-0.5 text-xs text-muted">{c.tagline}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onToggle}
              disabled={busy}
              aria-label={c.active ? "Desligar" : "Ligar"}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${c.active ? "bg-emerald-500" : "bg-gray-300"}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${c.active ? "translate-x-6" : "translate-x-1"}`} />
            </button>
            <button onClick={onClose} aria-label="Fechar" className="text-gray-400 hover:text-gray-600">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <p className="text-xs leading-relaxed text-ink2">{c.description}</p>

          {/* Timing / cadence */}
          <div className="rounded-xl border border-line bg-[#FAFAF8] p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted">Quando é enviada</p>
            {c.timing.summary && <p className="mt-1 text-xs text-ink2">🕒 {c.timing.summary}</p>}
            {c.timing.fromSegmentation && (
              <p className="mt-1 text-[10px] text-muted">
                Os dias que definem esta fase ficam em <span className="font-semibold">Configurações → Segmentação</span>.
              </p>
            )}
            <p className="mt-2 text-[10px] leading-relaxed text-muted">{CADENCE_EXPLAINER}</p>
          </div>

          {c.engine === "CART_RECOVERY" && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
              A mensagem do carrinho é gerenciada pelo sistema. Aqui você só liga ou desliga a campanha.
            </p>
          )}

          {has("message") && (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">Escolha uma mensagem pronta</p>
              <div className="space-y-1.5">
                {c.messageVariants.map((v, i) => {
                  const selected = v === message;
                  return (
                    <button
                      key={i}
                      onClick={() => setMessage(v)}
                      className={`w-full rounded-lg border px-3 py-2 text-left text-[12px] leading-snug transition-colors ${selected ? "border-brand-400 bg-brand-50 text-ink" : "border-line bg-white text-ink2 hover:bg-[#FAFAF8]"}`}
                    >
                      {v}
                    </button>
                  );
                })}
              </div>

              <p className="mb-1 mt-3 text-[10px] font-semibold uppercase tracking-wide text-muted">Ou escreva a sua</p>
              <textarea
                rows={3}
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
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">Cupom (opcional)</p>
              {coupons.length === 0 ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                  Nenhum cupom ativo. Crie cupons na aba <span className="font-semibold">Promoções</span> para escolher aqui.
                </p>
              ) : (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  <button
                    onClick={() => setCoupon("")}
                    className={`shrink-0 rounded-xl border px-3 py-2 text-[11px] font-semibold transition-colors ${coupon === "" ? "border-brand-400 bg-brand-50 text-ink" : "border-line bg-white text-ink2 hover:bg-[#FAFAF8]"}`}
                  >
                    Sem cupom
                  </button>
                  {coupons.map((cp) => {
                    const selected = coupon.toUpperCase() === cp.code;
                    return (
                      <button
                        key={cp.code}
                        onClick={() => setCoupon(cp.code)}
                        className={`shrink-0 rounded-xl border px-3 py-2 text-left transition-colors ${selected ? "border-brand-400 bg-brand-50" : "border-line bg-white hover:bg-[#FAFAF8]"}`}
                      >
                        <span className="block text-[11px] font-bold text-ink">{cp.code}</span>
                        <span className="block text-[10px] text-muted">{cp.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {has("schedule") && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Dias de envio</p>
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
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Horário — início</p>
                <input type="time" value={start} onChange={(e) => setStart(e.target.value)}
                  className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand-400 focus:outline-none" />
              </div>
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Horário — fim</p>
                <input type="time" value={end} onChange={(e) => setEnd(e.target.value)}
                  className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand-400 focus:outline-none" />
              </div>
            </div>
          )}

          {has("dailyLimit") && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Máximo por dia</p>
              <input
                type="number" min={1} max={200}
                value={dailyLimit}
                onChange={(e) => setDaily(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-32 rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand-400 focus:outline-none"
              />
              <span className="ml-2 text-[10px] text-muted">o limite global de segurança ainda vale</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
          <span className="text-[11px] text-muted">
            {c.active ? "Campanha ligada." : "Campanha desligada — pode configurar mesmo assim."}
            {saved && <span className="ml-1 font-semibold text-emerald-600">✓ Salvo</span>}
          </span>
          {canEdit ? (
            <button
              onClick={() => void save()}
              disabled={busy}
              className="rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {busy ? "Salvando…" : "Salvar"}
            </button>
          ) : (
            <button onClick={onClose} className="rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700">
              Fechar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
