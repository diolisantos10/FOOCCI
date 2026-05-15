"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

type ConnStatus = "unconfigured" | "configured" | "active" | "error" | "pending_validation";

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

// ── Field error ───────────────────────────────────────────────────────────────

function FieldError({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <p className="mt-1 text-xs font-medium text-red-600">{msg}</p>;
}

// ── Connection status indicator ───────────────────────────────────────────────

type SimpleStatus = "connected" | "connecting" | "error" | "unconfigured";

function viewToSimple(s: ConnStatus): SimpleStatus {
  if (s === "active")             return "connected";
  if (s === "error")              return "error";
  if (s === "pending_validation") return "connecting";
  if (s === "configured")         return "unconfigured"; // credentials exist, not yet connected
  return "unconfigured";
}

const STATUS_META: Record<SimpleStatus, { label: string; dot: string; ring: string; text: string }> = {
  connected:    { label: "Conectado",          dot: "bg-green-500", ring: "ring-green-500/20", text: "text-green-700" },
  connecting:   { label: "Aguardando conexão", dot: "bg-amber-500", ring: "ring-amber-500/20", text: "text-amber-700" },
  error:        { label: "Erro de conexão",    dot: "bg-red-500",   ring: "ring-red-500/20",   text: "text-red-700"   },
  unconfigured: { label: "Não conectado",      dot: "bg-gray-400",  ring: "ring-gray-300",     text: "text-gray-500"  },
};

function ConnectionPill({ status }: { status: SimpleStatus }) {
  const { label, dot, text } = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${text}`}>
      <span className={`h-2 w-2 rounded-full ${dot} ${status === "connecting" ? "animate-pulse" : ""}`} />
      {label}
    </span>
  );
}

// ── Simple QR / connection panel ──────────────────────────────────────────────

type QRState = "idle" | "loading" | "shown" | "connected" | "unconfigured" | "error";

function SimpleQRPanel({
  isConfigured,
  isOwner,
  isActive,
  onDisconnect,
}: {
  isConfigured: boolean;
  isOwner:      boolean;
  isActive:     boolean;
  onDisconnect: () => void;
}) {
  const [qrBase64,      setQrBase64]      = useState<string | null>(null);
  const [qrState,       setQrState]       = useState<QRState>("idle");
  const [disconnecting, setDisconnecting] = useState(false);
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
    } else if (qr.error === "not_configured") {
      setQrBase64(null);
      setQrState("unconfigured");
      stopPolling();
    } else if (!qr.base64 && !qr.error) {
      // Instance is already connected
      setQrBase64(null);
      setQrState("connected");
      stopPolling();
    } else {
      // evolution_error or other — likely already connected or transient
      setQrBase64(null);
      setQrState("error");
      stopPolling();
    }
  };

  const handleGenerateQR = async () => {
    setQrState("loading");
    setQrBase64(null);
    await fetchQR();
    stopPolling();
    intervalRef.current = setInterval(fetchQR, 30_000);
  };

  const handleDisconnectClick = async () => {
    setDisconnecting(true);
    await onDisconnect();
    setDisconnecting(false);
    setQrState("idle");
  };

  useEffect(() => () => stopPolling(), []);

  // Not configured — friendly gated message
  if (!isConfigured) {
    return (
      <div className="rounded-2xl border border-amber-100 bg-amber-50 px-5 py-4 space-y-1.5">
        <p className="text-sm font-semibold text-amber-800">
          WhatsApp ainda não está configurado
        </p>
        <p className="text-xs text-amber-700">
          Entre em contato com o suporte Foocci para ativar o WhatsApp neste restaurante.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">

      {/* Main CTA */}
      {qrState === "idle" && (
        <button
          type="button"
          onClick={() => void handleGenerateQR()}
          className="w-full rounded-2xl bg-green-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-green-700 active:scale-[0.99] transition"
        >
          {isActive ? "Reconectar WhatsApp" : "Conectar WhatsApp"}
        </button>
      )}

      {qrState === "loading" && (
        <div className="flex items-center justify-center gap-2.5 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4 text-sm text-gray-600">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-green-600 border-t-transparent" />
          Gerando QR Code…
        </div>
      )}

      {qrState === "shown" && qrBase64 && (
        <div className="rounded-2xl border border-green-100 bg-green-50 p-4 space-y-3">
          <p className="text-xs font-semibold text-green-800">
            Escaneie com o WhatsApp do restaurante:
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrBase64}
            alt="QR Code WhatsApp"
            className="rounded-xl border border-green-200 shadow-sm"
            style={{ width: 200, height: 200 }}
          />
          <ol className="space-y-0.5 text-[11px] text-green-700 list-decimal list-inside">
            <li>Abra o WhatsApp no celular</li>
            <li>Toque em Configurações → Aparelhos conectados</li>
            <li>Toque em Conectar aparelho</li>
          </ol>
          <button
            type="button"
            onClick={() => void handleGenerateQR()}
            className="w-full rounded-xl border border-green-200 bg-white px-3 py-2 text-xs font-medium text-green-700 hover:bg-green-50 transition"
          >
            Atualizar QR Code
          </button>
        </div>
      )}

      {qrState === "connected" && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-green-100 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          WhatsApp já está conectado!
        </div>
      )}

      {qrState === "unconfigured" && (
        <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800 space-y-1">
          <p className="font-semibold">WhatsApp não configurado</p>
          <p className="text-xs">Entre em contato com o suporte Foocci para ativar o WhatsApp neste restaurante.</p>
        </div>
      )}

      {qrState === "error" && (
        <div className="space-y-2">
          <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700 space-y-1">
            <p className="font-semibold">Não conseguimos gerar o QR Code</p>
            <p className="text-xs">Tente novamente. Se o problema persistir, fale com o suporte Foocci.</p>
          </div>
          <button
            type="button"
            onClick={() => void handleGenerateQR()}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Reconnect + Disconnect row */}
      {(qrState === "connected" || (qrState === "shown" && isActive)) && (
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => void handleGenerateQR()}
            className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition"
          >
            Reconectar
          </button>
          {isOwner && (
            <button
              type="button"
              onClick={() => void handleDisconnectClick()}
              disabled={disconnecting}
              className="flex-1 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition"
            >
              {disconnecting ? "…" : "Desconectar"}
            </button>
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
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [isAdvancedOpen,  setIsAdvancedOpen]  = useState(false);

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

  // Auto-open advanced section when the saved config has an invalid URL,
  // so support can fix it without hunting for the collapsed panel.
  useEffect(() => {
    if (!view || !isOwner) return;
    const urlErr = view.fields.baseUrl ? validateBaseUrl(view.fields.baseUrl) : null;
    if (urlErr) setIsAdvancedOpen(true);
  }, [view, isOwner]);

  // ── Computed ───────────────────────────────────────────────────────────────
  const f             = view?.fields ?? {};
  const hasExistingKey = !!f.apiKeyPreview;

  // Validate the URL that is already saved in the database (not the form input).
  // An invalid saved value (e.g. an email) means the config is not usable.
  const loadedBaseUrlErr = f.baseUrl ? validateBaseUrl(f.baseUrl) : null;
  const isConfigured     = view?.status !== "unconfigured" && !!f.instanceName && !loadedBaseUrlErr;
  const simpleStatus     = viewToSimple(view?.status ?? "unconfigured");

  // Per-field errors — only shown after first Save attempt
  const instanceNameErr = submitAttempted ? validateInstanceName(instanceName) : null;
  const baseUrlErr      = submitAttempted ? validateBaseUrl(baseUrl)           : null;
  const apiKeyErr       = (submitAttempted && !apiKey.trim() && !hasExistingKey)
    ? "Informe a API Key da Evolution API."
    : null;

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSubmitAttempted(true);

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
    setFeedback(null);
    const { ok } = await apiFetch("/api/integrations/whatsapp", "DELETE");
    if (ok) {
      setFeedback({ type: "ok", msg: "WhatsApp desconectado." });
      void loadView();
    } else {
      setFeedback({ type: "err", msg: "Erro ao desconectar. Tente novamente." });
    }
  }

  const webhookUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/webhooks/evolution`
    : "/api/webhooks/evolution";

  const lastTested = view?.lastTestedAt
    ? new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      }).format(new Date(view.lastTestedAt))
    : null;

  if (loading) {
    return (
      <div className="mx-auto max-w-lg p-6 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-gray-100" />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg p-6 space-y-6">

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
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-gray-900">WhatsApp</h1>
          <p className="text-xs text-gray-500">
            Atenda clientes do restaurante pelo WhatsApp.
          </p>
        </div>
        <ConnectionPill status={simpleStatus} />
      </div>

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

      {/* ── Simple connection card ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm space-y-4">
        <div>
          <p className="text-sm font-semibold text-gray-800">Conectar WhatsApp do restaurante</p>
          <p className="mt-0.5 text-xs text-gray-500">
            Escaneie o QR Code abaixo com o celular do restaurante para começar a atender clientes.
          </p>
        </div>

        <SimpleQRPanel
          isConfigured={isConfigured}
          isOwner={isOwner}
          isActive={view?.isActive ?? false}
          onDisconnect={handleDisconnect}
        />
      </div>

      {/* Agent behavior link */}
      <div className="rounded-xl border border-brand-100 bg-brand-50 px-4 py-3">
        <p className="text-xs text-brand-700">
          Quer configurar como o agente responde os clientes?{" "}
          <Link href="/agente-ia" className="font-semibold underline">
            Agentes IA → WhatsApp Host
          </Link>
        </p>
      </div>

      {/* ── Advanced settings (OWNER only, collapsed) ──────────────────────── */}
      {isOwner && (
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">

          {/* Toggle header */}
          <button
            type="button"
            onClick={() => setIsAdvancedOpen((v) => !v)}
            className="flex w-full items-center justify-between px-5 py-3.5 text-left hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-sm font-semibold text-gray-700">
                Configurações avançadas
              </span>
              <span className="rounded-full border border-gray-200 px-2 py-px text-[10px] font-medium text-gray-400">
                suporte técnico
              </span>
            </div>
            <span className={`text-gray-400 transition-transform ${isAdvancedOpen ? "rotate-180" : ""}`}>
              ▾
            </span>
          </button>

          {isAdvancedOpen && (
            <div className="border-t border-gray-100 px-5 pb-5 pt-4 space-y-5">

              {/* Warning */}
              <div className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                <span className="mt-0.5 text-amber-500">⚠</span>
                <p className="text-xs text-amber-800">
                  <span className="font-semibold">Uso interno Foocci / suporte técnico.</span>{" "}
                  Não altere estes campos sem orientação do suporte. Credenciais incorretas desconectam o WhatsApp.
                </p>
              </div>

              {/* Last tested info */}
              {(lastTested || view?.lastError) && (
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-xs space-y-1">
                  {lastTested && (
                    <p className="text-gray-500">
                      <span className="font-medium text-gray-700">Último teste:</span> {lastTested}
                    </p>
                  )}
                  {view?.lastError && (
                    <p className={view.isActive ? "text-green-700" : "text-red-600"}>
                      {view.isActive ? "✓" : "⚠"} {view.lastError}
                    </p>
                  )}
                </div>
              )}

              <form onSubmit={(e) => void handleSave(e)} className="space-y-4">

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
                    Nome da instância criada na Evolution API. Ex: sushicazza
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
                  {/* Persistent warning when the already-saved value is invalid */}
                  {loadedBaseUrlErr && !baseUrlErr && (
                    <div className="mt-1 flex items-start gap-1.5 rounded-lg border border-red-100 bg-red-50 px-2.5 py-2">
                      <span className="shrink-0 text-xs text-red-500">⚠</span>
                      <p className="text-xs text-red-700">
                        A URL do servidor Evolution salva está inválida.
                        Informe a URL pública da Evolution API.
                      </p>
                    </div>
                  )}
                  <FieldError msg={baseUrlErr} />
                  <p className="mt-1 text-xs text-gray-400">
                    URL pública do serviço Evolution API hospedado separadamente.
                    Não é e-mail. {URL_EXAMPLE}
                  </p>
                </div>

                {/* API Key */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    API Key
                  </label>
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
                    AUTHENTICATION_API_KEY configurada no serviço Evolution API.
                    Nunca compartilhe com o restaurante.
                  </p>
                </div>

                {/* Webhook Secret */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Webhook Secret
                  </label>
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

                {/* Webhook URL */}
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-3 space-y-1">
                  <p className="text-xs font-medium text-gray-700">
                    URL do Webhook — configure na Evolution API:
                  </p>
                  <p className="break-all font-mono text-xs text-gray-500">{webhookUrl}</p>
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition"
                  >
                    {saving ? "Salvando…" : "Salvar credenciais"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleTest()}
                    disabled={testing || view?.status === "unconfigured" || !view}
                    className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition"
                  >
                    {testing ? "Testando…" : "Testar conexão"}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
