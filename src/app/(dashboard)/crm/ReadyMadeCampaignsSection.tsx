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
import {
  CADENCE_EXPLAINER,
  COUPON_PERCENT_OPTIONS,
  COUPON_FIXED_OPTIONS,
  couponLabel,
  type CouponType,
  type ReadyMadeCoupon,
} from "@/services/crm/readyMadeCampaigns";

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

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const PREVIEW_CUSTOMER = { name: "Diego", tier: "OURO", lastOrderAt: new Date(Date.now() - 3 * 86_400_000).toISOString() };
const PREVIEW_CTX = { restaurantName: "seu restaurante", pedidoUrl: "https://foocci.com.br", googleReviewUrl: null, instagramUrl: null };

export function ReadyMadeCampaignsSection({ onManage, reloadSignal }: {
  /** Open the full "Gerenciar" modal for a recurring campaign (unified interface). */
  onManage?: (campaignId: string) => void;
  /** Bump to force a reload (e.g. after the manage modal changed a campaign). */
  reloadSignal?: number;
} = {}) {
  const [items, setItems]     = useState<ReadyMadeState[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId]   = useState<string | null>(null);
  const [openId, setOpenId]   = useState<string | null>(null);

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

  // "Configurar" opens the ONE unified "Gerenciar" modal for recurring campaigns.
  // If no campaign row exists yet, create a PAUSED one to hold the config, then open it.
  async function configure(c: ReadyMadeState) {
    if (onManage && (c.engine === "RECURRING" || c.engine === "CART_RECOVERY")) {
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
      if (campaignId) { onManage(campaignId); return; }
    }
    setOpenId(c.id); // fallback: simple config (cart recovery has no campaign row)
  }

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

      {openItem && (
        <ReadyMadeConfigModal
          c={openItem}
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

// ── Config modal ──────────────────────────────────────────────────────────────────

export function ReadyMadeConfigModal({
  c, busy, onClose, onToggle, onSave,
}: {
  c: ReadyMadeState;
  busy: boolean;
  onClose: () => void;
  onToggle: () => void;
  onSave: (overrides: Record<string, unknown>) => Promise<void>;
}) {
  const canEdit = c.editable.length > 0;
  const [message, setMessage]   = useState(c.message);
  const [coupon, setCoupon]     = useState<ReadyMadeCoupon | null>(c.coupon);
  const [weekdays, setWeekdays] = useState<number[]>(c.weekdays);
  const [start, setStart]       = useState(c.timeWindow.start);
  const [end, setEnd]           = useState(c.timeWindow.end);
  const [dailyLimit, setDaily]  = useState(c.dailyLimit);
  const [triggerDays, setTriggerDays] = useState(c.triggerDays ?? 2);
  const [editDays, setEditDays] = useState(false);
  const [saved, setSaved]       = useState(false);

  const has = (k: Editable[number]) => c.editable.includes(k);
  const toggleDay = (d: number) => setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d].sort()));

  async function save() {
    const ov: Record<string, unknown> = {};
    if (has("message"))     ov.message     = message;
    if (has("coupon"))      ov.coupon      = coupon;
    if (has("dailyLimit"))  ov.dailyLimit  = dailyLimit;
    if (has("triggerDays")) ov.triggerDays = triggerDays;
    if (has("schedule"))    { ov.weekdays = weekdays; ov.timeWindow = { start, end }; }
    await onSave(ov);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  // Coupon flows into the preview so {cupom} shows the real value live as it's picked.
  const preview = renderCrmMessage(message, PREVIEW_CUSTOMER, { ...PREVIEW_CTX, coupon });

  // Modern config modal — same chrome as the "Gerenciar campanha" modal used by every
  // other campaign (backdrop + blur, rounded-3xl card, sticky header with eyebrow +
  // status pill + Pausar/Ativar, sticky footer with Salvar).
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal card */}
      <div className="relative min-h-full flex items-start justify-center p-0 sm:p-4 sm:py-6">
        <div className="relative w-full bg-paper shadow-2xl sm:rounded-3xl sm:max-w-2xl overflow-hidden">

          {/* ── Sticky header ── */}
          <div className="sticky top-0 z-10 border-b border-line bg-paper">
            <div className="flex items-center justify-between px-5 py-4 sm:px-8">
              <div className="flex min-w-0 items-start gap-3 pr-4">
                <span className="text-2xl leading-none">{c.emoji}</span>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted">Configurar campanha</p>
                  <h2 className="mt-0.5 text-base font-bold text-ink truncate">{c.name}</h2>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`hidden sm:inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold ${c.active ? "bg-emerald-100 text-emerald-700" : "bg-[#F4F4F2] text-muted"}`}>
                  {c.active ? "Ligada" : "Desligada"}
                </span>
                {c.active ? (
                  <button
                    onClick={onToggle}
                    disabled={busy}
                    className="rounded-xl bg-yellow-50 px-3 py-1.5 text-xs font-semibold text-yellow-700 hover:bg-yellow-100 transition-colors disabled:opacity-50"
                  >Pausar</button>
                ) : (
                  <button
                    onClick={onToggle}
                    disabled={busy}
                    className="rounded-xl bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-100 transition-colors disabled:opacity-50"
                  >Ativar</button>
                )}
                <button onClick={onClose} aria-label="Fechar" className="rounded-xl p-2 text-muted hover:bg-[#F4F4F2] transition-colors">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
          </div>

          {/* ── Body ── */}
          <div className="space-y-5 px-5 py-6 sm:px-8 sm:py-8">
            <p className="text-sm leading-relaxed text-ink2">{c.description}</p>

            {/* Timing / cadence */}
            <div className="rounded-xl border border-line bg-[#FAFAF8] p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-muted">Quando é enviada</p>
              {c.timing.summary && <p className="mt-1.5 text-base text-ink2">🕒 {c.timing.summary}</p>}
              {c.timing.fromSegmentation && (
                <p className="mt-1.5 text-xs text-muted">
                  Os dias que definem esta fase ficam em <span className="font-semibold">Configurações → Segmentação</span>.
                </p>
              )}
              <p className="mt-2.5 text-xs leading-relaxed text-muted">{CADENCE_EXPLAINER}</p>
            </div>

            {has("triggerDays") && (
            <div className="rounded-xl border border-line p-4">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={editDays}
                  onChange={(e) => setEditDays(e.target.checked)}
                  className="h-4 w-4 rounded border-line text-brand-600 focus:ring-brand-400"
                />
                <span className="text-sm text-ink">
                  Enviar <span className="font-bold">{triggerDays} dias</span> após o evento
                  <span className="ml-1 text-xs text-muted">— marque para alterar</span>
                </span>
              </label>
              {editDays && (
                <div className="mt-3">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                    {c.triggerDaysLabel ?? "Enviar quantos dias após o evento"}
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number" min={0} max={90}
                      value={triggerDays}
                      onChange={(e) => setTriggerDays(Math.max(0, parseInt(e.target.value, 10) || 0))}
                      className="w-24 rounded-xl border border-line bg-white px-3 py-2 text-base text-ink focus:border-brand-400 focus:outline-none"
                    />
                    <span className="text-sm text-muted">dias</span>
                  </div>
                  <p className="mt-1.5 text-xs text-muted">
                    Dica: evite mandar cedo demais. Uma boa cadência é ~1 mensagem por semana por cliente.
                  </p>
                </div>
              )}
            </div>
          )}

          {c.engine === "CART_RECOVERY" && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
              Dispara automaticamente poucos minutos após o cliente abandonar o pedido. Você pode
              personalizar a mensagem e oferecer uma recompensa abaixo. Em <code className="rounded bg-white/70 px-1">{"{link_cardapio}"}</code> o
              cliente volta direto pro carrinho que ele montou.
            </p>
          )}

          {has("message") && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Escolha uma mensagem pronta</p>
              <div className="space-y-2">
                {c.messageVariants.map((v, i) => {
                  const selected = v === message;
                  return (
                    <button
                      key={i}
                      onClick={() => setMessage(v)}
                      className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm leading-relaxed transition-colors ${selected ? "border-brand-400 bg-brand-50 text-ink" : "border-line bg-white text-ink2 hover:bg-[#FAFAF8]"}`}
                    >
                      {v}
                    </button>
                  );
                })}
              </div>

              <p className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-muted">Ou escreva a sua</p>
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
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Cupom de desconto (opcional)</p>

              {/* Tipo do benefício */}
              <div className="flex flex-wrap gap-2">
                {([
                  { key: null,          label: "Sem cupom" },
                  { key: "PERCENTAGE",  label: "Porcentagem" },
                  { key: "FIXED",       label: "Valor em R$" },
                  { key: "CUSTOM",      label: "Recompensa" },
                ] as { key: CouponType | null; label: string }[]).map((opt) => {
                  const active = (coupon?.type ?? null) === opt.key;
                  return (
                    <button
                      key={opt.label}
                      onClick={() => setCoupon(
                        opt.key === null
                          ? null
                          : opt.key === "CUSTOM"
                          ? { type: "CUSTOM", value: coupon?.type === "CUSTOM" ? coupon.value : 0, description: coupon?.description ?? "", validityDays: coupon?.validityDays }
                          : { type: opt.key, value: (opt.key === "PERCENTAGE" ? COUPON_PERCENT_OPTIONS : COUPON_FIXED_OPTIONS)[1], validityDays: coupon?.validityDays }
                      )}
                      className={`rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${active ? "border-brand-400 bg-brand-50 text-ink" : "border-line bg-white text-ink2 hover:bg-[#FAFAF8]"}`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {/* Valores fixos (porcentagem / R$) */}
              {coupon && coupon.type !== "CUSTOM" && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {(coupon.type === "PERCENTAGE" ? COUPON_PERCENT_OPTIONS : COUPON_FIXED_OPTIONS).map((v) => {
                    const active = coupon.value === v;
                    return (
                      <button
                        key={v}
                        onClick={() => setCoupon({ type: coupon.type, value: v, validityDays: coupon.validityDays })}
                        className={`rounded-xl border px-3.5 py-2 text-sm font-bold transition-colors ${active ? "border-brand-400 bg-brand-50 text-ink" : "border-line bg-white text-ink2 hover:bg-[#FAFAF8]"}`}
                      >
                        {coupon.type === "PERCENTAGE" ? `${v}%` : `R$ ${v}`}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Recompensa personalizada (brinde) */}
              {coupon && coupon.type === "CUSTOM" && (
                <div className="mt-2 space-y-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">O que o cliente ganha</label>
                    <input
                      type="text" maxLength={80}
                      placeholder="ex.: sobremesa grátis"
                      value={coupon.description ?? ""}
                      onChange={(e) => setCoupon({ ...coupon, description: e.target.value })}
                      className="w-full rounded-xl border border-line bg-white px-3 py-2 text-base text-ink focus:border-brand-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Custo estimado (R$)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number" min={0} max={100000}
                        value={coupon.value}
                        onChange={(e) => setCoupon({ ...coupon, value: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                        className="w-28 rounded-xl border border-line bg-white px-3 py-2 text-base text-ink focus:border-brand-400 focus:outline-none"
                      />
                      <span className="text-xs text-muted">usado só para o orçamento de cupons (0 = não conta)</span>
                    </div>
                  </div>
                </div>
              )}

              {coupon && (
                <div className="mt-2">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Válido por</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number" min={1} max={365}
                      value={coupon.validityDays ?? 30}
                      onChange={(e) => setCoupon({ ...coupon, validityDays: Math.max(1, parseInt(e.target.value, 10) || 30) })}
                      className="w-24 rounded-xl border border-line bg-white px-3 py-2 text-base text-ink focus:border-brand-400 focus:outline-none"
                    />
                    <span className="text-sm text-muted">dias após ganhar</span>
                  </div>
                  <p className="mt-2 rounded-lg bg-emerald-50/60 px-3 py-2 text-xs text-emerald-800">
                    O cliente ganha <span className="font-bold">{couponLabel(coupon)}</span> na carteira ao receber a mensagem,
                    válido por <span className="font-bold">{coupon.validityDays ?? 30} dias</span>
                    {coupon.type === "CUSTOM"
                      ? " — resgatado no pedido, entregue pelo restaurante (sem desconto automático)."
                      : " — usável só em compras online."}
                    {" "}Use <code className="rounded bg-white/70 px-1">{"{cupom}"}</code> na mensagem para mostrar o benefício automaticamente.
                  </p>
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

          {/* ── Sticky footer ── */}
          <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-line bg-paper px-5 py-3 sm:px-8">
            <span className="text-[11px] text-muted">
              {c.active ? "Campanha ligada." : "Campanha desligada — pode configurar mesmo assim."}
              {saved && <span className="ml-1 font-semibold text-emerald-600">✓ Salvo</span>}
            </span>
            {canEdit ? (
              <button
                onClick={() => void save()}
                disabled={busy}
                className="rounded-xl bg-brand-600 px-5 py-2 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {busy ? "Salvando…" : "Salvar"}
              </button>
            ) : (
              <button onClick={onClose} className="rounded-xl bg-brand-600 px-5 py-2 text-xs font-bold text-white hover:bg-brand-700">
                Fechar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
