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
  totalEvents:    number;
  inboundToday:   number;
  lastEventAt:    string | null;
  lastAcceptedAt: string | null;
  lastError:      string | null;
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

interface SelfTestResult {
  success:      boolean;
  instanceName: string;
  dbWrite:  { ok: boolean; rowId: string | null; error: string | null };
  parse:    { ok: boolean; event: Record<string, unknown> | null; error: string | null };
  diagnosis:    string;
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
  byEventsIsFalse:  boolean;
  hasMessagesUpsert: boolean;
  isEnabled:        boolean;
  isHealthy:        boolean;
  issues:           string[];
  recommendation:   string;
}

function WebhookHealthCard({
  summary,
  events,
  loading,
  simpleStatus,
  onSync,
  syncLoading,
  syncResult,
  onSelfTest,
  selfTestLoading,
  selfTestResult,
  onVerify,
  verifyLoading,
  liveConfigResult,
}: {
  summary:          WebhookLogSummary | null;
  events:           WebhookLogEvent[];
  loading:          boolean;
  simpleStatus:     SimpleStatus;
  onSync:           () => void;
  syncLoading:      boolean;
  syncResult:       SyncWebhookResult | null;
  onSelfTest:       () => void;
  selfTestLoading:  boolean;
  selfTestResult:   SelfTestResult | null;
  onVerify:         () => void;
  verifyLoading:    boolean;
  liveConfigResult: LiveConfigResult | null;
}) {
  const now = Date.now();

  function healthStatus(): { label: string; color: string; dot: string } {
    if (!summary) return { label: "Sem dados", color: "text-gray-500", dot: "bg-gray-400" };
    if (!summary.lastEventAt) return { label: "Nenhum evento recebido", color: "text-amber-600", dot: "bg-amber-400" };
    const age = now - new Date(summary.lastEventAt).getTime();
    if (age < 5 * 60 * 1000) return { label: "Recebendo", color: "text-green-700", dot: "bg-green-500" };
    if (age < 60 * 60 * 1000) return { label: `Último: ${fmtAge(summary.lastEventAt)}`, color: "text-green-600", dot: "bg-green-400" };
    return { label: `Sem eventos há ${fmtAge(summary.lastEventAt)}`, color: "text-amber-600", dot: "bg-amber-400 animate-pulse" };
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
  const showSyncButton = simpleStatus === "connected" && (
    !summary?.lastEventAt || liveConfigResult?.isHealthy === false
  );
  const showSelfTestButton = syncResult?.success || liveConfigResult?.isHealthy === true;
  const phone = syncResult?.instanceInfo?.ownerJidMasked
    ? `+${syncResult.instanceInfo.ownerJidMasked.split("@")[0]}`
    : null;

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

            {phone && (
              <>
                <span className="text-gray-500">Número</span>
                <span className="font-mono font-semibold text-gray-800">{phone}</span>
              </>
            )}

            <span className="text-gray-500">Webhook</span>
            <span className={`flex items-center gap-1.5 font-semibold ${hs.color}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${hs.dot}`} />
              {hs.label}
            </span>

            <span className="text-gray-500">Último evento</span>
            <span className="text-gray-700">
              {summary?.lastEventAt ? `${fmtAge(summary.lastEventAt)} atrás` : "nenhum"}
            </span>

            <span className="text-gray-500">Mensagens hoje</span>
            <span className="font-semibold text-gray-800">{summary?.inboundToday ?? 0} recebidas</span>
          </div>

          {summary?.lastError && (
            <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[11px] text-red-700">
              Último erro: {summary.lastError}
            </div>
          )}

          {/* Sync result feedback */}
          {syncResult && (
            <div className={`rounded-lg border px-3 py-2.5 text-xs space-y-2 ${
              syncResult.success
                ? "border-green-200 bg-green-50 text-green-800"
                : "border-red-200 bg-red-50 text-red-700"
            }`}>
              <p className="font-semibold">
                {syncResult.success ? "✓ Webhook sincronizado" : "✗ Falha na sincronização"}
              </p>
              <p>{syncResult.recommendation}</p>
              {syncResult.error && (
                <p className="font-mono text-[10px] text-red-600 break-all">{syncResult.error}</p>
              )}
              {/* Show actual webhook config read back from Evolution */}
              {syncResult.webhookConfig && (
                <div className="rounded border border-current/20 bg-white/60 px-2 py-1.5 font-mono text-[10px] space-y-0.5">
                  <p>url: <span className="break-all">{syncResult.webhookConfig.url ?? "?"}</span>
                    {" "}{syncResult.webhookConfig.urlMatches
                      ? <span className="text-green-600">✓ bate</span>
                      : <span className="text-red-600">✗ diverge</span>
                    }
                  </p>
                  <p>webhookByEvents: <span className={syncResult.webhookConfig.webhookByEvents === false ? "text-green-700 font-bold" : "text-red-600 font-bold"}>
                    {String(syncResult.webhookConfig.webhookByEvents ?? "?")}
                  </span>
                  {syncResult.webhookConfig.webhookByEvents === true && (
                    <span className="text-red-600"> ← deve ser false</span>
                  )}
                  </p>
                  <p>enabled: {String(syncResult.webhookConfig.enabled ?? "?")}</p>
                  <p>events: [{syncResult.webhookConfig.events.join(", ")}]</p>
                </div>
              )}
            </div>
          )}

          {/* Live config result from Evolution */}
          {liveConfigResult && (
            <div className={`rounded-lg border px-3 py-2.5 text-xs space-y-2 ${
              liveConfigResult.isHealthy
                ? "border-green-200 bg-green-50 text-green-800"
                : "border-red-200 bg-red-50 text-red-800"
            }`}>
              <p className="font-semibold">
                {liveConfigResult.isHealthy
                  ? "✓ Webhook na Evolution: correto"
                  : "✗ Webhook na Evolution: problemas detectados"}
              </p>
              <div className="font-mono text-[10px] space-y-0.5 bg-white/60 rounded border border-current/10 px-2 py-1.5">
                <p>
                  <span className="text-gray-500">url: </span>
                  <span className="break-all">{liveConfigResult.url ?? "—"}</span>
                  {" "}
                  {liveConfigResult.urlMatches
                    ? <span className="text-green-600">✓</span>
                    : <span className="text-red-600">✗ diverge</span>}
                </p>
                <p>
                  <span className="text-gray-500">webhookByEvents: </span>
                  <span className={liveConfigResult.byEventsIsFalse ? "text-green-700 font-bold" : "text-red-600 font-bold"}>
                    {String(liveConfigResult.webhookByEvents ?? "?")}
                  </span>
                  {!liveConfigResult.byEventsIsFalse && (
                    <span className="text-red-600"> ← deve ser false</span>
                  )}
                </p>
                <p>
                  <span className="text-gray-500">enabled: </span>
                  <span className={liveConfigResult.isEnabled ? "text-green-700" : "text-red-600"}>
                    {String(liveConfigResult.enabled ?? "?")}
                  </span>
                </p>
                <p>
                  <span className="text-gray-500">secret: </span>
                  <span className={liveConfigResult.secretPresent ? "text-green-700" : "text-amber-600"}>
                    {liveConfigResult.secretPresent ? "presente" : "ausente"}
                  </span>
                </p>
                <p>
                  <span className="text-gray-500">events: </span>
                  [{liveConfigResult.events.join(", ") || "—"}]
                  {" "}
                  {!liveConfigResult.hasMessagesUpsert && (
                    <span className="text-red-600">← MESSAGES_UPSERT ausente</span>
                  )}
                </p>
              </div>
              {liveConfigResult.issues.length > 0 && (
                <ul className="space-y-0.5 text-[10px]">
                  {liveConfigResult.issues.map((issue, i) => (
                    <li key={i} className="text-red-700">⚠ {issue}</li>
                  ))}
                </ul>
              )}
              <p className="text-[10px]">{liveConfigResult.recommendation}</p>
            </div>
          )}

          {/* Verify button — always visible when configured */}
          {simpleStatus === "connected" && (
            <button
              type="button"
              onClick={onVerify}
              disabled={verifyLoading}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 transition"
            >
              {verifyLoading ? "Consultando Evolution…" : "Verificar webhook na Evolution"}
            </button>
          )}

          {/* Sync button — when connected and no events or live config has issues */}
          {showSyncButton && (
            <button
              type="button"
              onClick={onSync}
              disabled={syncLoading}
              className="w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50 transition"
            >
              {syncLoading ? "Sincronizando webhook…" : "Sincronizar webhook"}
            </button>
          )}

          {/* Self-test button — after sync or after verify confirms config OK */}
          {showSelfTestButton && (
            <button
              type="button"
              onClick={onSelfTest}
              disabled={selfTestLoading}
              className="w-full rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-800 hover:bg-blue-100 disabled:opacity-50 transition"
            >
              {selfTestLoading ? "Testando receiver…" : "Testar receiver Foocci"}
            </button>
          )}

          {/* Self-test result */}
          {selfTestResult && (
            <div className={`rounded-lg border px-3 py-2.5 text-xs space-y-1 ${
              selfTestResult.success
                ? "border-blue-200 bg-blue-50 text-blue-800"
                : "border-red-200 bg-red-50 text-red-700"
            }`}>
              <p className="font-semibold">
                {selfTestResult.success ? "✓ Receiver OK" : "✗ Receiver com problema"}
              </p>
              <p>{selfTestResult.diagnosis}</p>
              <div className="font-mono text-[10px] space-y-0.5 mt-1">
                <p>DB: {selfTestResult.dbWrite.ok ? "✓" : "✗"}{selfTestResult.dbWrite.error ? ` — ${selfTestResult.dbWrite.error}` : ""}</p>
                <p>Parser: {selfTestResult.parse.ok ? "✓" : "✗"}{selfTestResult.parse.error ? ` — ${selfTestResult.parse.error}` : ""}</p>
              </div>
            </div>
          )}

          {events.length === 0 && !loading && !showSyncButton && !syncResult && (
            <p className="text-xs text-gray-400 italic">
              Nenhum evento registrado ainda. Envie uma mensagem WhatsApp para testar.
            </p>
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

  const [view,    setView]    = useState<EvolutionView | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [isAdvancedOpen,  setIsAdvancedOpen]  = useState(false);

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

  // Live config verification state
  const [verifyingConfig,  setVerifyingConfig]  = useState(false);
  const [liveConfigResult, setLiveConfigResult] = useState<LiveConfigResult | null>(null);

  // Hard-reset state
  const [resetConfirming, setResetConfirming] = useState(false);
  const [qrPanelKey,      setQrPanelKey]      = useState(0);
  const [autoStartQR,     setAutoStartQR]     = useState(false);

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

  async function handleSyncWebhook() {
    setSyncingWebhook(true);
    setSyncResult(null);
    setSelfTestResult(null);
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
    setResetConfirming(false);
    // Remount the QR panel with autoStart — SimpleQRPanel.handleCreateQR runs the full
    // hard-reset (logout → delete → create → QR capture) and shows the result inline.
    setAutoStartQR(true);
    setQrPanelKey((k) => k + 1);
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
          key={qrPanelKey}
          isConfigured={isConfigured}
          isOwner={isOwner}
          isActive={view?.isActive ?? false}
          onDisconnect={handleDisconnect}
          onStartConnect={() => setFeedback(null)}
          onConnected={() => void loadView()}
          autoStart={autoStartQR}
        />
      </div>

      {/* Central de Mensagens link — only when connected */}
      {simpleStatus === "connected" && (
        <Link
          href="/atendimento"
          className="flex items-center justify-between rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700 hover:bg-green-100 transition-colors"
        >
          <span>Central de Mensagens</span>
          <span>→</span>
        </Link>
      )}

      {/* Webhook health card — owner only */}
      {isOwner && isConfigured && (
        <WebhookHealthCard
          summary={webhookLogSummary}
          events={webhookLogEvents}
          loading={webhookLogLoading}
          simpleStatus={simpleStatus}
          onSync={() => void handleSyncWebhook()}
          syncLoading={syncingWebhook}
          syncResult={syncResult}
          onSelfTest={() => void handleSelfTest()}
          selfTestLoading={selfTesting}
          selfTestResult={selfTestResult}
          onVerify={() => void handleVerifyConfig()}
          verifyLoading={verifyingConfig}
          liveConfigResult={liveConfigResult}
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

              {/* Hard reset — break-glass for stuck/unknown WhatsApp sessions */}
              <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-4 space-y-3">
                <div>
                  <p className="text-xs font-semibold text-red-700">Resetar instância WhatsApp</p>
                  <p className="mt-0.5 text-xs text-red-600">
                    Remove a sessão WhatsApp atual da Evolution, recria a instância do zero e gera um novo QR Code.
                    Use somente se o QR não aparecer após reconectar.
                  </p>
                </div>

                {!resetConfirming && (
                  <button
                    type="button"
                    onClick={() => setResetConfirming(true)}
                    disabled={!isConfigured}
                    className="rounded-xl border border-red-200 bg-white px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40 transition"
                  >
                    Resetar instância WhatsApp
                  </button>
                )}

                {resetConfirming && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-red-800">
                      Isso vai desconectar a instância atual e gerar uma nova sessão WhatsApp. Continuar?
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleHardReset()}
                        className="rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 transition"
                      >
                        Sim, resetar
                      </button>
                      <button
                        type="button"
                        onClick={() => setResetConfirming(false)}
                        className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Diagnostic tool */}
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-4 space-y-3">
                <div>
                  <p className="text-xs font-semibold text-gray-700">Diagnosticar Evolution</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Verifica conectividade, autenticação, estado da instância e disponibilidade de QR.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleDiagnose()}
                  disabled={diagnosing || !isConfigured}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition"
                >
                  {diagnosing ? "Diagnosticando…" : "Executar diagnóstico"}
                </button>

                {diagResult && (
                  <div className="space-y-3 pt-1">
                    {/* Version marker — confirms production is running new code */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-1.5 text-[10px]">
                      <span className="font-mono font-semibold text-blue-700">{diagResult.qrFlowVersion ?? "versão desconhecida"}</span>
                      <span className="text-blue-500">reset usa create: {diagResult.hardResetUsesCreateQr ? "✓ sim" : "✗ não"}</span>
                      <span className="text-blue-500">diag cria instância: {diagResult.diagnoseTestsCreateQr ? "✓ sim" : "✗ não (seguro)"}</span>
                    </div>

                    {/* Summary row */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <span className="text-gray-500">Servidor</span>
                      <span className="font-mono text-gray-700 truncate">{diagResult.baseUrlMasked}</span>
                      <span className="text-gray-500">Instância</span>
                      <span className="font-mono text-gray-700">{diagResult.instanceName}</span>
                      <span className="text-gray-500">Estado</span>
                      <span className={`font-semibold ${
                        diagResult.instanceState === "open"       ? "text-green-600" :
                        diagResult.instanceState === "connecting" ? "text-amber-600" :
                        "text-red-600"
                      }`}>{diagResult.instanceState}</span>
                      <span className="text-gray-500">QR extraído</span>
                      <span className={diagResult.qrAvailable ? "text-green-600 font-semibold" : "text-red-600"}>
                        {diagResult.qrAvailable ? "sim" : "não"}
                      </span>
                    </div>

                    {/* Step results */}
                    <div className="space-y-2">
                      {diagResult.steps.map((s) => {
                        const shapeStep = s.label === "qr_response_shape" && s.ok && s.detail;
                        const shape = shapeStep
                          ? (s.detail as {
                              availableKeys?: string[];
                              keyMeta?: Record<string, { type: string; length?: number }>;
                              qrExtracted?: boolean;
                              pairingCodeExtracted?: boolean;
                              reason?: string | null;
                              foundIn?: string | null;
                            })
                          : null;

                        const isVariants = s.label === "qr_endpoint_variants" && s.ok && Array.isArray(s.detail);
                        const variants = isVariants
                          ? (s.detail as Array<{ path: string; method: string; httpStatus?: number; qrExtracted?: boolean; reason?: string | null; error?: string }>)
                          : null;

                        return (
                          <div key={s.label} className="text-[11px]">
                            <div className="flex items-center gap-1.5">
                              <span className={s.ok ? "text-green-500" : "text-red-500"}>{s.ok ? "✓" : "✗"}</span>
                              <span className="font-mono text-gray-600">{s.label}</span>
                              {s.label === "qr_connect_endpoint" && s.ok && (
                                <span className={
                                  (s.detail as { qrExtracted?: boolean })?.qrExtracted
                                    ? "text-green-600"
                                    : "text-amber-600"
                                }>
                                  {(s.detail as { qrExtracted?: boolean })?.qrExtracted
                                    ? "→ QR encontrado"
                                    : "→ respondeu, QR não encontrado"}
                                </span>
                              )}
                              {!s.ok && s.error && (
                                <span className="text-red-600 break-all">{s.error}</span>
                              )}
                            </div>
                            {shape && (
                              <div className="ml-4 mt-1 space-y-0.5 text-gray-500">
                                <p>Chaves: [{shape.availableKeys?.join(", ") ?? "—"}]</p>
                                {shape.keyMeta && Object.entries(shape.keyMeta).map(([k, v]) => (
                                  <p key={k} className="font-mono">
                                    {k}: {v.type}{v.length !== undefined ? ` (${v.length} chars)` : ""}
                                  </p>
                                ))}
                                {shape.reason && <p className="text-amber-600">{shape.reason}</p>}
                              </div>
                            )}
                            {variants && (
                              <div className="ml-4 mt-1 space-y-1 text-gray-500">
                                {variants.map((v) => (
                                  <div key={`${v.method}:${v.path}`} className="flex items-center gap-1.5">
                                    <span className={v.qrExtracted ? "text-green-500" : v.error ? "text-red-400" : "text-gray-400"}>
                                      {v.qrExtracted ? "✓" : "·"}
                                    </span>
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

              {/* ── Env-var audit — Railway config recommendations ──────── */}
              <div className="rounded-xl border border-orange-100 bg-orange-50 px-4 py-4 space-y-3">
                <div>
                  <p className="text-xs font-semibold text-orange-700">Auditoria de Env Vars (Railway)</p>
                  <p className="mt-0.5 text-xs text-orange-600">
                    Retorna as variáveis de ambiente necessárias para Evolution v2.2.3 com valores recomendados,
                    prioridade e instruções Railway. Use quando QR retorna apenas &#123; count &#125;.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleAudit()}
                  disabled={auditing || !isConfigured}
                  className="rounded-xl border border-orange-200 bg-white px-4 py-2 text-xs font-medium text-orange-700 hover:bg-orange-50 disabled:opacity-40 transition"
                >
                  {auditing ? "Auditando…" : "Ver env vars necessárias"}
                </button>

                {auditResult && (
                  <div className="space-y-3 pt-1">
                    {/* Summary */}
                    <div className="rounded-lg border border-orange-200 bg-white px-3 py-2 text-[11px] space-y-1 text-gray-700">
                      <p className="font-semibold text-orange-700 mb-1">Plano de ação — em ordem:</p>
                      <p>1. {auditResult.summary.step1}</p>
                      <p>2. {auditResult.summary.step2}</p>
                      <p>3. {auditResult.summary.step3}</p>
                      <p>4. {auditResult.summary.step4}</p>
                      <p className="font-mono text-gray-500 mt-1">Script: {auditResult.summary.scriptToRun}</p>
                    </div>

                    {/* Prioritised fixes */}
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold text-gray-700">Correções prioritárias (adicione ao Railway):</p>
                      {auditResult.prioritisedFixes.slice(0, 8).map((fix) => (
                        <div key={fix.variable} className={`rounded-lg border px-3 py-2 text-[11px] ${
                          fix.priority <= 3 ? "border-red-200 bg-red-50" :
                          fix.priority <= 6 ? "border-amber-100 bg-amber-50" :
                          "border-gray-100 bg-gray-50"
                        }`}>
                          <div className="flex items-center gap-2">
                            <span className={`font-mono font-semibold ${fix.priority <= 3 ? "text-red-700" : fix.priority <= 6 ? "text-amber-700" : "text-gray-700"}`}>
                              {fix.priority}. {fix.variable}
                            </span>
                            {fix.value && (
                              <span className="font-mono text-green-700 bg-green-50 border border-green-100 px-1.5 py-0.5 rounded">
                                = {fix.value}
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-gray-600">{fix.reason}</p>
                          <p className="mt-0.5 font-mono text-gray-500">{fix.railwayHow}</p>
                        </div>
                      ))}
                    </div>

                    {/* Log patterns */}
                    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-[11px] space-y-1">
                      <p className="font-semibold text-gray-700 mb-1">Após LOG_BAILEYS=debug — o que procurar nos logs Railway:</p>
                      {auditResult.logPatterns.railwayCLI.map((line, i) => (
                        <p key={i} className="font-mono text-gray-500">{line}</p>
                      ))}
                      <div className="mt-2 space-y-0.5">
                        {auditResult.logPatterns.patterns.map((p) => (
                          <p key={p.grep} className="text-gray-600">
                            <span className="font-mono text-amber-600">&quot;{p.grep}&quot;</span> → {p.meaning}
                          </p>
                        ))}
                      </div>
                    </div>

                    {/* Upgrade recommendation */}
                    {auditResult.upgradeRecommendation.needed && (
                      <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] space-y-1">
                        <p className="font-semibold text-blue-700">Recomendação: Atualizar Evolution</p>
                        <p className="text-gray-600">{auditResult.upgradeRecommendation.reason}</p>
                        <p className="text-gray-600">Versão atual: <span className="font-mono">{auditResult.upgradeRecommendation.currentVersion}</span></p>
                        <p className="text-gray-600">Recomendado: <span className="font-mono">{auditResult.upgradeRecommendation.recommendedVersion}</span></p>
                        <p className="text-blue-500">Risco: {auditResult.upgradeRecommendation.riskLevel} — {auditResult.upgradeRecommendation.riskNote}</p>
                        <div className="mt-1 space-y-0.5">
                          {auditResult.upgradeRecommendation.railwayUpgradePath.map((step, i) => (
                            <p key={i} className="font-mono text-gray-500">{step}</p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── Webhook event log ────────────────────────────────────── */}
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-gray-700">Log de eventos webhook</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      Últimos 20 eventos recebidos. Prova se a Evolution está enviando webhooks ao Foocci.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadWebhookLog()}
                    disabled={webhookLogLoading}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition"
                  >
                    {webhookLogLoading ? "…" : "Atualizar"}
                  </button>
                </div>
                <WebhookLogTable events={webhookLogEvents} />
              </div>

              {/* ── Deep probe — definitive infrastructure test ──────────── */}
              <div className="rounded-xl border border-purple-100 bg-purple-50 px-4 py-4 space-y-3">
                <div>
                  <p className="text-xs font-semibold text-purple-700">Diagnóstico Profundo (~35 s)</p>
                  <p className="mt-0.5 text-xs text-purple-600">
                    Cria uma instância temporária para determinar se o problema de QR é específico
                    desta instância ou server-wide (Evolution não consegue alcançar WhatsApp).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleDeepProbe()}
                  disabled={deepProbing || !isConfigured}
                  className="rounded-xl border border-purple-200 bg-white px-4 py-2 text-xs font-medium text-purple-700 hover:bg-purple-50 disabled:opacity-40 transition"
                >
                  {deepProbing ? "Analisando… (~35 s)" : "Executar diagnóstico profundo"}
                </button>

                {deepResult && (
                  <div className="space-y-3 pt-1">
                    {/* Verdict banner */}
                    <div className={`rounded-lg border px-3 py-2.5 text-xs font-semibold ${
                      deepResult.verdictCode === "instance_specific" ? "border-amber-200 bg-amber-50 text-amber-800" :
                      deepResult.verdictCode === "server_wide"       ? "border-red-200 bg-red-50 text-red-800" :
                      "border-gray-200 bg-gray-50 text-gray-700"
                    }`}>
                      {deepResult.verdict}
                    </div>

                    {/* Recommendation */}
                    <div className="rounded-lg border border-purple-200 bg-white px-3 py-2 text-[11px] text-gray-700 whitespace-pre-wrap">
                      <span className="font-semibold">Recomendação: </span>{deepResult.recommendation}
                    </div>

                    {/* Temp instance test summary */}
                    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-[11px] font-mono space-y-0.5 text-gray-600">
                      <p className="font-semibold text-gray-700 mb-1">Instância temporária ({deepResult.tempInstanceTest.tempName})</p>
                      <p>criada: {deepResult.tempInstanceTest.created ? "sim" : "não"}{deepResult.tempInstanceTest.error ? ` — ${deepResult.tempInstanceTest.error}` : ""}</p>
                      {deepResult.tempInstanceTest.created && (
                        <>
                          <p>create_keys: [{deepResult.tempInstanceTest.createKeys.join(", ")}]</p>
                          <p>qrcode: [{deepResult.tempInstanceTest.qrcodeShape.join(", ")}]{deepResult.tempInstanceTest.qrcodeIsCountOnly ? " ← count only" : ""}</p>
                          <p>QR no create: {deepResult.tempInstanceTest.createQRFound ? "sim ✓" : "não"}</p>
                          {deepResult.tempInstanceTest.pollResults.map((p) => (
                            <p key={p.attempt}>poll {p.attempt}: HTTP {p.httpStatus} keys=[{p.keys.join(",")}] {p.isCountOnly ? "count-only" : ""} {p.qrFound ? "QR ✓" : ""}</p>
                          ))}
                          <p className={deepResult.tempInstanceTest.qrFound ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>
                            resultado: {deepResult.tempInstanceTest.qrFound ? "QR GERADO ✓" : "QR NÃO GERADO ✗"}
                          </p>
                        </>
                      )}
                    </div>

                    {/* Configured instance state */}
                    {deepResult.configuredInstance && (
                      <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-[11px] font-mono space-y-0.5 text-gray-600">
                        <p className="font-semibold text-gray-700 mb-1">Instância configurada</p>
                        <p>status: {String(deepResult.configuredInstance.status ?? "—")}</p>
                        <p>connectionStatus: {String(deepResult.configuredInstance.connectionStatus ?? "—")}</p>
                        <p>integration: {String(deepResult.configuredInstance.integration ?? "—")}</p>
                        <p>ownerJid (já autenticou?): {deepResult.configuredInstance.hasOwner ? "sim — teve sessão anterior" : "não"}</p>
                        <p>profileName: {String(deepResult.configuredInstance.profileName ?? "null")}</p>
                      </div>
                    )}

                    {/* Evolution version */}
                    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-[11px] font-mono space-y-0.5 text-gray-600">
                      <p className="font-semibold text-gray-700 mb-1">Versão Evolution (GET /)</p>
                      <p>HTTP: {deepResult.evolutionVersion.httpStatus}</p>
                      {Object.entries(deepResult.evolutionVersion.info).map(([k, v]) => (
                        <p key={k}>{k}: {typeof v === "object" ? JSON.stringify(v) : String(v)}</p>
                      ))}
                    </div>

                    {/* Railway checklist */}
                    <div className="rounded-lg border border-gray-100 bg-white px-3 py-2 text-[11px] space-y-1">
                      <p className="font-semibold text-gray-700 mb-1">Checklist Railway / Evolution env</p>
                      {deepResult.railwayCheckList.map((item, i) => (
                        <p key={i} className="text-gray-500">• {item}</p>
                      ))}
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
