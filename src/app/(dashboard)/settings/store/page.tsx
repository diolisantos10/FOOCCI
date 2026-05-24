"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";
import {
  apiFetch, Field, INPUT, SELECT, Feedback, SaveButton, PageCard, SectionHeading, Toggle,
} from "../_shared";

// ── Types ─────────────────────────────────────────────────────────────────────

type Form = {
  // Dados básicos
  name: string;
  description: string;
  slug: string;
  timezone: string;
  // Dados da loja
  tradeName: string;
  legalName: string;
  cuisineType: string;
  // Fiscal
  cnpj: string;
  stateRegistration: string;
  municipalRegistration: string;
  taxRegime: string;
  legalResponsibleName: string;
  legalResponsibleCpf: string;
  // Endereço
  cep: string;
  street: string;
  streetNumber: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  country: string;
  referencePoint: string;
  // lat/lng are read-only — auto-geocoded by the server, never entered manually
  latitude: string;
  longitude: string;
  // Contatos
  mainPhone: string;
  whatsappPhone: string;
  secondaryPhone: string;
  secondaryWhatsapp: string;
  mainEmail: string;
  financeEmail: string;
  supportEmail: string;
  // Responsáveis
  ownerName: string;
  ownerRole: string;
  ownerPhone: string;
  ownerWhatsapp: string;
  ownerEmail: string;
  managerName: string;
  managerRole: string;
  managerPhone: string;
  managerWhatsapp: string;
  managerEmail: string;
  // Operação
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  dineInEnabled: boolean;
  averagePreparationMinutes: string;
};

const EMPTY: Form = {
  name: "", description: "", slug: "", timezone: "America/Sao_Paulo",
  tradeName: "", legalName: "", cuisineType: "",
  cnpj: "", stateRegistration: "", municipalRegistration: "",
  taxRegime: "", legalResponsibleName: "", legalResponsibleCpf: "",
  cep: "", street: "", streetNumber: "", complement: "",
  neighborhood: "", city: "", state: "", country: "Brasil",
  referencePoint: "", latitude: "", longitude: "",
  mainPhone: "", whatsappPhone: "", secondaryPhone: "", secondaryWhatsapp: "",
  mainEmail: "", financeEmail: "", supportEmail: "",
  ownerName: "", ownerRole: "", ownerPhone: "", ownerWhatsapp: "", ownerEmail: "",
  managerName: "", managerRole: "", managerPhone: "", managerWhatsapp: "", managerEmail: "",
  deliveryEnabled: true, pickupEnabled: true, dineInEnabled: true,
  averagePreparationMinutes: "",
};

function fromApi(data: Record<string, unknown>): Form {
  const sp = (data.storeProfile as Record<string, unknown> | null) ?? {};
  const s = (v: unknown) => (v != null ? String(v) : "");
  const b = (v: unknown, def = true) => (typeof v === "boolean" ? v : def);
  return {
    name:        s(data.name),
    description: s(data.description),
    slug:        s(data.slug),
    timezone:    s(data.timezone) || "America/Sao_Paulo",
    tradeName:   s(sp.tradeName),
    legalName:   s(sp.legalName),
    cuisineType: s(sp.cuisineType),
    cnpj:                  s(sp.cnpj),
    stateRegistration:     s(sp.stateRegistration),
    municipalRegistration: s(sp.municipalRegistration),
    taxRegime:             s(sp.taxRegime),
    legalResponsibleName:  s(sp.legalResponsibleName),
    legalResponsibleCpf:   s(sp.legalResponsibleCpf),
    cep:            s(sp.cep),
    street:         s(sp.street),
    streetNumber:   s(sp.streetNumber),
    complement:     s(sp.complement),
    neighborhood:   s(sp.neighborhood),
    city:           s(sp.city),
    state:          s(sp.state),
    country:        s(sp.country) || "Brasil",
    referencePoint: s(sp.referencePoint),
    latitude:       sp.latitude  != null ? String(sp.latitude)  : "",
    longitude:      sp.longitude != null ? String(sp.longitude) : "",
    mainPhone:         s(sp.mainPhone),
    whatsappPhone:     s(sp.whatsappPhone),
    secondaryPhone:    s(sp.secondaryPhone),
    secondaryWhatsapp: s(sp.secondaryWhatsapp),
    mainEmail:         s(sp.mainEmail),
    financeEmail:      s(sp.financeEmail),
    supportEmail:      s(sp.supportEmail),
    ownerName:       s(sp.ownerName),
    ownerRole:       s(sp.ownerRole),
    ownerPhone:      s(sp.ownerPhone),
    ownerWhatsapp:   s(sp.ownerWhatsapp),
    ownerEmail:      s(sp.ownerEmail),
    managerName:     s(sp.managerName),
    managerRole:     s(sp.managerRole),
    managerPhone:    s(sp.managerPhone),
    managerWhatsapp: s(sp.managerWhatsapp),
    managerEmail:    s(sp.managerEmail),
    deliveryEnabled: b(sp.deliveryEnabled, true),
    pickupEnabled:   b(sp.pickupEnabled,   true),
    dineInEnabled:   b(sp.dineInEnabled,   true),
    averagePreparationMinutes: sp.averagePreparationMinutes != null
      ? String(sp.averagePreparationMinutes) : "",
  };
}

function toPayload(f: Form) {
  const n = (v: string) => v.trim() || null;
  const num = (v: string) => { const p = parseFloat(v); return isNaN(p) ? null : p; };
  const intN = (v: string) => { const p = parseInt(v); return isNaN(p) ? null : p; };
  return {
    name: f.name, description: n(f.description), timezone: n(f.timezone),
    tradeName: n(f.tradeName), legalName: n(f.legalName), cuisineType: n(f.cuisineType),
    cnpj: n(f.cnpj), stateRegistration: n(f.stateRegistration),
    municipalRegistration: n(f.municipalRegistration), taxRegime: n(f.taxRegime),
    legalResponsibleName: n(f.legalResponsibleName), legalResponsibleCpf: n(f.legalResponsibleCpf),
    cep: n(f.cep), street: n(f.street), streetNumber: n(f.streetNumber),
    complement: n(f.complement), neighborhood: n(f.neighborhood), city: n(f.city),
    state: n(f.state), country: n(f.country), referencePoint: n(f.referencePoint),
    // lat/lng intentionally omitted — server auto-geocodes from address
    mainPhone: n(f.mainPhone), whatsappPhone: n(f.whatsappPhone),
    secondaryPhone: n(f.secondaryPhone), secondaryWhatsapp: n(f.secondaryWhatsapp),
    mainEmail: n(f.mainEmail), financeEmail: n(f.financeEmail), supportEmail: n(f.supportEmail),
    ownerName: n(f.ownerName), ownerRole: n(f.ownerRole),
    ownerPhone: n(f.ownerPhone), ownerWhatsapp: n(f.ownerWhatsapp), ownerEmail: n(f.ownerEmail),
    managerName: n(f.managerName), managerRole: n(f.managerRole),
    managerPhone: n(f.managerPhone), managerWhatsapp: n(f.managerWhatsapp), managerEmail: n(f.managerEmail),
    deliveryEnabled: f.deliveryEnabled,
    pickupEnabled:   f.pickupEnabled,
    dineInEnabled:   f.dineInEnabled,
    averagePreparationMinutes: intN(f.averagePreparationMinutes),
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function StorePage() {
  const [form,    setForm]    = useState<Form>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  // Geocode status — updated after save or manual retry
  const [geocodeStatus,  setGeocodeStatus]  = useState<"ok" | "failed" | "skipped" | null>(null);
  const [geocodeLoading, setGeocodeLoading] = useState(false);

  // CEP lookup state
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError,   setCepError]   = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/settings/store").then(({ ok, data }) => {
      if (ok) setForm(fromApi(data));
      setLoading(false);
    });
  }, []);

  function set<K extends keyof Form>(key: K) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  function setVal<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const lookupCep = useCallback(async () => {
    const digits = form.cep.replace(/\D/g, "");
    if (digits.length !== 8) { setCepError("Informe um CEP válido (8 dígitos)."); return; }
    setCepLoading(true);
    setCepError(null);
    try {
      const res  = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json() as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
      if (!res.ok || data.erro) { setCepError("CEP não encontrado."); return; }
      const formatted = `${digits.slice(0, 5)}-${digits.slice(5)}`;
      setForm((f) => ({
        ...f,
        cep:          formatted,
        street:       data.logradouro ?? f.street,
        neighborhood: data.bairro     ?? f.neighborhood,
        city:         data.localidade ?? f.city,
        state:        data.uf         ?? f.state,
      }));
    } catch {
      setCepError("Não foi possível buscar o CEP agora. Preencha o endereço manualmente.");
    } finally {
      setCepLoading(false);
    }
  }, [form.cep]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSuccess(null);
    setError(null);
    const { ok: isOk, data } = await apiFetch("/api/settings/store", "PUT", toPayload(form));
    if (isOk) {
      const gs = (data?.geocodeStatus ?? null) as "ok" | "failed" | "skipped" | null;
      setGeocodeStatus(gs);
      // Refresh lat/lng in form from server response
      const sp = data?.storeProfile as Record<string, unknown> | null | undefined;
      if (sp) {
        setForm((f) => ({
          ...f,
          latitude:  sp.latitude  != null ? String(sp.latitude)  : "",
          longitude: sp.longitude != null ? String(sp.longitude) : "",
        }));
      }
      if (gs === "failed") {
        setSuccess("Dados salvos. Endereço salvo, mas não conseguimos calcular a localização automaticamente.");
      } else {
        setSuccess("Dados da loja salvos com sucesso.");
      }
    } else {
      setError(data?.error ?? "Erro ao salvar.");
    }
    setSaving(false);
  }

  async function handleRecalculateLocation() {
    setGeocodeLoading(true);
    setGeocodeStatus(null);
    const { ok: isOk, data } = await apiFetch("/api/settings/store/geocode", "POST", {});
    if (isOk) {
      setGeocodeStatus(data?.success ? "ok" : "failed");
      if (data?.success) {
        setForm((f) => ({
          ...f,
          latitude:  data.lat  != null ? String(data.lat)  : f.latitude,
          longitude: data.lng  != null ? String(data.lng)  : f.longitude,
        }));
      }
    } else {
      setGeocodeStatus("failed");
    }
    setGeocodeLoading(false);
  }

  if (loading) return <p className="py-8 text-sm text-gray-400">Carregando…</p>;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Feedback success={success} error={error} onDismiss={() => setError(null)} />

      {/* ══ SECTION 1 — Dados da loja ════════════════════════════ */}
      <PageCard>
        <SectionHeading
          title="Dados da loja"
          subtitle="Identificação pública e comercial do estabelecimento."
        />
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nome público do restaurante *">
              <input className={INPUT} value={form.name} onChange={set("name")} required maxLength={120}
                placeholder="Ex: Pizzaria Bella Napoli" />
            </Field>
            <Field label="Nome fantasia">
              <input className={INPUT} value={form.tradeName} onChange={set("tradeName")} maxLength={120}
                placeholder="Nome fantasia" />
            </Field>
          </div>
          <Field label="Razão social">
            <input className={INPUT} value={form.legalName} onChange={set("legalName")} maxLength={200}
              placeholder="Ex: Bella Napoli Restaurante LTDA" />
          </Field>
          <Field label="Descrição pública" hint="Aparece no cardápio web e QR.">
            <textarea className={INPUT + " resize-none"} rows={3}
              value={form.description} onChange={set("description")} maxLength={1000}
              placeholder="Breve descrição do restaurante…" />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Tipo de cozinha / segmento">
              <input className={INPUT} value={form.cuisineType} onChange={set("cuisineType")} maxLength={100}
                placeholder="Ex: Pizzaria, Japonesa, Hamburguer…" />
            </Field>
            <Field label="Slug (URL pública)" hint="Identificador único no link do cardápio.">
              <input className={INPUT} value={form.slug} readOnly
                disabled tabIndex={-1}
                style={{ backgroundColor: "#f9fafb", cursor: "default" }} />
            </Field>
          </div>
        </div>
      </PageCard>

      {/* ══ SECTION 2 — Dados fiscais ═════════════════════════════ */}
      <PageCard>
        <SectionHeading
          title="Dados fiscais"
          subtitle="Informações de uso interno. Não exibidas publicamente."
        />
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="CNPJ">
              <input className={INPUT} value={form.cnpj} onChange={set("cnpj")} maxLength={20}
                placeholder="00.000.000/0000-00" />
            </Field>
            <Field label="Regime tributário">
              <input className={INPUT} value={form.taxRegime} onChange={set("taxRegime")} maxLength={100}
                placeholder="Ex: Simples Nacional" />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Inscrição estadual">
              <input className={INPUT} value={form.stateRegistration} onChange={set("stateRegistration")} maxLength={60}
                placeholder="Inscrição estadual" />
            </Field>
            <Field label="Inscrição municipal">
              <input className={INPUT} value={form.municipalRegistration} onChange={set("municipalRegistration")} maxLength={60}
                placeholder="Inscrição municipal" />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nome do responsável legal">
              <input className={INPUT} value={form.legalResponsibleName} onChange={set("legalResponsibleName")} maxLength={120}
                placeholder="Nome completo" />
            </Field>
            <Field label="CPF do responsável legal">
              <input className={INPUT} value={form.legalResponsibleCpf} onChange={set("legalResponsibleCpf")} maxLength={20}
                placeholder="000.000.000-00" />
            </Field>
          </div>
        </div>
      </PageCard>

      {/* ══ SECTION 3 — Endereço da loja ══════════════════════════ */}
      <PageCard>
        <SectionHeading
          title="Endereço da loja"
          subtitle="Endereço físico do estabelecimento."
        />
        <div className="space-y-4">
          {/* CEP row */}
          <div className="flex items-end gap-3">
            <div className="flex-1 max-w-[180px]">
              <Field label="CEP *">
                <input
                  className={INPUT}
                  value={form.cep}
                  onChange={(e) => { setVal("cep", e.target.value); setCepError(null); }}
                  placeholder="00000-000"
                  maxLength={10}
                />
              </Field>
            </div>
            <button
              type="button"
              onClick={lookupCep}
              disabled={cepLoading}
              className="mb-[1px] rounded-xl border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50 transition"
            >
              {cepLoading ? "Buscando…" : "Buscar CEP"}
            </button>
          </div>
          {cepError && <p className="text-xs text-red-500">{cepError}</p>}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Field label="Logradouro / Rua *">
                <input className={INPUT} value={form.street} onChange={set("street")} maxLength={200}
                  placeholder="Rua, Avenida, Alameda…" />
              </Field>
            </div>
            <Field label="Número *">
              <input className={INPUT} value={form.streetNumber} onChange={set("streetNumber")} maxLength={20}
                placeholder="123" />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Complemento">
              <input className={INPUT} value={form.complement} onChange={set("complement")} maxLength={100}
                placeholder="Sala, Andar, Loja…" />
            </Field>
            <Field label="Bairro *">
              <input className={INPUT} value={form.neighborhood} onChange={set("neighborhood")} maxLength={100}
                placeholder="Nome do bairro" />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Field label="Cidade *">
                <input className={INPUT} value={form.city} onChange={set("city")} maxLength={100}
                  placeholder="Cidade" />
              </Field>
            </div>
            <Field label="Estado / UF *">
              <input className={INPUT} value={form.state} onChange={set("state")} maxLength={2}
                placeholder="SP" />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="País">
              <input className={INPUT} value={form.country} onChange={set("country")} maxLength={60}
                placeholder="Brasil" />
            </Field>
            <Field label="Ponto de referência">
              <input className={INPUT} value={form.referencePoint} onChange={set("referencePoint")} maxLength={200}
                placeholder="Próximo ao…" />
            </Field>
          </div>

          {/* Geocode status — auto-managed by Foocci, not manually entered */}
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-700">Localização da loja</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {form.latitude && form.longitude
                    ? "Calculada automaticamente com base no endereço."
                    : "Será calculada automaticamente ao salvar o endereço."}
                </p>
                {geocodeStatus === "failed" && (
                  <p className="mt-1 text-xs font-medium text-amber-700">
                    Não foi possível calcular a localização. Verifique o endereço e tente novamente.
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {form.latitude && form.longitude ? (
                  <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                    Localização calculada ✓
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                    Localização pendente
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleRecalculateLocation}
                  disabled={geocodeLoading}
                  className="rounded-xl border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50 transition"
                >
                  {geocodeLoading ? "Calculando…" : "Recalcular localização"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </PageCard>

      {/* ══ SECTION 4 — Contatos da loja ══════════════════════════ */}
      <PageCard>
        <SectionHeading
          title="Contatos da loja"
          subtitle="Canais de contato públicos e internos."
        />
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Telefone principal">
              <input className={INPUT} type="tel" value={form.mainPhone} onChange={set("mainPhone")} maxLength={30}
                placeholder="(11) 3000-0000" />
            </Field>
            <Field label="WhatsApp principal" hint="Usado pelo ícone de WhatsApp no cardápio público.">
              <input className={INPUT} type="tel" value={form.whatsappPhone} onChange={set("whatsappPhone")} maxLength={30}
                placeholder="(11) 99999-9999" />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Telefone secundário">
              <input className={INPUT} type="tel" value={form.secondaryPhone} onChange={set("secondaryPhone")} maxLength={30}
                placeholder="(11) 3000-0001" />
            </Field>
            <Field label="WhatsApp secundário">
              <input className={INPUT} type="tel" value={form.secondaryWhatsapp} onChange={set("secondaryWhatsapp")} maxLength={30}
                placeholder="(11) 98888-8888" />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="E-mail principal">
              <input className={INPUT} type="email" value={form.mainEmail} onChange={set("mainEmail")} maxLength={120}
                placeholder="contato@restaurante.com" />
            </Field>
            <Field label="E-mail financeiro">
              <input className={INPUT} type="email" value={form.financeEmail} onChange={set("financeEmail")} maxLength={120}
                placeholder="financeiro@restaurante.com" />
            </Field>
            <Field label="E-mail atendimento">
              <input className={INPUT} type="email" value={form.supportEmail} onChange={set("supportEmail")} maxLength={120}
                placeholder="atendimento@restaurante.com" />
            </Field>
          </div>
        </div>
      </PageCard>

      {/* ══ SECTION 5 — Responsáveis ══════════════════════════════ */}
      <PageCard>
        <SectionHeading
          title="Responsáveis"
          subtitle="Dados internos de contato dos responsáveis pelo estabelecimento."
        />
        <div className="space-y-5">
          {/* Proprietário */}
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Proprietário / Responsável principal</p>
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Nome">
                  <input className={INPUT} value={form.ownerName} onChange={set("ownerName")} maxLength={120}
                    placeholder="Nome completo" />
                </Field>
                <Field label="Cargo">
                  <input className={INPUT} value={form.ownerRole} onChange={set("ownerRole")} maxLength={80}
                    placeholder="Ex: Proprietário, Sócio-gerente" />
                </Field>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="Telefone">
                  <input className={INPUT} type="tel" value={form.ownerPhone} onChange={set("ownerPhone")} maxLength={30}
                    placeholder="(11) 99999-9999" />
                </Field>
                <Field label="WhatsApp">
                  <input className={INPUT} type="tel" value={form.ownerWhatsapp} onChange={set("ownerWhatsapp")} maxLength={30}
                    placeholder="(11) 99999-9999" />
                </Field>
                <Field label="E-mail">
                  <input className={INPUT} type="email" value={form.ownerEmail} onChange={set("ownerEmail")} maxLength={120}
                    placeholder="dono@email.com" />
                </Field>
              </div>
            </div>
          </div>

          {/* Gerente */}
          <div className="border-t border-gray-100 pt-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Gerente / Responsável operacional</p>
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Nome">
                  <input className={INPUT} value={form.managerName} onChange={set("managerName")} maxLength={120}
                    placeholder="Nome completo" />
                </Field>
                <Field label="Cargo">
                  <input className={INPUT} value={form.managerRole} onChange={set("managerRole")} maxLength={80}
                    placeholder="Ex: Gerente, Supervisor" />
                </Field>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="Telefone">
                  <input className={INPUT} type="tel" value={form.managerPhone} onChange={set("managerPhone")} maxLength={30}
                    placeholder="(11) 99999-9999" />
                </Field>
                <Field label="WhatsApp">
                  <input className={INPUT} type="tel" value={form.managerWhatsapp} onChange={set("managerWhatsapp")} maxLength={30}
                    placeholder="(11) 99999-9999" />
                </Field>
                <Field label="E-mail">
                  <input className={INPUT} type="email" value={form.managerEmail} onChange={set("managerEmail")} maxLength={120}
                    placeholder="gerente@email.com" />
                </Field>
              </div>
            </div>
          </div>
        </div>
      </PageCard>

      {/* ══ SECTION 6 — Operação ══════════════════════════════════ */}
      <PageCard>
        <SectionHeading
          title="Operação"
          subtitle="Modalidades de atendimento e configurações operacionais."
        />
        <div className="space-y-5">
          {/* Modalidades */}
          <div className="space-y-3">
            <Toggle
              label="Delivery ativo"
              desc="Habilita pedidos de entrega no cardápio público."
              checked={form.deliveryEnabled}
              onChange={(v) => setVal("deliveryEnabled", v)}
            />
            <Toggle
              label="Retirada ativa"
              desc="Habilita pedidos de retirada no cardápio público."
              checked={form.pickupEnabled}
              onChange={(v) => setVal("pickupEnabled", v)}
            />
            <Toggle
              label="Salão / QR ativo"
              desc="Habilita o cardápio de mesa (QR code)."
              checked={form.dineInEnabled}
              onChange={(v) => setVal("dineInEnabled", v)}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Tempo médio de preparo (min)" hint="Estimativa exibida ao cliente após o pedido.">
              <input className={INPUT} type="number" min="1" max="300"
                value={form.averagePreparationMinutes} onChange={set("averagePreparationMinutes")}
                placeholder="Ex: 30" />
            </Field>
            <Field label="Fuso horário">
              <select className={SELECT} value={form.timezone} onChange={set("timezone")}>
                <option value="America/Sao_Paulo">America/Sao_Paulo (BRT)</option>
                <option value="America/Manaus">America/Manaus (AMT)</option>
                <option value="America/Fortaleza">America/Fortaleza (BRT)</option>
                <option value="America/Belem">America/Belem (BRT)</option>
                <option value="America/Cuiaba">America/Cuiaba (AMT)</option>
                <option value="America/Porto_Velho">America/Porto_Velho (AMT)</option>
                <option value="America/Boa_Vista">America/Boa_Vista (AMT)</option>
                <option value="America/Rio_Branco">America/Rio_Branco (ACT)</option>
                <option value="America/Noronha">America/Noronha (FNT)</option>
              </select>
            </Field>
          </div>

          <p className="rounded-lg bg-gray-50 px-4 py-3 text-xs text-gray-500">
            💡 Taxas, zonas e horários de entrega são configurados em{" "}
            <a href="/settings/delivery" className="font-medium text-brand-600 hover:underline">Configurações › Entrega</a>.
            Horários de funcionamento em{" "}
            <a href="/settings/hours" className="font-medium text-brand-600 hover:underline">Configurações › Horários</a>.
          </p>
        </div>
      </PageCard>

      <SaveButton saving={saving} />
    </form>
  );
}
