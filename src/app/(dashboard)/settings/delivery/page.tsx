"use client";

import { useState, useEffect, type FormEvent } from "react";
import {
  apiFetch,
  Field,
  INPUT,
  Feedback,
  SaveButton,
  Toggle,
  PageCard,
  SectionHeading,
} from "../_shared";

// ── Types ──────────────────────────────────────────────────────────────────────

interface DeliveryZone {
  id: string;
  name: string;
  sortOrder: number;
  maxDistanceKm: number;
  fee: string | number;
  estimatedMinutes: number;
  minOrderValue: string | number | null;
  isActive: boolean;
  peakFee: string | number | null;
}

interface DeliveryFormState {
  enabled: boolean;
  pickupEnabled: boolean;
  mode: "simple" | "advanced";
  fee: string;
  estimatedMinutes: string;
  areaDescription: string;
  minOrderValue: string;
  freeDeliveryAbove: string;
  peakHoursEnabled: boolean;
  // Phase 5 placeholders
  geoCenter: string;
  geoRadiusKm: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function toNum(v: string): number | null {
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function fmtCurrency(v: string | number | null): string {
  if (v == null || v === "") return "";
  return String(Number(v));
}

// ── Zone card sub-component ────────────────────────────────────────────────────

interface ZoneRowProps {
  zone: DeliveryZone;
  index: number;
  onDelete: (id: string) => void;
  onToggle: (id: string, isActive: boolean) => void;
  onEdit: (zone: DeliveryZone) => void;
}

function ZoneRow({ zone, index, onDelete, onToggle, onEdit }: ZoneRowProps) {
  return (
    <div
      className={`rounded-xl border bg-white p-4 transition ${
        zone.isActive ? "border-gray-200" : "border-dashed border-gray-200 opacity-60"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600">
            {index + 1}
          </span>
          <div>
            <p className="text-sm font-semibold text-gray-900">{zone.name}</p>
            <p className="text-xs text-gray-500">
              até {zone.maxDistanceKm} km · {zone.estimatedMinutes} min
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-800">
            {Number(zone.fee) === 0
              ? "Grátis"
              : `R$ ${Number(zone.fee).toFixed(2).replace(".", ",")}`}
          </span>
          <button
            type="button"
            onClick={() => onEdit(zone)}
            className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            Editar
          </button>
          <button
            type="button"
            onClick={() => onToggle(zone.id, !zone.isActive)}
            className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
              zone.isActive
                ? "border-gray-200 text-gray-500 hover:bg-gray-50"
                : "border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
            }`}
          >
            {zone.isActive ? "Desativar" : "Ativar"}
          </button>
          <button
            type="button"
            onClick={() => onDelete(zone.id)}
            className="rounded-lg border border-red-100 px-2 py-1 text-xs font-medium text-red-400 hover:bg-red-50 hover:text-red-600"
          >
            ✕
          </button>
        </div>
      </div>

      {zone.minOrderValue != null && Number(zone.minOrderValue) > 0 && (
        <p className="mt-2 text-[11px] text-gray-400">
          Pedido mínimo: R$ {Number(zone.minOrderValue).toFixed(2).replace(".", ",")}
        </p>
      )}
    </div>
  );
}

// ── Zone editor modal ──────────────────────────────────────────────────────────

interface ZoneEditorProps {
  initial: Partial<DeliveryZone> | null;
  onSave: (data: Omit<DeliveryZone, "id" | "sortOrder">) => void;
  onCancel: () => void;
  saving: boolean;
}

function ZoneEditor({ initial, onSave, onCancel, saving }: ZoneEditorProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [maxDistanceKm, setMaxDistanceKm] = useState(
    initial?.maxDistanceKm != null ? String(initial.maxDistanceKm) : ""
  );
  const [fee, setFee] = useState(
    initial?.fee != null ? fmtCurrency(initial.fee) : ""
  );
  const [estimatedMinutes, setEstimatedMinutes] = useState(
    initial?.estimatedMinutes != null ? String(initial.estimatedMinutes) : ""
  );
  const [minOrderValue, setMinOrderValue] = useState(
    initial?.minOrderValue != null ? fmtCurrency(initial.minOrderValue) : ""
  );
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSave({
      name,
      maxDistanceKm: parseFloat(maxDistanceKm),
      fee: parseFloat(fee) || 0,
      estimatedMinutes: parseInt(estimatedMinutes, 10),
      minOrderValue: minOrderValue ? parseFloat(minOrderValue) : null,
      isActive,
      peakFee: initial?.peakFee ?? null,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-base font-semibold text-gray-900">
          {initial?.id ? "Editar zona" : "Nova zona de entrega"}
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Nome da zona *">
            <input
              className={INPUT}
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Centro, Zona 1 — até 3km"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Distância máxima (km) *">
              <input
                className={INPUT}
                type="number"
                required
                min="0.1"
                step="0.1"
                value={maxDistanceKm}
                onChange={(e) => setMaxDistanceKm(e.target.value)}
                placeholder="5"
              />
            </Field>
            <Field label="Tempo estimado (min) *">
              <input
                className={INPUT}
                type="number"
                required
                min="1"
                max="300"
                value={estimatedMinutes}
                onChange={(e) => setEstimatedMinutes(e.target.value)}
                placeholder="30"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Taxa de entrega (R$) *" hint="0 = grátis">
              <input
                className={INPUT}
                type="number"
                required
                min="0"
                step="0.01"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                placeholder="0,00"
              />
            </Field>
            <Field label="Pedido mínimo (R$)" hint="Opcional">
              <input
                className={INPUT}
                type="number"
                min="0"
                step="0.01"
                value={minOrderValue}
                onChange={(e) => setMinOrderValue(e.target.value)}
                placeholder="0,00"
              />
            </Field>
          </div>

          <Toggle
            label="Zona ativa"
            desc="Zona inativa não aparece para o cliente."
            checked={isActive}
            onChange={setIsActive}
          />

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? "Salvando…" : "Salvar zona"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function DeliveryPage() {
  const [form, setForm] = useState<DeliveryFormState>({
    enabled: true,
    pickupEnabled: true,
    mode: "simple",
    fee: "",
    estimatedMinutes: "",
    areaDescription: "",
    minOrderValue: "",
    freeDeliveryAbove: "",
    peakHoursEnabled: false,
    geoCenter: "",
    geoRadiusKm: "",
  });

  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [zoneSaving, setZoneSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showZoneEditor, setShowZoneEditor] = useState(false);
  const [editingZone, setEditingZone] = useState<DeliveryZone | null>(null);

  // Load config + zones
  useEffect(() => {
    apiFetch("/api/settings/delivery").then(({ ok: isOk, data }) => {
      if (isOk) {
        setForm({
          enabled:          data.enabled ?? true,
          pickupEnabled:    data.pickupEnabled ?? true,
          mode:             data.mode ?? "simple",
          fee:              fmtCurrency(data.fee),
          estimatedMinutes: data.estimatedMinutes != null ? String(data.estimatedMinutes) : "",
          areaDescription:  data.areaDescription ?? "",
          minOrderValue:    fmtCurrency(data.minOrderValue),
          freeDeliveryAbove: fmtCurrency(data.freeDeliveryAbove),
          peakHoursEnabled: data.peakHoursEnabled ?? false,
          geoCenter:        data.geoCenter ?? "",
          geoRadiusKm:      data.geoRadiusKm != null ? String(data.geoRadiusKm) : "",
        });
        setZones(data.zones ?? []);
      }
      setLoading(false);
    });
  }, []);

  // Save global config
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSuccess(null);
    setError(null);
    const { ok: isOk, data } = await apiFetch("/api/settings/delivery", "PUT", {
      enabled:           form.enabled,
      pickupEnabled:     form.pickupEnabled,
      mode:              form.mode,
      fee:               toNum(form.fee),
      estimatedMinutes:  form.estimatedMinutes ? parseInt(form.estimatedMinutes, 10) : null,
      areaDescription:   form.areaDescription || null,
      minOrderValue:     toNum(form.minOrderValue),
      freeDeliveryAbove: toNum(form.freeDeliveryAbove),
      peakHoursEnabled:  form.peakHoursEnabled,
      geoCenter:         form.geoCenter || null,
      geoRadiusKm:       toNum(form.geoRadiusKm),
    });
    if (isOk) setSuccess("Configurações de entrega salvas.");
    else setError(data?.error ?? "Erro ao salvar.");
    setSaving(false);
  }

  // Zone operations
  async function handleZoneSave(data: Omit<DeliveryZone, "id" | "sortOrder">) {
    setZoneSaving(true);
    if (editingZone?.id) {
      const res = await apiFetch(`/api/settings/delivery/zones/${editingZone.id}`, "PUT", {
        ...data,
        sortOrder: editingZone.sortOrder,
      });
      if (res.ok) {
        setZones((prev) =>
          prev.map((z) => (z.id === editingZone.id ? res.data : z))
        );
        setShowZoneEditor(false);
        setEditingZone(null);
      } else {
        setError(res.data?.error ?? "Erro ao salvar zona.");
      }
    } else {
      const res = await apiFetch("/api/settings/delivery/zones", "POST", {
        ...data,
        sortOrder: zones.length,
      });
      if (res.ok) {
        setZones((prev) => [...prev, res.data]);
        setShowZoneEditor(false);
        setEditingZone(null);
      } else {
        setError(res.data?.error ?? "Erro ao criar zona.");
      }
    }
    setZoneSaving(false);
  }

  async function handleZoneDelete(id: string) {
    if (!confirm("Remover esta zona de entrega?")) return;
    const res = await apiFetch(`/api/settings/delivery/zones/${id}`, "DELETE");
    if (res.ok) setZones((prev) => prev.filter((z) => z.id !== id));
    else setError(res.data?.error ?? "Erro ao remover zona.");
  }

  async function handleZoneToggle(id: string, isActive: boolean) {
    const zone = zones.find((z) => z.id === id);
    if (!zone) return;
    const res = await apiFetch(`/api/settings/delivery/zones/${id}`, "PUT", {
      ...zone,
      fee:          Number(zone.fee),
      minOrderValue: zone.minOrderValue != null ? Number(zone.minOrderValue) : null,
      peakFee:       zone.peakFee != null ? Number(zone.peakFee) : null,
      isActive,
    });
    if (res.ok) setZones((prev) => prev.map((z) => (z.id === id ? res.data : z)));
    else setError(res.data?.error ?? "Erro ao atualizar zona.");
  }

  function openNewZone() {
    setEditingZone(null);
    setShowZoneEditor(true);
  }

  function openEditZone(zone: DeliveryZone) {
    setEditingZone(zone);
    setShowZoneEditor(true);
  }

  if (loading) return <p className="py-8 text-sm text-gray-400">Carregando…</p>;

  const activeZones = zones.filter((z) => z.isActive);

  return (
    <>
      {showZoneEditor && (
        <ZoneEditor
          initial={editingZone}
          onSave={handleZoneSave}
          onCancel={() => { setShowZoneEditor(false); setEditingZone(null); }}
          saving={zoneSaving}
        />
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <Feedback success={success} error={error} onDismiss={() => setError(null)} />

        {/* ── Fulfillment toggles ─────────────────────────────────────────────── */}
        <PageCard>
          <SectionHeading
            title="Modalidades de atendimento"
            subtitle="Defina como seu restaurante recebe pedidos."
          />
          <div className="space-y-4">
            <Toggle
              label="Delivery ativo"
              desc="Aceitar pedidos para entrega no endereço do cliente."
              checked={form.enabled}
              onChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
            />
            <div className="border-t border-gray-100" />
            <Toggle
              label="Retirada no balcão ativa"
              desc="Aceitar pedidos para retirada pelo cliente."
              checked={form.pickupEnabled}
              onChange={(v) => setForm((f) => ({ ...f, pickupEnabled: v }))}
            />
          </div>
        </PageCard>

        {form.enabled && (
          <>
            {/* ── Mode selector ───────────────────────────────────────────────── */}
            <PageCard>
              <SectionHeading
                title="Configuração de entrega"
                subtitle="Escolha como deseja estruturar sua política de entrega."
              />
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, mode: "simple" }))}
                  className={`rounded-xl border p-4 text-left transition ${
                    form.mode === "simple"
                      ? "border-indigo-400 bg-indigo-50 ring-1 ring-indigo-300"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <p className="text-sm font-semibold text-gray-900">Simples</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Taxa única para toda a área de entrega.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, mode: "advanced" }))}
                  className={`rounded-xl border p-4 text-left transition ${
                    form.mode === "advanced"
                      ? "border-indigo-400 bg-indigo-50 ring-1 ring-indigo-300"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <p className="text-sm font-semibold text-gray-900">Por zonas</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Taxas e tempos diferentes por distância ou bairro.
                  </p>
                </button>
              </div>
            </PageCard>

            {/* ── Simple mode ─────────────────────────────────────────────────── */}
            {form.mode === "simple" && (
              <PageCard>
                <SectionHeading
                  title="Taxa e prazo"
                  subtitle="Uma configuração única para toda sua área de entrega."
                />
                <div className="grid grid-cols-3 gap-4">
                  <Field label="Taxa de entrega (R$)" hint="Deixe em branco para grátis.">
                    <input
                      className={INPUT}
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.fee}
                      onChange={(e) => setForm((f) => ({ ...f, fee: e.target.value }))}
                      placeholder="0,00"
                    />
                  </Field>
                  <Field label="Pedido mínimo (R$)">
                    <input
                      className={INPUT}
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.minOrderValue}
                      onChange={(e) => setForm((f) => ({ ...f, minOrderValue: e.target.value }))}
                      placeholder="0,00"
                    />
                  </Field>
                  <Field label="Tempo estimado (min)">
                    <input
                      className={INPUT}
                      type="number"
                      min="1"
                      max="300"
                      value={form.estimatedMinutes}
                      onChange={(e) => setForm((f) => ({ ...f, estimatedMinutes: e.target.value }))}
                      placeholder="30"
                    />
                  </Field>
                </div>

                <div className="mt-4">
                  <Field label="Área de cobertura" hint="Descreva onde você entrega — o agente usará essa info para responder clientes.">
                    <textarea
                      className={INPUT + " resize-none"}
                      rows={3}
                      maxLength={500}
                      value={form.areaDescription}
                      onChange={(e) => setForm((f) => ({ ...f, areaDescription: e.target.value }))}
                      placeholder="Ex: Pinheiros, Vila Madalena, Bela Vista — raio de 5 km"
                    />
                  </Field>
                </div>
              </PageCard>
            )}

            {/* ── Advanced mode — zones ────────────────────────────────────────── */}
            {form.mode === "advanced" && (
              <PageCard>
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-gray-900">Zonas de entrega</h2>
                    <p className="mt-0.5 text-sm text-gray-500">
                      {zones.length === 0
                        ? "Adicione zonas para definir taxas por distância."
                        : `${activeZones.length} zona${activeZones.length !== 1 ? "s" : ""} ativa${activeZones.length !== 1 ? "s" : ""}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={openNewZone}
                    className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                  >
                    + Adicionar zona
                  </button>
                </div>

                {zones.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-200 py-10 text-center">
                    <p className="text-sm text-gray-400">Nenhuma zona configurada.</p>
                    <button
                      type="button"
                      onClick={openNewZone}
                      className="mt-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
                    >
                      Criar primeira zona →
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {zones
                      .slice()
                      .sort((a, b) => a.maxDistanceKm - b.maxDistanceKm)
                      .map((zone, i) => (
                        <ZoneRow
                          key={zone.id}
                          zone={zone}
                          index={i}
                          onDelete={handleZoneDelete}
                          onToggle={handleZoneToggle}
                          onEdit={openEditZone}
                        />
                      ))}
                  </div>
                )}

                {zones.length > 0 && (
                  <div className="mt-4 border-t border-gray-100 pt-4">
                    <Field label="Área de cobertura (descrição)">
                      <textarea
                        className={INPUT + " resize-none"}
                        rows={2}
                        maxLength={500}
                        value={form.areaDescription}
                        onChange={(e) => setForm((f) => ({ ...f, areaDescription: e.target.value }))}
                        placeholder="Informação extra para o agente sobre sua área de cobertura."
                      />
                    </Field>
                  </div>
                )}
              </PageCard>
            )}

            {/* ── Commercial rules ─────────────────────────────────────────────── */}
            <PageCard>
              <SectionHeading
                title="Regras comerciais"
                subtitle="Incentivos e limites que se aplicam a todos os pedidos."
              />
              <div className="grid grid-cols-2 gap-4">
                <Field
                  label="Entrega grátis acima de (R$)"
                  hint="Pedidos acima deste valor têm frete grátis. Deixe em branco para não usar."
                >
                  <input
                    className={INPUT}
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.freeDeliveryAbove}
                    onChange={(e) => setForm((f) => ({ ...f, freeDeliveryAbove: e.target.value }))}
                    placeholder="Ex: 80,00"
                  />
                </Field>
                {form.mode === "advanced" && (
                  <Field
                    label="Pedido mínimo global (R$)"
                    hint="Aplica a todas as zonas que não têm mínimo específico."
                  >
                    <input
                      className={INPUT}
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.minOrderValue}
                      onChange={(e) => setForm((f) => ({ ...f, minOrderValue: e.target.value }))}
                      placeholder="0,00"
                    />
                  </Field>
                )}
              </div>
            </PageCard>

            {/* ── Phase 3 placeholder — peak hours ─────────────────────────────── */}
            <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-50/60 p-5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-lg">⏱</span>
                <div>
                  <p className="text-sm font-semibold text-amber-800">
                    Preço dinâmico por horário
                    <span className="ml-2 rounded-full bg-amber-200 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700">
                      em breve
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-amber-700 opacity-80">
                    Configure taxas diferenciadas para horários de pico (ex: sexta noite, almoço).
                    A estrutura já está preparada — funcionalidade chegará em breve.
                  </p>
                </div>
              </div>
            </div>

            {/* ── Phase 5 placeholder — map zones ──────────────────────────────── */}
            <div className="rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/50 p-5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-lg">🗺</span>
                <div>
                  <p className="text-sm font-semibold text-indigo-800">
                    Zonas desenhadas no mapa
                    <span className="ml-2 rounded-full bg-indigo-200 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-indigo-600">
                      em breve
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-indigo-600 opacity-80">
                    Defina áreas de entrega diretamente no mapa, com precisão geográfica por polígonos.
                    O modelo de dados já suporta isso — a interface está em desenvolvimento.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}

        <SaveButton saving={saving} />
      </form>
    </>
  );
}
