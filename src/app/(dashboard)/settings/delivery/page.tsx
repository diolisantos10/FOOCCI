"use client";

import { useState, useEffect, type FormEvent } from "react";
import { apiFetch, Field, INPUT, Feedback, SaveButton, Toggle, PageCard, SectionHeading } from "../_shared";

export default function DeliveryPage() {
  const [form, setForm] = useState({
    enabled: true,
    fee: "",
    minOrderValue: "",
    estimatedMinutes: "",
    areaDescription: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/settings/delivery").then(({ ok, data }) => {
      if (ok)
        setForm({
          enabled:          data.enabled ?? true,
          fee:              data.fee              != null ? String(Number(data.fee)) : "",
          minOrderValue:    data.minOrderValue    != null ? String(Number(data.minOrderValue)) : "",
          estimatedMinutes: data.estimatedMinutes != null ? String(data.estimatedMinutes) : "",
          areaDescription:  data.areaDescription  ?? "",
        });
      setLoading(false);
    });
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSuccess(null);
    setError(null);
    const { ok, data } = await apiFetch("/api/settings/delivery", "PUT", {
      enabled:          form.enabled,
      fee:              form.fee              ? Number(form.fee)              : null,
      estimatedMinutes: form.estimatedMinutes ? Number(form.estimatedMinutes) : null,
      areaDescription:  form.areaDescription  || null,
    });
    if (ok) setSuccess("Configurações de entrega salvas.");
    else setError(data?.error ?? "Erro ao salvar.");
    setSaving(false);
  }

  if (loading) return <p className="py-8 text-sm text-gray-400">Carregando…</p>;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Feedback success={success} error={error} onDismiss={() => setError(null)} />

      {/* Toggle */}
      <PageCard>
        <Toggle
          label="Delivery ativo"
          desc="Aceitar pedidos para entrega no endereço do cliente."
          checked={form.enabled}
          onChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
        />
      </PageCard>

      {form.enabled && (
        <>
          {/* Fees & timing */}
          <PageCard>
            <SectionHeading
              title="Taxas e prazo"
              subtitle="Configure o custo e o tempo estimado de entrega."
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
          </PageCard>

          {/* Area */}
          <PageCard>
            <SectionHeading
              title="Área de cobertura"
              subtitle="Descreva onde você entrega para que o agente possa informar clientes."
            />
            <Field label="Bairros, CEPs ou raio de cobertura">
              <textarea
                className={INPUT + " resize-none"}
                rows={3}
                value={form.areaDescription}
                onChange={(e) => setForm((f) => ({ ...f, areaDescription: e.target.value }))}
                placeholder="Ex: Pinheiros, Vila Madalena, Bela Vista — raio de 5 km"
                maxLength={500}
              />
            </Field>
          </PageCard>

          {/* Coming soon insights */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/50 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-400">Em breve</p>
              <p className="mt-1 text-sm font-semibold text-indigo-800">Regiões de melhor desempenho</p>
              <p className="mt-1 text-xs text-indigo-600 opacity-70">
                Veja de onde vêm seus pedidos e foque sua área de entrega.
              </p>
            </div>
            <div className="rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/50 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-400">Em breve</p>
              <p className="mt-1 text-sm font-semibold text-indigo-800">Raio sugerido de entrega</p>
              <p className="mt-1 text-xs text-indigo-600 opacity-70">
                IA analisa seus pedidos e sugere o raio ideal para maximizar conversões.
              </p>
            </div>
          </div>
        </>
      )}

      <SaveButton saving={saving} />
    </form>
  );
}
