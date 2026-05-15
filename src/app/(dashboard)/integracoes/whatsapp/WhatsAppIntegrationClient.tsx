"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

type ConnStatus = "unconfigured" | "active" | "error" | "pending_validation";

interface EvolutionView {
  provider:     string;
  status:       ConnStatus;
  isActive:     boolean;
  lastTestedAt: string | null;
  lastError:    string | null;
  fields: {
    instanceName?:         string | null;
    baseUrl?:              string | null;
    apiKeyPreview?:        string | null;
    webhookSecretPreview?: string | null;
  };
}

// ── API helper ────────────────────────────────────────────────────────────────

async function apiFetch(url: string, method = "GET", body?: object) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body:    body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data: json?.data ?? json };
}

// ── Validation helpers ────────────────────────────────────────────────────────

function validateInstanceName(v: string): string | null {
  if (!v.trim()) return "Informe o nome da instância do WhatsApp.";
  return null;
}

const URL_EXAMPLE = "Exemplo: https://sua-evolution-api.up.railway.app";

function validateBaseUrl(v: string): string | null {
  const t = v.trim();
  if (!t)
    return `Informe a URL do servidor Evolution. ${URL_EXAMPLE}`;
  // Detect email typed instead of URL (has @ without an http/https prefix)
  if (!t.startsWith("http") && t.includes("@"))
    return `Este campo não aceita e-mail. Informe a URL do servidor. ${URL_EXAMPLE}`;
  try {
    const parsed = new URL(t);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      return `A URL deve começar com http:// ou https://. ${URL_EXAMPLE}`;
    return null;
  } catch {
    return `URL inválida. Informe a URL pública do servidor Evolution. ${URL_EXAMPLE}`;
  }
}

function normalizeBaseUrl(v: string): string {
  return v.trim().replace(/\/+$/, "");
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ConnStatus }) {
  const map: Record<ConnStatus, { label: string; cls: string; dot: string }> = {
    active:             { label: "Ativo",              dot: "bg-green-500", cls: "bg-green-100 text-green-700"   },
    error:              { label: "Erro",               dot: "bg-red-500",   cls: "bg-red-100   text-red-700"     },
    pending_validation: { label: "Validação pendente", dot: "bg-amber-500", cls: "bg-amber-100 text-amber-700"   },
    unconfigured:       { label: "Não configurado",    dot: "bg-gray-400",  cls: "bg-gray-100  text-gray-600"    },
  };
  const { label, cls, dot } = map[status];
  return (
    <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

// ── Field error ───────────────────────────────────────────────────────────────

function FieldError({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <p className="mt-1 text-xs font-medium text-red-600">{msg}</p>;
}

// ── QR Code panel ─────────────────────────────────────────────────────────────

function QRPanel({
  isConfigValid,
  configErrors,
}: {
  isConfigValid: boolean;
  configErrors:  string[];
}) {
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [qrState,  setQrState]  = useState<"idle" | "loading" | "shown" | "connected" | "error">("idle");
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
      setQrBase64(null);
      setQrState(qr.error === "not_configured" ? "error" : "connected");
      stopPolling();
    }
  };

  const handleConnect = async () => {
    setQrState("loading");
    setQrBase64(null);
    await fetchQR();
    intervalRef.current = setInterval(fetchQR, 30_000);
  };

  useEffect(() => () => stopPolling(), []);

  return (
    <div className="rounded-xl border border-green-100 bg-green-50 p-4">
      <p className="mb-3 text-sm font-semibold text-green-800">Conectar WhatsApp via QR</p>

      {/* Show config issues before the user attempts to connect */}
      {!isConfigValid && configErrors.length > 0 && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 space-y-1">
          <p className="text-xs font-semibold text-amber-800">
            Salve as credenciais antes de conectar:
          </p>
          <ul className="list-disc list-inside space-y-0.5">
            {configErrors.map((err, i) => (
              <li key={i} className="text-xs text-amber-700">{err}</li>
            ))}
          </ul>
        </div>
      )}

      {qrState === "idle" && (
        <button
          type="button"
          onClick={isConfigValid ? () => void handleConnect() : undefined}
          disabled={!isConfigValid}
          className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
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
        <div className="flex flex-col items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrBase64}
            alt="QR Code WhatsApp"
            className="rounded-xl border border-green-200 shadow-sm"
            style={{ width: 200, height: 200 }}
          />
          <p className="text-[11px] text-green-700">
            WhatsApp → Configurações → Aparelhos conectados → Conectar aparelho
          </p>
          <button
            type="button"
            onClick={() => void handleConnect()}
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
        <div className="space-y-1.5">
          <p className="text-sm text-red-600">Não foi possível gerar o QR Code.</p>
          {configErrors.length > 0 ? (
            <ul className="list-disc list-inside space-y-0.5">
              {configErrors.map((err, i) => (
                <li key={i} className="text-xs text-red-600">{err}</li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-red-600">
              Verifique as credenciais salvas e tente novamente.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function WhatsAppIntegrationClient({ userRole }: { userRole: string }) {
  const isOwner = userRole === "OWNER";

  const [view,    setView]    = useState<EvolutionView | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  // Tracks whether the user has ever clicked "Salvar credenciais" — gates per-field errors
  const [submitAttempted, setSubmitAttempted] = useState(false);

  // Form state — secrets always blank on load (never pre-filled)
  const [instanceName,  setInstanceName]  = useState("");
  const [baseUrl,       setBaseUrl]       = useState("");
  const [apiKey,        setApiKey]        = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");

  const loadView = useCallback(async () => {
    setLoading(true);
    const { ok, data } = await apiFetch("/api/integrations/whatsapp");
    if (ok && data) {
      const v = data as EvolutionView;
      setView(v);
      setInstanceName(v.fields.instanceName ?? "");
      setBaseUrl(v.fields.baseUrl ?? "");
      setApiKey("");
      setWebhookSecret("");
    }
    setLoading(false);
  }, []);

  useEffect(() => { void loadView(); }, [loadView]);

  // ── Computed validation ────────────────────────────────────────────────────
  const f             = view?.fields ?? {};
  const hasExistingKey = !!f.apiKeyPreview;

  // Per-field errors — only shown after the user clicks Save
  const instanceNameErr = submitAttempted ? validateInstanceName(instanceName) : null;
  const baseUrlErr      = submitAttempted ? validateBaseUrl(baseUrl) : null;
  const apiKeyErr       = (submitAttempted && !apiKey.trim() && !hasExistingKey)
    ? "Informe a API Key da Evolution API."
    : null;

  // Always-computed for QRPanel (independent of submitAttempted)
  const _instErr    = validateInstanceName(instanceName);
  const _urlErr     = validateBaseUrl(baseUrl);
  const _keyMissing = !apiKey.trim() && !hasExistingKey;
  const isConfigValid = !_instErr && !_urlErr && !_keyMissing;
  const configErrors: string[] = [
    _instErr    ? "Nome da instância ausente" : null,
    _urlErr     ? "URL inválida"              : null,
    _keyMissing ? "API Key ausente"           : null,
  ].filter(Boolean) as string[];

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSubmitAttempted(true);

    // Client-side guard before hitting the API
    const instErr = validateInstanceName(instanceName);
    const urlErr  = validateBaseUrl(baseUrl);
    const keyErr  = !apiKey.trim() && !hasExistingKey;
    if (instErr || urlErr || keyErr) return;

    setSaving(true);
    setFeedback(null);
    const { ok, data } = await apiFetch("/api/integrations/whatsapp", "PUT", {
      instanceName: instanceName.trim(),
      baseUrl:      normalizeBaseUrl(baseUrl),
      apiKey,
      webhookSecret,
    });
    setSaving(false);

    if (ok) {
      setFeedback({ type: "ok", msg: "Configuração salva com sucesso." });
      setApiKey("");
      setWebhookSecret("");
      setSubmitAttempted(false);
      void loadView();
    } else {
      const err = (data as { error?: string })?.error ?? "Erro ao salvar.";
      setFeedback({ type: "err", msg: err });
    }
  }

  async function handleTest() {
    setTesting(true);
    setFeedback(null);
    const { data } = await apiFetch("/api/integrations/whatsapp/test", "POST");
    setTesting(false);
    const result = data as { success?: boolean; message?: string };
    setFeedback({
      type: result.success ? "ok" : "err",
      msg:  result.message ?? (result.success ? "Conexão OK." : "Falha na conexão."),
    });
    void loadView();
  }

  async function handleDisconnect() {
    if (!confirm("Desconectar WhatsApp? As credenciais serão desativadas.")) return;
    setFeedback(null);
    const { ok } = await apiFetch("/api/integrations/whatsapp", "DELETE");
    if (ok) {
      setFeedback({ type: "ok", msg: "WhatsApp desconectado." });
      void loadView();
    } else {
      setFeedback({ type: "err", msg: "Erro ao desconectar." });
    }
  }

  const webhookUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/webhooks/evolution`
    : "/api/webhooks/evolution";

  const status: ConnStatus = view?.status ?? "unconfigured";

  const lastTested = view?.lastTestedAt
    ? new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      }).format(new Date(view.lastTestedAt))
    : null;

  if (loading) {
    return (
      <div className="mx-auto max-w-xl p-6 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-gray-100" />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl p-6 space-y-6">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/integracoes" className="hover:text-gray-800 transition-colors">
          Integrações
        </Link>
        <span>/</span>
        <span className="font-semibold text-gray-800">WhatsApp</span>
      </div>

      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-green-500 text-2xl text-white shadow-sm">
          💬
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-gray-900">WhatsApp — Evolution API</h1>
          <p className="text-xs text-gray-500">
            Conexão técnica do WhatsApp Business. Comportamento do agente é configurado em{" "}
            <Link href="/agente-ia" className="font-medium text-brand-600 hover:underline">
              Agentes IA
            </Link>
            .
          </p>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Last tested / error */}
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

      {/* QR Code panel */}
      <QRPanel isConfigValid={isConfigValid} configErrors={configErrors} />

      {/* Config form */}
      {isOwner ? (
        <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm space-y-5">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Credenciais Evolution API</h2>
              <p className="mt-0.5 text-xs text-gray-500">
                Dados da instância no seu servidor Evolution. Secrets criptografados em AES-256.
              </p>
            </div>

            {/* Instance name */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Nome da instância
              </label>
              <input
                type="text"
                value={instanceName}
                onChange={(e) => setInstanceName(e.target.value)}
                placeholder="sushicazza"
                className={`w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition ${
                  instanceNameErr
                    ? "border-red-400 focus:border-red-400 focus:ring-red-100"
                    : "border-gray-200 focus:border-indigo-400 focus:ring-indigo-100"
                }`}
              />
              <FieldError msg={instanceNameErr} />
              <p className="mt-1 text-xs text-gray-400">
                Nome da instância criada na Evolution API. Exemplo: sushicazza
              </p>
            </div>

            {/* Base URL */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                URL do servidor Evolution
              </label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://evo.seuservidor.com"
                className={`w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition ${
                  baseUrlErr
                    ? "border-red-400 focus:border-red-400 focus:ring-red-100"
                    : "border-gray-200 focus:border-indigo-400 focus:ring-indigo-100"
                }`}
              />
              <FieldError msg={baseUrlErr} />
              <p className="mt-1 text-xs text-gray-400">
                URL pública onde sua Evolution API está rodando. Não use e-mail aqui.
              </p>
            </div>

            {/* API Key */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">API Key</label>
              {f.apiKeyPreview && (
                <p className="mb-1 text-xs text-gray-500">
                  Atual:{" "}
                  <span className="font-mono font-semibold text-gray-700">{f.apiKeyPreview}</span>
                </p>
              )}
              <input
                type="password"
                name="apiKey"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={
                  f.apiKeyPreview
                    ? "Nova chave — deixe em branco para manter"
                    : "Cole sua API Key"
                }
                className={`w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition ${
                  apiKeyErr
                    ? "border-red-400 focus:border-red-400 focus:ring-red-100"
                    : "border-gray-200 focus:border-indigo-400 focus:ring-indigo-100"
                }`}
              />
              <FieldError msg={apiKeyErr} />
              <p className="mt-1 text-xs text-gray-400">
                Chave de autenticação da Evolution API. Ela será salva de forma segura.
              </p>
            </div>

            {/* Webhook Secret */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Webhook Secret</label>
              {f.webhookSecretPreview && (
                <p className="mb-1 text-xs text-gray-500">
                  Atual:{" "}
                  <span className="font-mono font-semibold text-gray-700">{f.webhookSecretPreview}</span>
                </p>
              )}
              <input
                type="password"
                name="webhookSecret"
                autoComplete="off"
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                placeholder={
                  f.webhookSecretPreview
                    ? "Novo secret — deixe em branco para manter"
                    : "Cole o Webhook Secret"
                }
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition"
              />
              <p className="mt-1 text-xs text-gray-400">
                Usado para validar a autenticidade das mensagens recebidas.
              </p>
            </div>

            {/* Webhook URL (read-only) */}
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
              <p className="text-xs font-medium text-gray-700">URL do Webhook para configurar na Evolution:</p>
              <p className="mt-1 break-all font-mono text-xs text-gray-500">{webhookUrl}</p>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition"
              >
                {saving ? "Salvando…" : "Salvar credenciais"}
              </button>
            </div>
          </div>
        </form>
      ) : (
        <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-500">
          Apenas o proprietário pode editar as configurações de integração.
        </div>
      )}

      {/* Actions */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => void handleTest()}
          disabled={testing || status === "unconfigured"}
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-40 transition"
        >
          {testing ? "Testando…" : "Testar conexão"}
        </button>

        {isOwner && view?.isActive && (
          <button
            type="button"
            onClick={() => void handleDisconnect()}
            className="w-full rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 transition"
          >
            Desconectar
          </button>
        )}
      </div>

      {/* Scope note */}
      <div className="rounded-xl border border-brand-100 bg-brand-50 px-4 py-3">
        <p className="text-xs font-medium text-brand-800">Esta página gerencia apenas a conexão técnica.</p>
        <p className="mt-1 text-xs text-brand-700">
          Nome do agente, mensagem de boas-vindas, modo de operação e fluxos de menu são configurados em{" "}
          <Link href="/agente-ia" className="font-semibold underline">
            Agentes IA → WhatsApp Host
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
