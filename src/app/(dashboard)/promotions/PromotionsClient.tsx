"use client";

import { useState, useCallback, useEffect, useMemo, type FormEvent } from "react";
import type { PromotionRow, PromotionMetricsSummary, PromotionMetricsDetail } from "@/services/promotions/PromotionService";
import type {
  PromotionType,
  PromotionChannel,
  PromotionTarget,
} from "@/validators/promotions";
import type { AutomationRow } from "@/services/crm/CRMService";
import { pickAutomationPlaceholder } from "@/lib/crm-messages";

// ── Label maps ─────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  PERCENTAGE:    "% Desconto",
  FIXED:         "R$ Desconto",
  COMBO:         "Combo",
  FREE_DELIVERY: "Frete grátis",
  COUPON:        "Cupom",
};

const CHANNEL_LABELS: Record<string, string> = {
  QR_MENU:  "Cardápio QR",
  DELIVERY: "Delivery",
  WHATSAPP: "WhatsApp / IA",
  ALL:      "Todos",
};

const TARGET_LABELS: Record<string, string> = {
  PRODUCT:  "Produto",
  CATEGORY: "Categoria",
  ORDER:    "Pedido",
};

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; text: string }
> = {
  DRAFT:     { label: "Rascunho",  bg: "bg-[#F4F4F2]",   text: "text-ink2"  },
  ACTIVE:    { label: "Ativa",     bg: "bg-green-100",  text: "text-green-700" },
  PAUSED:    { label: "Pausada",   bg: "bg-amber-100", text: "text-amber-700"},
  SCHEDULED: { label: "Agendada", bg: "bg-blue-100",   text: "text-blue-700"  },
  EXPIRED:   { label: "Encerrada", bg: "bg-red-50",     text: "text-red-600"   },
};

// ── Blank form ─────────────────────────────────────────────────────────────────

function blankForm(): PromotionForm {
  return {
    name:              "",
    description:       "",
    type:              "PERCENTAGE",
    discountValue:     "",
    target:            "ORDER",
    targetProductIds:  [],
    targetCategoryIds: [],
    channel:           "ALL",
    couponCode:        "",
    bannerImageUrl:    "",
    startsAt:          "",
    endsAt:            "",
    daysOfWeek:        [],
    timeFrom:          "",
    timeTo:            "",
    minOrderValue:     "",
    minQuantity:       "",
    maxUses:           "",
    oneTimePerUser:    false,
    combinable:        false,
  };
}

interface PromotionForm {
  name: string;
  description: string;
  type: PromotionType;
  discountValue: string;
  target: PromotionTarget;
  targetProductIds: string[];
  targetCategoryIds: string[];
  channel: PromotionChannel;
  couponCode: string;
  bannerImageUrl: string;
  startsAt: string;
  endsAt: string;
  daysOfWeek: number[];
  timeFrom: string;
  timeTo: string;
  minOrderValue: string;
  minQuantity: string;
  maxUses: string;
  oneTimePerUser: boolean;
  combinable: boolean;
}

function rowToForm(p: PromotionRow): PromotionForm {
  return {
    name:              p.name,
    description:       p.description ?? "",
    type:              p.type as PromotionType,
    discountValue:     String(p.discountValue),
    target:            p.target as PromotionTarget,
    targetProductIds:  p.targetProductIds,
    targetCategoryIds: p.targetCategoryIds,
    channel:           p.channel as PromotionChannel,
    couponCode:        p.couponCode ?? "",
    bannerImageUrl:    p.bannerImageUrl ?? "",
    startsAt:          p.startsAt ? p.startsAt.slice(0, 16) : "",
    endsAt:            p.endsAt ? p.endsAt.slice(0, 16) : "",
    daysOfWeek:        p.daysOfWeek,
    timeFrom:          p.timeFrom ?? "",
    timeTo:            p.timeTo ?? "",
    minOrderValue:     p.minOrderValue != null ? String(p.minOrderValue) : "",
    minQuantity:       p.minQuantity != null ? String(p.minQuantity) : "",
    maxUses:           p.maxUses != null ? String(p.maxUses) : "",
    oneTimePerUser:    p.oneTimePerUser,
    combinable:        p.combinable,
  };
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG["DRAFT"]!;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-bold uppercase tracking-widest text-muted mb-3">
      {children}
    </p>
  );
}

function FormGroup({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-ink2">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-line2 bg-[#FAFAF8] px-3 py-2 text-sm text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 placeholder:text-muted";

// ── Automations ────────────────────────────────────────────────────────────────

const TRIGGER_META: Record<string, { label: string; icon: string; description: string }> = {
  REACTIVATION: { label: "Reativação",  icon: "🔄", description: "Enviado para clientes que não pedem há X dias." },
  BIRTHDAY:     { label: "Aniversário", icon: "🎂", description: "Enviado automaticamente no aniversário do cliente." },
  POST_ORDER:   { label: "Pós-pedido",  icon: "⭐", description: "Enviado X dias após a conclusão de um pedido." },
};

interface AutomationStatRow {
  trigger: string;
  lastRunAt: string | null;
  lastSent: number;
  lastFailed: number;
  campaignId: string | null;
}

function AutomationsSection({ initialAutomations }: { initialAutomations: AutomationRow[] }) {
  const placeholders = useMemo(() => ({
    REACTIVATION: pickAutomationPlaceholder("REACTIVATION"),
    BIRTHDAY:     pickAutomationPlaceholder("BIRTHDAY"),
    POST_ORDER:   pickAutomationPlaceholder("POST_ORDER"),
  }), []);

  const defaults: Record<string, AutomationRow> = {
    REACTIVATION: { id: "", trigger: "REACTIVATION", isEnabled: false, messageTemplate: "", triggerAfterDays: 30, discountType: null, discountValue: null, scheduleConfig: null },
    BIRTHDAY:     { id: "", trigger: "BIRTHDAY",     isEnabled: false, messageTemplate: "", triggerAfterDays: 0,  discountType: null, discountValue: null, scheduleConfig: null },
    POST_ORDER:   { id: "", trigger: "POST_ORDER",   isEnabled: false, messageTemplate: "", triggerAfterDays: 1,  discountType: null, discountValue: null, scheduleConfig: null },
  };
  initialAutomations.forEach((a) => { defaults[a.trigger] = a; });

  const [automations, setAutomations] = useState<Record<string, AutomationRow>>(defaults);
  const [expanded, setExpanded]       = useState<string | null>(null);
  const [saving, setSaving]           = useState<string | null>(null);
  const [saved, setSaved]             = useState<string | null>(null);
  const [stats, setStats]             = useState<Record<string, AutomationStatRow>>({});
  const [testing, setTesting]         = useState<string | null>(null);
  const [testResult, setTestResult]   = useState<Record<string, { sent: number; targeted: number } | null>>({});

  useEffect(() => {
    fetch("/api/crm/automations/stats")
      .then((r) => r.json())
      .then((json: { data?: AutomationStatRow[] }) => {
        const map: Record<string, AutomationStatRow> = {};
        (json.data ?? []).forEach((s) => { map[s.trigger] = s; });
        setStats(map);
      })
      .catch(() => {});
  }, []);

  function handleUpdate(trigger: string, patch: Partial<AutomationRow>) {
    setAutomations((prev) => ({ ...prev, [trigger]: { ...prev[trigger]!, ...patch } }));
  }

  async function saveAutomation(trigger: string) {
    const a = automations[trigger]!;
    setSaving(trigger);
    const res = await fetch(`/api/crm/automations/${trigger}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isEnabled:        a.isEnabled,
        messageTemplate:  a.messageTemplate,
        triggerAfterDays: a.triggerAfterDays,
        discountType:     a.discountType,
        discountValue:    a.discountValue,
      }),
    });
    if (res.ok) {
      const json = await res.json();
      setAutomations((prev) => ({ ...prev, [trigger]: json.data }));
      setSaved(trigger);
      setTimeout(() => setSaved(null), 2000);
    }
    setSaving(null);
  }

  async function testAutomation(trigger: string) {
    setTesting(trigger);
    setTestResult((prev) => ({ ...prev, [trigger]: null }));
    try {
      const res = await fetch("/api/crm/automations/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trigger, dryRun: false }),
      });
      const json = await res.json();
      const r = json.data?.result;
      if (r) {
        setTestResult((prev) => ({ ...prev, [trigger]: { sent: r.messagesSent ?? 0, targeted: r.customersTargeted ?? 0 } }));
        // Refresh stats after a successful run
        fetch("/api/crm/automations/stats")
          .then((x) => x.json())
          .then((x: { data?: AutomationStatRow[] }) => {
            const map: Record<string, AutomationStatRow> = {};
            (x.data ?? []).forEach((s) => { map[s.trigger] = s; });
            setStats(map);
          })
          .catch(() => {});
      }
    } catch {
      // silently ignore
    }
    setTesting(null);
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Mensagens enviadas automaticamente via WhatsApp para aumentar o retorno dos seus clientes.
        <span className="ml-1 text-brand-600 font-medium">Requer integração WhatsApp ativa.</span>
      </p>

      {(["REACTIVATION", "BIRTHDAY", "POST_ORDER"] as const).map((trigger) => {
        const a    = automations[trigger]!;
        const meta = TRIGGER_META[trigger]!;
        const isOpen = expanded === trigger;
        const stat = stats[trigger];
        const tr = testResult[trigger];

        return (
          <div key={trigger} className={`rounded-2xl border bg-paper shadow-sm overflow-hidden transition-all ${
            a.isEnabled ? "border-green-200" : "border-line"
          }`}>
            <div className="flex items-center gap-4 px-4 py-4">
              <span className="text-2xl">{meta.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-ink">{meta.label}</p>
                <p className="text-xs text-muted">{meta.description}</p>
                {stat?.lastRunAt && (
                  <p className="mt-0.5 text-[10px] text-muted">
                    Último envio:{" "}
                    {new Date(stat.lastRunAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                    {" · "}{stat.lastSent} enviadas
                    {stat.lastFailed > 0 && `, ${stat.lastFailed} falhas`}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => handleUpdate(trigger, { isEnabled: !a.isEnabled })}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${a.isEnabled ? "bg-green-500" : "bg-line2"}`}
                aria-label={a.isEnabled ? "Desativar" : "Ativar"}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-paper shadow transition-transform ${a.isEnabled ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>

              <button
                onClick={() => setExpanded(isOpen ? null : trigger)}
                className="text-xs font-medium text-muted hover:text-ink2 transition-colors"
              >
                {isOpen ? "▲" : "▼"}
              </button>
            </div>

            {isOpen && (
              <div className="border-t border-line bg-[#FAFAF8] p-4 space-y-4">
                {trigger !== "BIRTHDAY" && (
                  <div>
                    <label className="block text-xs font-semibold text-ink2 mb-1">
                      {trigger === "REACTIVATION" ? "Disparar após quantos dias sem pedido" : "Disparar quantos dias após o pedido"}
                    </label>
                    <input
                      type="number" min={0} max={365}
                      value={a.triggerAfterDays}
                      onChange={(e) => handleUpdate(trigger, { triggerAfterDays: parseInt(e.target.value) || 0 })}
                      className="w-32 rounded-lg border border-line2 bg-paper px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                    />
                    <span className="ml-2 text-xs text-muted">dias</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-ink2 mb-1">Mensagem</label>
                  <textarea
                    rows={4}
                    value={a.messageTemplate || placeholders[trigger as keyof typeof placeholders] || ""}
                    onChange={(e) => handleUpdate(trigger, { messageTemplate: e.target.value })}
                    className="w-full rounded-xl border border-line2 bg-paper px-3 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 resize-none"
                    placeholder={placeholders[trigger as keyof typeof placeholders]}
                  />
                  <p className="mt-1 text-[10px] text-muted">
                    Use <code className="bg-[#F4F4F2] px-1 rounded">{"{nome}"}</code> para o nome do cliente.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink2 mb-2">Desconto opcional</label>
                  <div className="flex flex-wrap gap-3 items-center">
                    <select
                      value={a.discountType ?? ""}
                      onChange={(e) => handleUpdate(trigger, { discountType: e.target.value || null, discountValue: null })}
                      className="rounded-lg border border-line2 bg-paper px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
                    >
                      <option value="">Sem desconto</option>
                      <option value="PERCENTAGE">% Desconto</option>
                      <option value="FIXED">R$ Desconto</option>
                    </select>
                    {a.discountType && (
                      <input
                        type="number" min={0}
                        step={a.discountType === "PERCENTAGE" ? 1 : 0.01}
                        max={a.discountType === "PERCENTAGE" ? 100 : undefined}
                        value={a.discountValue ?? ""}
                        onChange={(e) => handleUpdate(trigger, { discountValue: parseFloat(e.target.value) || null })}
                        className="w-28 rounded-lg border border-line2 bg-paper px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
                        placeholder={a.discountType === "PERCENTAGE" ? "10" : "5.00"}
                      />
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => saveAutomation(trigger)}
                    disabled={saving === trigger}
                    className="rounded-xl bg-brand-600 px-5 py-2 text-sm font-bold text-white hover:bg-brand-700 transition-colors disabled:opacity-60 shadow-sm"
                  >
                    {saving === trigger ? "Salvando…" : saved === trigger ? "✓ Salvo!" : "Salvar configuração"}
                  </button>

                  <button
                    type="button"
                    onClick={() => testAutomation(trigger)}
                    disabled={testing === trigger || !a.isEnabled}
                    title={!a.isEnabled ? "Ative a automação para testar" : undefined}
                    className="rounded-xl border border-line2 bg-paper px-4 py-2 text-sm font-semibold text-ink2 hover:bg-[#FAFAF8] transition-colors disabled:opacity-50 shadow-sm"
                  >
                    {testing === trigger ? "Executando…" : "▶ Executar agora"}
                  </button>
                </div>

                {tr !== undefined && tr !== null && (
                  <p className={`text-xs font-medium rounded-lg px-3 py-2 ${
                    tr.sent > 0 ? "bg-green-50 text-green-700" : "bg-[#F4F4F2] text-ink2"
                  }`}>
                    {tr.sent > 0
                      ? `✓ ${tr.sent} mensage${tr.sent === 1 ? "m enviada" : "ns enviadas"} de ${tr.targeted} cliente${tr.targeted === 1 ? "" : "s"} elegíveis`
                      : tr.targeted === 0
                        ? "Nenhum cliente elegível no momento"
                        : `${tr.targeted} cliente${tr.targeted === 1 ? "" : "s"} elegíveis — nenhuma mensagem enviada (verifique a integração WhatsApp)`}
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Promotion Form Drawer (full content-area panel) ───────────────────────────

function PromotionDrawer({
  editing,
  onClose,
  onSaved,
  automations,
}: {
  editing: PromotionRow | null;
  onClose: () => void;
  onSaved: (p: PromotionRow) => void;
  automations: AutomationRow[];
}) {
  const [drawerTab, setDrawerTab] = useState<"promotion" | "automations">("promotion");
  const [form, setForm] = useState<PromotionForm>(
    editing ? rowToForm(editing) : blankForm()
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showBannerSection, setShowBannerSection] = useState(
    !!(editing?.bannerImageUrl)
  );

  function set<K extends keyof PromotionForm>(key: K, value: PromotionForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleBannerUpload(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/menu/upload", { method: "POST", body: fd });
    setUploading(false);
    if (!res.ok) {
      setError("Falha ao enviar imagem. Tente novamente.");
      return;
    }
    const json = await res.json();
    set("bannerImageUrl", json.url ?? "");
  }

  function toggleDay(d: number) {
    setForm((prev) => ({
      ...prev,
      daysOfWeek: prev.daysOfWeek.includes(d)
        ? prev.daysOfWeek.filter((x) => x !== d)
        : [...prev.daysOfWeek, d],
    }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const body = {
      name:              form.name.trim(),
      description:       form.description.trim() || undefined,
      type:              form.type,
      discountValue:     parseFloat(form.discountValue) || 0,
      target:            form.target,
      targetProductIds:  form.targetProductIds,
      targetCategoryIds: form.targetCategoryIds,
      channel:           form.channel,
      couponCode:        form.couponCode.trim() || undefined,
      bannerImageUrl:    form.bannerImageUrl.trim() || undefined,
      startsAt:          form.startsAt ? new Date(form.startsAt).toISOString() : undefined,
      endsAt:            form.endsAt ? new Date(form.endsAt).toISOString() : undefined,
      daysOfWeek:        form.daysOfWeek,
      timeFrom:          form.timeFrom || undefined,
      timeTo:            form.timeTo || undefined,
      minOrderValue:     form.minOrderValue ? parseFloat(form.minOrderValue) : undefined,
      minQuantity:       form.minQuantity ? parseInt(form.minQuantity) : undefined,
      maxUses:           form.maxUses ? parseInt(form.maxUses) : undefined,
      oneTimePerUser:    form.oneTimePerUser,
      combinable:        form.combinable,
    };

    const url = editing ? `/api/promotions/${editing.id}` : "/api/promotions";
    const method = editing ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();

    if (!res.ok) {
      setError(json.error ?? "Erro ao salvar promoção");
      setSaving(false);
      return;
    }

    onSaved(json.data);
  }

  const showDiscount = form.type !== "FREE_DELIVERY" && form.type !== "COMBO";
  const discountLabel = form.type === "PERCENTAGE" ? "Desconto (%)" : "Desconto (R$)";

  return (
    <>
      {/* Backdrop — only over the content area (right of sidebar) */}
      <div
        className="fixed inset-y-0 left-0 lg:left-56 right-0 z-40 bg-black/20 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Full content-area panel */}
      <div className="fixed inset-y-0 left-0 lg:left-56 right-0 z-50 flex flex-col bg-paper shadow-2xl">

        {/* Header: tabs + close */}
        <div className="flex items-center gap-4 border-b border-line px-6 py-3">
          <div className="flex gap-1 rounded-xl bg-[#F4F4F2] p-1">
            <button
              type="button"
              onClick={() => setDrawerTab("promotion")}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                drawerTab === "promotion"
                  ? "bg-paper text-ink shadow-sm"
                  : "text-muted hover:text-ink2"
              }`}
            >
              {editing ? "Editar promoção" : "Nova promoção"}
            </button>
            <button
              type="button"
              onClick={() => setDrawerTab("automations")}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                drawerTab === "automations"
                  ? "bg-paper text-ink shadow-sm"
                  : "text-muted hover:text-ink2"
              }`}
            >
              🤖 Automações WhatsApp
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-[#F4F4F2] hover:text-ink2"
          >
            ✕
          </button>
        </div>

        {/* Automations tab body */}
        {drawerTab === "automations" && (
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="mx-auto max-w-3xl">
              <AutomationsSection initialAutomations={automations} />
            </div>
          </div>
        )}

        {/* Promotion form tab body */}
        {drawerTab === "promotion" && (
        <form id="promotion-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-7">
          <div className="mx-auto max-w-3xl space-y-7">

          {/* ── 1. Informações básicas ── */}
          <div>
            <SectionTitle>Informações básicas</SectionTitle>
            <div className="space-y-4">
              <FormGroup label="Nome da promoção *">
                <input
                  required
                  className={inputCls}
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Ex: Happy Hour de Quinta"
                  maxLength={120}
                />
              </FormGroup>
              <FormGroup label="Descrição interna">
                <textarea
                  className={inputCls}
                  rows={2}
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="Visível apenas para você"
                  maxLength={500}
                />
              </FormGroup>
            </div>
          </div>

          {/* ── 2. Tipo de promoção ── */}
          <div>
            <SectionTitle>Tipo de promoção</SectionTitle>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(["PERCENTAGE", "FIXED", "COMBO", "FREE_DELIVERY", "COUPON"] as PromotionType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => set("type", t)}
                  className={`rounded-xl border-2 px-3 py-2.5 text-sm font-medium transition-all text-left ${
                    form.type === t
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-line2 bg-paper text-ink2 hover:border-line2"
                  }`}
                >
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>

            {showDiscount && (
              <div className="mt-4">
                <FormGroup label={discountLabel}>
                  <input
                    type="number"
                    min={0}
                    max={form.type === "PERCENTAGE" ? 100 : undefined}
                    step="0.01"
                    className={inputCls}
                    value={form.discountValue}
                    onChange={(e) => set("discountValue", e.target.value)}
                    placeholder={form.type === "PERCENTAGE" ? "10" : "5.00"}
                  />
                </FormGroup>
              </div>
            )}

            {form.type === "COUPON" && (
              <div className="mt-4">
                <FormGroup
                  label="Código do cupom *"
                  hint="Os clientes digitam este código para ativar o desconto"
                >
                  <input
                    required={form.type === "COUPON"}
                    className={`${inputCls} uppercase`}
                    value={form.couponCode}
                    onChange={(e) => set("couponCode", e.target.value.toUpperCase())}
                    placeholder="PROMO10"
                    maxLength={50}
                  />
                </FormGroup>
              </div>
            )}

          </div>

          {/* ── Banner opcional ── */}
          <div>
            <SectionTitle>Banner promocional</SectionTitle>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-line2 bg-[#FAFAF8] px-4 py-3 hover:bg-[#F4F4F2] transition-colors">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-line2 accent-brand-500"
                checked={!!form.bannerImageUrl || showBannerSection}
                onChange={(e) => {
                  if (!e.target.checked) {
                    set("bannerImageUrl", "");
                    setShowBannerSection(false);
                  } else {
                    setShowBannerSection(true);
                  }
                }}
              />
              <span className="text-sm font-medium text-ink2">
                Adicionar banner a esta promoção
              </span>
            </label>
            <p className="mt-1 text-xs text-muted">
              O banner aparecerá no topo do cardápio QR e do delivery online enquanto a promoção estiver ativa.
            </p>

            {(showBannerSection || !!form.bannerImageUrl) && (
              <div className="mt-3 space-y-3">
                <p className="text-xs text-muted">
                  Imagem retangular (proporção 3:1 recomendada, ex: 1200×400 px).
                </p>
                {form.bannerImageUrl ? (
                  <div className="relative overflow-hidden rounded-xl border border-line2 bg-[#FAFAF8]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={form.bannerImageUrl}
                      alt="Preview do banner"
                      className="w-full object-cover"
                      style={{ aspectRatio: "3/1" }}
                    />
                    <button
                      type="button"
                      onClick={() => set("bannerImageUrl", "")}
                      className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white text-xs hover:bg-black/70"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <label
                    className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors cursor-pointer ${
                      uploading
                        ? "border-brand-300 bg-brand-50"
                        : "border-line2 bg-[#FAFAF8] hover:border-brand-400 hover:bg-brand-50"
                    }`}
                  >
                    <span className="text-2xl">{uploading ? "⏳" : "🖼️"}</span>
                    <span className="text-sm font-semibold text-ink2">
                      {uploading ? "Enviando…" : "Clique para fazer upload do banner"}
                    </span>
                    <span className="text-xs text-muted">JPEG, PNG ou WebP · máx. 5 MB</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      disabled={uploading}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleBannerUpload(file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
              </div>
            )}
          </div>

          {/* ── 3. Alvo ── */}
          <div>
            <SectionTitle>Alvo</SectionTitle>
            <div className="grid grid-cols-3 gap-2">
              {(["ORDER", "CATEGORY", "PRODUCT"] as PromotionTarget[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => set("target", t)}
                  className={`rounded-xl border-2 px-3 py-2.5 text-sm font-medium transition-all ${
                    form.target === t
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-line2 bg-paper text-ink2 hover:border-line2"
                  }`}
                >
                  {TARGET_LABELS[t]}
                </button>
              ))}
            </div>

            <div className="mt-4">
              <FormGroup label="Canal">
                <select
                  className={inputCls}
                  value={form.channel}
                  onChange={(e) => set("channel", e.target.value as PromotionChannel)}
                >
                  {(["ALL", "QR_MENU", "DELIVERY", "WHATSAPP"] as PromotionChannel[]).map((c) => (
                    <option key={c} value={c}>{CHANNEL_LABELS[c]}</option>
                  ))}
                </select>
              </FormGroup>
            </div>
          </div>

          {/* ── 4. Validade ── */}
          <div>
            <SectionTitle>Validade</SectionTitle>
            <div className="grid grid-cols-2 gap-4">
              <FormGroup label="Início">
                <input
                  type="datetime-local"
                  className={inputCls}
                  value={form.startsAt}
                  onChange={(e) => set("startsAt", e.target.value)}
                />
              </FormGroup>
              <FormGroup label="Término" hint="Deixe vazio para sem expiração">
                <input
                  type="datetime-local"
                  className={inputCls}
                  value={form.endsAt}
                  onChange={(e) => set("endsAt", e.target.value)}
                />
              </FormGroup>
            </div>

            <div className="mt-4">
              <p className="text-sm font-medium text-ink2 mb-2">Dias da semana</p>
              <p className="text-xs text-muted mb-2">Deixe em branco para todos os dias</p>
              <div className="flex flex-wrap gap-2">
                {DAY_LABELS.map((label, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleDay(i)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                      form.daysOfWeek.includes(i)
                        ? "bg-brand-500 text-white"
                        : "bg-[#F4F4F2] text-ink2 hover:bg-line2"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4">
              <FormGroup label="Hora início" hint="Opcional">
                <input
                  type="time"
                  className={inputCls}
                  value={form.timeFrom}
                  onChange={(e) => set("timeFrom", e.target.value)}
                />
              </FormGroup>
              <FormGroup label="Hora fim" hint="Opcional">
                <input
                  type="time"
                  className={inputCls}
                  value={form.timeTo}
                  onChange={(e) => set("timeTo", e.target.value)}
                />
              </FormGroup>
            </div>
          </div>

          {/* ── 5. Regras ── */}
          <div>
            <SectionTitle>Regras de elegibilidade</SectionTitle>
            <div className="grid grid-cols-2 gap-4">
              <FormGroup label="Pedido mínimo (R$)" hint="Opcional">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className={inputCls}
                  value={form.minOrderValue}
                  onChange={(e) => set("minOrderValue", e.target.value)}
                  placeholder="0.00"
                />
              </FormGroup>
              <FormGroup label="Qtd. mínima" hint="Opcional">
                <input
                  type="number"
                  min={1}
                  step={1}
                  className={inputCls}
                  value={form.minQuantity}
                  onChange={(e) => set("minQuantity", e.target.value)}
                  placeholder="—"
                />
              </FormGroup>
              <FormGroup label="Limite de usos" hint="Opcional">
                <input
                  type="number"
                  min={1}
                  step={1}
                  className={inputCls}
                  value={form.maxUses}
                  onChange={(e) => set("maxUses", e.target.value)}
                  placeholder="Ilimitado"
                />
              </FormGroup>
            </div>

            <div className="mt-4 space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-line2 accent-brand-500"
                  checked={form.oneTimePerUser}
                  onChange={(e) => set("oneTimePerUser", e.target.checked)}
                />
                <div>
                  <p className="text-sm font-medium text-ink2">Uso único por cliente</p>
                  <p className="text-xs text-muted">Cada cliente só pode usar esta promoção uma vez</p>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-line2 accent-brand-500"
                  checked={form.combinable}
                  onChange={(e) => set("combinable", e.target.checked)}
                />
                <div>
                  <p className="text-sm font-medium text-ink2">Combinável com outras promoções</p>
                  <p className="text-xs text-muted">Permite acumular com outros descontos ativos</p>
                </div>
              </label>
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          </div>{/* /max-w-3xl */}
        </form>
        )}

        {/* Footer — only for promotion tab */}
        {drawerTab === "promotion" && (
        <div className="border-t border-line px-6 py-4 flex gap-3 max-w-3xl w-full mx-auto">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-line2 bg-paper py-2.5 text-sm font-semibold text-ink2 hover:bg-[#FAFAF8] transition-colors"
          >
            Cancelar
          </button>
          <button
            form="promotion-form"
            type="submit"
            disabled={saving}
            className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-bold text-white hover:bg-brand-700 transition-colors disabled:opacity-60 shadow-sm"
          >
            {saving ? "Salvando…" : editing ? "Salvar alterações" : "Criar promoção"}
          </button>
        </div>
        )}
      </div>
    </>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtBrl(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Promotion Metrics Drawer ───────────────────────────────────────────────────

const ORDER_STATUS_LABEL: Record<string, string> = {
  CONFIRMED:        "Confirmado",
  PREPARING:        "Em preparo",
  READY:            "Pronto",
  OUT_FOR_DELIVERY: "A caminho",
  DELIVERED:        "Entregue",
};

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  PAID:             "Pago",
  PAY_ON_DELIVERY:  "Pago na entrega",
  PAY_ON_PICKUP:    "Pago na retirada",
};

const ORDER_TYPE_LABEL: Record<string, string> = {
  DELIVERY: "Delivery",
  PICKUP:   "Retirada",
  DINE_IN:  "Presencial",
};

function MetricTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-line bg-[#FAFAF8] p-4">
      <p className="text-xs text-muted mb-1">{label}</p>
      <p className="text-xl font-bold text-ink leading-tight">{value}</p>
      {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
    </div>
  );
}

function PromotionMetricsDrawer({
  promotion,
  onClose,
}: {
  promotion: PromotionRow;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"resumo" | "pedidos">("resumo");
  const [data, setData] = useState<PromotionMetricsDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/promotions/${promotion.id}/metrics`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((json) => { if (!cancelled) { setData(json.data); setLoading(false); } })
      .catch(() => { if (!cancelled) { setError("Não foi possível carregar as métricas."); setLoading(false); } });
    return () => { cancelled = true; };
  }, [promotion.id]);

  const discountLabel = promotion.type === "PERCENTAGE"
    ? `${promotion.discountValue}% off`
    : promotion.type === "FIXED"
      ? `R$ ${fmtBrl(promotion.discountValue)} off`
      : promotion.type === "FREE_DELIVERY"
        ? "Frete grátis"
        : TYPE_LABELS[promotion.type] ?? promotion.type;

  return (
    <>
      <div
        className="fixed inset-y-0 left-0 lg:left-56 right-0 z-40 bg-black/20 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="fixed inset-y-0 left-0 lg:left-56 right-0 z-50 flex flex-col bg-paper shadow-2xl">

        {/* Header */}
        <div className="flex items-center gap-4 border-b border-line px-6 py-3">
          <div className="flex gap-1 rounded-xl bg-[#F4F4F2] p-1">
            <button
              type="button"
              onClick={() => setTab("resumo")}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                tab === "resumo" ? "bg-paper text-ink shadow-sm" : "text-muted hover:text-ink2"
              }`}
            >
              📊 Resumo
            </button>
            <button
              type="button"
              onClick={() => setTab("pedidos")}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                tab === "pedidos" ? "bg-paper text-ink shadow-sm" : "text-muted hover:text-ink2"
              }`}
            >
              Pedidos {data && data.uses > 0 ? `(${data.uses})` : ""}
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-[#F4F4F2] hover:text-ink2"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto max-w-3xl space-y-6">

            {/* Promo identity */}
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <StatusBadge status={promotion.displayStatus} />
                <span className="rounded-full bg-[#F4F4F2] px-2 py-0.5 text-[11px] font-medium text-ink2">
                  {TYPE_LABELS[promotion.type] ?? promotion.type}
                </span>
                {promotion.couponCode && (
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-mono font-semibold text-brand-600">
                    {promotion.couponCode}
                  </span>
                )}
              </div>
              <h2 className="text-lg font-bold text-ink">{promotion.name}</h2>
              <p className="mt-1 text-sm text-muted">
                {discountLabel} · {CHANNEL_LABELS[promotion.channel]}
                {promotion.maxUses ? ` · Limite: ${promotion.maxUses} usos` : ""}
                {promotion.oneTimePerUser ? " · 1× por cliente" : ""}
              </p>
            </div>

            {loading && (
              <div className="flex items-center justify-center py-16">
                <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {!loading && !error && data && tab === "resumo" && (
              <>
                {data.uses === 0 ? (
                  <div className="rounded-xl border border-dashed border-line2 bg-[#FAFAF8] py-12 text-center">
                    <p className="text-3xl mb-2">📭</p>
                    <p className="text-sm font-semibold text-ink2">Nenhum pedido com este cupom ainda</p>
                    <p className="text-xs text-muted mt-1">Os dados aparecerão aqui conforme o cupom for utilizado.</p>
                  </div>
                ) : (
                  <>
                    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
                      <MetricTile label="Usos do cupom"    value={String(data.uses)} />
                      <MetricTile label="Receita gerada"   value={`R$ ${fmtBrl(data.revenue)}`} />
                      <MetricTile label="Desconto concedido" value={`−R$ ${fmtBrl(data.discountGiven)}`} />
                      <MetricTile label="Ticket médio"     value={`R$ ${fmtBrl(data.averageTicket)}`} />
                      <MetricTile label="Clientes únicos"  value={String(data.uniqueCustomers)} />
                      <MetricTile
                        label="Último uso"
                        value={data.lastUsedAt ? fmtDate(data.lastUsedAt) : "—"}
                      />
                    </div>

                    {/* Campaign attribution note */}
                    <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                      Este cupom ainda não está vinculado automaticamente a campanhas. Métricas acima consideram todos os pedidos que usaram o código.
                    </div>
                  </>
                )}
              </>
            )}

            {!loading && !error && data && tab === "pedidos" && (
              <>
                {data.orders.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-line2 bg-[#FAFAF8] py-12 text-center">
                    <p className="text-3xl mb-2">📭</p>
                    <p className="text-sm font-semibold text-ink2">Nenhum pedido com este cupom ainda</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-line">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-line bg-[#FAFAF8]">
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted">Pedido</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted">Cliente</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted">Data</th>
                          <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted">Subtotal</th>
                          <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted">Desconto</th>
                          <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted">Total</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted">Tipo</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted">Pagamento</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.orders.map((o, i) => (
                          <tr key={o.id} className={`border-b border-line ${i % 2 === 0 ? "bg-paper" : "bg-[#FAFAF8]/50"}`}>
                            <td className="px-4 py-2.5 font-mono text-xs text-ink2">#{o.orderRef}</td>
                            <td className="px-4 py-2.5">
                              <p className="font-medium text-ink truncate max-w-[120px]">{o.customerName ?? "—"}</p>
                              {o.customerPhone && (
                                <p className="text-xs text-muted">{o.customerPhone}</p>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-muted whitespace-nowrap">
                              {fmtDate(o.createdAt)}
                            </td>
                            <td className="px-4 py-2.5 text-right text-sm text-ink2">R$ {fmtBrl(o.subtotal)}</td>
                            <td className="px-4 py-2.5 text-right text-sm text-brand-600">−R$ {fmtBrl(o.discount)}</td>
                            <td className="px-4 py-2.5 text-right text-sm font-semibold text-ink">R$ {fmtBrl(o.total)}</td>
                            <td className="px-4 py-2.5 text-xs text-muted">{ORDER_TYPE_LABEL[o.type] ?? o.type}</td>
                            <td className="px-4 py-2.5 text-xs">
                              <span className={`rounded-full px-2 py-0.5 font-medium ${
                                o.paymentStatus === "PAID"
                                  ? "bg-green-100 text-green-700"
                                  : "bg-[#F4F4F2] text-ink2"
                              }`}>
                                {o.paymentStatus ? (PAYMENT_STATUS_LABEL[o.paymentStatus] ?? o.paymentStatus) : "—"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {data.orders.length >= 200 && (
                      <p className="px-4 py-2 text-xs text-muted border-t border-line">
                        Exibindo os 200 pedidos mais recentes.
                      </p>
                    )}
                  </div>
                )}
              </>
            )}

          </div>
        </div>
      </div>
    </>
  );
}

// ── Promotion Card ─────────────────────────────────────────────────────────────

function PromotionCard({
  promotion,
  metrics,
  onEdit,
  onMetrics,
  onDuplicate,
  onDelete,
  onToggleStatus,
}: {
  promotion: PromotionRow;
  metrics?: PromotionMetricsSummary;
  onEdit: () => void;
  onMetrics: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onToggleStatus: () => void;
}) {
  const canToggle =
    promotion.displayStatus === "ACTIVE" ||
    promotion.displayStatus === "PAUSED" ||
    promotion.displayStatus === "SCHEDULED" ||
    promotion.displayStatus === "DRAFT";
  const isActive = promotion.displayStatus === "ACTIVE";

  let validityText = "Sem expiração";
  if (promotion.startsAt && promotion.endsAt) {
    const s = new Date(promotion.startsAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
    const e = new Date(promotion.endsAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
    validityText = `${s} → ${e}`;
  } else if (promotion.endsAt) {
    validityText = `Até ${new Date(promotion.endsAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`;
  } else if (promotion.startsAt) {
    validityText = `A partir de ${new Date(promotion.startsAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`;
  }

  const discountText = promotion.type === "PERCENTAGE"
    ? `${promotion.discountValue}% off`
    : promotion.type === "FIXED"
      ? `R$${promotion.discountValue.toFixed(2)} off`
      : promotion.type === "FREE_DELIVERY"
        ? "Frete grátis"
        : TYPE_LABELS[promotion.type] ?? promotion.type;

  return (
    <div className="rounded-2xl border border-line bg-paper p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <StatusBadge status={promotion.displayStatus} />
            <span className="rounded-full bg-[#F4F4F2] px-2 py-0.5 text-[11px] font-medium text-ink2">
              {TYPE_LABELS[promotion.type] ?? promotion.type}
            </span>
            {promotion.couponCode && (
              <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-mono font-semibold text-brand-600">
                {promotion.couponCode}
              </span>
            )}
            {promotion.bannerImageUrl && (
              <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-600">
                🖼 banner
              </span>
            )}
          </div>
          <p className="text-sm font-bold text-ink truncate">{promotion.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted">
            <span className="font-semibold text-brand-600">{discountText}</span>
            <span>·</span>
            <span>{CHANNEL_LABELS[promotion.channel]}</span>
            <span>·</span>
            <span>{validityText}</span>
          </div>
          {promotion.minOrderValue != null && (
            <p className="mt-1 text-xs text-muted">
              Pedido mínimo: R${promotion.minOrderValue.toFixed(2)}
            </p>
          )}
          {promotion.daysOfWeek.length > 0 && (
            <p className="mt-1 text-xs text-muted">
              {promotion.daysOfWeek.map((d) => DAY_LABELS[d]).join(", ")}
              {promotion.timeFrom && promotion.timeTo ? ` · ${promotion.timeFrom}–${promotion.timeTo}` : ""}
            </p>
          )}
        </div>
      </div>

      {/* Banner preview */}
      {promotion.type === "BANNER" && promotion.bannerImageUrl && (
        <div className="mt-3 overflow-hidden rounded-xl border border-line">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={promotion.bannerImageUrl}
            alt={promotion.name}
            className="w-full object-cover"
            style={{ aspectRatio: "3/1" }}
          />
        </div>
      )}

      {/* Compact metrics strip — shown when there are recorded uses */}
      {metrics && metrics.uses > 0 && (
        <div className="mt-3 grid grid-cols-4 gap-2 rounded-xl bg-[#FAFAF8] px-3 py-2.5">
          <div className="text-center">
            <p className="text-[10px] text-muted leading-tight">Usos</p>
            <p className="text-xs font-bold text-ink">{metrics.uses}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted leading-tight">Receita</p>
            <p className="text-xs font-bold text-green-700">R$&nbsp;{fmtBrl(metrics.revenue)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted leading-tight">Desconto</p>
            <p className="text-xs font-bold text-brand-600">−R$&nbsp;{fmtBrl(metrics.discountGiven)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted leading-tight">Clientes</p>
            <p className="text-xs font-bold text-ink">{metrics.uniqueCustomers}</p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <button
          onClick={onEdit}
          className="rounded-lg bg-[#F4F4F2] px-3 py-1.5 text-xs font-semibold text-ink2 hover:bg-line2 transition-colors"
        >
          Editar
        </button>
        <button
          onClick={onMetrics}
          className="rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100 transition-colors"
        >
          📊 Métricas
        </button>
        <button
          onClick={onDuplicate}
          className="rounded-lg bg-[#F4F4F2] px-3 py-1.5 text-xs font-semibold text-ink2 hover:bg-line2 transition-colors"
        >
          Duplicar
        </button>
        {canToggle && (
          <button
            onClick={onToggleStatus}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              isActive
                ? "bg-amber-100 text-amber-700 hover:bg-yellow-200"
                : "bg-green-100 text-green-700 hover:bg-green-200"
            }`}
          >
            {isActive ? "Pausar" : "Ativar"}
          </button>
        )}
        <button
          onClick={onDelete}
          className="ml-auto rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 transition-colors"
        >
          Excluir
        </button>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function PromotionsClient({
  initialPromotions,
  metricsMap = {},
}: {
  initialPromotions: PromotionRow[];
  metricsMap?: Record<string, PromotionMetricsSummary>;
}) {
  const [promotions, setPromotions] = useState<PromotionRow[]>(initialPromotions);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<PromotionRow | null>(null);
  const [metricsPromo, setMetricsPromo] = useState<PromotionRow | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [automations, setAutomations] = useState<AutomationRow[]>([]);

  useEffect(() => {
    fetch("/api/crm/automations")
      .then((r) => r.json())
      .then((json) => setAutomations(json.data ?? []))
      .catch(() => {});
  }, []);

  // ── Derived ──────────────────────────────────────────────────────────
  const filtered = promotions.filter((p) =>
    statusFilter === "ALL" ? true : p.displayStatus === statusFilter
  );

  // ── Handlers ─────────────────────────────────────────────────────────

  function openCreate() {
    setEditing(null);
    setDrawerOpen(true);
  }

  function openEdit(p: PromotionRow) {
    setEditing(p);
    setDrawerOpen(true);
  }

  const handleSaved = useCallback((p: PromotionRow) => {
    setPromotions((prev) => {
      const idx = prev.findIndex((x) => x.id === p.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = p;
        return next;
      }
      return [p, ...prev];
    });
    setDrawerOpen(false);
  }, []);

  async function handleDuplicate(p: PromotionRow) {
    const res = await fetch(`/api/promotions/${p.id}/duplicate`, { method: "POST" });
    if (!res.ok) return;
    const json = await res.json();
    setPromotions((prev) => [json.data, ...prev]);
  }

  async function handleDelete(p: PromotionRow) {
    if (!window.confirm(`Excluir "${p.name}"? Esta ação não pode ser desfeita.`)) return;
    setDeleting(p.id);
    await fetch(`/api/promotions/${p.id}`, { method: "DELETE" });
    setPromotions((prev) => prev.filter((x) => x.id !== p.id));
    setDeleting(null);
  }

  async function handleToggleStatus(p: PromotionRow) {
    const newStatus = p.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    const res = await fetch(`/api/promotions/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!res.ok) return;
    const json = await res.json();
    setPromotions((prev) =>
      prev.map((x) => (x.id === p.id ? json.data : x))
    );
  }

  // ── Render ────────────────────────────────────────────────────────────

  const statusFilters: { value: string; label: string }[] = [
    { value: "ALL", label: "Todas" },
    { value: "ACTIVE", label: "Ativas" },
    { value: "SCHEDULED", label: "Agendadas" },
    { value: "PAUSED", label: "Pausadas" },
    { value: "DRAFT", label: "Rascunhos" },
    { value: "EXPIRED", label: "Encerradas" },
  ];

  return (
    <div className="p-6 max-w-4xl space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {statusFilters.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                statusFilter === f.value
                  ? "bg-brand-600 text-white shadow-sm"
                  : "bg-[#F4F4F2] text-ink2 hover:bg-line2"
              }`}
            >
              {f.label}
              {f.value !== "ALL" && (
                <span className="ml-1.5 opacity-70">
                  {promotions.filter((p) => p.displayStatus === f.value).length}
                </span>
              )}
            </button>
          ))}
        </div>
        <button
          onClick={openCreate}
          className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-brand-700 transition-colors"
        >
          + Criar promoção
        </button>
      </div>

      {/* Promotion list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line2 bg-[#FAFAF8] py-16 text-center">
          <span className="mb-3 text-4xl">🎁</span>
          <p className="text-sm font-semibold text-ink2">
            {statusFilter === "ALL" ? "Nenhuma promoção criada" : "Nenhuma promoção neste status"}
          </p>
          <p className="mt-1 text-xs text-muted">
            {statusFilter === "ALL" && "Crie sua primeira promoção para atrair mais clientes."}
          </p>
          {statusFilter === "ALL" && (
            <button
              onClick={openCreate}
              className="mt-4 rounded-xl bg-brand-600 px-5 py-2 text-sm font-bold text-white hover:bg-brand-700 transition-colors"
            >
              Criar promoção
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((p) => (
            <PromotionCard
              key={p.id}
              promotion={p}
              metrics={metricsMap[p.id]}
              onEdit={() => openEdit(p)}
              onMetrics={() => setMetricsPromo(p)}
              onDuplicate={() => handleDuplicate(p)}
              onDelete={() => !deleting && handleDelete(p)}
              onToggleStatus={() => handleToggleStatus(p)}
            />
          ))}
        </div>
      )}

      {/* Edit / create drawer */}
      {drawerOpen && (
        <PromotionDrawer
          editing={editing}
          onClose={() => setDrawerOpen(false)}
          onSaved={handleSaved}
          automations={automations}
        />
      )}

      {/* Metrics drawer */}
      {metricsPromo && (
        <PromotionMetricsDrawer
          promotion={metricsPromo}
          onClose={() => setMetricsPromo(null)}
        />
      )}
    </div>
  );
}
