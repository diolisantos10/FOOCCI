"use client";

import { useState, useEffect, useCallback, useRef } from "react";

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
  debug?:  unknown; // Saipos only — safe diagnostic payload, no secrets
}

type Provider = "whatsapp" | "stone" | "mercadopago" | "tipos" | "openai" | "saipos";

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
  {
    provider:    "saipos",
    name:        "Saipos",
    description: "PDV e gestão de pedidos — envio automático de pedidos ao caixa e atualizações de status em tempo real.",
    icon:        "🖥️",
    color:       "bg-violet-600",
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

function WhatsAppQRPanel() {
  const [qrBase64, setQrBase64]   = useState<string | null>(null);
  const [qrState, setQrState]     = useState<"idle" | "loading" | "shown" | "connected" | "error">("idle");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  };

  const fetchQR = async () => {
    const res  = await fetch("/api/evolution/qr");
    const data = await res.json().catch(() => ({}));
    const qr   = (data?.data ?? data) as { base64?: string | null; error?: string };

    if (qr.base64) {
      setQrBase64(qr.base64);
      setQrState("shown");
    } else {
      // No QR → instance is already open or error
      setQrBase64(null);
      setQrState(qr.error === "not_configured" ? "error" : "connected");
      stopPolling();
    }
  };

  const handleConnect = async () => {
    setQrState("loading");
    setQrBase64(null);
    await fetchQR();
    // Auto-refresh every 30 s so QR doesn't expire
    intervalRef.current = setInterval(async () => {
      await fetchQR();
    }, 30_000);
  };

  // Stop polling when component unmounts or instance becomes connected
  useEffect(() => () => stopPolling(), []);

  return (
    <div className="rounded-xl border border-green-100 bg-green-50 px-4 py-4">
      <p className="mb-3 text-sm font-semibold text-green-800">Conectar WhatsApp</p>

      {qrState === "idle" && (
        <button
          type="button"
          onClick={handleConnect}
          className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-700 transition"
        >
          Gerar QR Code
        </button>
      )}

      {qrState === "loading" && (
        <div className="flex items-center gap-2 text-sm text-green-700">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-green-600 border-t-transparent" />
          Gerando QR Code…
        </div>
      )}

      {qrState === "shown" && qrBase64 && (
        <div className="flex flex-col items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrBase64}
            alt="QR Code WhatsApp"
            className="rounded-xl border border-green-200 shadow-sm"
            style={{ width: 200, height: 200 }}
          />
          <p className="text-center text-[11px] text-green-700">
            Abra o WhatsApp → Configurações → Aparelhos conectados → Conectar aparelho
          </p>
          <button
            type="button"
            onClick={handleConnect}
            className="rounded-lg border border-green-300 bg-white px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50 transition"
          >
            Atualizar QR
          </button>
        </div>
      )}

      {qrState === "connected" && (
        <p className="flex items-center gap-2 text-sm font-medium text-green-700">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          WhatsApp já está conectado!
        </p>
      )}

      {qrState === "error" && (
        <p className="text-sm text-red-600">
          Integração não configurada. Salve as credenciais primeiro.
        </p>
      )}
    </div>
  );
}

function WhatsAppForm({
  view, saving, onSave,
}: {
  view: IntegrationView | null;
  saving: boolean;
  onSave: (data: Record<string, unknown>) => void;
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
      <WhatsAppQRPanel />
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
  onSave: (data: Record<string, unknown>) => void;
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
  onSave: (data: Record<string, unknown>) => void;
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
  onSave: (data: Record<string, unknown>) => void;
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

function CheckboxField({
  label, hint, name, checked, onChange,
}: {
  label: string; hint?: string; name: string;
  checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <input
        id={name}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-violet-600"
      />
      <div>
        <label htmlFor={name} className="text-sm font-medium text-gray-700 cursor-pointer">{label}</label>
        {hint && <p className="mt-0.5 text-xs text-gray-400">{hint}</p>}
      </div>
    </div>
  );
}

function SaiposForm({
  view, saving, onSave,
}: {
  view: IntegrationView | null;
  saving: boolean;
  onSave: (data: Record<string, unknown>) => void;
}) {
  const f = view?.fields ?? {};
  // apiKeyPreview is safe to display (e.g. "1e28...aa05") but NEVER goes into an input value
  const existingSecretPreview = f.apiKeyPreview ?? null;

  const [isActive,        setIsActive]       = useState(view?.isActive ?? true);
  const [environment,     setEnvironment]    = useState(f.environment    ?? "HOMOLOGATION");
  const [apiKey,          setApiKey]         = useState(""); // ALWAYS empty on load
  const [idPartner,       setIdPartner]      = useState(f.idPartner      ?? "");
  const [codStore,        setCodStore]       = useState(f.codStore       ?? "");
  const [autoSendOrders,  setAutoSendOrders] = useState((f.autoSendOrders ?? "true") === "true");
  const [syncCatalog,     setSyncCatalog]    = useState((f.syncCatalog   ?? "false") === "true");
  const [paymentMappings, setPaymentMappings] = useState(
    f.paymentMappings && f.paymentMappings !== "{}"
      ? f.paymentMappings
      : JSON.stringify({ CASH: 1, PIX: 2, CREDIT_CARD: 3, DEBIT_CARD: 4 }, null, 2)
  );
  const [copied, setCopied] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setIsActive(view?.isActive ?? true);
    setEnvironment(f.environment    ?? "HOMOLOGATION");
    setApiKey(""); // NEVER populate with secret value or preview
    setIdPartner(f.idPartner        ?? "");
    setCodStore(f.codStore          ?? "");
    setAutoSendOrders((f.autoSendOrders ?? "true") === "true");
    setSyncCatalog((f.syncCatalog   ?? "false") === "true");
    setPaymentMappings(
      f.paymentMappings && f.paymentMappings !== "{}"
        ? f.paymentMappings
        : JSON.stringify({ CASH: 1, PIX: 2, CREDIT_CARD: 3, DEBIT_CARD: 4 }, null, 2)
    );
    setErrors({});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.provider]);

  const webhookUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/integrations/saipos/webhook`
    : "/api/integrations/saipos/webhook";

  const handleCopy = () => {
    navigator.clipboard.writeText(webhookUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!idPartner.trim())
      e.idPartner = "ID do parceiro obrigatório.";
    else if (idPartner.includes("@"))
      e.idPartner = "ID do parceiro não deve ser um endereço de e-mail.";
    if (!codStore.trim())
      e.codStore = "Código do estabelecimento obrigatório.";
    else if (!/^\d+$/.test(codStore.trim()))
      e.codStore = "Código do estabelecimento deve conter apenas números.";
    // Secret only required on first configuration (no existing secret stored)
    if (!existingSecretPreview && !apiKey.trim())
      e.apiKey = "Secret obrigatório na primeira configuração.";
    try { JSON.parse(paymentMappings); } catch {
      e.paymentMappings = "JSON inválido no mapeamento de pagamentos.";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    onSave({
      isActive,
      environment,
      apiKey:          apiKey.trim(), // empty string → backend keeps existing encrypted secret
      idPartner:       idPartner.trim(),
      codStore:        codStore.trim(),
      autoSendOrders,
      syncCatalog,
      paymentMappings,
    });
  };

  const inputCls = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100 transition";
  const errCls   = "mt-1 text-xs text-red-500";

  return (
    <form onSubmit={handleSubmit} className="w-full min-w-0 space-y-4 overflow-hidden">

      {/* ── Ativar integração ─────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setIsActive((v) => !v)}
        className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 transition ${
          isActive
            ? "border-violet-200 bg-violet-50"
            : "border-gray-200 bg-gray-50"
        }`}
      >
        <div className="text-left">
          <p className={`text-sm font-semibold ${isActive ? "text-violet-800" : "text-gray-600"}`}>
            Ativar integração Saipos
          </p>
          <p className="mt-0.5 text-xs text-gray-400">
            {isActive
              ? "Integração ativa — pedidos confirmados são enviados ao Saipos."
              : "Integração desativada — credenciais salvas mas pedidos não são enviados."}
          </p>
        </div>
        {/* Toggle pill */}
        <div className={`relative ml-4 h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
          isActive ? "bg-violet-600" : "bg-gray-300"
        }`}>
          <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
            isActive ? "translate-x-5" : "translate-x-0"
          }`} />
        </div>
      </button>

      <SelectField
        label="Ambiente"
        name="environment"
        value={environment}
        options={[
          { value: "HOMOLOGATION", label: "Homologação (teste)" },
          { value: "PRODUCTION",   label: "Produção" },
        ]}
        onChange={setEnvironment}
      />

      {/* ID do parceiro */}
      <div>
        <TextField
          label="ID do parceiro (idPartner)"
          name="idPartner"
          placeholder="Ex: 49f2fe58c6c5de7cf2b43c741d08b374"
          hint="Fornecido pela equipe Saipos no cadastro do parceiro."
          value={idPartner}
          onChange={(v) => { setIdPartner(v); setErrors((p) => ({ ...p, idPartner: "" })); }}
        />
        {errors.idPartner && <p className={errCls}>{errors.idPartner}</p>}
      </div>

      {/* Código do estabelecimento */}
      <div>
        <TextField
          label="Código do estabelecimento (cod_store)"
          name="codStore"
          placeholder="Ex: 87877"
          hint="Código numérico do seu restaurante na plataforma Saipos."
          value={codStore}
          onChange={(v) => { setCodStore(v); setErrors((p) => ({ ...p, codStore: "" })); }}
        />
        {errors.codStore && <p className={errCls}>{errors.codStore}</p>}
      </div>

      {/* Secret — input is ALWAYS empty on load; preview shown as a separate label */}
      <div>
        <p className="mb-1 text-sm font-medium text-gray-700">
          Secret / Senha de acesso à API Saipos
        </p>
        {existingSecretPreview && (
          <p className="mb-1.5 text-xs text-gray-500">
            Secret atual salva:{" "}
            <span className="font-mono font-semibold text-gray-700">{existingSecretPreview}</span>
          </p>
        )}
        <input
          type="password"
          name="saiposSecret"
          placeholder="Cole a nova senha"
          value={apiKey}
          autoComplete="new-password"
          onChange={(e) => { setApiKey(e.target.value); setErrors((p) => ({ ...p, apiKey: "" })); }}
          className={inputCls}
        />
        <p className="mt-1 text-xs text-gray-400">
          Cole aqui a Senha para acesso à API da integração Saipos. Deixe em branco para manter a atual.
        </p>
        {errors.apiKey && <p className={errCls}>{errors.apiKey}</p>}
      </div>

      <div className="space-y-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
        <p className="text-xs font-semibold text-gray-700">Comportamento</p>
        <CheckboxField
          label="Enviar pedidos automaticamente"
          name="autoSendOrders"
          checked={autoSendOrders}
          onChange={setAutoSendOrders}
          hint="Quando ativo, cada pedido confirmado é enviado ao Saipos automaticamente."
        />
        <CheckboxField
          label="Sincronizar cardápio"
          name="syncCatalog"
          checked={syncCatalog}
          onChange={setSyncCatalog}
          hint="Em breve — sincronização do cardápio Foocci com o catálogo Saipos."
        />
      </div>

      {/* Payment mappings — max-w-full prevents textarea from forcing modal width */}
      <div className="min-w-0">
        <label className="mb-1.5 block text-sm font-medium text-gray-700">
          Mapeamento de pagamentos
          <span className="ml-1 font-normal text-gray-400">(JSON)</span>
        </label>
        <textarea
          value={paymentMappings}
          onChange={(e) => {
            setPaymentMappings(e.target.value);
            setErrors((p) => ({ ...p, paymentMappings: "" }));
          }}
          rows={5}
          spellCheck={false}
          className="w-full max-w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 font-mono text-xs text-gray-800 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100 transition"
        />
        {errors.paymentMappings
          ? <p className={errCls}>{errors.paymentMappings}</p>
          : <p className="mt-1 text-xs text-gray-400">
              Mapeie cada método Foocci (CASH, PIX, CREDIT_CARD, DEBIT_CARD…) ao código numérico do PDV Saipos.
            </p>
        }
      </div>

      {/* Webhook URL — min-w-0 on flex container prevents URL from forcing overflow */}
      <div className="min-w-0 overflow-hidden rounded-xl border border-violet-100 bg-violet-50 px-4 py-3">
        <p className="text-xs font-medium text-violet-800">URL do webhook para configurar no Saipos:</p>
        <div className="mt-1.5 flex min-w-0 items-start gap-2">
          <p className="min-w-0 flex-1 break-all font-mono text-xs text-violet-700">{webhookUrl}</p>
          <button
            type="button"
            onClick={handleCopy}
            className="shrink-0 rounded-lg border border-violet-200 bg-white px-2.5 py-1 text-xs font-medium text-violet-700 hover:bg-violet-50 transition"
          >
            {copied ? "Copiado!" : "Copiar"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
        <p className="text-xs font-medium text-amber-800">Códigos de integração nos produtos</p>
        <p className="mt-1 text-xs text-amber-700 break-words">
          Para cada produto no cardápio, preencha o campo <strong>Código Saipos</strong> com o código
          PDV correspondente (<code>saiposIntegrationCode</code>). Sem esse código, o item é enviado
          sem referência PDV e pode não ser reconhecido no caixa.
        </p>
      </div>

      <div className="flex justify-end pt-1">
        <button type="submit" disabled={saving}
          className="rounded-xl bg-violet-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 disabled:opacity-50 transition">
          {saving ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </form>
  );
}

// ── Saipos auth debug panel (shown after a failed Test Connection) ────────────

function SaiposAuthDebugPanel({ debug }: { debug: Record<string, unknown> }) {
  const rows: [string, string][] = [
    ["Auth URL",       String(debug.authUrl ?? "—")],
    ["Body keys",      Array.isArray(debug.requestBodyKeys)
      ? (debug.requestBodyKeys as string[]).join(", ")
      : String(debug.requestBodyKeys ?? "—")],
    ["idPartner",      `exists=${debug.idPartnerExists}  len=${debug.idPartnerLength}  preview=${debug.idPartnerPreview}`],
    ["secret",         `exists=${debug.secretExists}  len=${debug.secretLength}  preview=${debug.secretPreview}`],
    ["cod_store",      String(debug.codStore ?? "—")],
    ["environment",    String(debug.environment ?? "—")],
    ["HTTP status",    String(debug.responseStatus ?? "—")],
    ["Error code",     String(debug.responseErrorCode ?? "—")],
    ["Error message",  String(debug.responseErrorMessage ?? "—")],
  ];

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
      <p className="mb-2 text-xs font-semibold text-gray-500">Diagnóstico Saipos Auth</p>
      <div className="space-y-1.5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex min-w-0 gap-2">
            <span className="w-28 shrink-0 text-[10px] font-medium text-gray-400 uppercase tracking-wide">{label}</span>
            <span className="min-w-0 flex-1 break-all font-mono text-[11px] text-gray-800">{value}</span>
          </div>
        ))}
      </div>
    </div>
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

  const handleSave = async (data: Record<string, unknown>) => {
    setSaving(true);
    clearFeedback();
    const { ok, data: res } = await apiFetch(
      `/api/integrations/${provider}`,
      "PUT",
      data as object
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
        <div className="flex-1 overflow-x-hidden overflow-y-auto px-5 py-5 space-y-6">

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
            <>
              <div className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${
                testResult.success
                  ? "border-green-200 bg-green-50 text-green-700"
                  : "border-orange-200 bg-orange-50 text-orange-700"
              }`}>
                <span>{testResult.success ? "✓" : "⚠"}</span>
                <span>{testResult.message}</span>
              </div>
              {/* Safe auth diagnostics — Saipos only, always shown when available */}
              {provider === "saipos" && testResult.debug && (
                <SaiposAuthDebugPanel debug={testResult.debug as Record<string, unknown>} />
              )}
            </>
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
              {provider === "saipos"      && <SaiposForm      view={view} saving={saving} onSave={handleSave} />}
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
