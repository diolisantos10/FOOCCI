"use client";

/**
 * /settings — General restaurant configuration
 * Tabs: Loja · Entrega · Horários · Pagamento · Acesso · Políticas
 */

import { useState, useEffect, FormEvent } from "react";
import { DEFAULT_HOURS, type DayHoursInput } from "@/validators/settings";

// ── Tab definitions ────────────────────────────────────────────────────────────

const TABS = [
  { id: "loja",      label: "Loja"      },
  { id: "entrega",   label: "Entrega"   },
  { id: "horarios",  label: "Horários"  },
  { id: "pagamento", label: "Pagamento" },
  { id: "acesso",    label: "Acesso"    },
  { id: "politicas", label: "Políticas" },
] as const;

type TabId = (typeof TABS)[number]["id"];

// ── Shared helpers ─────────────────────────────────────────────────────────────

async function apiFetch(url: string, method = "GET", body?: object) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data: json?.data ?? json };
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

const INPUT =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500";

function Feedback({ success, error, onDismiss }: { success: string | null; error: string | null; onDismiss: () => void }) {
  if (success)
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
        {success}
      </div>
    );
  if (error)
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
        {error}
        <button type="button" className="ml-2 underline" onClick={onDismiss}>
          fechar
        </button>
      </div>
    );
  return null;
}

function SaveButton({ saving }: { saving: boolean }) {
  return (
    <div className="flex justify-end pt-2">
      <button
        type="submit"
        disabled={saving}
        className="rounded-lg bg-brand-600 px-6 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {saving ? "Salvando…" : "Salvar"}
      </button>
    </div>
  );
}

function Toggle({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <div className="relative mt-0.5 shrink-0">
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <div
          className={`h-5 w-9 rounded-full transition-colors ${checked ? "bg-brand-500" : "bg-gray-300"}`}
        />
        <div
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`}
        />
      </div>
      <div>
        <p className="text-sm font-medium text-gray-800">{label}</p>
        {desc && <p className="text-xs text-gray-500">{desc}</p>}
      </div>
    </label>
  );
}

// ── Tab 1: Loja ────────────────────────────────────────────────────────────────

function LojaTab() {
  const [form, setForm] = useState({ name: "", phone: "", address: "", description: "", logoUrl: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/settings/store").then(({ ok, data }) => {
      if (ok) setForm({ name: data.name ?? "", phone: data.phone ?? "", address: data.address ?? "", description: data.description ?? "", logoUrl: data.logoUrl ?? "" });
      setLoading(false);
    });
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setSuccess(null); setError(null);
    const { ok, data } = await apiFetch("/api/settings/store", "PUT", {
      ...form,
      phone:       form.phone       || null,
      address:     form.address     || null,
      description: form.description || null,
      logoUrl:     form.logoUrl     || null,
    });
    if (ok) setSuccess("Loja salva com sucesso.");
    else setError(data?.error ?? "Erro ao salvar.");
    setSaving(false);
  }

  if (loading) return <p className="text-sm text-gray-400 py-6">Carregando…</p>;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Feedback success={success} error={error} onDismiss={() => setError(null)} />

      <Field label="Nome do restaurante *">
        <input className={INPUT} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ex: Sushi Cazza" required maxLength={120} />
      </Field>

      <Field label="Descrição" hint="Aparece no cardápio e páginas públicas.">
        <textarea className={INPUT + " resize-none"} rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Breve descrição do seu restaurante…" maxLength={1000} />
      </Field>

      <Field label="Telefone">
        <input className={INPUT} type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="(11) 99999-9999" maxLength={30} />
      </Field>

      <Field label="Endereço">
        <input className={INPUT} value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="Rua, número, bairro, cidade" maxLength={300} />
      </Field>

      <Field label="Logo (URL da imagem)" hint="Cole a URL de uma imagem ou use /api/media/[id] de um upload anterior.">
        <input className={INPUT} type="url" value={form.logoUrl} onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value }))} placeholder="https://…" maxLength={500} />
        {form.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={form.logoUrl} alt="Logo" className="mt-2 h-16 w-16 rounded-full object-cover border border-gray-200" />
        )}
      </Field>

      <SaveButton saving={saving} />
    </form>
  );
}

// ── Tab 2: Entrega ─────────────────────────────────────────────────────────────

function EntregaTab() {
  const [form, setForm] = useState({ enabled: true, fee: "", estimatedMinutes: "", areaDescription: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/settings/delivery").then(({ ok, data }) => {
      if (ok) setForm({
        enabled:          data.enabled ?? true,
        fee:              data.fee     != null ? String(Number(data.fee)) : "",
        estimatedMinutes: data.estimatedMinutes != null ? String(data.estimatedMinutes) : "",
        areaDescription:  data.areaDescription ?? "",
      });
      setLoading(false);
    });
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setSuccess(null); setError(null);
    const { ok, data } = await apiFetch("/api/settings/delivery", "PUT", {
      enabled:          form.enabled,
      fee:              form.fee              ? Number(form.fee)              : null,
      estimatedMinutes: form.estimatedMinutes ? Number(form.estimatedMinutes) : null,
      areaDescription:  form.areaDescription  || null,
    });
    if (ok) setSuccess("Configuração de entrega salva.");
    else setError(data?.error ?? "Erro ao salvar.");
    setSaving(false);
  }

  if (loading) return <p className="text-sm text-gray-400 py-6">Carregando…</p>;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Feedback success={success} error={error} onDismiss={() => setError(null)} />

      <Toggle
        label="Delivery ativo"
        desc="Habilitar recebimento de pedidos para entrega."
        checked={form.enabled}
        onChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
      />

      {form.enabled && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Taxa de entrega (R$)" hint="Deixe em branco para grátis.">
              <input className={INPUT} type="number" step="0.01" min="0" value={form.fee} onChange={(e) => setForm((f) => ({ ...f, fee: e.target.value }))} placeholder="0,00" />
            </Field>
            <Field label="Tempo estimado (min)">
              <input className={INPUT} type="number" min="1" max="300" value={form.estimatedMinutes} onChange={(e) => setForm((f) => ({ ...f, estimatedMinutes: e.target.value }))} placeholder="30" />
            </Field>
          </div>

          <Field label="Área de entrega" hint="Descreva bairros, CEPs ou raio de cobertura.">
            <textarea className={INPUT + " resize-none"} rows={3} value={form.areaDescription} onChange={(e) => setForm((f) => ({ ...f, areaDescription: e.target.value }))} placeholder="Ex: Pinheiros, Vila Madalena, Bela Vista (raio de 5 km)" maxLength={500} />
          </Field>
        </>
      )}

      <SaveButton saving={saving} />
    </form>
  );
}

// ── Tab 3: Horários ────────────────────────────────────────────────────────────

const DAY_NAMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function HorariosTab() {
  const [hours, setHours] = useState<DayHoursInput[]>(DEFAULT_HOURS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/settings/hours").then(({ data }) => {
      if (Array.isArray(data) && data.length === 7) setHours(data as DayHoursInput[]);
      else if (Array.isArray(data) && data.length > 0) {
        // Merge returned records with defaults for any missing days
        const merged = DEFAULT_HOURS.map((def) => {
          const found = (data as DayHoursInput[]).find((d) => d.dayOfWeek === def.dayOfWeek);
          return found ?? def;
        });
        setHours(merged);
      }
      setLoading(false);
    });
  }, []);

  function updateDay(idx: number, patch: Partial<DayHoursInput>) {
    setHours((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setSuccess(null); setError(null);
    const { ok, data } = await apiFetch("/api/settings/hours", "PUT", hours);
    if (ok) setSuccess("Horários salvos com sucesso.");
    else setError(data?.error ?? "Erro ao salvar.");
    setSaving(false);
  }

  if (loading) return <p className="text-sm text-gray-400 py-6">Carregando…</p>;

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Feedback success={success} error={error} onDismiss={() => setError(null)} />

      <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white overflow-hidden">
        {hours.map((day, idx) => (
          <div key={day.dayOfWeek} className="flex items-center gap-3 px-4 py-3">
            {/* Day toggle */}
            <div className="w-28 shrink-0">
              <Toggle
                label={DAY_NAMES[day.dayOfWeek]!}
                checked={day.isOpen}
                onChange={(v) => updateDay(idx, { isOpen: v })}
              />
            </div>

            {/* Time inputs */}
            {day.isOpen ? (
              <div className="flex items-center gap-2 ml-auto">
                <input
                  type="time"
                  value={day.openTime}
                  onChange={(e) => updateDay(idx, { openTime: e.target.value })}
                  className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <span className="text-gray-400 text-sm">até</span>
                <input
                  type="time"
                  value={day.closeTime}
                  onChange={(e) => updateDay(idx, { closeTime: e.target.value })}
                  className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            ) : (
              <span className="ml-auto text-xs text-gray-400">Fechado</span>
            )}
          </div>
        ))}
      </div>

      <SaveButton saving={saving} />
    </form>
  );
}

// ── Tab 4: Pagamento ───────────────────────────────────────────────────────────

const PAYMENT_OPTIONS = [
  { key: "acceptPix",  label: "Pix",            desc: "Transferência instantânea via chave Pix", icon: "⚡" },
  { key: "acceptCash", label: "Dinheiro",        desc: "Pagamento em espécie na entrega",         icon: "💵" },
  { key: "acceptCard", label: "Cartão (maquina)", desc: "Crédito ou débito na entrega",           icon: "💳" },
  { key: "acceptLink", label: "Link de pagamento", desc: "Em breve — integração futura",          icon: "🔗" },
] as const;

type PaymentKey = (typeof PAYMENT_OPTIONS)[number]["key"];

function PagamentoTab() {
  const [form, setForm] = useState({ acceptPix: true, acceptCash: true, acceptCard: true, acceptLink: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/settings/payment").then(({ ok, data }) => {
      if (ok) setForm({ acceptPix: data.acceptPix ?? true, acceptCash: data.acceptCash ?? true, acceptCard: data.acceptCard ?? true, acceptLink: data.acceptLink ?? false });
      setLoading(false);
    });
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setSuccess(null); setError(null);
    const { ok, data } = await apiFetch("/api/settings/payment", "PUT", form);
    if (ok) setSuccess("Métodos de pagamento salvos.");
    else setError(data?.error ?? "Erro ao salvar.");
    setSaving(false);
  }

  if (loading) return <p className="text-sm text-gray-400 py-6">Carregando…</p>;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Feedback success={success} error={error} onDismiss={() => setError(null)} />

      <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white overflow-hidden">
        {PAYMENT_OPTIONS.map(({ key, label, desc, icon }) => (
          <div key={key} className="flex items-center gap-4 px-4 py-4">
            <span className="text-2xl">{icon}</span>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-800">{label}</p>
              <p className="text-xs text-gray-500">{desc}</p>
            </div>
            <Toggle
              label=""
              checked={form[key as PaymentKey]}
              onChange={(v) => setForm((f) => ({ ...f, [key]: v }))}
            />
          </div>
        ))}
      </div>

      <SaveButton saving={saving} />
    </form>
  );
}

// ── Tab 5: Acesso ──────────────────────────────────────────────────────────────

type UserRow = { id: string; name: string; email: string; role: string; isActive: boolean };

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Proprietário", MANAGER: "Gerente", STAFF: "Funcionário",
};

function AcessoTab() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "", role: "STAFF" });
  const [adding, setAdding] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/users").then(({ data }) => {
      if (Array.isArray(data)) setUsers(data);
      setLoading(false);
    });
  }, []);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setAdding(true); setError(null); setSuccess(null);
    const { ok, data } = await apiFetch("/api/users", "POST", newUser);
    if (ok) {
      setUsers((prev) => [...prev, data]);
      setNewUser({ name: "", email: "", password: "", role: "STAFF" });
      setShowForm(false);
      setSuccess("Usuário criado com sucesso.");
    } else {
      setError(data?.error ?? "Erro ao criar usuário.");
    }
    setAdding(false);
  }

  if (loading) return <p className="text-sm text-gray-400 py-6">Carregando…</p>;

  return (
    <div className="space-y-5">
      <Feedback success={success} error={error} onDismiss={() => setError(null)} />

      {/* User list */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {users.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Nenhum usuário cadastrado.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Nome</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">E-mail</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Perfil</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.map((u) => (
                <tr key={u.id} className={!u.isActive ? "opacity-50" : ""}>
                  <td className="px-4 py-3 font-medium text-gray-900">{u.name}</td>
                  <td className="px-4 py-3 text-gray-600">{u.email}</td>
                  <td className="px-4 py-3 text-gray-600">{ROLE_LABELS[u.role] ?? u.role}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${u.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {u.isActive ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add user */}
      {showForm ? (
        <form onSubmit={handleAdd} className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">Novo usuário</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nome">
              <input className={INPUT} value={newUser.name} onChange={(e) => setNewUser((f) => ({ ...f, name: e.target.value }))} required maxLength={100} />
            </Field>
            <Field label="E-mail">
              <input className={INPUT} type="email" value={newUser.email} onChange={(e) => setNewUser((f) => ({ ...f, email: e.target.value }))} required />
            </Field>
            <Field label="Senha" hint="Mínimo 6 caracteres.">
              <input className={INPUT} type="password" value={newUser.password} onChange={(e) => setNewUser((f) => ({ ...f, password: e.target.value }))} required minLength={6} />
            </Field>
            <Field label="Perfil">
              <select className={INPUT} value={newUser.role} onChange={(e) => setNewUser((f) => ({ ...f, role: e.target.value }))}>
                <option value="STAFF">Funcionário</option>
                <option value="MANAGER">Gerente</option>
                <option value="OWNER">Proprietário</option>
              </select>
            </Field>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={adding} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">{adding ? "Criando…" : "Criar usuário"}</button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setShowForm(true)} className="rounded-lg border border-dashed border-brand-300 bg-brand-50 px-4 py-2 text-sm font-medium text-brand-600 hover:bg-brand-100">
          + Adicionar usuário
        </button>
      )}
    </div>
  );
}

// ── Tab 6: Políticas ───────────────────────────────────────────────────────────

const POLICY_FIELDS = [
  { key: "termsOfUse",         label: "Termos de uso",          placeholder: "Descreva os termos de uso do seu restaurante…" },
  { key: "privacyPolicy",      label: "Política de privacidade", placeholder: "Como tratamos seus dados pessoais…" },
  { key: "cancellationPolicy", label: "Política de cancelamento", placeholder: "Como funciona o cancelamento de pedidos…" },
] as const;

type PolicyKey = (typeof POLICY_FIELDS)[number]["key"];

function PoliticasTab() {
  const [form, setForm] = useState({ termsOfUse: "", privacyPolicy: "", cancellationPolicy: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/settings/policies").then(({ ok, data }) => {
      if (ok) setForm({ termsOfUse: data.termsOfUse ?? "", privacyPolicy: data.privacyPolicy ?? "", cancellationPolicy: data.cancellationPolicy ?? "" });
      setLoading(false);
    });
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setSuccess(null); setError(null);
    const { ok, data } = await apiFetch("/api/settings/policies", "PUT", {
      termsOfUse:         form.termsOfUse         || null,
      privacyPolicy:      form.privacyPolicy       || null,
      cancellationPolicy: form.cancellationPolicy  || null,
    });
    if (ok) setSuccess("Políticas salvas com sucesso.");
    else setError(data?.error ?? "Erro ao salvar.");
    setSaving(false);
  }

  if (loading) return <p className="text-sm text-gray-400 py-6">Carregando…</p>;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Feedback success={success} error={error} onDismiss={() => setError(null)} />
      {POLICY_FIELDS.map(({ key, label, placeholder }) => (
        <Field key={key} label={label}>
          <textarea
            className={INPUT + " resize-y"}
            rows={5}
            maxLength={5000}
            value={form[key as PolicyKey]}
            onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
            placeholder={placeholder}
          />
        </Field>
      ))}
      <SaveButton saving={saving} />
    </form>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [tab, setTab] = useState<TabId>("loja");

  return (
    <div className="flex flex-col min-h-full">
      {/* Page header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-lg font-semibold text-gray-900">Configurações</h1>
      </div>

      {/* Tab bar */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <nav className="flex overflow-x-auto px-4 sm:px-6 scrollbar-hide">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`shrink-0 border-b-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
                tab === t.id
                  ? "border-brand-500 text-brand-600"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="flex-1 p-6 max-w-2xl w-full">
        {tab === "loja"      && <LojaTab />}
        {tab === "entrega"   && <EntregaTab />}
        {tab === "horarios"  && <HorariosTab />}
        {tab === "pagamento" && <PagamentoTab />}
        {tab === "acesso"    && <AcessoTab />}
        {tab === "politicas" && <PoliticasTab />}
      </div>
    </div>
  );
}
