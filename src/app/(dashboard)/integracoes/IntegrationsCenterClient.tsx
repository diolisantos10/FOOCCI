"use client";

import { useState, useEffect, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type IntegrationStatus = "unconfigured" | "active" | "error";

interface IntegrationView {
  provider:     string;
  status:       IntegrationStatus;
  isActive:     boolean;
  lastTestedAt: string | null;
  lastError:    string | null;
  fields:       Record<string, string | null>;
}

interface TestResult {
  success: boolean;
  message: string;
}

type Provider = "whatsapp" | "stone" | "mercadopago" | "tipos" | "openai";

// ── Integration metadata (display config) ─────────────────────────────────────

const INTEGRATIONS: {
  provider:    Provider;
  name:        string;
  description: string;
  icon:        string;
  color:       string;
}[] = [
  {
    provider:    "whatsapp",
    name:        "WhatsApp",
    description: "Atendimento automático e manual via WhatsApp Business com Evolution API.",
    icon:        "💬",
    color:       "bg-green-500",
  },
  {
    provider:    "stone",
    name:        "Stone",
    description: "Links de pagamento, recebimento via PIX e cartão de crédito/débito.",
    icon:        "💳",
    color:       "bg-[#00C389]",
  },
  {
    provider:    "mercadopago",
    name:        "Mercado Pago",
    description: "Checkout transparente, links de pagamento e cobranças via PIX.",
    icon:        "🔵",
    color:       "bg-blue-500",
  },
  {
    provider:    "tipos",
    name:        "Tipos",
    description: "Sistema de gestão de restaurante (ERP) — sincronização de cardápio e pedidos.",
    icon:        "🍽️",
    color:       "bg-orange-500",
  },
  {
    provider:    "openai",
    name:        "OpenAI",
    description: "Motor de IA dos agentes Foocci — GPT-4o para atendimento e vendas automáticas.",
    icon:        "🤖",
    color:       "bg-[#10a37f]",
  },
];

// ── API helper ────────────────────────────────────────────────────────────────

async function apiFetch(url: string, method = "GET", body?: object) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data: json?.data ?? json };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: IntegrationStatus }) {
  if (status === "active")
    return (
      <span className="flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
        Ativo
      </span>
    );
  if (status === "error")
    return (
      <span className="flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-600">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        Erro
      </span>
    );
  return (
    <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-500">
      <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
      Não configurado
    </span>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}

// ── Card ──────────────────────────────────────────────────────────────────────

function IntegrationCard({
  meta,
  view,
  selected,
  onClick,
}: {
  meta:     typeof INTEGRATIONS[0];
  view:     IntegrationView | null;
  selected: boolean;
  onClick:  () => void;
}) {
  const status: IntegrationStatus = view?.status ?? "unconfigured";
  const lastTested = formatDate(view?.lastTestedAt ?? null);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-2xl border bg-white p-5 shadow-sm transition-all hover:shadow-md ${
        selected ? "border-indigo-400 ring-2 ring-indigo-100" : "border-gray-100"
      }`}
    >
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl text-white shadow-sm ${meta.color}`}>
          {meta.icon}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">{meta.name}</span>
            <StatusBadge status={status} />
          </div>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">{meta.description}</p>
          {lastTested && (
            <p className="mt-1.5 text-[10px] text-gray-400">Testado em {lastTested}</p>
          )}
          {view?.lastError && status === "error" && (
            <p className="mt-1 truncate text-[10px] text-red-500">{view.lastError}</p>
          )}
        </div>

        {/* Arrow */}
        <span className="shrink-0 text-gray-300">›</span>
      </div>
    </button>
  );
}

// ── Detail panel — form fields per provider ───────────────────────────────────

function SecretField({
  label, hint, name, placeholder, value, onChange,
}: {
  label: string; hint?: string; name: string; placeholder: string;
  value: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">{label}</label>
      <input
        type="password"
        name={name}
        placeholder={placeholder}
        value={value}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition"
      />
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

function TextField({
  label, hint, name, placeholder, value, onChange, type = "text",
}: {
  label: string; hint?: string; name: string; placeholder: string;
  value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">{label}</label>
      <input
        type={type}
        name={name}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition"
      />
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

function SelectField({
  label, hint, name, value, options, onChange,
}: {
  label: string; hint?: string; name: string; value: string;
  options: { value: string; label: string }[]; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">{label}</label>
      <select
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

// ── Per-provider config forms ─────────────────────────────────────────────────

function WhatsAppForm({
  view, saving, onSave,
}: {
  view: IntegrationView | null;
  saving: boolean;
  onSave: (data: Record<string, string>) => void;
}) {
  const f = view?.fields ?? {};
  const [instanceName, setInstanceName] = useState(f.instanceName ?? "");
  const [baseUrl, setBaseUrl]           = useState(f.baseUrl ?? "");
  const [apiKey, setApiKey]             = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");

  useEffect(() => {
    setInstanceName(f.instanceName ?? "");
    setBaseUrl(f.baseUrl ?? "");
    setApiKey("");
    setWebhookSecret("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.provider]);

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSave({ instanceName, baseUrl, apiKey, webhookSecret }); }}
      className="space-y-4"
    >
      <TextField
        label="Nome da instância"
        name="instanceName"
        placeholder="meu-restaurante"
        hint="Identificador único da sua instância no Evolution."
        value={instanceName}
        onChange={setInstanceName}
      />
      <TextField
        label="URL do servidor Evolution"
        name="baseUrl"
        placeholder="https://evo.seuservidor.com"
        type="url"
        value={baseUrl}
        onChange={setBaseUrl}
      />
      <SecretField
        label="API Key"
        name="apiKey"
        placeholder={f.apiKeyPreview ? `Atual: ${f.apiKeyPreview} — deixe em branco para manter` : "Cole sua API Key"}
        hint="Deixe em branco para manter a chave atual."
        value={apiKey}
        onChange={setApiKey}
      />
      <SecretField
        label="Webhook Secret"
        name="webhookSecret"
        placeholder={f.webhookSecretPreview ? `Atual: ${f.webhookSecretPreview} — deixe em branco para manter` : "Cole o Webhook Secret"}
        hint="Usado para validar mensagens recebidas."
        value={webhookSecret}
        onChange={setWebhookSecret}
      />
      <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
        <p className="text-xs font-medium text-gray-700">URL do Webhook para configurar na Evolution:</p>
        <p className="mt-1 break-all font-mono text-xs text-gray-500">
          {window.location.origin}/api/webhooks/evolution
        </p>
      </div>
      <div className="flex justify-end pt-1">
        <button type="submit" disabled={saving}
          className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition">
          {saving ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </form>
  );
}

function StoneForm({
  view, saving, onSave,
}: {
  view: IntegrationView | null;
  saving: boolean;
  onSave: (data: Record<string, string>) => void;
}) {
  const f = view?.fields ?? {};
  const [environment, setEnvironment] = useState(f.environment ?? "sandbox");
  const [clientId, setClientId]       = useState(f.clientId ?? "");
  const [clientSecret, setClientSecret] = useState("");

  useEffect(() => {
    setEnvironment(f.environment ?? "sandbox");
    setClientId(f.clientId ?? "");
    setClientSecret("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.provider]);

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSave({ environment, clientId, clientSecret }); }}
      className="space-y-4"
    >
      <SelectField
        label="Ambiente"
        name="environment"
        value={environment}
        options={[
          { value: "sandbox", label: "Sandbox (teste)" },
          { value: "production", label: "Produção" },
        ]}
        onChange={setEnvironment}
      />
      <TextField
        label="Client ID"
        name="clientId"
        placeholder="seu-client-id"
        value={clientId}
        onChange={setClientId}
      />
      <SecretField
        label="Client Secret"
        name="clientSecret"
        placeholder={f.clientSecretPreview ? `Atual: ${f.clientSecretPreview} — deixe em branco para manter` : "Cole o Client Secret"}
        hint="Deixe em branco para manter o secret atual."
        value={clientSecret}
        onChange={setClientSecret}
      />
      <div className="flex justify-end pt-1">
        <button type="submit" disabled={saving}
          className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition">
          {saving ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </form>
  );
}

function MercadoPagoForm({
  view, saving, onSave,
}: {
  view: IntegrationView | null;
  saving: boolean;
  onSave: (data: Record<string, string>) => void;
}) {
  const f = view?.fields ?? {};
  const [environment, setEnvironment] = useState(f.environment ?? "test");
  const [accessToken, setAccessToken] = useState("");

  useEffect(() => {
    setEnvironment(f.environment ?? "test");
    setAccessToken("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.provider]);

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSave({ environment, accessToken }); }}
      className="space-y-4"
    >
      <SelectField
        label="Ambiente"
        name="environment"
        value={environment}
        options={[
          { value: "test", label: "Teste" },
          { value: "production", label: "Produção" },
        ]}
        onChange={setEnvironment}
      />
      <SecretField
        label="Access Token"
        name="accessToken"
        placeholder={f.accessTokenPreview ? `Atual: ${f.accessTokenPreview} — deixe em branco para manter` : "APP_USR-..."}
        hint="Encontre no painel do Mercado Pago → Credenciais → Access Token."
        value={accessToken}
        onChange={setAccessToken}
      />
      <div className="flex justify-end pt-1">
        <button type="submit" disabled={saving}
          className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition">
          {saving ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </form>
  );
}

function TiposForm({
  view, saving, onSave,
}: {
  view: IntegrationView | null;
  saving: boolean;
  onSave: (data: Record<string, string>) => void;
}) {
  const f = view?.fields ?? {};
  const [baseUrl, setBaseUrl]     = useState(f.baseUrl ?? "");
  const [apiKey, setApiKey]       = useState("");
  const [accountId, setAccountId] = useState(f.accountId ?? "");

  useEffect(() => {
    setBaseUrl(f.baseUrl ?? "");
    setApiKey("");
    setAccountId(f.accountId ?? "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.provider]);

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSave({ baseUrl, apiKey, accountId }); }}
      className="space-y-4"
    >
      <TextField
        label="URL base da API"
        name="baseUrl"
        placeholder="https://api.tipos.com.br"
        type="url"
        hint="URL fornecida pelo suporte Tipos."
        value={baseUrl}
        onChange={setBaseUrl}
      />
      <TextField
        label="ID da conta / restaurante"
        name="accountId"
        placeholder="12345"
        hint="Opcional. Identificador do seu restaurante na Tipos."
        value={accountId}
        onChange={setAccountId}
      />
      <SecretField
        label="API Key"
        name="apiKey"
        placeholder={f.apiKeyPreview ? `Atual: ${f.apiKeyPreview} — deixe em branco para manter` : "Cole sua API Key"}
        hint="Chave de acesso fornecida pela Tipos."
        value={apiKey}
        onChange={setApiKey}
      />
      <div className="flex justify-end pt-1">
        <button type="submit" disabled={saving}
          className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition">
          {saving ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </form>
  );
}

function OpenAIForm({
  view, saving, onSave,
}: {
  view:    IntegrationView | null;
  saving:  boolean;
  onSave:  (data: Record<string, string>) => void;
}) {
  const f = view?.fields ?? {};
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    setApiKey("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.provider]);

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSave({ apiKey }); }}
      className="space-y-4"
    >
      <SecretField
        label="API Key"
        name="apiKey"
        placeholder={f.apiKeyPreview ? `Atual: ${f.apiKeyPreview} — deixe em branco para manter` : "sk-..."}
        hint="Encontre em platform.openai.com → API Keys. Deixe em branco para manter a chave atual."
        value={apiKey}
        onChange={setApiKey}
      />
      <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
        <p className="text-xs font-medium text-blue-700">Seleção de modelo</p>
        <p className="mt-1 text-xs text-blue-600">
          O modelo de IA (GPT-4o, GPT-4o mini, etc.) é configurado na página{" "}
          <a href="/agente-ia" className="font-semibold underline">Agente IA</a>.
        </p>
      </div>
      <div className="flex justify-end pt-1">
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition"
        >
          {saving ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </form>
  );
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function DetailPanel({
  provider,
  view,
  userRole,
  onClose,
  onRefresh,
}: {
  provider:  Provider;
  view:      IntegrationView | null;
  userRole:  string;
  onClose:   () => void;
  onRefresh: (p: Provider) => void;
}) {
  const meta = INTEGRATIONS.find((i) => i.provider === provider)!;
  const isOwner = userRole === "OWNER";

  const [saving,   setSaving]   = useState(false);
  const [testing,  setTesting]  = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const clearFeedback = () => { setFeedback(null); setTestResult(null); };

  const handleSave = async (data: Record<string, string>) => {
    setSaving(true);
    clearFeedback();
    const { ok, data: res } = await apiFetch(
      `/api/integrations/${provider}`,
      "PUT",
      data
    );
    setSaving(false);
    if (ok) {
      setFeedback({ type: "ok", msg: "Configuração salva com sucesso." });
      onRefresh(provider);
    } else {
      setFeedback({ type: "err", msg: (res as { error?: string })?.error ?? "Erro ao salvar." });
    }
  };

  const handleTest = async () => {
    setTesting(true);
    clearFeedback();
    const { data } = await apiFetch(`/api/integrations/${provider}/test`, "POST");
    setTesting(false);
    const result = data as TestResult;
    setTestResult(result);
    onRefresh(provider);
  };

  const handleDisconnect = async () => {
    if (!confirm(`Desconectar ${meta.name}? As credenciais serão desativadas.`)) return;
    clearFeedback();
    const { ok } = await apiFetch(`/api/integrations/${provider}`, "DELETE");
    if (ok) {
      setFeedback({ type: "ok", msg: `${meta.name} desconectado.` });
      onRefresh(provider);
    } else {
      setFeedback({ type: "err", msg: "Erro ao desconectar." });
    }
  };

  const lastTested = formatDate(view?.lastTestedAt ?? null);
  const status = view?.status ?? "unconfigured";

  return (
    <>
      {/* Mobile overlay */}
      <div
        className="fixed inset-0 z-20 bg-black/30 lg:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-30 flex w-full flex-col bg-white shadow-2xl sm:w-[420px] lg:relative lg:inset-auto lg:z-auto lg:w-[400px] lg:shrink-0 lg:rounded-2xl lg:border lg:border-gray-100 lg:shadow-sm">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className={`flex h-9 w-9 items-center justify-center rounded-xl text-lg text-white ${meta.color}`}>
              {meta.icon}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{meta.name}</p>
              <StatusBadge status={status} />
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition">✕</button>
        </div>

        {/* Scroll body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

          {/* Status summary */}
          {(lastTested || view?.lastError) && (
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-xs space-y-1">
              {lastTested && (
                <p className="text-gray-500">
                  <span className="font-medium text-gray-700">Último teste:</span> {lastTested}
                </p>
              )}
              {view?.lastError && (
                <p className={view.isActive ? "font-medium text-green-700" : "font-medium text-red-600"}>
                  {view.isActive ? "✓" : "⚠"} {view.lastError}
                </p>
              )}
            </div>
          )}

          {/* Feedback */}
          {feedback && (
            <div className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium ${
              feedback.type === "ok"
                ? "border-green-200 bg-green-50 text-green-700"
                : "border-red-200 bg-red-50 text-red-700"
            }`}>
              <span>{feedback.type === "ok" ? "✓" : "⚠"}</span>
              {feedback.msg}
            </div>
          )}

          {/* Test result */}
          {testResult && (
            <div className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${
              testResult.success
                ? "border-green-200 bg-green-50 text-green-700"
                : "border-orange-200 bg-orange-50 text-orange-700"
            }`}>
              <span>{testResult.success ? "✓" : "⚠"}</span>
              <span>{testResult.message}</span>
            </div>
          )}

          {/* Config form (owner-only) */}
          {isOwner ? (
            <div>
              <p className="mb-4 text-sm font-semibold text-gray-700">Configuração</p>
              {provider === "whatsapp"    && <WhatsAppForm    view={view} saving={saving} onSave={handleSave} />}
              {provider === "stone"       && <StoneForm       view={view} saving={saving} onSave={handleSave} />}
              {provider === "mercadopago" && <MercadoPagoForm view={view} saving={saving} onSave={handleSave} />}
              {provider === "tipos"       && <TiposForm       view={view} saving={saving} onSave={handleSave} />}
              {provider === "openai"      && <OpenAIForm      view={view} saving={saving} onSave={handleSave} />}
            </div>
          ) : (
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-500">
              Apenas o proprietário pode editar as configurações de integração.
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="border-t border-gray-100 px-5 py-4 space-y-2">
          {/* Test connection */}
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || status === "unconfigured"}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-40 transition"
          >
            {testing ? "Testando…" : "Testar conexão"}
          </button>

          {/* Disconnect */}
          {isOwner && view?.isActive && (
            <button
              type="button"
              onClick={handleDisconnect}
              className="w-full rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 transition"
            >
              Desconectar
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ── Main page component ───────────────────────────────────────────────────────

export function IntegrationsCenterClient({ userRole }: { userRole: string }) {
  const [views, setViews]         = useState<Record<string, IntegrationView>>({});
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState<Provider | null>(null);

  const loadAll = useCallback(async () => {
    const results = await Promise.allSettled(
      INTEGRATIONS.map((i) => apiFetch(`/api/integrations/${i.provider}`))
    );
    const map: Record<string, IntegrationView> = {};
    results.forEach((r, idx) => {
      const integration = INTEGRATIONS[idx];
      if (r.status === "fulfilled" && r.value.ok && integration) {
        map[integration.provider] = r.value.data as IntegrationView;
      }
    });
    setViews(map);
    setLoading(false);
  }, []);

  const refreshOne = useCallback(async (provider: Provider) => {
    const { ok, data } = await apiFetch(`/api/integrations/${provider}`);
    if (ok) setViews((prev) => ({ ...prev, [provider]: data as IntegrationView }));
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Summary counts
  const total     = INTEGRATIONS.length;
  const connected = Object.values(views).filter((v) => v.status === "active").length;
  const withError = Object.values(views).filter((v) => v.status === "error").length;
  const pending   = total - connected - withError;

  return (
    <div className="flex h-full min-h-0">
      {/* Left: list */}
      <div className={`flex flex-1 flex-col overflow-hidden ${selected ? "hidden lg:flex" : "flex"}`}>
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {/* Header */}
          <div className="mb-6">
            <p className="text-sm text-gray-500">
              Conecte e monitore as tecnologias do seu restaurante.
            </p>

            {/* Summary row */}
            {!loading && (
              <div className="mt-4 flex flex-wrap gap-3">
                <SummaryChip label="Total" value={total} color="gray" />
                <SummaryChip label="Conectado" value={connected} color="green" />
                <SummaryChip label="Pendente" value={pending} color="yellow" />
                {withError > 0 && <SummaryChip label="Com erro" value={withError} color="red" />}
              </div>
            )}
          </div>

          {/* Cards */}
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-2xl bg-gray-100" />
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {INTEGRATIONS.map((meta) => (
                <IntegrationCard
                  key={meta.provider}
                  meta={meta}
                  view={views[meta.provider] ?? null}
                  selected={selected === meta.provider}
                  onClick={() => setSelected(selected === meta.provider ? null : meta.provider)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: detail panel */}
      {selected && (
        <DetailPanel
          key={selected}
          provider={selected}
          view={views[selected] ?? null}
          userRole={userRole}
          onClose={() => setSelected(null)}
          onRefresh={refreshOne}
        />
      )}
    </div>
  );
}

// ── Summary chip ──────────────────────────────────────────────────────────────

function SummaryChip({
  label, value, color,
}: {
  label: string; value: number; color: "gray" | "green" | "yellow" | "red";
}) {
  const cls = {
    gray:   "bg-gray-100 text-gray-600",
    green:  "bg-green-100 text-green-700",
    yellow: "bg-yellow-100 text-yellow-700",
    red:    "bg-red-100 text-red-600",
  }[color];

  return (
    <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${cls}`}>
      <span className="text-sm font-bold">{value}</span>
      {label}
    </span>
  );
}
