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

type QRState = "idle" | "creating" | "loading" | "restarting" | "generating" | "shown" | "pairing" | "connected" | "unconfigured" | "error";

function SimpleQRPanel({
  isConfigured,
  isOwner,
  isActive,
  onDisconnect,
  onStartConnect,
  onConnected,
  autoStart,
}: {
  isConfigured:   boolean;
  isOwner:        boolean;
  isActive:       boolean;
  onDisconnect:   () => void;
  onStartConnect: () => void;
  onConnected:    () => void;
  autoStart?:     boolean;
}) {
  const [qrBase64,      setQrBase64]      = useState<string | null>(null);
  const [qrPairingCode, setQrPairingCode] = useState<string | null>(null);
  const [qrState,       setQrState]       = useState<QRState>("idle");
  const [qrErrorMsg,    setQrErrorMsg]    = useState<string | null>(null);
  const [qrDiagnostic,  setQrDiagnostic]  = useState<{
    stage?: string;
    create_response_keys?: string[];
    create_response_shape?: Record<string, string[]>;
    qrcode_shape?: string[];
    qrcode_is_count_only?: boolean;
    poll_rounds_count?: number;
    all_count_only?: boolean;
    recommendation?: string;
    message?: string;
  } | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-start on fresh instance (post hard-reset from parent)
  useEffect(() => {
    if (autoStart && isConfigured) {
      void handleCreateQR();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopPolling = () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  };

  // Poll /api/evolution/qr only to detect when user scans (not to re-fetch QR image)
  const checkConnection = async () => {
    const res  = await fetch("/api/evolution/qr");
    const json = await res.json().catch(() => ({}));
    const d    = (json?.data ?? json) as { connected?: boolean };
    if (d.connected) {
      setQrState("connected");
      stopPolling();
      onConnected();
    }
  };

  // Primary QR flow: logout/delete/create → capture QR from create response directly.
  // Never relies on GET /instance/connect as QR source (returns { count } in v2.2.3).
  const handleCreateQR = async () => {
    onStartConnect();
    setQrState("creating");
    setQrBase64(null);
    setQrPairingCode(null);
    setQrErrorMsg(null);
    setQrDiagnostic(null);
    stopPolling();

    const res  = await fetch("/api/evolution/hard-reset", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    const d    = (json?.data ?? json) as {
      ok?: boolean;
      success?: boolean;
      qr_found?: boolean;
      qr_base64?: string | null;
      qr_text?: string | null;
      qr_source?: string | null;
      create_response_keys?: string[];
      create_response_shape?: Record<string, string[]>;
      qrcode_shape?: string[];
      qrcode_is_count_only?: boolean;
      alt_create_keys?: string[];
      alt_create_shape?: Record<string, string[]>;
      stage?: string;
      poll_rounds?: Array<{
        round: number;
        endpoints: Array<{ method: string; path: string; httpStatus: number; keys: string[]; qrFound: boolean; isCountOnly: boolean; error?: string }>;
        qrFound: boolean;
      }>;
      poll_rounds_count?: number;
      recommendation?: string;
      message?: string;
      error?: string;
    };

    if (!res.ok || !d.success) {
      setQrState("error");
      setQrErrorMsg(d.error ?? "Erro ao recriar instância WhatsApp. Tente novamente.");
      return;
    }

    if (d.qr_found && d.qr_base64) {
      setQrBase64(d.qr_base64);
      setQrPairingCode(null);
      setQrState("shown");
      stopPolling();
      intervalRef.current = setInterval(() => void checkConnection(), 10_000);
    } else {
      setQrBase64(null);
      setQrState("error");
      setQrDiagnostic({
        stage:                d.stage,
        create_response_keys: d.create_response_keys,
        create_response_shape: d.create_response_shape,
        qrcode_shape:          d.qrcode_shape,
        qrcode_is_count_only:  d.qrcode_is_count_only,
        poll_rounds_count:     d.poll_rounds_count,
        all_count_only:        (d.poll_rounds ?? []).length > 0 &&
          d.poll_rounds!.every((r) => r.endpoints.every((e) => e.isCountOnly || e.httpStatus !== 200)),
        recommendation:        d.recommendation,
        message:               d.message,
      });
      setQrErrorMsg(
        d.qrcode_is_count_only
          ? "A Evolution respondeu, mas retornou apenas um contador de QR ({ count }) — sem imagem ou código. Ver diagnóstico abaixo."
          : d.message ?? "A instância foi recriada, mas nenhum QR foi encontrado. Ver diagnóstico abaixo."
      );
    }
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
          onClick={() => void handleCreateQR()}
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

      {qrState === "creating" && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-center gap-2.5 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-4 text-sm text-indigo-700">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            Recriando instância e capturando QR…
          </div>
          <p className="text-center text-[11px] text-gray-400">
            Isso leva cerca de 5–10 segundos. Não feche esta página.
          </p>
        </div>
      )}

      {qrState === "restarting" && (
        <div className="space-y-2">
          <div className="flex items-center justify-center gap-2.5 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-4 text-sm text-amber-700">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
            Preparando instância WhatsApp… aguarde.
          </div>
          <p className="text-center text-[11px] text-gray-400">
            QR Code sendo gerado automaticamente. Pode levar até 15s.
          </p>
        </div>
      )}

      {qrState === "generating" && (
        <div className="space-y-2">
          <div className="flex items-center justify-center gap-2.5 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-4 text-sm text-blue-700">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            Evolution está gerando o QR Code…
          </div>
          <p className="text-center text-[11px] text-gray-400">
            Aguarde enquanto o servidor prepara um novo código. Pode levar até 30s.
          </p>
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
            onClick={() => void handleCreateQR()}
            className="w-full rounded-xl border border-green-200 bg-white px-3 py-2 text-xs font-medium text-green-700 hover:bg-green-50 transition"
          >
            Atualizar QR Code
          </button>
        </div>
      )}

      {qrState === "pairing" && qrPairingCode && (
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 space-y-3">
          <p className="text-xs font-semibold text-indigo-800">
            Use o código de pareamento no WhatsApp do restaurante:
          </p>
          <div className="rounded-xl border border-indigo-200 bg-white px-4 py-3 text-center">
            <span className="font-mono text-2xl font-bold tracking-widest text-indigo-700">
              {qrPairingCode}
            </span>
          </div>
          <ol className="space-y-0.5 text-[11px] text-indigo-700 list-decimal list-inside">
            <li>Abra o WhatsApp no celular</li>
            <li>Toque em Configurações → Aparelhos conectados</li>
            <li>Toque em &ldquo;Conectar com número de telefone&rdquo;</li>
            <li>Digite o código acima</li>
          </ol>
          <button
            type="button"
            onClick={() => void handleCreateQR()}
            className="w-full rounded-xl border border-indigo-200 bg-white px-3 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-50 transition"
          >
            Gerar novo código
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
          <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700 space-y-2">
            <p className="font-semibold">
              {qrDiagnostic?.qrcode_is_count_only ? "Evolution retornou apenas contador QR" : "QR Code não disponível"}
            </p>
            <p className="text-xs">
              {qrErrorMsg ?? "A instância Evolution não respondeu. Tente novamente."}
            </p>
            {qrDiagnostic && (
              <div className="rounded-lg border border-red-200 bg-white px-3 py-2 text-[11px] font-mono space-y-0.5 text-gray-600">
                {qrDiagnostic.stage && (
                  <p>stage: <span className="text-red-600">{qrDiagnostic.stage}</span></p>
                )}
                {qrDiagnostic.create_response_keys && (
                  <p>create_keys: [{qrDiagnostic.create_response_keys.join(", ")}]</p>
                )}
                {qrDiagnostic.qrcode_shape && (
                  <p>qrcode: [{qrDiagnostic.qrcode_shape.join(", ")}]{qrDiagnostic.qrcode_is_count_only ? " ← count only" : ""}</p>
                )}
                {qrDiagnostic.poll_rounds_count !== undefined && (
                  <p>
                    polls: {qrDiagnostic.poll_rounds_count} rodada(s) × 4 endpoints (60 s)
                    {qrDiagnostic.all_count_only ? " — todas retornaram {count}" : ""}
                  </p>
                )}
                {qrDiagnostic.recommendation && (
                  <p className="mt-1 text-amber-600 whitespace-pre-wrap">{qrDiagnostic.recommendation}</p>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => void handleCreateQR()}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
          >
            Gerar novo QR Code
          </button>
        </div>
      )}

      {/* Reconnect + Disconnect row */}
      {(qrState === "connected" || (qrState === "shown" && isActive)) && (
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => void handleCreateQR()}
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

// ── Webhook health card ────────────────────────────────────────────────────────

interface WebhookLogSummary {
  totalEvents:       number;
  realEvents:        number;
  selfTestEvents:    number;
  inboundToday:      number;
  acceptedRealEvents: number;
  lastEventAt:       string | null;
  lastRealEventAt:   string | null;
  lastSelfTestAt:    string | null;
  lastAcceptedAt:    string | null;
  lastError:         string | null;
}

interface WebhookLogEvent {
  id:              string;
  instanceName:    string;
  eventName:       string;
  accepted:        boolean;
  ignored:         boolean;
  error:           string | null;
  bodyKeys:        string[];
  direction:       string | null;
  createdAt:       string;
}

interface SyncWebhookResult {
  success:              boolean;
  instanceName:         string;
  webhookUrlConfigured: string;
  eventsConfigured:     string[];
  rawWebhookShapeKeys:  string[];
  webhookConfig: {
    url:             string | null;
    webhookByEvents: boolean | null;
    events:          string[];
    enabled:         boolean | null;
    urlMatches:      boolean;
  } | null;
  secretInfo?: {
    configuredSecretFromDb: boolean;
    sentSecret:             boolean;
    readBackSecretVisible:  boolean;
    tokenInUrl:             boolean;
  };
  instanceInfo: {
    connectionStatus: string | null;
    profileName:      string | null;
    ownerJidMasked:   string | null;
  } | null;
  error:          string | null;
  recommendation: string;
  debug?: {
    attemptedPayloads: string[];
    setResponses:      Array<{ label: string; ok: boolean; keys: string[]; error?: string }>;
    liveConfig:        Record<string, unknown> | null;
  };
}

interface AuthSelfTestResult {
  success:             boolean;
  instanceName:        string;
  hasSecret:           boolean;
  allWorkingCorrectly: boolean;
  diagnosis:           string;
  tests: {
    xEvolutionSecret:        { accepted: boolean; strategy: string | null };
    xEvolutionWebhookSecret: { accepted: boolean; strategy: string | null };
    xWebhookSecret:          { accepted: boolean; strategy: string | null };
    authorizationBearer:     { accepted: boolean; strategy: string | null };
    bodySecret:              { accepted: boolean; strategy: string | null };
    bodyApikey:              { accepted: boolean; strategy: string | null };
    queryToken:              { accepted: boolean; strategy: string | null };
  } | null;
  error?: string;
}

interface SelfTestResult {
  success:      boolean;
  instanceName: string;
  dbWrite:  { ok: boolean; rowId: string | null; error: string | null };
  parse:    { ok: boolean; event: Record<string, unknown> | null; error: string | null };
  diagnosis:    string;
}

type EventDiagnosticsVerdict =
  | "ok_waiting"
  | "no_messages_upsert"
  | "webhook_ok_not_emitting"
  | "instance_not_connected";

interface EventDiagnosticsResult {
  success:          boolean;
  instanceName:     string;
  connectionStatus: string | null;
  ownerJidMasked:   string | null;
  integration:      string | null;
  webhook: {
    url:               string | null;
    enabled:           boolean | null;
    webhookByEvents:   boolean | null;
    events:            string[];
    hasMessagesUpsert: boolean;
    hasMessagesUpdate: boolean;
    urlMatches:        boolean;
  };
  settings: {
    rejectCall:      boolean | null;
    groupsIgnore:    boolean | null;
    readMessages:    boolean | null;
    readStatus:      boolean | null;
    syncFullHistory: boolean | null;
    alwaysOnline:    boolean | null;
  };
  rawInstanceKeys:  string[];
  rawWebhookKeys:   string[];
  rawSettingsKeys:  string[];
  verdict:          EventDiagnosticsVerdict;
  verdictMessage:   string;
}

interface LiveConfigResult {
  success:          boolean;
  instanceName:     string;
  expectedUrl:      string;
  enabled:          boolean | null;
  url:              string | null;
  webhookByEvents:  boolean | null;
  events:           string[];
  secretPresent:    boolean;
  rawKeys:          string[];
  urlMatches:       boolean;
  urlBaseMatches:   boolean;
  tokenInUrl:       boolean;
  authMode:         "query_token" | "header_secret" | "unknown";
  byEventsIsFalse:  boolean;
  hasMessagesUpsert: boolean;
  isEnabled:        boolean;
  isHealthy:        boolean;
  issues:           string[];
  recommendation:   string;
}

// ── Event diagnostics result card ────────────────────────────────────────────

const VERDICT_META: Record<EventDiagnosticsVerdict, { icon: string; border: string; bg: string; text: string }> = {
  ok_waiting:              { icon: "✓", border: "border-green-200", bg: "bg-green-50",  text: "text-green-800" },
  no_messages_upsert:      { icon: "✗", border: "border-red-200",   bg: "bg-red-50",    text: "text-red-800"   },
  webhook_ok_not_emitting: { icon: "⚠", border: "border-amber-200", bg: "bg-amber-50",  text: "text-amber-800" },
  instance_not_connected:  { icon: "✗", border: "border-red-200",   bg: "bg-red-50",    text: "text-red-800"   },
};

function EventDiagCard({ result }: { result: EventDiagnosticsResult }) {
  const meta = VERDICT_META[result.verdict];
  return (
    <div className={`rounded-lg border ${meta.border} ${meta.bg} px-3 py-2.5 text-xs space-y-2`}>
      <p className={`font-semibold ${meta.text}`}>
        {meta.icon} {result.verdictMessage}
      </p>
      <div className={`font-mono text-[10px] space-y-0.5 bg-white/60 rounded border border-current/10 px-2 py-1.5 ${meta.text}`}>
        <p>
          <span className="text-gray-500">estado: </span>
          <span className={result.connectionStatus === "open" ? "text-green-700 font-bold" : "text-red-600 font-bold"}>
            {result.connectionStatus ?? "—"}
          </span>
        </p>
        {result.ownerJidMasked && (
          <p><span className="text-gray-500">número: </span>+{result.ownerJidMasked.split("@")[0]}</p>
        )}
        {result.integration && (
          <p><span className="text-gray-500">integration: </span>{result.integration}</p>
        )}
        <p>
          <span className="text-gray-500">MESSAGES_UPSERT: </span>
          <span className={result.webhook.hasMessagesUpsert ? "text-green-700" : "text-red-600 font-bold"}>
            {result.webhook.hasMessagesUpsert ? "✓ presente" : "✗ ausente"}
          </span>
        </p>
        <p>
          <span className="text-gray-500">webhookByEvents: </span>
          <span className={result.webhook.webhookByEvents === false ? "text-green-700" : "text-red-600"}>
            {String(result.webhook.webhookByEvents ?? "?")}
          </span>
        </p>
        <p>
          <span className="text-gray-500">enabled: </span>
          <span className={result.webhook.enabled ? "text-green-700" : "text-red-600"}>
            {String(result.webhook.enabled ?? "?")}
          </span>
        </p>
        {result.rawSettingsKeys.length > 0 && (
          <>
            {result.settings.groupsIgnore !== null && (
              <p><span className="text-gray-500">groupsIgnore: </span>{String(result.settings.groupsIgnore)}</p>
            )}
            {result.settings.rejectCall !== null && (
              <p><span className="text-gray-500">rejectCall: </span>{String(result.settings.rejectCall)}</p>
            )}
            {result.settings.syncFullHistory !== null && (
              <p><span className="text-gray-500">syncFullHistory: </span>{String(result.settings.syncFullHistory)}</p>
            )}
          </>
        )}
        {result.rawSettingsKeys.length === 0 && (
          <p className="text-gray-400">settings: endpoint não disponível nesta versão Evolution</p>
        )}
      </div>
    </div>
  );
}

function WebhookHealthCard({
  summary,
  loading,
  simpleStatus,
}: {
  summary:      WebhookLogSummary | null;
  loading:      boolean;
  simpleStatus: SimpleStatus;
}) {
  const now = Date.now();

  function healthStatus(): { label: string; color: string; dot: string } {
    if (!summary) return { label: "Sem dados", color: "text-gray-500", dot: "bg-gray-400" };
    // Use lastRealEventAt (ignores self_test synthetic writes)
    const lastReal = summary.lastRealEventAt ?? summary.lastEventAt;
    if (!lastReal) return { label: "Nenhum evento real recebido", color: "text-amber-600", dot: "bg-amber-400" };
    const age = now - new Date(lastReal).getTime();
    if (age < 5 * 60 * 1000) return { label: "Recebendo", color: "text-green-700", dot: "bg-green-500" };
    if (age < 60 * 60 * 1000) return { label: `Último: ${fmtAge(lastReal)}`, color: "text-green-600", dot: "bg-green-400" };
    return { label: `Sem eventos há ${fmtAge(lastReal)}`, color: "text-amber-600", dot: "bg-amber-400 animate-pulse" };
  }

  function fmtAge(iso: string): string {
    const ms = now - new Date(iso).getTime();
    const m  = Math.floor(ms / 60000);
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  }

  const hs = healthStatus();

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm space-y-3">
      <p className="text-sm font-semibold text-gray-800">Saúde da integração</p>

      {loading ? (
        <div className="h-16 animate-pulse rounded-xl bg-gray-100" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
            <span className="text-gray-500">Status</span>
            <span className={`font-semibold ${simpleStatus === "connected" ? "text-green-700" : "text-gray-600"}`}>
              {simpleStatus === "connected" ? "Conectado" : "Não conectado"}
            </span>

            <span className="text-gray-500">Webhook</span>
            <span className={`flex items-center gap-1.5 font-semibold ${hs.color}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${hs.dot}`} />
              {hs.label}
            </span>

            <span className="text-gray-500">Último evento real</span>
            <span className="text-gray-700">
              {(summary?.lastRealEventAt ?? summary?.lastEventAt)
                ? `${fmtAge(summary!.lastRealEventAt ?? summary!.lastEventAt!)} atrás`
                : "nenhum"}
            </span>

            <span className="text-gray-500">Mensagens hoje</span>
            <span className="font-semibold text-gray-800">{summary?.inboundToday ?? 0} recebidas</span>
          </div>

          {summary?.lastError && (summary.acceptedRealEvents ?? 0) === 0 && (
            <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[11px] text-red-700">
              Último erro: {summary.lastError}
            </div>
          )}

        </>
      )}
    </div>
  );
}

// ── Webhook log table ──────────────────────────────────────────────────────────

function WebhookLogTable({ events }: { events: WebhookLogEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-xs text-gray-400 italic py-2">
        Nenhum evento registrado. Envie uma mensagem WhatsApp para o número conectado.
      </p>
    );
  }
  return (
    <div className="space-y-1.5 max-h-72 overflow-y-auto">
      {events.map((ev) => (
        <div key={ev.id} className={`rounded-lg border px-2.5 py-2 text-[11px] font-mono ${
          !ev.accepted ? "border-red-100 bg-red-50" :
          ev.ignored   ? "border-gray-100 bg-gray-50" :
          "border-green-100 bg-green-50"
        }`}>
          <div className="flex items-center gap-2">
            <span className={ev.accepted ? (ev.ignored ? "text-gray-400" : "text-green-600") : "text-red-500"}>
              {ev.accepted ? (ev.ignored ? "·" : "✓") : "✗"}
            </span>
            <span className="text-gray-700 font-semibold">{ev.eventName}</span>
            {ev.direction && (
              <span className={`rounded px-1 py-px text-[9px] ${ev.direction === "INBOUND" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                {ev.direction}
              </span>
            )}
            <span className="ml-auto text-gray-400 text-[10px]">
              {new Date(ev.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          </div>
          {ev.error && (
            <p className="mt-0.5 text-red-600 break-all">{ev.error}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function WhatsAppIntegrationClient({ userRole }: { userRole: string }) {
  const isOwner = userRole === "OWNER";

  // Support mode — the technical "Configurações avançadas" block (diagnostics,
  // maintenance, deep probes, raw credentials, secret rotation) is HIDDEN from
  // the lojista and only appears for Foocci support via ?suporte=1. This keeps
  // the owner's page clean (status + QR + health) without losing the tools used
  // to debug a connection. Starts false (SSR-safe); set on the client after mount.
  const [supportMode, setSupportMode] = useState(false);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setSupportMode(p.get("suporte") === "1" || p.get("support") === "1");
  }, []);

  const [view,    setView]    = useState<EvolutionView | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [isAdvancedOpen,  setIsAdvancedOpen]  = useState(false);
  const [quickTesting, setQuickTesting] = useState(false);

  // Webhook health state
  const [webhookLogLoading, setWebhookLogLoading] = useState(false);
  const [webhookLogSummary, setWebhookLogSummary] = useState<WebhookLogSummary | null>(null);
  const [webhookLogEvents,  setWebhookLogEvents]  = useState<WebhookLogEvent[]>([]);

  // Sync webhook state
  const [syncingWebhook, setSyncingWebhook] = useState(false);
  const [syncResult,     setSyncResult]     = useState<SyncWebhookResult | null>(null);

  // Self-test state
  const [selfTesting,   setSelfTesting]   = useState(false);
  const [selfTestResult, setSelfTestResult] = useState<SelfTestResult | null>(null);

  // Auth self-test state
  const [authTesting,    setAuthTesting]    = useState(false);
  const [authTestResult, setAuthTestResult] = useState<AuthSelfTestResult | null>(null);

  // Live config verification state
  const [verifyingConfig,  setVerifyingConfig]  = useState(false);
  const [liveConfigResult, setLiveConfigResult] = useState<LiveConfigResult | null>(null);

  // Event diagnostics state
  const [eventDiagLoading, setEventDiagLoading] = useState(false);
  const [eventDiagResult,  setEventDiagResult]  = useState<EventDiagnosticsResult | null>(null);

  // Secret rotation state
  const [rotatingSecret, setRotatingSecret] = useState(false);
  const [rotateResult,   setRotateResult]   = useState<{ success: boolean; message: string } | null>(null);

  // Hard-reset state
  const [resetConfirming, setResetConfirming] = useState(false);
  const [qrPanelKey,      setQrPanelKey]      = useState(0);
  const [autoStartQR,     setAutoStartQR]     = useState(false);
  // QR panel visibility (separate from connection state)
  const [showQrPanel, setShowQrPanel] = useState(false);
  // Text confirmation for hard reset
  const [resetConfirmText, setResetConfirmText] = useState("");
  // Technical tools accordion
  const [isTechToolsOpen, setIsTechToolsOpen] = useState(false);

  // Diagnostic state
  const [diagnosing,  setDiagnosing]  = useState(false);
  const [diagResult,  setDiagResult]  = useState<{
    qrFlowVersion?:        string;
    hardResetUsesCreateQr?: boolean;
    diagnoseTestsCreateQr?: boolean;
    instanceName:  string;
    baseUrlMasked: string;
    instanceState: string;
    qrAvailable:   boolean;
    steps: Array<{ label: string; ok: boolean; detail?: unknown; error?: string }>;
  } | null>(null);

  // Deep probe state
  const [deepProbing,  setDeepProbing]  = useState(false);
  const [deepResult,   setDeepResult]   = useState<{
    evolutionVersion: { httpStatus: number; info: Record<string, unknown> };
    configuredInstance: Record<string, unknown> | null;
    instanceSettings: Record<string, unknown>;
    tempInstanceTest: {
      tempName: string;
      created: boolean;
      createKeys: string[];
      createShape: Record<string, string[]>;
      qrcodeShape: string[];
      qrcodeIsCountOnly: boolean;
      createQRFound: boolean;
      pollResults: Array<{ attempt: number; keys: string[]; isCountOnly: boolean; qrFound: boolean; httpStatus: number }>;
      qrFound: boolean;
      error: string | null;
    };
    verdict: string;
    verdictCode: "instance_specific" | "server_wide" | "inconclusive";
    recommendation: string;
    railwayCheckList: string[];
  } | null>(null);

  // Env audit state
  const [auditing,   setAuditing]   = useState(false);
  const [auditResult, setAuditResult] = useState<{
    evolutionVersion: { detected: string; httpStatus: number };
    prioritisedFixes: Array<{ priority: number; variable: string; action: string; value?: string; reason: string; railwayHow: string }>;
    upgradeRecommendation: { needed: boolean; currentVersion: string; recommendedVersion: string; railwayUpgradePath: string[]; riskLevel: string; riskNote: string; reason: string };
    logPatterns: { command: string; patterns: Array<{ grep: string; meaning: string }>; railwayCLI: string[] };
    summary: { step1: string; step2: string; step3: string; step4: string; scriptToRun: string };
  } | null>(null);

  // Form state — secrets always blank on load (never pre-filled)
  const [instanceName,  setInstanceName]  = useState("");
  const [baseUrl,       setBaseUrl]       = useState("");
  const [apiKey,        setApiKey]        = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");

  const loadView = useCallback(async () => {
    setLoading(true);
    try {
      const { ok, data } = await apiFetch("/api/integrations/whatsapp");
      if (ok && data) {
        const v = data as EvolutionView;
        setView(v);
        setInstanceName(v.fields.instanceName ?? "");
        setBaseUrl(v.fields.baseUrl ?? "");
        setApiKey("");
        setWebhookSecret("");
      }
    } catch {
      // Network error — leave view null, page shows unconfigured state
    } finally {
      setLoading(false);
    }
  }, []);

  // Owner-friendly "Testar conexão" — re-checks the live status (read-only; same GET
  // loadView uses) and reports a simple message. No backend/webhook/send change.
  async function handleQuickTest() {
    setQuickTesting(true);
    setFeedback(null);
    const { ok, data } = await apiFetch("/api/integrations/whatsapp");
    setQuickTesting(false);
    if (ok && data) {
      const v = data as EvolutionView;
      setView(v);
      setFeedback(viewToSimple(v.status) === "connected"
        ? { type: "ok",  msg: "Conectado. Sua integração de WhatsApp está funcionando." }
        : { type: "err", msg: "Falha na conexão. Reconecte o WhatsApp ou abra o Avançado." });
    } else {
      setFeedback({ type: "err", msg: "Falha na conexão." });
    }
  }

  const loadWebhookLog = useCallback(async () => {
    if (!isOwner) return;
    setWebhookLogLoading(true);
    const { ok, data } = await apiFetch("/api/evolution/webhook-log");
    if (ok && data) {
      const d = data as { summary: WebhookLogSummary; events: WebhookLogEvent[] };
      setWebhookLogSummary(d.summary ?? null);
      setWebhookLogEvents(d.events ?? []);
    }
    setWebhookLogLoading(false);
  }, [isOwner]);

  async function handleAuthTest() {
    setAuthTesting(true);
    setAuthTestResult(null);
    const { ok, data } = await apiFetch("/api/evolution/webhook-auth-self-test", "POST");
    setAuthTesting(false);
    if (ok) {
      setAuthTestResult(data as AuthSelfTestResult);
    } else {
      setFeedback({ type: "err", msg: "Falha ao executar teste de autenticação." });
    }
  }

  async function handleSyncWebhook() {
    setSyncingWebhook(true);
    setSyncResult(null);
    setSelfTestResult(null);
    setAuthTestResult(null);
    const webhookUrl = typeof window !== "undefined"
      ? `${window.location.origin}/api/webhooks/evolution`
      : "/api/webhooks/evolution";
    const { ok, data } = await apiFetch("/api/evolution/sync-webhook", "POST", { webhookUrl });
    setSyncingWebhook(false);
    if (ok) {
      setSyncResult(data as SyncWebhookResult);
      setTimeout(() => void loadWebhookLog(), 5000);
    } else {
      setFeedback({ type: "err", msg: "Falha ao sincronizar webhook. Tente novamente." });
    }
  }

  async function handleSelfTest() {
    setSelfTesting(true);
    setSelfTestResult(null);
    const { ok, data } = await apiFetch("/api/evolution/webhook-self-test", "POST");
    setSelfTesting(false);
    if (ok) {
      setSelfTestResult(data as SelfTestResult);
      setTimeout(() => void loadWebhookLog(), 1500);
    } else {
      setFeedback({ type: "err", msg: "Falha ao executar self-test." });
    }
  }

  async function handleVerifyConfig() {
    setVerifyingConfig(true);
    setLiveConfigResult(null);
    const { ok, data } = await apiFetch("/api/evolution/webhook-config-live");
    setVerifyingConfig(false);
    if (ok) {
      setLiveConfigResult(data as LiveConfigResult);
    } else {
      setFeedback({ type: "err", msg: "Falha ao consultar configuração da Evolution." });
    }
  }

  async function handleRotateSecret() {
    setRotatingSecret(true);
    setRotateResult(null);
    const { ok, data } = await apiFetch("/api/evolution/rotate-webhook-secret", "POST");
    setRotatingSecret(false);
    if (ok) {
      const d = data as { success: boolean; message?: string };
      setRotateResult({ success: d.success, message: d.message ?? "Secret rotacionado com sucesso." });
      setSyncResult(null);
      setLiveConfigResult(null);
      setTimeout(() => void loadWebhookLog(), 5000);
    } else {
      setRotateResult({ success: false, message: "Falha ao rotacionar secret. Tente novamente." });
    }
  }

  async function handleEventDiag() {
    setEventDiagLoading(true);
    setEventDiagResult(null);
    const { ok, data } = await apiFetch("/api/evolution/message-event-diagnostics");
    setEventDiagLoading(false);
    if (ok) {
      setEventDiagResult(data as EventDiagnosticsResult);
    } else {
      setFeedback({ type: "err", msg: "Falha ao executar diagnóstico de eventos." });
    }
  }

  useEffect(() => { void loadView(); }, [loadView]);

  // Poll webhook health every 30s when configured
  useEffect(() => {
    void loadWebhookLog();
    const id = setInterval(() => void loadWebhookLog(), 30_000);
    return () => clearInterval(id);
  }, [loadWebhookLog]);

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

  // Webhook diagnostic derived values
  const hasSignatureMismatch = webhookLogSummary?.lastError === "signature_mismatch"
    && !liveConfigResult?.tokenInUrl && !syncResult?.secretInfo?.tokenInUrl;
  const showSyncButton = simpleStatus === "connected" && (
    !webhookLogSummary?.lastRealEventAt || liveConfigResult?.isHealthy === false || hasSignatureMismatch
  );
  const showSelfTestButton = syncResult?.success || liveConfigResult?.isHealthy === true;

  // Human-readable connection info from diagnostic results
  const phone = (() => {
    const jid = syncResult?.instanceInfo?.ownerJidMasked ?? eventDiagResult?.ownerJidMasked;
    if (!jid) return null;
    return `+${jid.split("@")[0]}`;
  })();
  const profileName = syncResult?.instanceInfo?.profileName ?? null;
  const now = Date.now();
  const lastRealIso = webhookLogSummary?.lastRealEventAt ?? webhookLogSummary?.lastEventAt ?? null;
  const lastRealAgo = lastRealIso
    ? (() => {
        const ms = now - new Date(lastRealIso).getTime();
        const m = Math.floor(ms / 60000);
        if (m < 60) return `${m} min atrás`;
        const h = Math.floor(m / 60);
        return h < 24 ? `${h}h atrás` : `${Math.floor(h / 24)}d atrás`;
      })()
    : null;
  const webhookStatusLabel = (() => {
    if (!lastRealIso) return { label: "Sem atividade recente", color: "text-amber-600", dot: "bg-amber-400" };
    const ms = now - new Date(lastRealIso).getTime();
    if (ms < 5 * 60_000) return { label: "Recebendo mensagens", color: "text-green-600", dot: "bg-green-500" };
    if (ms < 60 * 60_000) return { label: `Último evento há ${Math.floor(ms / 60_000)} min`, color: "text-green-600", dot: "bg-green-400" };
    return { label: "Sem eventos há mais de 1h", color: "text-amber-600", dot: "bg-amber-400 animate-pulse" };
  })();

  // Auto-hide QR panel when WhatsApp successfully reconnects
  useEffect(() => {
    if (simpleStatus === "connected") setShowQrPanel(false);
  }, [simpleStatus]);

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

  async function handleDiagnose() {
    setDiagnosing(true);
    setDiagResult(null);
    const { ok, data } = await apiFetch("/api/evolution/diagnose", "POST");
    setDiagnosing(false);
    if (ok) {
      setDiagResult(data as typeof diagResult);
    } else {
      setFeedback({ type: "err", msg: "Falha ao executar diagnóstico Evolution." });
    }
  }

  async function handleDeepProbe() {
    setDeepProbing(true);
    setDeepResult(null);
    const { ok, data } = await apiFetch("/api/evolution/deep-probe", "POST");
    setDeepProbing(false);
    if (ok) {
      setDeepResult(data as typeof deepResult);
    } else {
      setFeedback({ type: "err", msg: "Falha ao executar diagnóstico profundo." });
    }
  }

  async function handleAudit() {
    setAuditing(true);
    setAuditResult(null);
    const { ok, data } = await apiFetch("/api/evolution/env-audit", "POST");
    setAuditing(false);
    if (ok) {
      setAuditResult(data as typeof auditResult);
    } else {
      setFeedback({ type: "err", msg: "Falha ao executar auditoria de env vars." });
    }
  }

  function handleHardReset() {
    setFeedback(null);
    setResetConfirmText("");
    setAutoStartQR(true);
    setQrPanelKey((k) => k + 1);
    setShowQrPanel(true);
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
          <p className="text-xs text-gray-500">Integração atual · atende seus clientes no WhatsApp.</p>
          <span className="mt-1 inline-block rounded-full bg-gray-100 px-2 py-px text-[10px] font-medium text-gray-500">Mantido como fallback</span>
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
          <button type="button" onClick={() => setFeedback(null)} className="ml-auto text-current opacity-50 hover:opacity-100">✕</button>
        </div>
      )}

      {/* ── Connected state ────────────────────────────────────────────────── */}
      {simpleStatus === "connected" && !showQrPanel ? (
        <div className="rounded-2xl border border-green-100 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-800">WhatsApp atual</p>
            <span className="flex items-center gap-1.5 text-xs font-medium text-green-600">
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              Conectado
            </span>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
            {phone && (
              <>
                <span className="text-gray-500">Número</span>
                <span className="font-mono font-semibold text-gray-800">{phone}</span>
              </>
            )}
            {profileName && (
              <>
                <span className="text-gray-500">Perfil</span>
                <span className="text-gray-700">{profileName}</span>
              </>
            )}
            <span className="text-gray-500">Recebimento</span>
            <span className={`flex items-center gap-1.5 font-medium ${webhookStatusLabel.color}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${webhookStatusLabel.dot}`} />
              {webhookStatusLabel.label}
            </span>
            {lastRealAgo && (
              <>
                <span className="text-gray-500">Última atividade</span>
                <span className="text-gray-700">{lastRealAgo}</span>
              </>
            )}
            <span className="text-gray-500">Mensagens hoje</span>
            <span className="font-semibold text-gray-800">{webhookLogSummary?.inboundToday ?? 0} recebidas</span>
          </div>

          {webhookLogSummary?.lastError && (webhookLogSummary.acceptedRealEvents ?? 0) === 0 && (
            <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
              Atenção: {webhookLogSummary.lastError === "signature_mismatch"
                ? "Problema de autenticação na conexão. Fale com o suporte Foocci para reconfigurar."
                : webhookLogSummary.lastError}
            </div>
          )}

          <div className="space-y-2 pt-1">
            <Link
              href="/atendimento"
              className="flex items-center justify-between rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700 transition"
            >
              <span>Abrir Central de Mensagens</span>
              <span>→</span>
            </Link>
            <button
              type="button"
              onClick={() => void handleQuickTest()}
              disabled={quickTesting}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition"
            >
              {quickTesting ? "Testando…" : "Testar conexão"}
            </button>
            <button
              type="button"
              onClick={() => setShowQrPanel(true)}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
            >
              Reconectar WhatsApp
            </button>
          </div>
        </div>
      ) : (
        /* ── Disconnected / QR state ──────────────────────────────────────── */
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm space-y-4">
          <div>
            <p className="text-sm font-semibold text-gray-800">
              {showQrPanel ? "Reconectar WhatsApp" : "Conectar WhatsApp do restaurante"}
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              {showQrPanel
                ? "Escaneie o QR Code para reconectar."
                : "Escaneie o QR Code com o celular do restaurante para começar a atender clientes."}
            </p>
          </div>

          {!showQrPanel && isConfigured && (
            <div className="space-y-3">
              <ol className="space-y-1.5 text-xs text-gray-600 list-decimal list-inside">
                <li>Abra o WhatsApp no celular</li>
                <li>Toque em <span className="font-medium">Aparelhos conectados</span></li>
                <li>Toque em <span className="font-medium">Conectar aparelho</span></li>
                <li>Escaneie o QR Code</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowQrPanel(true)}
                className="w-full rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700 active:scale-[0.99] transition"
              >
                Gerar QR Code
              </button>
            </div>
          )}

          {(showQrPanel || !isConfigured || simpleStatus !== "connected") && (
            <SimpleQRPanel
              key={qrPanelKey}
              isConfigured={isConfigured}
              isOwner={isOwner}
              isActive={view?.isActive ?? false}
              onDisconnect={handleDisconnect}
              onStartConnect={() => setFeedback(null)}
              onConnected={() => { void loadView(); setShowQrPanel(false); }}
              autoStart={showQrPanel || autoStartQR}
            />
          )}

          {showQrPanel && simpleStatus !== "connected" && (
            <button
              type="button"
              onClick={() => setShowQrPanel(false)}
              className="w-full rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 transition"
            >
              Cancelar
            </button>
          )}
        </div>
      )}

      {/* Webhook health card — owner only */}
      {isOwner && isConfigured && (
        <WebhookHealthCard
          summary={webhookLogSummary}
          loading={webhookLogLoading}
          simpleStatus={simpleStatus}
        />
      )}

      {/* Agent behavior link */}
      <div className="rounded-xl border border-brand-100 bg-brand-50 px-4 py-3">
        <p className="text-xs text-brand-700">
          Quer configurar como o agente responde os clientes?{" "}
          <Link href="/agente-ia" className="font-semibold underline">
            Agentes IA → WhatsApp Host
          </Link>
        </p>
      </div>

      {/* ── Advanced settings — Foocci support only (hidden from lojista; ?suporte=1) ── */}
      {isOwner && supportMode && (
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">

          {/* Toggle header */}
          <button
            type="button"
            onClick={() => setIsAdvancedOpen((v) => !v)}
            className="flex w-full items-center justify-between px-5 py-3.5 text-left hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-sm font-semibold text-gray-700">Avançado</span>
              <span className="rounded-full border border-gray-200 px-2 py-px text-[10px] font-medium text-gray-400">
                Uso interno Foocci
              </span>
            </div>
            <span className={`text-gray-400 transition-transform ${isAdvancedOpen ? "rotate-180" : ""}`}>▾</span>
          </button>

          {isAdvancedOpen && (
            <div className="border-t border-gray-100 px-5 pb-5 pt-4 space-y-5">

              {/* ── Grupo A — Diagnósticos ────────────────────────────────── */}
              <div className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Diagnósticos</p>

                {/* Signature mismatch alert */}
                {hasSignatureMismatch && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-xs space-y-2">
                    <p className="font-semibold text-red-800">Webhook com problema de autenticação</p>
                    <p className="text-red-700">O secret enviado pela Evolution não bate com o banco. Use &ldquo;Sincronizar webhook&rdquo; abaixo para corrigir.</p>
                  </div>
                )}

                {/* Verify webhook */}
                {isConfigured && (
                  <button
                    type="button"
                    onClick={() => void handleVerifyConfig()}
                    disabled={verifyingConfig}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 transition"
                  >
                    {verifyingConfig ? "Consultando Evolution…" : "Verificar webhook na Evolution"}
                  </button>
                )}
                {liveConfigResult && (
                  <div className={`rounded-lg border px-3 py-2.5 text-xs space-y-1.5 ${
                    liveConfigResult.isHealthy ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800"
                  }`}>
                    <p className="font-semibold">{liveConfigResult.isHealthy ? "✓ Webhook correto" : "✗ Problemas detectados"}</p>
                    <div className="font-mono text-[10px] space-y-0.5">
                      <p>url: {liveConfigResult.url ?? "—"}{" "}{liveConfigResult.urlMatches ? <span className="text-green-600">✓</span> : <span className="text-red-500">✗ diverge</span>}</p>
                      <p>webhookByEvents: <span className={liveConfigResult.byEventsIsFalse ? "text-green-700 font-bold" : "text-red-600 font-bold"}>{String(liveConfigResult.webhookByEvents ?? "?")}</span></p>
                      <p>auth: {liveConfigResult.tokenInUrl ? <span className="text-green-700">token na URL ✓</span> : liveConfigResult.secretPresent ? <span className="text-green-700">secret ✓</span> : <span className="text-amber-600">ausente</span>}</p>
                    </div>
                    {liveConfigResult.issues.length > 0 && liveConfigResult.issues.map((iss, i) => <p key={i} className="text-[10px]">⚠ {iss}</p>)}
                    <p className="text-[10px] text-gray-600">{liveConfigResult.recommendation}</p>
                  </div>
                )}

                {/* Self-test */}
                {(showSelfTestButton || isConfigured) && (
                  <button
                    type="button"
                    onClick={() => void handleSelfTest()}
                    disabled={selfTesting}
                    className="w-full rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50 transition"
                  >
                    {selfTesting ? "Testando receiver…" : "Testar receiver Foocci"}
                  </button>
                )}
                {selfTestResult && (
                  <div className={`rounded-lg border px-3 py-2 text-xs space-y-1 ${
                    selfTestResult.success ? "border-blue-200 bg-blue-50 text-blue-800" : "border-red-200 bg-red-50 text-red-700"
                  }`}>
                    <p className="font-semibold">{selfTestResult.success ? "✓ Receiver OK" : "✗ Receiver com problema"}</p>
                    <p className="text-[10px]">{selfTestResult.diagnosis}</p>
                    <p className="font-mono text-[10px]">DB: {selfTestResult.dbWrite.ok ? "✓" : "✗"} · Parser: {selfTestResult.parse.ok ? "✓" : "✗"}</p>
                  </div>
                )}

                {/* Auth self-test */}
                {isConfigured && (
                  <button
                    type="button"
                    onClick={() => void handleAuthTest()}
                    disabled={authTesting}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50 transition"
                  >
                    {authTesting ? "Testando…" : "Testar lógica de autenticação"}
                  </button>
                )}
                {authTestResult && (
                  <div className={`rounded border px-2 py-1.5 text-[10px] font-mono space-y-0.5 ${
                    authTestResult.allWorkingCorrectly ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700"
                  }`}>
                    <p className="font-semibold">{authTestResult.allWorkingCorrectly ? "✓ Auth OK" : "✗ Auth com falha"}</p>
                    <p className="text-gray-600">{authTestResult.diagnosis}</p>
                    {authTestResult.tests && Object.entries(authTestResult.tests).map(([k, v]) => (
                      <p key={k}><span className={v.accepted ? "text-green-600" : "text-red-500"}>{v.accepted ? "✓" : "✗"}</span> {k}</p>
                    ))}
                  </div>
                )}

                {/* Event diagnostics */}
                {simpleStatus === "connected" && (
                  <button
                    type="button"
                    onClick={() => void handleEventDiag()}
                    disabled={eventDiagLoading}
                    className="w-full rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 transition"
                  >
                    {eventDiagLoading ? "Diagnosticando eventos…" : "Diagnóstico de eventos"}
                  </button>
                )}
                {eventDiagResult && <EventDiagCard result={eventDiagResult} />}
                {(eventDiagResult?.verdict === "ok_waiting" || eventDiagResult?.verdict === "webhook_ok_not_emitting") && (
                  <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2.5 text-[10px] space-y-1">
                    <p className="font-semibold text-amber-800">Como verificar logs da Evolution no Railway:</p>
                    <ol className="list-decimal list-inside space-y-0.5 text-amber-700">
                      <li>railway.app → projeto → serviço evolution-api → Deployments → View logs</li>
                      <li>Envie mensagem pelo WhatsApp ao número conectado</li>
                      <li>Procure: MESSAGES_UPSERT, webhook, error</li>
                    </ol>
                  </div>
                )}
              </div>

              {/* ── Grupo B — Manutenção ──────────────────────────────────── */}
              <div className="space-y-3 border-t border-gray-100 pt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Manutenção</p>

                {/* Sync webhook */}
                {showSyncButton && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs space-y-2">
                    <p className="font-semibold text-amber-800">Webhook precisa de sincronização</p>
                    <button
                      type="button"
                      onClick={() => void handleSyncWebhook()}
                      disabled={syncingWebhook}
                      className="w-full rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50 transition"
                    >
                      {syncingWebhook ? "Sincronizando…" : "Sincronizar webhook"}
                    </button>
                  </div>
                )}
                {!showSyncButton && isConfigured && (
                  <button
                    type="button"
                    onClick={() => void handleSyncWebhook()}
                    disabled={syncingWebhook}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 transition"
                  >
                    {syncingWebhook ? "Sincronizando…" : "Sincronizar webhook"}
                  </button>
                )}
                {syncResult && (
                  <div className={`rounded-lg border px-3 py-2 text-xs space-y-1 ${
                    syncResult.success ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700"
                  }`}>
                    <p className="font-semibold">
                      {syncResult.success
                        ? syncResult.secretInfo?.tokenInUrl ? "✓ Webhook configurado com token seguro" : "✓ Webhook sincronizado"
                        : "✗ Falha na sincronização"}
                    </p>
                    <p className="text-[10px]">{syncResult.recommendation}</p>
                    {syncResult.error && <p className="font-mono text-[10px] break-all">{syncResult.error}</p>}
                  </div>
                )}

                {/* Secret rotation */}
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 space-y-2.5">
                  <div>
                    <p className="text-xs font-medium text-gray-700">Rotacionar secret do webhook</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">Use apenas se o token foi exposto. Não desconecta o WhatsApp.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleRotateSecret()}
                    disabled={rotatingSecret || !isConfigured}
                    className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition"
                  >
                    {rotatingSecret ? "Rotacionando…" : "Rotacionar secret"}
                  </button>
                  {rotateResult && (
                    <div className={`rounded-lg border px-3 py-2 text-xs ${
                      rotateResult.success ? "border-green-200 bg-white text-green-800" : "border-red-200 bg-white text-red-700"
                    }`}>
                      <p className="font-semibold">{rotateResult.success ? "✓ Secret rotacionado" : "✗ Falha"}</p>
                      <p className="text-[10px] mt-0.5">{rotateResult.message}</p>
                    </div>
                  )}
                </div>

                {/* Log de eventos webhook */}
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-gray-700">Log de eventos webhook</p>
                    <button
                      type="button"
                      onClick={() => void loadWebhookLog()}
                      disabled={webhookLogLoading}
                      className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[10px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition"
                    >
                      {webhookLogLoading ? "…" : "Atualizar"}
                    </button>
                  </div>
                  <WebhookLogTable events={webhookLogEvents} />
                </div>
              </div>

              {/* ── Grupo C — Ferramentas técnicas (nested accordion) ─────── */}
              <div className="border-t border-gray-100 pt-4">
                <button
                  type="button"
                  onClick={() => setIsTechToolsOpen((v) => !v)}
                  className="flex w-full items-center justify-between rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-left hover:bg-red-100 transition-colors"
                >
                  <div>
                    <p className="text-xs font-semibold text-red-700">Ferramentas técnicas — uso interno Foocci</p>
                    <p className="text-[10px] text-red-500 mt-0.5">Use apenas com orientação técnica. Pode afetar a conexão.</p>
                  </div>
                  <span className={`text-red-400 transition-transform ${isTechToolsOpen ? "rotate-180" : ""}`}>▾</span>
                </button>

                {isTechToolsOpen && (
                  <div className="mt-3 space-y-4">

                    {/* Warning */}
                    <div className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                      <span className="mt-0.5 text-amber-500">⚠</span>
                      <p className="text-xs text-amber-800">
                        <span className="font-semibold">Uso interno Foocci / suporte técnico.</span>{" "}
                        Não altere credenciais sem orientação. Configurações incorretas desconectam o WhatsApp.
                        {/* TODO de produto: Em produção, EvolutionConfig deve ser provisionado no onboarding do restaurante. Cliente só escaneia QR. */}
                      </p>
                    </div>

                    {/* Credentials form */}
                    {(lastTested || view?.lastError) && (
                      <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-xs space-y-1">
                        {lastTested && <p className="text-gray-500"><span className="font-medium text-gray-700">Último teste:</span> {lastTested}</p>}
                        {view?.lastError && (
                          <p className={view.isActive ? "text-green-700" : "text-red-600"}>
                            {view.isActive ? "✓" : "⚠"} {view.lastError}
                          </p>
                        )}
                      </div>
                    )}

                    <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-gray-700">Nome da instância</label>
                        <input type="text" value={instanceName} onChange={(e) => setInstanceName(e.target.value)} placeholder="sushicazza"
                          className={`w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition ${instanceNameErr ? "border-red-400 focus:border-red-400 focus:ring-red-100" : "border-gray-200 focus:border-indigo-400 focus:ring-indigo-100"}`}
                        />
                        <FieldError msg={instanceNameErr} />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-gray-700">URL do servidor Evolution</label>
                        <input type="text" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://evo.seuservidor.com"
                          className={`w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition ${baseUrlErr ? "border-red-400 focus:border-red-400 focus:ring-red-100" : "border-gray-200 focus:border-indigo-400 focus:ring-indigo-100"}`}
                        />
                        {loadedBaseUrlErr && !baseUrlErr && (
                          <div className="mt-1 flex items-start gap-1.5 rounded-lg border border-red-100 bg-red-50 px-2.5 py-2">
                            <span className="shrink-0 text-xs text-red-500">⚠</span>
                            <p className="text-xs text-red-700">A URL do servidor Evolution salva está inválida. Informe a URL pública da Evolution API.</p>
                          </div>
                        )}
                        <FieldError msg={baseUrlErr} />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-gray-700">API Key</label>
                        {f.apiKeyPreview && <p className="mb-1 text-xs text-gray-500">Atual: <span className="font-mono font-semibold text-gray-700">{f.apiKeyPreview}</span></p>}
                        <input type="password" name="apiKey" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                          placeholder={f.apiKeyPreview ? "Nova chave — deixe em branco para manter" : "Cole sua API Key"}
                          className={`w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition ${apiKeyErr ? "border-red-400 focus:border-red-400 focus:ring-red-100" : "border-gray-200 focus:border-indigo-400 focus:ring-indigo-100"}`}
                        />
                        <FieldError msg={apiKeyErr} />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-gray-700">Webhook Secret</label>
                        {f.webhookSecretPreview && <p className="mb-1 text-xs text-gray-500">Atual: <span className="font-mono font-semibold text-gray-700">{f.webhookSecretPreview}</span></p>}
                        <input type="password" name="webhookSecret" autoComplete="off" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)}
                          placeholder={f.webhookSecretPreview ? "Novo secret — deixe em branco para manter" : "Cole o Webhook Secret"}
                          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition"
                        />
                        <p className="mt-1 text-xs text-gray-400">Usado para autenticar as mensagens recebidas.</p>
                      </div>
                      <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 space-y-0.5">
                        <p className="text-xs font-medium text-gray-700">URL do Webhook (base)</p>
                        <p className="break-all font-mono text-[10px] text-gray-500">{webhookUrl}</p>
                      </div>
                      <div className="flex items-center gap-3 pt-1">
                        <button type="submit" disabled={saving} className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition">
                          {saving ? "Salvando…" : "Salvar credenciais"}
                        </button>
                        <button type="button" onClick={() => void handleTest()} disabled={testing || view?.status === "unconfigured" || !view}
                          className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition">
                          {testing ? "Testando…" : "Testar conexão"}
                        </button>
                      </div>
                    </form>

                    {/* Diagnose Evolution */}
                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-4 space-y-3">
                      <div>
                        <p className="text-xs font-semibold text-gray-700">Diagnosticar Evolution</p>
                        <p className="mt-0.5 text-xs text-gray-500">Verifica conectividade, autenticação, estado da instância e disponibilidade de QR.</p>
                      </div>
                      <button type="button" onClick={() => void handleDiagnose()} disabled={diagnosing || !isConfigured}
                        className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition">
                        {diagnosing ? "Diagnosticando…" : "Executar diagnóstico"}
                      </button>
                      {diagResult && (
                        <div className="space-y-3 pt-1">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-1.5 text-[10px]">
                            <span className="font-mono font-semibold text-blue-700">{diagResult.qrFlowVersion ?? "versão desconhecida"}</span>
                            <span className="text-blue-500">reset usa create: {diagResult.hardResetUsesCreateQr ? "✓" : "✗"}</span>
                            <span className="text-blue-500">diag cria instância: {diagResult.diagnoseTestsCreateQr ? "✓" : "✗ (seguro)"}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                            <span className="text-gray-500">Servidor</span><span className="font-mono text-gray-700 truncate">{diagResult.baseUrlMasked}</span>
                            <span className="text-gray-500">Instância</span><span className="font-mono text-gray-700">{diagResult.instanceName}</span>
                            <span className="text-gray-500">Estado</span>
                            <span className={`font-semibold ${diagResult.instanceState === "open" ? "text-green-600" : diagResult.instanceState === "connecting" ? "text-amber-600" : "text-red-600"}`}>{diagResult.instanceState}</span>
                            <span className="text-gray-500">QR extraído</span>
                            <span className={diagResult.qrAvailable ? "text-green-600 font-semibold" : "text-red-600"}>{diagResult.qrAvailable ? "sim" : "não"}</span>
                          </div>
                          <div className="space-y-2">
                            {diagResult.steps.map((s) => {
                              const shapeStep = s.label === "qr_response_shape" && s.ok && s.detail;
                              const shape = shapeStep ? (s.detail as { availableKeys?: string[]; keyMeta?: Record<string, { type: string; length?: number }>; reason?: string | null }) : null;
                              const isVariants = s.label === "qr_endpoint_variants" && s.ok && Array.isArray(s.detail);
                              const variants = isVariants ? (s.detail as Array<{ path: string; method: string; httpStatus?: number; qrExtracted?: boolean; error?: string }>) : null;
                              return (
                                <div key={s.label} className="text-[11px]">
                                  <div className="flex items-center gap-1.5">
                                    <span className={s.ok ? "text-green-500" : "text-red-500"}>{s.ok ? "✓" : "✗"}</span>
                                    <span className="font-mono text-gray-600">{s.label}</span>
                                    {!s.ok && s.error && <span className="text-red-600 break-all">{s.error}</span>}
                                  </div>
                                  {shape && (
                                    <div className="ml-4 mt-1 space-y-0.5 text-gray-500 text-[10px]">
                                      {shape.availableKeys && <p>Chaves: [{shape.availableKeys.join(", ")}]</p>}
                                      {shape.reason && <p className="text-amber-600">{shape.reason}</p>}
                                    </div>
                                  )}
                                  {variants && (
                                    <div className="ml-4 mt-1 space-y-1 text-gray-500 text-[10px]">
                                      {variants.map((v) => (
                                        <div key={`${v.method}:${v.path}`} className="flex items-center gap-1.5">
                                          <span className={v.qrExtracted ? "text-green-500" : v.error ? "text-red-400" : "text-gray-400"}>{v.qrExtracted ? "✓" : "·"}</span>
                                          <span className="font-mono">{v.method} {v.path}</span>
                                          {v.httpStatus && <span className="text-gray-400">HTTP {v.httpStatus}</span>}
                                          {v.qrExtracted && <span className="text-green-600 font-semibold">QR encontrado aqui!</span>}
                                          {v.error && <span className="text-red-500">{v.error}</span>}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Env-var audit */}
                    <div className="rounded-xl border border-orange-100 bg-orange-50 px-4 py-4 space-y-3">
                      <div>
                        <p className="text-xs font-semibold text-orange-700">Auditoria de Env Vars (Railway)</p>
                        <p className="mt-0.5 text-xs text-orange-600">Retorna variáveis necessárias para Evolution com valores recomendados. Use quando QR retorna apenas &#123; count &#125;.</p>
                      </div>
                      <button type="button" onClick={() => void handleAudit()} disabled={auditing || !isConfigured}
                        className="rounded-xl border border-orange-200 bg-white px-4 py-2 text-xs font-medium text-orange-700 hover:bg-orange-50 disabled:opacity-40 transition">
                        {auditing ? "Auditando…" : "Ver env vars necessárias"}
                      </button>
                      {auditResult && (
                        <div className="space-y-3 pt-1">
                          <div className="rounded-lg border border-orange-200 bg-white px-3 py-2 text-[11px] space-y-1 text-gray-700">
                            <p className="font-semibold text-orange-700 mb-1">Plano de ação:</p>
                            <p>1. {auditResult.summary.step1}</p>
                            <p>2. {auditResult.summary.step2}</p>
                            <p>3. {auditResult.summary.step3}</p>
                            <p>4. {auditResult.summary.step4}</p>
                          </div>
                          <div className="space-y-2">
                            <p className="text-[11px] font-semibold text-gray-700">Correções prioritárias:</p>
                            {auditResult.prioritisedFixes.slice(0, 8).map((fix) => (
                              <div key={fix.variable} className={`rounded-lg border px-3 py-2 text-[11px] ${fix.priority <= 3 ? "border-red-200 bg-red-50" : fix.priority <= 6 ? "border-amber-100 bg-amber-50" : "border-gray-100 bg-gray-50"}`}>
                                <div className="flex items-center gap-2">
                                  <span className={`font-mono font-semibold ${fix.priority <= 3 ? "text-red-700" : fix.priority <= 6 ? "text-amber-700" : "text-gray-700"}`}>{fix.priority}. {fix.variable}</span>
                                  {fix.value && <span className="font-mono text-green-700 bg-green-50 border border-green-100 px-1.5 py-0.5 rounded">= {fix.value}</span>}
                                </div>
                                <p className="mt-0.5 text-gray-600">{fix.reason}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Deep probe */}
                    <div className="rounded-xl border border-purple-100 bg-purple-50 px-4 py-4 space-y-3">
                      <div>
                        <p className="text-xs font-semibold text-purple-700">Diagnóstico Profundo (~35 s)</p>
                        <p className="mt-0.5 text-xs text-purple-600">Cria instância temporária para determinar se o problema de QR é específico desta instância ou server-wide.</p>
                      </div>
                      <button type="button" onClick={() => void handleDeepProbe()} disabled={deepProbing || !isConfigured}
                        className="rounded-xl border border-purple-200 bg-white px-4 py-2 text-xs font-medium text-purple-700 hover:bg-purple-50 disabled:opacity-40 transition">
                        {deepProbing ? "Analisando… (~35 s)" : "Executar diagnóstico profundo"}
                      </button>
                      {deepResult && (
                        <div className="space-y-3 pt-1">
                          <div className={`rounded-lg border px-3 py-2.5 text-xs font-semibold ${deepResult.verdictCode === "instance_specific" ? "border-amber-200 bg-amber-50 text-amber-800" : deepResult.verdictCode === "server_wide" ? "border-red-200 bg-red-50 text-red-800" : "border-gray-200 bg-gray-50 text-gray-700"}`}>
                            {deepResult.verdict}
                          </div>
                          <div className="rounded-lg border border-purple-200 bg-white px-3 py-2 text-[11px] text-gray-700 whitespace-pre-wrap">
                            <span className="font-semibold">Recomendação: </span>{deepResult.recommendation}
                          </div>
                          <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-[11px] font-mono space-y-0.5 text-gray-600">
                            <p className="font-semibold text-gray-700 mb-1">Instância temporária ({deepResult.tempInstanceTest.tempName})</p>
                            <p>criada: {deepResult.tempInstanceTest.created ? "sim" : "não"}{deepResult.tempInstanceTest.error ? ` — ${deepResult.tempInstanceTest.error}` : ""}</p>
                            {deepResult.tempInstanceTest.created && (
                              <>
                                <p>QR no create: {deepResult.tempInstanceTest.createQRFound ? "sim ✓" : "não"}</p>
                                <p className={deepResult.tempInstanceTest.qrFound ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>resultado: {deepResult.tempInstanceTest.qrFound ? "QR GERADO ✓" : "QR NÃO GERADO ✗"}</p>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Hard reset — requires text confirmation */}
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 space-y-3">
                      <div>
                        <p className="text-xs font-semibold text-red-700">Resetar instância WhatsApp</p>
                        <p className="mt-0.5 text-xs text-red-600">
                          Remove a sessão WhatsApp atual, recria a instância do zero e gera novo QR Code.
                          Use somente se o QR não aparecer após reconectar.
                        </p>
                      </div>
                      <div className="space-y-2">
                        <p className="text-[10px] text-red-700 font-medium">
                          Para confirmar, digite: <span className="font-mono font-bold">RESETAR {(f.instanceName ?? "INSTANCIA").toUpperCase()}</span>
                        </p>
                        <input
                          type="text"
                          value={resetConfirmText}
                          onChange={(e) => setResetConfirmText(e.target.value)}
                          placeholder={`RESETAR ${(f.instanceName ?? "INSTANCIA").toUpperCase()}`}
                          className="w-full rounded-xl border border-red-200 px-3 py-2 text-xs font-mono focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100 transition"
                        />
                        <button
                          type="button"
                          disabled={resetConfirmText.trim().toUpperCase() !== `RESETAR ${(f.instanceName ?? "INSTANCIA").toUpperCase()}` || !isConfigured}
                          onClick={() => { setResetConfirmText(""); handleHardReset(); }}
                          className="w-full rounded-xl border border-red-300 bg-white px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
                        >
                          Resetar instância WhatsApp
                        </button>
                      </div>
                    </div>

                  </div>
                )}
              </div>

            </div>
          )}
        </div>
      )}
    </div>
  );
}
