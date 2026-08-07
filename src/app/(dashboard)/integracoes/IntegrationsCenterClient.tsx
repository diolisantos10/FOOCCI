"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// ── Types ─────────────────────────────────────────────────────────────────────

// "attention" = conectado, sem erro registrado, mas sem receber nada há tempo
// demais. Nasceu do Instagram que ficou treze dias verde com o canal morto. É
// deliberadamente DIFERENTE de "error" no texto e na cor: silêncio pode ser
// movimento baixo, e um alarme que grita "quebrou" sem prova seria pior que o
// selo que ele substitui.
type IntegrationStatus = "unconfigured" | "configured" | "active" | "error" | "attention" | "pending_validation";

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

type Provider = "whatsapp" | "instagram" | "facebook" | "google" | "stone" | "mercadopago" | "openai" | "saipos" | "sumup";

// ── Integration metadata (display config) ─────────────────────────────────────

const INTEGRATIONS: {
  provider:      Provider;
  name:          string;
  description:   string;
  icon:          string;
  color:         string;
  configureHref?: string;
}[] = [
  {
    provider:      "whatsapp",
    name:          "WhatsApp",
    description:   "Conecte a conta oficial da Meta, com login em um clique.",
    icon:          "💬",
    color:         "bg-green-500",
    configureHref: "/integracoes/whatsapp",
  },
  {
    provider:      "instagram",
    name:          "Instagram",
    description:   "Receba e responda mensagens do Instagram Direct pela Central de Atendimento.",
    icon:          "📷",
    color:         "bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF]",
    configureHref: "/integracoes/instagram",
  },
  {
    provider:      "facebook",
    name:          "Facebook",
    description:   "Receba e responda mensagens do Facebook Messenger pela Central de Atendimento.",
    icon:          "📘",
    color:         "bg-[#1877F2]",
    configureHref: "/integracoes/facebook",
  },
  {
    provider:      "google",
    name:          "Google",
    description:   "Conecte o Google Meu Negócio e o Google Analytics com um clique. Avaliações e métricas do site na sua central.",
    icon:          "🔍",
    color:         "bg-blue-500",
    configureHref: "/integracoes/google",
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
    provider:    "openai",
    name:        "OpenAI",
    description: "Motor de inteligência artificial dos agentes Foocci.",
    icon:        "🤖",
    color:       "bg-[#10a37f]",
  },
  {
    provider:    "saipos",
    name:        "Saipos",
    description: "PDV e gestão de pedidos — envio automático de pedidos ao caixa e atualizações de status em tempo real.",
    icon:        "🖥️",
    color:       "bg-brand-500",
  },
  {
    provider:    "sumup",
    name:        "SumUp",
    description: "Cartão de crédito dentro do app (checkout transparente) — o cliente paga sem sair da tela, com 3D Secure.",
    icon:        "💳",
    color:       "bg-[#1E1A4D]",
  },
];

// ── API helper ────────────────────────────────────────────────────────────────

function mergeStatus(a: IntegrationStatus | undefined, b: IntegrationStatus | undefined): IntegrationStatus {
  // `attention` fica ACIMA de `active` de propósito: quando um lado diz "ativo" e
  // o outro diz "não chega nada há dois dias", o aviso é que precisa sobreviver.
  // Um "ativo" nunca pode apagar um sinal de silêncio.
  const rank: Record<IntegrationStatus, number> = { attention: 6, active: 5, error: 4, configured: 3, pending_validation: 2, unconfigured: 1 };
  const ra = a ? rank[a] : 0;
  const rb = b ? rank[b] : 0;
  return ra >= rb ? (a ?? "unconfigured") : (b ?? "unconfigured");
}

// Google's status endpoint returns a custom shape; normalize it to a card view.
function googleToView(data: unknown): IntegrationView {
  const d = (data ?? {}) as { connected?: boolean; lastError?: string | null; lastSyncedAt?: string | null };
  const status: IntegrationStatus = d.connected ? "active" : "unconfigured";
  return {
    provider: "google",
    status,
    isActive: Boolean(d.connected),
    lastTestedAt: d.lastSyncedAt ?? null,
    lastError: d.lastError ?? null,
    fields: {},
  };
}

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
  // Conectado, sem erro, mas mudo há tempo demais. Âmbar e "Sem receber" —
  // nunca vermelho, nunca "Erro": não temos prova de que quebrou.
  if (status === "attention")
    return (
      <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        Sem receber
      </span>
    );
  if (status === "pending_validation")
    return (
      <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        Validação pendente
      </span>
    );
  if (status === "configured")
    return (
      <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
        <span className="h-1.5 w-1.5 rounded-full bg-yellow-400" />
        Não conectado
      </span>
    );
  return (
    <span className="flex items-center gap-1 rounded-full bg-[#F4F4F2] px-2.5 py-0.5 text-xs font-semibold text-muted">
      <span className="h-1.5 w-1.5 rounded-full bg-muted" />
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
    <div className={`rounded-2xl border bg-paper shadow-sm transition-all hover:shadow-md ${
      selected ? "border-brand-400 ring-2 ring-brand-100" : "border-line"
    }`}>
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left p-5"
      >
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl text-white shadow-sm ${meta.color}`}>
            {meta.icon}
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-ink">{meta.name}</span>
              <StatusBadge status={status} />
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted">{meta.description}</p>
            {lastTested && (
              <p className="mt-1.5 text-[10px] text-muted">Testado em {lastTested}</p>
            )}
            {view?.lastError && status === "error" && (
              <p className="mt-1 truncate text-[10px] text-red-500">{view.lastError}</p>
            )}
          </div>

          {/* Arrow */}
          <span className="shrink-0 text-muted">›</span>
        </div>
      </button>

      {meta.configureHref && (
        <div className="border-t border-line px-5 py-2.5">
          <Link
            href={meta.configureHref}
            className="text-xs font-medium text-brand-500 hover:text-brand-700 transition-colors"
          >
            Configurar →
          </Link>
        </div>
      )}
    </div>
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
      <label className="mb-1.5 block text-sm font-medium text-ink2">{label}</label>
      <input
        type="password"
        name={name}
        placeholder={placeholder}
        value={value}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-line2 bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition"
      />
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
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
      <label className="mb-1.5 block text-sm font-medium text-ink2">{label}</label>
      <input
        type={type}
        name={name}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-line2 bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition"
      />
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
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
      <label className="mb-1.5 block text-sm font-medium text-ink2">{label}</label>
      <select
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-line2 bg-paper px-3 py-2 text-sm text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

// ── Per-provider config forms ─────────────────────────────────────────────────

/**
 * WhatsApp — SEM formulário aqui, de propósito.
 *
 * ⚠️ MUDOU EM 04/08/2026. Aqui vivia o painel de **QR Code / código de pareamento**
 * (`WhatsAppQRPanel`) mais um formulário de credenciais da Evolution (instanceName,
 * baseUrl, apiKey, webhookSecret, URL de webhook para colar no servidor). A
 * Evolution foi eliminada do Foocci por ordem do CEO.
 *
 * Na Meta **não existe QR nem pareamento**: o lojista conecta a conta oficial com
 * login em um clique, e não há credencial para digitar. Por isso o card manda para
 * a tela dedicada em vez de mostrar um formulário que não tem mais o que preencher.
 *
 * A lição que o painel antigo deixou continua valendo em qualquer tela de canal, e
 * está na vitrine: **ausência de imagem/erro não é informação de que conectou.**
 * Um `else` tratado como sucesso dizia "WhatsApp já está conectado!" para quem não
 * tinha conectado nada.
 */
function WhatsAppForm() {
  return (
    <div className="rounded-xl border border-line bg-[#FAFAF8] px-4 py-4">
      <p className="text-sm font-semibold text-ink2">Conectar pela conta oficial da Meta</p>
      <p className="mt-1 text-sm text-muted">
        Não há credencial para digitar nem QR Code para escanear: a conexão é feita com login
        na própria Meta, em um clique.
      </p>
      <a
        href="/integracoes/whatsapp"
        className="mt-3 inline-block rounded-xl bg-brand-500 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600"
      >
        Abrir a tela do WhatsApp
      </a>
    </div>
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
          className="rounded-xl bg-brand-500 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 disabled:opacity-50 transition">
          {saving ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </form>
  );
}

const MP_PAYMENT_METHODS = [
  { id: "pix",              label: "Pix",                   active: true  },
  { id: "credit_card",      label: "Cartão de crédito",     active: false },
  { id: "debit_card",       label: "Cartão de débito",      active: false },
  { id: "boleto",           label: "Boleto bancário",       active: false },
  { id: "mp_wallet",        label: "Carteira Mercado Pago", active: false },
] as const;

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
      {/* Payment methods — read-only status panel */}
      <div className="rounded-xl border border-line bg-[#FAFAF8] px-4 py-3">
        <p className="mb-2.5 text-xs font-semibold text-ink2">Formas de pagamento</p>
        <div className="space-y-1.5">
          {MP_PAYMENT_METHODS.map((m) => (
            <div key={m.id} className="flex items-center justify-between">
              <span className="text-xs text-ink2">{m.label}</span>
              {m.active ? (
                <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                  Ativo
                </span>
              ) : (
                <span className="rounded-full bg-[#F4F4F2] px-2 py-0.5 text-[10px] font-semibold text-muted">
                  Em breve
                </span>
              )}
            </div>
          ))}
        </div>
        <p className="mt-2.5 text-[10px] leading-relaxed text-muted">
          No momento apenas Pix está disponível. Os demais métodos serão liberados em breve.
        </p>
      </div>

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
          className="rounded-xl bg-brand-500 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 disabled:opacity-50 transition">
          {saving ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </form>
  );
}

function SumUpForm({
  view, saving, onSave,
}: {
  view: IntegrationView | null;
  saving: boolean;
  onSave: (data: Record<string, unknown>) => void;
}) {
  const f = view?.fields ?? {};
  const [environment, setEnvironment]         = useState(f.environment ?? "production");
  const [apiKey, setApiKey]                   = useState("");
  const [merchantCode, setMerchantCode]       = useState((f.merchantCode as string) ?? "");
  const [maxInstallments, setMaxInstallments] = useState((f.maxInstallments as string) ?? "1");

  useEffect(() => {
    setEnvironment(f.environment ?? "production");
    setApiKey("");
    setMerchantCode((f.merchantCode as string) ?? "");
    setMaxInstallments((f.maxInstallments as string) ?? "1");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.provider]);

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSave({ environment, apiKey, merchantCode, maxInstallments }); }}
      className="space-y-4"
    >
      <div className="rounded-xl border border-line bg-[#FAFAF8] px-4 py-3">
        <p className="text-xs font-semibold text-ink2">Cartão de crédito no app</p>
        <p className="mt-1 text-[10px] leading-relaxed text-muted">
          O cliente digita o cartão dentro do seu app (checkout transparente, com 3D Secure).
          Os dados do cartão nunca passam pelos nossos servidores.
        </p>
      </div>

      <SelectField
        label="Ambiente"
        name="environment"
        value={environment}
        options={[
          { value: "production", label: "Produção" },
          { value: "sandbox",    label: "Sandbox (teste)" },
        ]}
        onChange={setEnvironment}
      />
      <SecretField
        label="API Key (Secret key)"
        name="sumupApiKey"
        placeholder={f.apiKeyPreview ? `Atual: ${f.apiKeyPreview} — deixe em branco para manter` : "sup_sk_..."}
        hint="SumUp → Configurações para programadores → Chaves de API. Fica criptografada."
        value={apiKey}
        onChange={setApiKey}
      />
      <TextField
        label="Merchant code"
        name="sumupMerchantCode"
        placeholder="Ex.: MCXXXXXX"
        hint="SumUp → Perfil da conta → Código do comerciante (merchant code)."
        value={merchantCode}
        onChange={setMerchantCode}
      />
      <SelectField
        label="Parcelas máximas"
        name="sumupMaxInstallments"
        value={maxInstallments}
        options={[
          { value: "1",  label: "Somente à vista" },
          { value: "2",  label: "Até 2x" },
          { value: "3",  label: "Até 3x" },
          { value: "4",  label: "Até 4x" },
          { value: "6",  label: "Até 6x" },
          { value: "12", label: "Até 12x" },
        ]}
        onChange={setMaxInstallments}
      />
      <div className="flex justify-end pt-1">
        <button type="submit" disabled={saving}
          className="rounded-xl bg-brand-500 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 disabled:opacity-50 transition">
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
          className="rounded-xl bg-brand-500 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 disabled:opacity-50 transition"
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
        className="mt-0.5 h-4 w-4 rounded border-line2 accent-brand-500"
      />
      <div>
        <label htmlFor={name} className="text-sm font-medium text-ink2 cursor-pointer">{label}</label>
        {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
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

  const inputCls = "w-full rounded-xl border border-line2 bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition";
  const errCls   = "mt-1 text-xs text-red-500";

  return (
    <form onSubmit={handleSubmit} className="w-full min-w-0 space-y-4 overflow-hidden">

      {/* ── Ativar integração ─────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setIsActive((v) => !v)}
        className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 transition ${
          isActive
            ? "border-brand-200 bg-brand-50"
            : "border-line2 bg-[#FAFAF8]"
        }`}
      >
        <div className="text-left">
          <p className={`text-sm font-semibold ${isActive ? "text-brand-700" : "text-ink2"}`}>
            Ativar integração Saipos
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {isActive
              ? "Integração ativa — pedidos confirmados são enviados ao Saipos."
              : "Integração desativada — credenciais salvas mas pedidos não são enviados."}
          </p>
        </div>
        {/* Toggle pill */}
        <div className={`relative ml-4 h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
          isActive ? "bg-brand-500" : "bg-line2"
        }`}>
          <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-paper shadow transition-transform duration-200 ${
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
          label="ID da loja no canal de venda (idPartner)"
          name="idPartner"
          placeholder="Ex: 49f2fe58c6c5de7cf2b43c741d08b374"
          hint="Identificador desta loja no canal de venda Saipos. Cada loja conectada ao parceiro tem um idPartner diferente."
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
          hint="Código numérico do estabelecimento na plataforma Saipos (ex: 87877). Diferente do idPartner — este é o código do restaurante, não do canal de venda."
          value={codStore}
          onChange={(v) => { setCodStore(v); setErrors((p) => ({ ...p, codStore: "" })); }}
        />
        {errors.codStore && <p className={errCls}>{errors.codStore}</p>}
      </div>

      {/* Secret do parceiro — input is ALWAYS empty on load; preview shown as a separate label */}
      <div>
        <p className="mb-1 text-sm font-medium text-ink2">
          Secret do parceiro/canal Saipos
        </p>
        {existingSecretPreview && (
          <p className="mb-1.5 text-xs text-muted">
            Secret atual salvo:{" "}
            <span className="font-mono font-semibold text-ink2">{existingSecretPreview}</span>
          </p>
        )}
        <input
          type="password"
          name="saiposSecret"
          placeholder="Cole o secret do parceiro/canal"
          value={apiKey}
          autoComplete="new-password"
          onChange={(e) => { setApiKey(e.target.value); setErrors((p) => ({ ...p, apiKey: "" })); }}
          className={inputCls}
        />
        <p className="mt-1 text-xs text-muted">
          Cole aqui o secret do parceiro/canal informado pela Saipos após o credenciamento. Não confundir com senha da loja ou API Key pública, salvo se a Saipos confirmar que este é o secret do canal.
        </p>
        {errors.apiKey && <p className={errCls}>{errors.apiKey}</p>}
      </div>

      {/* Informational box: what secret to use */}
      <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 space-y-1">
        <p className="text-xs font-semibold text-blue-800">Qual secret usar?</p>
        <p className="text-xs text-blue-700">
          Na API de Pedidos v2.5, o <code className="font-mono">idPartner</code> identifica a loja no canal de venda.
          Já o <code className="font-mono">secret</code> é a senha única do parceiro/canal, igual para todas as lojas integradas por esse parceiro.
          A documentação informa que esse secret é enviado pela equipe Saipos após o credenciamento.
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-line bg-[#FAFAF8] px-4 py-3">
        <p className="text-xs font-semibold text-ink2">Comportamento</p>
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
        <label className="mb-1.5 block text-sm font-medium text-ink2">
          Mapeamento de pagamentos
          <span className="ml-1 font-normal text-muted">(JSON)</span>
        </label>
        <textarea
          value={paymentMappings}
          onChange={(e) => {
            setPaymentMappings(e.target.value);
            setErrors((p) => ({ ...p, paymentMappings: "" }));
          }}
          rows={5}
          spellCheck={false}
          className="w-full max-w-full resize-none rounded-xl border border-line2 bg-paper px-3 py-2 font-mono text-xs text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition"
        />
        {errors.paymentMappings
          ? <p className={errCls}>{errors.paymentMappings}</p>
          : <p className="mt-1 text-xs text-muted">
              Mapeie cada método Foocci (CASH, PIX, CREDIT_CARD, DEBIT_CARD…) ao código numérico do PDV Saipos.
            </p>
        }
      </div>

      {/* Webhook URL — min-w-0 on flex container prevents URL from forcing overflow */}
      <div className="min-w-0 overflow-hidden rounded-xl border border-brand-100 bg-brand-50 px-4 py-3">
        <p className="text-xs font-medium text-brand-700">URL do webhook para configurar no Saipos:</p>
        <div className="mt-1.5 flex min-w-0 items-start gap-2">
          <p className="min-w-0 flex-1 break-all font-mono text-xs text-brand-600">{webhookUrl}</p>
          <button
            type="button"
            onClick={handleCopy}
            className="shrink-0 rounded-lg border border-brand-200 bg-paper px-2.5 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50 transition"
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

      {/* Temporary secret tester — tests without overwriting the stored secret */}
      <SaiposTempSecretTester />

      <div className="flex justify-end pt-1">
        <button type="submit" disabled={saving}
          className="rounded-xl bg-brand-500 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 disabled:opacity-50 transition">
          {saving ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </form>
  );
}

// ── Saipos auth debug panel (shown after a failed Test Connection) ────────────

function SaiposAuthDebugPanel({ debug }: { debug: Record<string, unknown> }) {
  const rows: [string, string][] = [
    ["Auth URL",           String(debug.authUrl ?? "—")],
    ["Body keys",          Array.isArray(debug.requestBodyKeys)
      ? (debug.requestBodyKeys as string[]).join(", ")
      : String(debug.requestBodyKeys ?? "—")],
    ["idPartner (loja)",   `exists=${debug.idPartnerExists}  len=${debug.idPartnerLength}  preview=${debug.idPartnerPreview}`],
    ["secret (parceiro)",  `exists=${debug.secretExists}  len=${debug.secretLength}  preview=${debug.secretPreview}`],
    ["cod_store",          String(debug.codStore ?? "—")],
    ["environment",        String(debug.environment ?? "—")],
    ["HTTP status",        String(debug.responseStatus ?? "—")],
    ["Resp body keys",     Array.isArray(debug.responseBodyKeys)
      ? (debug.responseBodyKeys as string[]).join(", ")
      : "—"],
    ["Error code",         String(debug.responseErrorCode ?? "—")],
    ["Error message",      String(debug.responseErrorMessage ?? "—")],
  ];

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-line2 bg-[#FAFAF8] px-4 py-3">
      <p className="mb-1 text-xs font-semibold text-muted">Diagnóstico Saipos Auth</p>
      <p className="mb-2 text-[10px] text-muted">
        idPartner = ID da loja no canal de venda (store-specific).
        secret = senha única do parceiro/canal (igual para todas as lojas do parceiro).
      </p>
      <div className="space-y-1.5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex min-w-0 gap-2">
            <span className="w-32 shrink-0 text-[10px] font-medium text-muted uppercase tracking-wide">{label}</span>
            <span className="min-w-0 flex-1 break-all font-mono text-[11px] text-ink">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Saipos copy diagnostics button ───────────────────────────────────────────

function SaiposCopyDiagnosticsButton({ debug }: { debug: Record<string, unknown> }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const payload = {
      note:                   "idPartner=store-specific; secret=partner/channel-level (same for all stores of this partner)",
      authUrl:                debug.authUrl,
      bodyKeys:               debug.requestBodyKeys,
      idPartner_storeSide:    `len=${debug.idPartnerLength}  preview=${debug.idPartnerPreview}`,
      secret_partnerChannel:  `len=${debug.secretLength}  preview=${debug.secretPreview}`,
      codStore:               debug.codStore,
      environment:            debug.environment,
      httpStatus:             debug.responseStatus,
      responseBodyKeys:       debug.responseBodyKeys,
      errorCode:              debug.responseErrorCode,
      errorMessage:           debug.responseErrorMessage,
    };
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="w-full rounded-xl border border-line2 bg-paper px-4 py-2 text-xs font-medium text-ink2 hover:bg-[#FAFAF8] transition"
    >
      {copied ? "✓ Diagnóstico copiado!" : "Copiar diagnóstico para suporte"}
    </button>
  );
}

// ── Saipos temp secret tester ─────────────────────────────────────────────────

function SaiposTempSecretTester() {
  const [tempSecret, setTempSecret] = useState("");
  const [loading,    setLoading]    = useState(false);
  const [result,     setResult]     = useState<{ success: boolean; message: string; debug?: Record<string, unknown> } | null>(null);

  const handleTest = async () => {
    if (!tempSecret.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res  = await fetch("/api/integrations/saipos/test-secret", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ tempSecret: tempSecret.trim() }),
      });
      const data = await res.json().catch(() => ({})) as { success?: boolean; message?: string; debug?: Record<string, unknown> };
      setResult({
        success: Boolean(data.success),
        message: data.message ?? "Erro desconhecido.",
        debug:   data.debug as Record<string, unknown> | undefined,
      });
    } catch {
      setResult({ success: false, message: "Erro de rede ao testar." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-4 space-y-3">
      <p className="text-xs font-semibold text-amber-800">Testar com secret do parceiro temporário</p>
      <p className="text-xs text-amber-700">
        Testa a autenticação com um secret diferente sem alterar o secret salvo. Use para validar o secret do parceiro/canal enviado pela Saipos antes de salvar.
      </p>
      <div className="flex gap-2">
        <input
          type="password"
          placeholder="Cole o secret do parceiro/canal"
          value={tempSecret}
          autoComplete="off"
          onChange={(e) => setTempSecret(e.target.value)}
          className="flex-1 rounded-xl border border-amber-200 bg-paper px-3 py-2 text-sm placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition"
        />
        <button
          type="button"
          onClick={handleTest}
          disabled={loading || !tempSecret.trim()}
          className="shrink-0 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-40 transition"
        >
          {loading ? "…" : "Testar"}
        </button>
      </div>
      {result && (
        <div className={`rounded-xl border px-3 py-2 text-xs font-medium ${
          result.success
            ? "border-green-200 bg-green-50 text-green-700"
            : "border-red-200 bg-red-50 text-red-600"
        }`}>
          {result.success ? "✓" : "⚠"} {result.message}
        </div>
      )}
      {result?.debug && <SaiposAuthDebugPanel debug={result.debug} />}
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
        className="fixed inset-0 z-20 bg-ink/45 lg:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-30 flex w-full flex-col bg-paper shadow-2xl sm:w-[420px] lg:relative lg:inset-auto lg:z-auto lg:w-[400px] lg:shrink-0 lg:rounded-2xl lg:border lg:border-line lg:shadow-sm">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-3">
            <div className={`flex h-9 w-9 items-center justify-center rounded-xl text-lg text-white ${meta.color}`}>
              {meta.icon}
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">{meta.name}</p>
              <StatusBadge status={status} />
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-[#F4F4F2] hover:text-ink2 transition">✕</button>
        </div>

        {/* Scroll body */}
        <div className="flex-1 overflow-x-hidden overflow-y-auto px-5 py-5 space-y-6">

          {/* Status summary */}
          {(lastTested || view?.lastError) && (
            <div className="rounded-xl border border-line bg-[#FAFAF8] px-4 py-3 text-xs space-y-1">
              {lastTested && (
                <p className="text-muted">
                  <span className="font-medium text-ink2">Último teste:</span> {lastTested}
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
                  : "border-brand-200 bg-brand-50 text-brand-700"
              }`}>
                <span>{testResult.success ? "✓" : "⚠"}</span>
                <span>{testResult.message}</span>
              </div>

              {/* Saipos-specific: errorCode 902 explanation */}
              {provider === "saipos" && !testResult.success &&
                (testResult.debug as Record<string, unknown> | undefined)?.responseErrorCode?.toString() === "902" && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 space-y-1">
                  <p className="font-semibold">errorCode 902 — Credenciais pendentes de validação Saipos</p>
                  <p>
                    O Foocci está enviando URL, <code>idPartner</code> e <code>secret</code> no formato correto
                    (<code>{`{ idPartner, secret }`}</code>), mas a Saipos retornou errorCode 902.
                    Isso indica que o par <code>idPartner</code> + <code>secret</code> ainda não foi aprovado
                    pela Saipos para o ambiente de homologação. Confirme com a Saipos se o <code>idPartner</code> está
                    vinculado ao <code>secret</code> no cadastro do parceiro.
                  </p>
                </div>
              )}

              {/* Saipos-specific: HTTP 403 explanation */}
              {provider === "saipos" && !testResult.success &&
                (testResult.debug as Record<string, unknown> | undefined)?.responseStatus === 403 && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800 space-y-1">
                  <p className="font-semibold">HTTP 403 — acesso negado pela Saipos no endpoint v2.5</p>
                  <p>
                    A URL informada pelo suporte está em uso, mas a credencial/parceiro ainda não foi autorizado para autenticação.
                    Verifique se o <code className="font-mono">secret</code> salvo é o secret do parceiro/canal de venda enviado pela Saipos após o credenciamento — não a senha da loja nem uma API Key pública.
                    Se o secret estiver correto, aguarde a liberação do acesso pela Saipos.
                  </p>
                </div>
              )}

              {/* Safe auth diagnostics — Saipos only, always shown when available */}
              {provider === "saipos" && testResult.debug && (
                <>
                  <SaiposAuthDebugPanel debug={testResult.debug as Record<string, unknown>} />
                  <SaiposCopyDiagnosticsButton debug={testResult.debug as Record<string, unknown>} />
                </>
              )}
            </>
          )}

          {/* Config form (owner-only) */}
          {isOwner ? (
            <div>
              <p className="mb-4 text-sm font-semibold text-ink2">Configuração</p>
              {provider === "whatsapp"    && <WhatsAppForm    />}
              {provider === "stone"       && <StoneForm       view={view} saving={saving} onSave={handleSave} />}
              {provider === "mercadopago" && <MercadoPagoForm view={view} saving={saving} onSave={handleSave} />}
              {provider === "sumup"       && <SumUpForm       view={view} saving={saving} onSave={handleSave} />}
              {provider === "openai"      && <OpenAIForm      view={view} saving={saving} onSave={handleSave} />}
              {provider === "saipos"      && <SaiposForm      view={view} saving={saving} onSave={handleSave} />}
            </div>
          ) : (
            <div className="rounded-xl border border-line bg-[#FAFAF8] px-4 py-3 text-sm text-muted">
              Apenas o proprietário pode editar as configurações de integração.
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="border-t border-line px-5 py-4 space-y-2">
          {/* Test connection */}
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || status === "unconfigured"}
            className="w-full rounded-xl border border-line2 bg-paper px-4 py-2.5 text-sm font-semibold text-ink2 shadow-sm hover:bg-[#FAFAF8] disabled:opacity-40 transition"
          >
            {testing ? "Testando…" : "Testar conexão"}
          </button>

          {/* Disconnect */}
          {isOwner && view?.isActive && (
            <button
              type="button"
              onClick={handleDisconnect}
              className="w-full rounded-xl border border-red-200 bg-paper px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 transition"
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
  const router = useRouter();
  const [views, setViews]         = useState<Record<string, IntegrationView>>({});
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState<Provider | null>(null);

  const loadAll = useCallback(async () => {
    const [results, metaResult] = await Promise.all([
      Promise.allSettled(INTEGRATIONS.map((i) => apiFetch(`/api/integrations/${i.provider}`))),
      apiFetch("/api/integrations/whatsapp-business"),
    ]);
    const map: Record<string, IntegrationView> = {};
    results.forEach((r, idx) => {
      const integration = INTEGRATIONS[idx];
      if (r.status === "fulfilled" && r.value.ok && integration) {
        // Google returns a custom shape ({ connected, ... }) — normalize to a card view.
        map[integration.provider] = integration.provider === "google"
          ? googleToView(r.value.data)
          : (r.value.data as IntegrationView);
      }
    });
    // Um único card de WhatsApp: `/api/integrations/whatsapp` e
    // `/api/integrations/whatsapp-business` olham a MESMA conta da Meta por ângulos
    // diferentes (config gravada × conta conectada). `mergeStatus` continua sendo o
    // conservador entre os dois — nenhum dos dois sozinho pode dizer "conectado".
    if (metaResult.ok && metaResult.data) {
      const metaView = metaResult.data as IntegrationView;
      const waView   = map["whatsapp"];
      const combined = mergeStatus(waView?.status, metaView.status);
      map["whatsapp"] = waView
        ? { ...waView, status: combined, isActive: combined === "active" }
        : { ...metaView, status: combined, isActive: combined === "active" };
    }
    setViews(map);
    setLoading(false);
  }, []);

  const refreshOne = useCallback(async (provider: Provider) => {
    const { ok, data } = await apiFetch(`/api/integrations/${provider}`);
    if (!ok) return;
    if (provider === "whatsapp") {
      // Rebusca o status da conta da Meta e combina (ver loadAll).
      const metaResult = await apiFetch("/api/integrations/whatsapp-business");
      const waView = data as IntegrationView;
      if (metaResult.ok && metaResult.data) {
        const metaView = metaResult.data as IntegrationView;
        const combined = mergeStatus(waView.status, metaView.status);
        setViews((prev) => ({ ...prev, whatsapp: { ...waView, status: combined, isActive: combined === "active" } }));
      } else {
        setViews((prev) => ({ ...prev, whatsapp: waView }));
      }
    } else {
      setViews((prev) => ({ ...prev, [provider]: data as IntegrationView }));
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Summary counts
  const total     = INTEGRATIONS.length;
  const connected = Object.values(views).filter((v) => v.status === "active").length;
  const withError = Object.values(views).filter((v) => v.status === "error").length;
  // Canal mudo tem chip próprio: somar em "Conectado" era exatamente a mentira
  // antiga, e escondê-lo dentro de "Pendente" o tornaria invisível de novo.
  const stale     = Object.values(views).filter((v) => v.status === "attention").length;
  const pending   = total - connected - withError - stale;

  return (
    <div className="flex h-full min-h-0">
      {/* Left: list */}
      <div className={`flex flex-1 flex-col overflow-hidden ${selected ? "hidden lg:flex" : "flex"}`}>
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {/* Header */}
          <div className="mb-6">
            <p className="text-sm text-muted">
              Conecte e monitore as tecnologias do seu restaurante.
            </p>

            {/* Summary row */}
            {!loading && (
              <div className="mt-4 flex flex-wrap gap-3">
                <SummaryChip label="Total" value={total} color="gray" />
                <SummaryChip label="Conectado" value={connected} color="green" />
                <SummaryChip label="Pendente" value={pending} color="yellow" />
                {stale > 0 && <SummaryChip label="Sem receber" value={stale} color="yellow" />}
                {withError > 0 && <SummaryChip label="Com erro" value={withError} color="red" />}
              </div>
            )}
          </div>

          {/* Conexões externas (API) — first-class feature card, links to its
              own page. Not part of the status-fetched INTEGRATIONS grid. */}
          <Link
            href="/integracoes/api"
            className="mb-3 flex items-center gap-4 rounded-2xl border border-brand-200 bg-brand-50/60 p-5 shadow-sm transition-all hover:shadow-md hover:border-brand-300"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-xl text-white shadow-sm">
              🔌
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-ink">Conexões externas (API)</span>
                <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-700">
                  Novo
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Gere uma chave e outros sistemas (ex.: Foocci Manager) recebem suas vendas sozinhos.
              </p>
            </div>
            <span className="shrink-0 text-brand-600">›</span>
          </Link>

          {/* Cards */}
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-2xl bg-[#F4F4F2]" />
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
                  onClick={() =>
                    meta.configureHref
                      ? router.push(meta.configureHref)
                      : setSelected(selected === meta.provider ? null : meta.provider)
                  }
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
    gray:   "bg-[#F4F4F2] text-ink2",
    green:  "bg-green-100 text-green-700",
    yellow: "bg-amber-100 text-amber-700",
    red:    "bg-red-100 text-red-600",
  }[color];

  return (
    <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${cls}`}>
      <span className="text-sm font-bold">{value}</span>
      {label}
    </span>
  );
}
