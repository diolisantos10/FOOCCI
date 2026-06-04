"use client";

/**
 * Build OS → Diagnóstico (admin-only, read-only by default).
 *
 * One-click health report for the WhatsApp command path + an internal simulated
 * command (dry-run or real). No console/fetch/Railway needed. No Claude/GitHub/LLM.
 */

import { Fragment, useEffect, useState } from "react";

// Fallback ONLY — the test phone is prefilled from the active operator on mount.
const DEFAULT_PHONE = "+5511940595223";
const DEFAULT_MESSAGE = "/build Faz um RAIO-X do checkout Pix. Não implemente nada ainda.";

interface Report {
  deployInfo: {
    commitSha: string; branch: string; appVersion: string; nodeEnv: string;
    buildMarker: string; webhookRouteExpected: string; healthEndpoint: string;
  };
  buildOsChannel?: {
    configured: boolean;
    instanceName: string | null;
    enabled: boolean;
    legacyFallbackEnabled: boolean;
  };
  eventFreshness?: {
    available: boolean;
    generatedAt?: string;
    lastEventAt?: string | null;
    lastEventAgeMinutes?: number | null;
    lastEventInstance?: string | null;
    staleThresholdMinutes?: number;
    stale?: boolean;
    expectedInstance?: string | null;
    masterChannelConfigured?: boolean;
    perInstance?: Array<{ instanceName: string; lastEventAt: string | null; ageMinutes: number | null; eventCount: number; isBuildOsMaster?: boolean }>;
    orientation?: string;
  };
  buildArrivalCheck?: {
    available: boolean;
    lastBuildTraceAt?: string | null;
    lastBuildTracePrefix?: string | null;
    lastBuildTraceMaskedPhone?: string | null;
    lastBuildTraceAuthorized?: boolean | null;
    lastBuildTraceFailureReason?: string | null;
    lastBuildTraceFromMe?: boolean | null;
    lastBuildTraceInstance?: string | null;
    lastBuildTraceFromMasterChannel?: boolean;
    lastBuildTraceCanAuthorize?: boolean;
    lastBuildMessageAt?: string | null;
    lastBuildAnyAt?: string | null;
    lastBuildAgeMinutes?: number | null;
    newBuildSinceLastTrace?: boolean;
    note?: string;
  };
  buildOsConfig: { exists: boolean; enabled: boolean; source: string; hardDisabled: boolean; mode: string };
  authorizedSenderCheck: {
    inputPhone: string; normalizedPhone: string; variants: string[];
    dbSenderFound: boolean; dbSenderActive: boolean; role: string | null;
    lastUsedAt: string | null; authorized: boolean; authorizationSource: string; activeDbSenderCount: number;
  };
  projectCheck: { defaultProjectFound: boolean; defaultProjectSlug: string | null; activeProjectsCount: number; resolvedFromMessage: string | null };
  detectorCheck: { testMessage: string; prefixDetected: string | null; commandText: string | null };
  classificationCheck: { taskType: string; executionIntent: string; targetArea: string; riskLevel: string; requiresHumanConfirmation: boolean };
  promptDraftCheck: { canGeneratePromptDraft: boolean; preview?: string; noClaudeRelay: boolean };
  webhookIntegrationCheck: Record<string, unknown>;
  evolutionInstanceCheck: {
    available: boolean;
    instances?: Array<{ instanceName: string; isActive: boolean; restaurant: string | null }>;
    anyEventReceived?: boolean;
    lastEventAt?: string | null;
    lastEventName?: string | null;
    lastEventNormalized?: string | null;
    lastInboundAt?: string | null;
    lastInboundEventName?: string | null;
    recentEvents?: Array<{
      instanceName: string; eventName: string; normalized: string | null;
      accepted: boolean; ignored: boolean; direction: string | null;
      remoteJid: string | null; error: string | null; createdAt: string;
    }>;
  };
  recentMessages: Array<{
    createdAt: string; instanceName: string; eventNameRaw: string;
    eventNameNormalized: string | null; accepted: boolean; ignored: boolean;
    direction: string | null; fromMe: boolean | null; fromMeNote: string | null;
    remoteJidMasked: string | null;
    senderMasked: string | null; extractedPhoneMasked: string | null;
    prefixDetected: string | null; buildCommandCandidate: boolean;
    authorized: boolean | null; commandCreated: boolean; shortCircuited: boolean;
    failureReason: string | null; hasBuildTrace: boolean;
  }>;
  buildTextSearch: {
    searched: boolean;
    foundInMessages?: boolean;
    messages?: Array<{
      createdAt: string; prefixDetected: string | null; direction: string;
      senderType: string | null; channel: string | null; restaurantId: string | null;
      phoneMasked: string | null; snippet: string;
    }>;
    foundInTraces?: boolean;
    traces?: Array<{
      createdAt: string; prefixDetected: string | null; phoneMasked: string | null;
      authorized: boolean | null; fromMe: boolean | null; failureReason: string | null;
    }>;
    authorizedOperatorMasked?: string;
    authorizedVariantsMasked?: string[];
    verdict?: string;
  };
  webhookReceivedRealBuild: boolean;
  lastWebhookAt: string | null;
  recentWebhookTraces: Array<{
    id: string; traceId: string; canAuthorize: boolean; maskedPhone: string | null; prefixDetected: string | null;
    configEnabled: boolean | null; authorized: boolean | null; fromMe: boolean | null;
    commandCreated: boolean; responseSent: boolean; shortCircuited: boolean;
    failureReason: string | null; createdAt: string;
  }>;
  lastCommands: Array<{ id: string; status: string; project: string | null; taskType: string; riskLevel: string; createdAt: string; promptVersions: number; events: number }>;
  likelyRootCause: { code: string; explanation: string; recommendedFix: string };
}

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-green-500" : "bg-red-500"}`} />
      {label} {ok ? "PASS" : "FAIL"}
    </span>
  );
}

interface InstanceHealth {
  instanceName: string;
  restaurant: string | null;
  isActiveDb: boolean;
  isBuildOsMaster: boolean;
  reachable: boolean;
  connectionState: string | null;
  connectedNumberMasked: string | null;
  profileName: string | null;
  webhookUrl: string | null;
  webhookEnabled: boolean | null;
  events: string[];
  hasMessagesUpsert: boolean;
  urlMatchesExpected: boolean;
  lastEventAt: string | null;
  lastEventAgeMinutes: number | null;
  lastInboundAt: string | null;
  lastUpsertAt: string | null;
  lastUpsertAgeMinutes: number | null;
  lastConnectionUpdateAt: string | null;
  lastConnectionUpdateAgeMinutes: number | null;
  deliveryStatus: "healthy" | "stale" | "stopped";
  issues: string[];
  error: string | null;
}

interface NumbersInvolved {
  connectedNumberMasked: string | null;
  authorizedOperatorMasked: string | null;
  lastBuildAttemptMasked: string | null;
  activeOperatorCount: number;
  connectedMatchesOperator: boolean | null;
  verdict: string;
  guidance: string;
}

interface InstanceHealthReport {
  generatedAt: string;
  expectedWebhookUrl: string;
  expectedInstance: string | null;
  masterChannelConfigured: boolean;
  masterInstanceName: string | null;
  masterInstanceExistsInEvolution: boolean;
  numbersInvolved: NumbersInvolved;
  instances: InstanceHealth[];
}

const DELIVERY_BADGE: Record<string, string> = {
  healthy: "bg-green-100 text-green-700",
  stale: "bg-amber-100 text-amber-700",
  stopped: "bg-red-100 text-red-700",
};
const DELIVERY_LABEL: Record<string, string> = {
  healthy: "Entrega: SAUDÁVEL",
  stale: "Entrega: STALE",
  stopped: "Entrega: PARADA",
};

function InstanceHealthCard({
  health, busy, error, onCheck, onSync, syncBusy, syncMsg,
}: {
  health: InstanceHealthReport | null;
  busy: boolean;
  error: string | null;
  onCheck: () => void;
  onSync: () => void;
  syncBusy: boolean;
  syncMsg: string | null;
}) {
  const ni = health?.numbersInvolved;
  const allStopped = !!health && health.instances.length > 0 && health.instances.every((i) => i.deliveryStatus !== "healthy");
  const anyOpen = !!health && health.instances.some((i) => i.connectionState === "open");
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-900">Saúde da instância Evolution (entrega de eventos)</p>
          <p className="text-xs text-gray-500">
            Verifica conexão, número conectado (mascarado), webhook e o último evento recebido — sem console/Railway. Read-only.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={onCheck}
            disabled={busy || syncBusy}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
          >
            {busy ? "Verificando…" : "Verificar conexão Evolution"}
          </button>
          <button
            onClick={onSync}
            disabled={busy || syncBusy}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
          >
            {syncBusy ? "Sincronizando…" : "Sincronizar webhook e revalidar"}
          </button>
        </div>
      </div>

      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {syncMsg && <p className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">{syncMsg}</p>}

      {health && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-gray-500">
            Verificado em {new Date(health.generatedAt).toLocaleString("pt-BR")} · URL esperada do webhook:{" "}
            <span className="font-mono">{health.expectedWebhookUrl}</span> · Canal Master:{" "}
            <strong>{health.masterInstanceName ?? "não configurado"}</strong>
          </p>

          {!health.masterChannelConfigured && (
            <p className="rounded-lg bg-amber-100 px-3 py-2 text-sm font-medium text-amber-800">
              ⚠️ Canal Build OS Master não configurado. As instâncias abaixo são de restaurante — não devem ser usadas
              como canal de comandos internos. Configure em Configuração → Canal WhatsApp Master/Admin.
            </p>
          )}
          {health.masterChannelConfigured && !health.masterInstanceExistsInEvolution && (
            <p className="rounded-lg bg-red-100 px-3 py-2 text-sm font-medium text-red-800">
              ⚠️ O Canal Master &quot;{health.masterInstanceName}&quot; não corresponde a nenhuma instância Evolution
              configurada — o webhook não vai reconhecê-la. Crie/conecte essa instância na Evolution.
            </p>
          )}

          {/* Números envolvidos — resolve a confusão entre os 3 números */}
          {ni && (
            <div className={`rounded-lg border p-3 ${ni.connectedMatchesOperator === false ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-gray-50"}`}>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Números envolvidos</p>
              <div className="mt-1 grid grid-cols-1 gap-x-6 gap-y-1 text-xs text-gray-700 sm:grid-cols-3">
                <span>Conectado na instância: <span className="font-mono font-semibold">{ni.connectedNumberMasked ?? "—"}</span></span>
                <span>Operador autorizado: <span className="font-mono font-semibold">{ni.authorizedOperatorMasked ?? "—"}</span>{ni.activeOperatorCount > 1 ? ` (+${ni.activeOperatorCount - 1})` : ""}</span>
                <span>Último que tentou /build: <span className="font-mono font-semibold">{ni.lastBuildAttemptMasked ?? "—"}</span></span>
              </div>
              <p className="mt-2 text-sm font-medium text-gray-800">{ni.verdict}</p>
              <p className="mt-1 text-xs text-gray-700">➡️ {ni.guidance}</p>
            </div>
          )}

          {allStopped && anyOpen && (
            <p className="rounded-lg bg-red-100 px-3 py-2 text-sm font-medium text-red-800">
              ⚠️ Instância OPEN, webhook correto, mas sem delivery de mensagens. Provável problema interno Evolution/conexão do número — o próximo passo seguro é reconectar/reiniciar a instância (não executado automaticamente).
            </p>
          )}

          {health.instances.length === 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
              Nenhuma instância Evolution configurada.
            </p>
          )}
          {health.instances.map((h) => {
            const connected = h.connectionState === "open";
            return (
              <div key={h.instanceName} className={`rounded-lg border p-3 ${connected ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono text-sm font-semibold text-gray-900">
                    {h.instanceName}
                    {h.restaurant ? <span className="ml-2 text-xs font-normal text-gray-500">({h.restaurant})</span> : null}
                  </p>
                  <span className="flex flex-wrap gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${h.isBuildOsMaster ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-500"}`}>
                      {h.isBuildOsMaster ? "Canal Build OS Master" : "Restaurante"}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${connected ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {h.connectionState ? `Conexão: ${h.connectionState.toUpperCase()}` : "Conexão: DESCONHECIDA"}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${DELIVERY_BADGE[h.deliveryStatus]}`}>
                      {DELIVERY_LABEL[h.deliveryStatus]}
                    </span>
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-xs text-gray-700 sm:grid-cols-2">
                  <span>Número conectado: <span className="font-mono">{h.connectedNumberMasked ?? "—"}</span>{h.profileName ? ` · ${h.profileName}` : ""}</span>
                  <span>Ativa no banco: {String(h.isActiveDb)}</span>
                  <span>Webhook habilitado: {h.webhookEnabled === null ? "—" : String(h.webhookEnabled)}</span>
                  <span>URL bate com a esperada: {String(h.urlMatchesExpected)}</span>
                  <span>MESSAGES_UPSERT: {h.hasMessagesUpsert ? "sim" : "não"}</span>
                  <span>Último evento (qualquer): {h.lastEventAt ? `${new Date(h.lastEventAt).toLocaleString("pt-BR")} (há ${h.lastEventAgeMinutes} min)` : "nunca"}</span>
                  <span>Último messages.upsert: {h.lastUpsertAt ? `${new Date(h.lastUpsertAt).toLocaleString("pt-BR")} (há ${h.lastUpsertAgeMinutes} min)` : "nunca"}</span>
                  <span>Último connection.update: {h.lastConnectionUpdateAt ? `${new Date(h.lastConnectionUpdateAt).toLocaleString("pt-BR")} (há ${h.lastConnectionUpdateAgeMinutes} min)` : "nunca"}</span>
                  <span className="sm:col-span-2 font-mono text-[11px] text-gray-500">webhook: {h.webhookUrl ?? "—"}</span>
                  <span className="sm:col-span-2 text-[11px] text-gray-500">eventos: {h.events.length ? h.events.join(", ") : "—"}</span>
                </div>
                {h.error && <p className="mt-2 text-xs text-red-600">{h.error}</p>}
                {h.issues.length > 0 && (
                  <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-red-700">
                    {h.issues.map((iss, i) => <li key={i}>{iss}</li>)}
                  </ul>
                )}
                {connected && h.issues.length === 0 && (
                  <p className="mt-2 text-xs text-green-700">Conectada e entregando eventos normalmente.</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function BuildOsDiagnosticsPanel() {
  const [phone, setPhone] = useState(DEFAULT_PHONE);
  const [phonePrefilled, setPhonePrefilled] = useState(false);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);

  // Prefill the test phone from the CURRENT active operator (DB), so the diagnostic
  // tests whoever is authorized now — never a stale hardcoded number. Only fills
  // while the user hasn't started editing.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/build-os/authorized-senders");
        const d = await res.json().catch(() => ({}));
        const senders: Array<{ phone: string; rawPhone: string | null; isActive: boolean; lastUsedAt: string | null }> =
          d.senders ?? d.data ?? [];
        const active = senders.filter((s) => s.isActive);
        const pick = active.sort((a, b) => (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? ""))[0];
        if (!cancelled && pick && !phonePrefilled) {
          setPhone(pick.rawPhone || pick.phone);
          setPhonePrefilled(true);
        }
      } catch {
        /* keep fallback default */
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [simResult, setSimResult] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [copyFallback, setCopyFallback] = useState<string | null>(null);

  // ── Evolution instance health (connection + connected number + webhook delivery) ──
  const [health, setHealth] = useState<InstanceHealthReport | null>(null);
  const [healthBusy, setHealthBusy] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  // ── "Autorizar este remetente" (one-click authorize from an unauthorized trace) ──
  // Only a traceId ever leaves the browser; the real phone is recovered server-side.
  const [authTraceId, setAuthTraceId] = useState<string | null>(null); // which row's form is open
  const [authName, setAuthName] = useState("Operador Build OS");
  const [authRole, setAuthRole] = useState<"owner" | "admin">("owner");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authDone, setAuthDone] = useState<string | null>(null); // success message

  function openAuthForm(traceId: string) {
    setAuthTraceId(traceId);
    setAuthName("Operador Build OS");
    setAuthRole("owner");
    setAuthError(null);
    setAuthDone(null);
  }

  async function confirmAuthorize(traceId: string) {
    setAuthBusy(true); setAuthError(null);
    try {
      const res = await fetch("/api/admin/build-os/diagnostics/authorize-sender", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ traceId, name: authName, role: authRole }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) { setAuthError(d.error ?? "Falha ao autorizar."); return; }
      setAuthTraceId(null);
      setAuthDone(d.message ?? "Remetente autorizado. Envie /build novamente no WhatsApp.");
      // Refresh the report so the trace/authorization status reflects the change.
      runDiagnostic().catch(() => {});
    } finally { setAuthBusy(false); }
  }

  async function copyDiagnostic() {
    if (!report) return;
    const text = buildReportMarkdown(report);
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("copied");
      setCopyFallback(null);
      setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      // Clipboard blocked (insecure context / permissions) → show copyable textarea.
      setCopyFallback(text);
    }
  }

  async function runDiagnostic() {
    setBusy(true); setError(null); setSimResult(null);
    try {
      const qs = new URLSearchParams({ phone, message });
      const res = await fetch(`/api/admin/build-os/diagnostics?${qs}`);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error ?? "Falha no diagnóstico."); return; }
      setReport(d.report as Report);
    } finally { setBusy(false); }
  }

  async function simulate(dryRun: boolean) {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/admin/build-os/diagnostics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, message, dryRun }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error ?? "Falha na simulação."); return; }
      if (dryRun) {
        setReport(d.report as Report);
        setSimResult("Pré-visualização (dry-run): nenhum dado gravado.");
      } else if (d.result?.ok) {
        setSimResult(`✅ Comando simulado criado: #${d.result.shortId} · status ${d.result.status} · prompt v${d.result.promptVersion ?? "—"}. Veja na aba Comandos.`);
      } else {
        setError(d.result?.error ?? "Simulação não criou comando.");
      }
    } finally { setBusy(false); }
  }

  async function checkInstanceHealth(): Promise<InstanceHealthReport | null> {
    setHealthBusy(true); setHealthError(null);
    try {
      const res = await fetch("/api/admin/build-os/diagnostics/instance-health");
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) { setHealthError(d.error ?? "Falha ao verificar a instância."); return null; }
      const report = d.report as InstanceHealthReport;
      setHealth(report);
      return report;
    } finally { setHealthBusy(false); }
  }

  async function syncAndRevalidate() {
    setSyncBusy(true); setSyncMsg(null); setHealthError(null);
    try {
      // 1) Re-apply the webhook config on the connected instance (OWNER-only route,
      //    same one the Webhook card uses). Does NOT touch the WhatsApp session.
      const res = await fetch("/api/evolution/sync-webhook", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || d.success === false) {
        setSyncMsg(`⚠️ Falha ao sincronizar o webhook: ${d.error ?? "erro desconhecido"}.`);
        return;
      }
      // 2) Re-probe delivery health to see whether anything changed.
      const report = await checkInstanceHealth();
      const stillStale = !report || report.instances.every((i) => i.deliveryStatus !== "healthy");
      setSyncMsg(
        stillStale
          ? "Webhook sincronizado, mas ainda sem evento novo. Instância OPEN e webhook correto, porém sem delivery de mensagens — provável problema interno da Evolution/conexão do número. Próximo passo seguro: reconectar/reiniciar a instância."
          : "✅ Webhook sincronizado e eventos voltaram a chegar.",
      );
    } finally { setSyncBusy(false); }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
        Diagnóstico <strong>interno/admin</strong> do caminho de comando do WhatsApp. Roda no
        ambiente do app (sem console, sem Railway, sem credenciais). Não envia nada a Claude/GitHub.
      </div>

      {/* Saúde da instância Evolution — entrega de eventos (conexão + número + webhook) */}
      <InstanceHealthCard
        health={health}
        busy={healthBusy}
        error={healthError}
        onCheck={checkInstanceHealth}
        onSync={syncAndRevalidate}
        syncBusy={syncBusy}
        syncMsg={syncMsg}
      />

      {/* Webhook Evolution — corrective action lives where the problem is diagnosed */}
      <WebhookCard />

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}
      {simResult && <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">{simResult}</div>}

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">Telefone</span>
            <input className={INPUT} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">Mensagem de teste</span>
            <input className={INPUT} value={message} onChange={(e) => setMessage(e.target.value)} />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={runDiagnostic}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-40">
            Rodar diagnóstico Build OS
          </button>
          <button type="button" disabled={busy} onClick={() => simulate(true)}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40">
            Simular comando (dry-run)
          </button>
          <button type="button" disabled={busy} onClick={() => simulate(false)}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40">
            Simular comando (criar)
          </button>
          <button type="button" disabled={!report} onClick={copyDiagnostic}
            title={report ? "Copiar relatório completo (Markdown)" : "Rode o diagnóstico primeiro"}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40">
            {copyState === "copied" ? "✓ Diagnóstico copiado" : "Copiar diagnóstico completo"}
          </button>
        </div>

        {copyFallback !== null && (
          <div className="mt-3">
            <p className="mb-1 text-xs text-amber-700">
              O navegador bloqueou a cópia automática. Selecione tudo abaixo e copie (Ctrl/Cmd+C):
            </p>
            <textarea
              readOnly
              value={copyFallback}
              onFocus={(e) => e.currentTarget.select()}
              className="h-40 w-full rounded-lg border border-gray-200 p-2 font-mono text-[11px] text-gray-800"
            />
          </div>
        )}
      </div>

      {report && (
        <div className="space-y-4">
          {/* Root cause */}
          <div className={`rounded-xl border p-5 ${report.likelyRootCause.code === "HEALTHY" ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Causa-raiz provável</p>
            <p className="mt-1 text-lg font-bold text-gray-900">{report.likelyRootCause.code}</p>
            <p className="mt-1 text-sm text-gray-700">{report.likelyRootCause.explanation}</p>
            <p className="mt-2 text-sm text-gray-800"><strong>Correção recomendada:</strong> {report.likelyRootCause.recommendedFix}</p>
          </div>

          {/* Build OS Master channel — must NOT be a restaurant instance */}
          {report.buildOsChannel && (
            <div className={`rounded-xl border p-5 ${report.buildOsChannel.configured ? "border-green-200 bg-green-50" : "border-amber-300 bg-amber-50"}`}>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Canal WhatsApp Master/Admin (Build OS)</p>
              {report.buildOsChannel.configured ? (
                <>
                  <p className="mt-1 text-lg font-bold text-gray-900">Configurado: {report.buildOsChannel.instanceName}</p>
                  <p className="mt-1 text-sm text-gray-700">
                    Este é o canal interno do Build OS — separado dos WhatsApps de restaurante. Ativo:{" "}
                    {String(report.buildOsChannel.enabled)}.
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-1 text-lg font-bold text-amber-800">Canal Admin/Sistema do Build OS não configurado</p>
                  <p className="mt-1 text-sm text-amber-800">
                    Comandos internos pertencem ao centro administrativo do Foocci e NÃO usam instâncias de restaurante.
                    Configure o canal em <strong>Configuração → Canal WhatsApp Master/Admin do Foocci</strong>.
                  </p>
                </>
              )}
              {report.buildOsChannel.legacyFallbackEnabled && (
                <p className="mt-2 rounded-lg bg-amber-100 px-3 py-2 text-xs font-medium text-amber-800">
                  ⚠️ Fallback legado ativo — instâncias de restaurante podem agir como canal Build OS. Não recomendado.
                </p>
              )}
            </div>
          )}

          {/* Event freshness — answers "resent /build but nothing shows" */}
          {report.eventFreshness?.available && (
            <div className={`rounded-xl border p-5 ${report.eventFreshness.stale ? "border-red-300 bg-red-50" : "border-green-200 bg-green-50"}`}>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Chegada de eventos do WhatsApp (Evolution)</p>
              <p className="mt-1 text-lg font-bold text-gray-900">
                {report.eventFreshness.lastEventAgeMinutes === null || report.eventFreshness.lastEventAgeMinutes === undefined
                  ? "Nenhum evento Evolution registrado"
                  : `Último evento recebido há ${report.eventFreshness.lastEventAgeMinutes} min`}
              </p>
              <p className="mt-1 text-sm text-gray-700">
                Último evento: {report.eventFreshness.lastEventAt ? new Date(report.eventFreshness.lastEventAt).toLocaleString("pt-BR") : "nunca"}
                {report.eventFreshness.lastEventInstance ? ` · instância ${report.eventFreshness.lastEventInstance}` : ""}
                {" · "}gerado em {report.eventFreshness.generatedAt ? new Date(report.eventFreshness.generatedAt).toLocaleString("pt-BR") : "—"}
              </p>
              <p className="mt-1 text-sm text-gray-700">
                Instância esperada para teste: <strong>{report.eventFreshness.expectedInstance ?? "—"}</strong>
              </p>
              {report.eventFreshness.stale && (
                <p className="mt-2 rounded-lg bg-red-100 px-3 py-2 text-sm font-medium text-red-800">
                  ⚠️ {report.eventFreshness.orientation}
                </p>
              )}
              {report.buildArrivalCheck?.available && (
                <p className="mt-2 text-sm text-gray-800">
                  <strong>Último /build registrado:</strong>{" "}
                  {report.buildArrivalCheck.lastBuildAnyAt
                    ? `${new Date(report.buildArrivalCheck.lastBuildAnyAt).toLocaleString("pt-BR")} (há ${report.buildArrivalCheck.lastBuildAgeMinutes} min)`
                    : "nenhum"}
                  {" — "}{report.buildArrivalCheck.note}
                </p>
              )}
              {report.eventFreshness.perInstance && report.eventFreshness.perInstance.length > 0 && (
                <table className="mt-3 w-full text-xs">
                  <thead><tr className="text-left text-gray-400"><th className="py-1">Instância</th><th>Último evento</th><th>Há (min)</th><th>Total eventos</th></tr></thead>
                  <tbody>
                    {report.eventFreshness.perInstance.map((p) => (
                      <tr key={p.instanceName} className="border-t border-gray-100">
                        <td className="py-1 font-mono">{p.instanceName}</td>
                        <td>{p.lastEventAt ? new Date(p.lastEventAt).toLocaleString("pt-BR") : "—"}</td>
                        <td>{p.ageMinutes ?? "—"}</td>
                        <td>{p.eventCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* PASS/FAIL badges */}
          <div className="flex flex-wrap gap-2">
            <Badge ok={report.buildOsConfig.enabled && !report.buildOsConfig.hardDisabled} label="Config ativa" />
            <Badge ok={report.authorizedSenderCheck.authorized} label="Operador autorizado" />
            <Badge ok={report.projectCheck.defaultProjectFound} label="Projeto default" />
            <Badge ok={!!report.detectorCheck.prefixDetected} label="Prefixo detectado" />
            <Badge ok={report.promptDraftCheck.canGeneratePromptDraft} label="Rascunho de prompt" />
            <Badge ok={report.webhookReceivedRealBuild} label="Webhook real recebeu /build" />
          </div>

          {/* Deploy info — confirma se produção roda o build com trace */}
          <Card title="Deploy em produção (confirme se é o build atual)">
            <Row k="Build marker" v={report.deployInfo.buildMarker} />
            <Row k="Commit" v={report.deployInfo.commitSha} />
            <Row k="Branch" v={report.deployInfo.branch} />
            <Row k="App version" v={report.deployInfo.appVersion} />
            <Row k="Rota esperada do webhook" v={report.deployInfo.webhookRouteExpected} />
            <Row k="Health" v={report.deployInfo.healthEndpoint} />
            <p className="mt-2 text-xs text-gray-400">
              Se o build marker acima não aparecer, o deploy em produção é antigo (sem o
              código de trace) — faça o redeploy do serviço que recebe o webhook.
            </p>
          </Card>

          {/* Instância Evolution testada — chegada real de eventos */}
          {report.evolutionInstanceCheck.available && (
            <Card title="Instância Evolution testada (chegada real de eventos)">
              <Row k="Algum evento recebido" v={report.evolutionInstanceCheck.anyEventReceived ? "Sim" : "NÃO — nenhum evento chegou ao app"} />
              <Row k="Último evento" v={report.evolutionInstanceCheck.lastEventName ?? "—"} />
              <Row k="Último evento (normalizado)" v={report.evolutionInstanceCheck.lastEventNormalized ?? "—"} />
              <Row k="Último inbound" v={report.evolutionInstanceCheck.lastInboundEventName ?? "—"} />
              <Row k="Quando (último evento)" v={report.evolutionInstanceCheck.lastEventAt ? new Date(report.evolutionInstanceCheck.lastEventAt).toLocaleString("pt-BR") : "—"} />
              <div className="mt-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Instâncias configuradas</p>
                {(report.evolutionInstanceCheck.instances ?? []).map((i) => (
                  <p key={i.instanceName} className="text-xs text-gray-700">
                    {i.instanceName} · {i.restaurant ?? "—"} · {i.isActive ? "ativa" : "inativa"}
                  </p>
                ))}
              </div>
              {(report.evolutionInstanceCheck.recentEvents ?? []).length > 0 && (
                <table className="mt-2 w-full text-[11px]">
                  <thead><tr className="text-left text-gray-400">
                    <th>Evento</th><th>Norm.</th><th>Aceito</th><th>Ignorado</th><th>Dir.</th><th>Quando</th>
                  </tr></thead>
                  <tbody>
                    {(report.evolutionInstanceCheck.recentEvents ?? []).map((e, idx) => (
                      <tr key={idx} className="border-t border-gray-100">
                        <td className="font-mono">{e.eventName}</td>
                        <td className="font-mono">{e.normalized ?? "—"}</td>
                        <td>{String(e.accepted)}</td>
                        <td>{String(e.ignored)}</td>
                        <td>{e.direction ?? "—"}</td>
                        <td>{new Date(e.createdAt).toLocaleTimeString("pt-BR")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {!report.evolutionInstanceCheck.anyEventReceived && (
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Nenhum evento chegou ao app: o problema é entrega Evolution → app (instância
                  desconectada, URL do webhook, ou número/instância diferente do testado).
                </p>
              )}
            </Card>
          )}

          {/* Últimas mensagens reais recebidas da Evolution (mascarado) */}
          {report.recentMessages && report.recentMessages.length > 0 && (
            <Card title={`Últimas mensagens reais recebidas da Evolution (${report.recentMessages.length})`}>
              <p className="mb-2 text-xs text-gray-500">
                Tudo mascarado/sanitizado. Cruzamento do log de eventos da Evolution com o trace do
                Build OS. Procure uma linha com <strong>prefixo /build</strong> e veja onde parou.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-left text-gray-400">
                      <th className="py-1">Quando</th>
                      <th>Evento (raw)</th>
                      <th>Norm.</th>
                      <th>Dir.</th>
                      <th>fromMe</th>
                      <th>remoteJid</th>
                      <th>Telefone</th>
                      <th>Prefixo</th>
                      <th>Candidato</th>
                      <th>Autoriz.</th>
                      <th>Criou</th>
                      <th>Trace</th>
                      <th>failureReason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.recentMessages.map((m, i) => (
                      <Fragment key={i}>
                        <tr className="border-t border-gray-100 align-top">
                          <td className="py-1">{new Date(m.createdAt).toLocaleTimeString("pt-BR")}</td>
                          <td className="font-mono">{m.eventNameRaw}</td>
                          <td className="font-mono">{m.eventNameNormalized ?? "—"}</td>
                          <td>{m.direction ?? "—"}</td>
                          <td>{m.fromMe === null ? "—" : String(m.fromMe)}</td>
                          <td className="font-mono">{m.remoteJidMasked ?? "—"}</td>
                          <td className="font-mono">{m.extractedPhoneMasked ?? "—"}</td>
                          <td className={m.prefixDetected ? "font-semibold text-orange-700" : ""}>{m.prefixDetected ?? "—"}</td>
                          <td>{m.buildCommandCandidate ? "sim" : "não"}</td>
                          <td>{m.authorized === null ? "—" : String(m.authorized)}</td>
                          <td>{String(m.commandCreated)}</td>
                          <td>{m.hasBuildTrace ? "sim" : "não"}</td>
                          <td className="text-red-600">{m.failureReason ?? "—"}</td>
                        </tr>
                        {m.fromMeNote && (
                          <tr className="bg-amber-50">
                            <td colSpan={13} className="px-2 py-1 text-[11px] text-amber-700">ℹ️ {m.fromMeNote}</td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Busca por /build nos eventos e mensagens */}
          {report.buildTextSearch?.searched && (
            <Card title="Busca por /build nos eventos e mensagens">
              {report.buildTextSearch.verdict && (
                <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{report.buildTextSearch.verdict}</p>
              )}
              <div className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
                <Row k="/build em mensagens normais" v={report.buildTextSearch.foundInMessages ? "SIM" : "não"} />
                <Row k="/build em traces Build OS" v={report.buildTextSearch.foundInTraces ? "SIM" : "não"} />
                <Row k="Operador autorizado (mascarado)" v={report.buildTextSearch.authorizedOperatorMasked ?? "—"} />
                <Row k="Variantes autorizadas" v={(report.buildTextSearch.authorizedVariantsMasked ?? []).join("  |  ")} />
              </div>

              {(report.buildTextSearch.messages ?? []).length > 0 && (
                <div className="mt-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                    /build em Conversation/Message (fluxo normal)
                  </p>
                  <table className="mt-1 w-full text-[11px]">
                    <thead><tr className="text-left text-gray-400">
                      <th>Quando</th><th>Prefixo</th><th>Dir.</th><th>Sender</th><th>Canal</th><th>Telefone</th><th>Trecho</th>
                    </tr></thead>
                    <tbody>
                      {(report.buildTextSearch.messages ?? []).map((m, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td>{new Date(m.createdAt).toLocaleString("pt-BR")}</td>
                          <td className="font-semibold text-orange-700">{m.prefixDetected ?? "—"}</td>
                          <td>{m.direction}</td>
                          <td>{m.senderType ?? "—"}</td>
                          <td>{m.channel ?? "—"}</td>
                          <td className="font-mono">{m.phoneMasked ?? "—"}</td>
                          <td className="font-mono">{m.snippet}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {(report.buildTextSearch.traces ?? []).length > 0 && (
                <div className="mt-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                    /build em BuildWebhookTrace
                  </p>
                  <table className="mt-1 w-full text-[11px]">
                    <thead><tr className="text-left text-gray-400">
                      <th>Quando</th><th>Prefixo</th><th>Telefone</th><th>Autoriz.</th><th>fromMe</th><th>failureReason</th>
                    </tr></thead>
                    <tbody>
                      {(report.buildTextSearch.traces ?? []).map((t, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td>{new Date(t.createdAt).toLocaleString("pt-BR")}</td>
                          <td className="font-semibold text-orange-700">{t.prefixDetected ?? "—"}</td>
                          <td className="font-mono">{t.phoneMasked ?? "—"}</td>
                          <td>{t.authorized === null ? "—" : String(t.authorized)}</td>
                          <td>{t.fromMe === null ? "—" : String(t.fromMe)}</td>
                          <td className="text-red-600">{t.failureReason ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {/* Webhook real — o indicador decisivo */}
          <div className={`rounded-xl border p-4 ${report.webhookReceivedRealBuild ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
            <p className="text-sm font-semibold text-gray-900">
              {report.webhookReceivedRealBuild
                ? "✅ O webhook real do WhatsApp JÁ alcançou o Build OS."
                : "❌ Nenhuma tentativa real do webhook Build OS foi registrada ainda."}
            </p>
            <p className="mt-1 text-xs text-gray-600">
              {report.webhookReceivedRealBuild
                ? `Última tentativa: ${report.lastWebhookAt ? new Date(report.lastWebhookAt).toLocaleString("pt-BR") : "—"}.`
                : "Se você já enviou /build no WhatsApp e isto continua vazio, o webhook real NÃO está chegando neste código (deploy antigo, URL do webhook errada no Evolution, ou outra instância). Confirme o deploy/URL e envie /build novamente."}
            </p>
          </div>

          {/* Webhook traces */}
          {report.recentWebhookTraces.length > 0 && (
            <Card title={`Tentativas reais do webhook (${report.recentWebhookTraces.length})`}>
              {authDone && (
                <div className="mb-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                  ✅ {authDone}
                </div>
              )}
              <table className="w-full text-xs">
                <thead><tr className="text-left text-gray-400">
                  <th className="py-1">#</th><th>Telefone</th><th>Prefixo</th><th>fromMe</th>
                  <th>Config</th><th>Autoriz.</th><th>Criou</th><th>Respondeu</th><th>Falha</th><th>Quando</th><th>Ação</th>
                </tr></thead>
                <tbody>
                  {report.recentWebhookTraces.map((t) => {
                    const eligible =
                      ["/build", "/cmd", "/prompt"].includes((t.prefixDetected ?? "").toLowerCase()) &&
                      t.authorized === false &&
                      t.failureReason === "unauthorized_sender";
                    const formOpen = authTraceId === t.traceId;
                    return (
                      <Fragment key={t.id}>
                        <tr className="border-t border-gray-100">
                          <td className="py-1 font-mono">{t.id}</td>
                          <td className="font-mono">{t.maskedPhone ?? "—"}</td>
                          <td>{t.prefixDetected ?? "—"}</td>
                          <td>{t.fromMe === null ? "—" : String(t.fromMe)}</td>
                          <td>{t.configEnabled === null ? "—" : String(t.configEnabled)}</td>
                          <td>{t.authorized === null ? "—" : String(t.authorized)}</td>
                          <td>{String(t.commandCreated)}</td>
                          <td>{String(t.responseSent)}</td>
                          <td className="text-red-600">{t.failureReason ?? "—"}</td>
                          <td>{new Date(t.createdAt).toLocaleString("pt-BR")}</td>
                          <td>
                            {eligible && !formOpen && t.canAuthorize && (
                              <button
                                onClick={() => openAuthForm(t.traceId)}
                                className="rounded-md bg-orange-600 px-2 py-1 text-xs font-semibold text-white hover:bg-orange-700"
                              >
                                Autorizar
                              </button>
                            )}
                            {eligible && !t.canAuthorize && (
                              <span className="text-xs text-gray-500" title="Este trace é anterior ao registro do número; reenvie /build para gerar um trace autorizável.">
                                Trace antigo — reenvie /build para autorizar
                              </span>
                            )}
                            {t.failureReason === "fromme_operator_unresolved" && (
                              <span className="text-xs text-amber-600" title="O /build veio da própria instância (fromMe), mas o webhook não trouxe o número conectado do operador. Não dá para autorizar sem identificar o operador.">
                                Operador da instância não identificado no webhook
                              </span>
                            )}
                          </td>
                        </tr>
                        {formOpen && (
                          <tr className="bg-orange-50">
                            <td colSpan={11} className="px-3 py-3">
                              <div className="space-y-2">
                                <p className="text-sm font-semibold text-gray-800">
                                  Autorizar este número como operador do Build OS?
                                </p>
                                <p className="text-xs text-gray-600">
                                  Telefone (mascarado): <span className="font-mono">{t.maskedPhone ?? "—"}</span>.
                                  O número completo é recuperado com segurança no servidor — nunca é exibido nem enviado pelo navegador.
                                </p>
                                <div className="flex flex-wrap items-end gap-3">
                                  <label className="text-xs text-gray-600">
                                    Nome
                                    <input
                                      value={authName}
                                      onChange={(e) => setAuthName(e.target.value)}
                                      className="mt-1 block w-56 rounded-md border border-gray-300 px-2 py-1 text-sm"
                                    />
                                  </label>
                                  <label className="text-xs text-gray-600">
                                    Função
                                    <select
                                      value={authRole}
                                      onChange={(e) => setAuthRole(e.target.value as "owner" | "admin")}
                                      className="mt-1 block w-40 rounded-md border border-gray-300 px-2 py-1 text-sm"
                                    >
                                      <option value="owner">OWNER</option>
                                      <option value="admin">ADMIN</option>
                                    </select>
                                  </label>
                                  <button
                                    onClick={() => confirmAuthorize(t.traceId)}
                                    disabled={authBusy}
                                    className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                                  >
                                    {authBusy ? "Autorizando…" : "Confirmar autorização"}
                                  </button>
                                  <button
                                    onClick={() => setAuthTraceId(null)}
                                    disabled={authBusy}
                                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                                {authError && <p className="text-xs text-red-600">{authError}</p>}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}

          {/* Cards */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title="Configuração">
              <Row k="Existe no banco" v={String(report.buildOsConfig.exists)} />
              <Row k="Ativado" v={String(report.buildOsConfig.enabled)} />
              <Row k="Origem" v={report.buildOsConfig.source} />
              <Row k="Hard disabled" v={String(report.buildOsConfig.hardDisabled)} />
              <Row k="Modo" v={report.buildOsConfig.mode} />
            </Card>
            <Card title="Autorização do operador">
              <Row k="Telefone (mascarado)" v={report.authorizedSenderCheck.normalizedPhone} />
              <Row k="Variantes" v={report.authorizedSenderCheck.variants.join("  |  ")} />
              <Row k="Operador no banco" v={String(report.authorizedSenderCheck.dbSenderFound)} />
              <Row k="Ativo" v={String(report.authorizedSenderCheck.dbSenderActive)} />
              <Row k="Autorizado" v={String(report.authorizedSenderCheck.authorized)} />
              <Row k="Fonte" v={report.authorizedSenderCheck.authorizationSource} />
              <Row k="Último uso" v={report.authorizedSenderCheck.lastUsedAt ?? "—"} />
            </Card>
            <Card title="Projeto">
              <Row k="Default encontrado" v={String(report.projectCheck.defaultProjectFound)} />
              <Row k="Slug default" v={report.projectCheck.defaultProjectSlug ?? "—"} />
              <Row k="Projetos ativos" v={String(report.projectCheck.activeProjectsCount)} />
              <Row k="Resolvido da msg" v={report.projectCheck.resolvedFromMessage ?? "—"} />
            </Card>
            <Card title="Detecção + Classificação">
              <Row k="Prefixo" v={report.detectorCheck.prefixDetected ?? "—"} />
              <Row k="taskType" v={report.classificationCheck.taskType} />
              <Row k="executionIntent" v={report.classificationCheck.executionIntent} />
              <Row k="targetArea" v={report.classificationCheck.targetArea} />
              <Row k="riskLevel" v={report.classificationCheck.riskLevel} />
            </Card>
          </div>

          {/* Last commands */}
          <Card title={`Últimos comandos do operador (${report.lastCommands.length})`}>
            {report.lastCommands.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhum comando registrado para este telefone.</p>
            ) : (
              <table className="w-full text-xs">
                <thead><tr className="text-left text-gray-400">
                  <th className="py-1">#</th><th>Status</th><th>Projeto</th><th>Risco</th><th>Prompt v</th><th>Criado</th>
                </tr></thead>
                <tbody>
                  {report.lastCommands.map((c) => (
                    <tr key={c.id} className="border-t border-gray-100">
                      <td className="py-1 font-mono">{c.id}</td><td>{c.status}</td>
                      <td>{c.project ?? "—"}</td><td>{c.riskLevel}</td>
                      <td>{c.promptVersions}</td><td>{new Date(c.createdAt).toLocaleString("pt-BR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

// ── Webhook Evolution card ──────────────────────────────────────────────────────
// Reuses the EXISTING endpoints (no duplication):
//   GET  /api/evolution/webhook-config-live  → read live status (OWNER-only)
//   POST /api/evolution/sync-webhook         → set the correct URL (OWNER-only)
// Both strip secrets/token server-side. The corrective action lives here so the
// operator never has to leave the Build OS diagnostics screen.

const EXPECTED_WEBHOOK_URL = "https://foocci.com.br/api/webhooks/evolution";

interface WebhookLive {
  success: boolean;
  instanceName?: string;
  expectedUrl?: string;
  url?: string | null;
  enabled?: boolean | null;
  events?: string[];
  hasMessagesUpsert?: boolean;
  isEnabled?: boolean;
  isHealthy?: boolean;
  issues?: string[];
  recommendation?: string;
  error?: string;
}

interface SyncResult {
  success: boolean;
  instanceName?: string;
  webhookUrlConfigured?: string;
  eventsConfigured?: string[];
  recommendation?: string;
  error?: string | null;
}

/**
 * Build the full Markdown diagnostic report from the already-loaded `report`.
 * Uses ONLY data already present on screen (no new fetch). Everything is the
 * masked/sanitized values the diagnostics API returns — no secrets/tokens/phones.
 */
function buildReportMarkdown(r: Report): string {
  const yn = (v: boolean | null | undefined) => (v === null || v === undefined ? "—" : v ? "sim" : "não");
  const L: string[] = [];
  L.push("# Build OS Diagnostic Report");
  L.push(`Gerado em: ${new Date().toLocaleString("pt-BR")}`);
  L.push("");

  L.push("## Causa-raiz provável");
  L.push(`- Label: ${r.likelyRootCause.code}`);
  L.push(`- Explicação: ${r.likelyRootCause.explanation}`);
  L.push(`- Correção recomendada: ${r.likelyRootCause.recommendedFix}`);
  L.push("");

  if (r.buildOsChannel) {
    L.push("## Canal WhatsApp Master/Admin (Build OS)");
    L.push(`- Configurado: ${yn(r.buildOsChannel.configured)}`);
    L.push(`- Instância: ${r.buildOsChannel.instanceName ?? "—"}`);
    L.push(`- Ativo: ${yn(r.buildOsChannel.enabled)}`);
    L.push(`- Fallback legado (restaurante como Build OS): ${yn(r.buildOsChannel.legacyFallbackEnabled)}`);
    if (!r.buildOsChannel.configured) L.push("- ⚠️ Canal Master não configurado — comandos internos NÃO devem usar instâncias de restaurante.");
    L.push("");
  }

  if (r.eventFreshness?.available) {
    L.push("## Chegada de eventos (Evolution)");
    L.push(`- Último evento recebido: ${r.eventFreshness.lastEventAt ?? "nunca"} (há ${r.eventFreshness.lastEventAgeMinutes ?? "—"} min, instância ${r.eventFreshness.lastEventInstance ?? "—"})`);
    L.push(`- Relatório gerado em: ${r.eventFreshness.generatedAt ?? "—"}`);
    L.push(`- Eventos desatualizados (stale > ${r.eventFreshness.staleThresholdMinutes ?? "?"} min): ${yn(r.eventFreshness.stale)}`);
    L.push(`- Instância esperada para teste: ${r.eventFreshness.expectedInstance ?? "—"}`);
    if (r.eventFreshness.stale) L.push(`- ⚠️ ${r.eventFreshness.orientation ?? ""}`);
    for (const p of r.eventFreshness.perInstance ?? []) {
      L.push(`  - [${p.instanceName}] último ${p.lastEventAt ?? "—"} (há ${p.ageMinutes ?? "—"} min) · ${p.eventCount} eventos`);
    }
    if (r.buildArrivalCheck?.available) {
      L.push(`- Último /build registrado: ${r.buildArrivalCheck.lastBuildAnyAt ?? "nenhum"} (há ${r.buildArrivalCheck.lastBuildAgeMinutes ?? "—"} min)`);
      L.push(`- Último /build veio do Canal Master: ${yn(r.buildArrivalCheck.lastBuildTraceFromMasterChannel)} (instância: ${r.buildArrivalCheck.lastBuildTraceInstance ?? "—"})`);
      L.push(`- ${r.buildArrivalCheck.note ?? ""}`);
    }
    L.push("");
  }

  L.push("## Checks principais");
  L.push(`- Config ativa: ${yn(r.buildOsConfig.enabled && !r.buildOsConfig.hardDisabled)}`);
  L.push(`- Operador autorizado: ${yn(r.authorizedSenderCheck.authorized)}`);
  L.push(`- Projeto default: ${yn(r.projectCheck.defaultProjectFound)}`);
  L.push(`- Prefixo detectado: ${yn(!!r.detectorCheck.prefixDetected)}`);
  L.push(`- Rascunho de prompt: ${yn(r.promptDraftCheck.canGeneratePromptDraft)}`);
  L.push(`- Webhook real recebeu /build: ${yn(r.webhookReceivedRealBuild)}`);
  L.push("");

  L.push("## Deploy em produção");
  L.push(`- Build marker: ${r.deployInfo.buildMarker}`);
  L.push(`- Commit: ${r.deployInfo.commitSha}`);
  L.push(`- Branch: ${r.deployInfo.branch}`);
  L.push(`- App version: ${r.deployInfo.appVersion}`);
  L.push(`- Rota esperada do webhook: ${r.deployInfo.webhookRouteExpected}`);
  L.push(`- Health endpoint: ${r.deployInfo.healthEndpoint}`);
  L.push("");

  L.push("## Instância Evolution testada");
  const ev = r.evolutionInstanceCheck;
  if (ev.available) {
    L.push(`- Algum evento recebido: ${yn(ev.anyEventReceived)}`);
    L.push(`- Último evento: ${ev.lastEventName ?? "—"}`);
    L.push(`- Último evento normalizado: ${ev.lastEventNormalized ?? "—"}`);
    L.push(`- Último inbound: ${ev.lastInboundEventName ?? "—"}`);
    L.push(`- Horário do último evento: ${ev.lastEventAt ? new Date(ev.lastEventAt).toLocaleString("pt-BR") : "—"}`);
    L.push(`- Instâncias configuradas: ${(ev.instances ?? []).map((i) => `${i.instanceName}(${i.restaurant ?? "—"}, ${i.isActive ? "ativa" : "inativa"})`).join(", ") || "—"}`);
    L.push("- Últimos eventos:");
    for (const e of ev.recentEvents ?? []) {
      L.push(`  - ${new Date(e.createdAt).toLocaleString("pt-BR")} | ${e.eventName} → ${e.normalized ?? "—"} | accepted=${yn(e.accepted)} ignored=${yn(e.ignored)} | dir=${e.direction ?? "—"} | ${e.remoteJid ?? "—"}${e.error ? ` | err=${e.error}` : ""}`);
    }
  } else {
    L.push("- (indisponível)");
  }
  L.push("");

  L.push("## Últimas mensagens reais recebidas da Evolution");
  if (r.recentMessages.length === 0) L.push("- (nenhuma)");
  for (const m of r.recentMessages) {
    L.push(`- ${new Date(m.createdAt).toLocaleString("pt-BR")} | ${m.eventNameRaw}→${m.eventNameNormalized ?? "—"} | dir=${m.direction ?? "—"} fromMe=${yn(m.fromMe)} | jid=${m.remoteJidMasked ?? "—"} tel=${m.extractedPhoneMasked ?? "—"} | prefix=${m.prefixDetected ?? "—"} candidate=${yn(m.buildCommandCandidate)} authorized=${yn(m.authorized)} created=${yn(m.commandCreated)} trace=${yn(m.hasBuildTrace)}${m.failureReason ? ` | reason=${m.failureReason}` : ""}`);
  }
  L.push("");

  L.push("## Busca por /build");
  const bt = r.buildTextSearch;
  if (bt.searched) {
    L.push(`- Encontrado em mensagens normais: ${yn(bt.foundInMessages)}`);
    L.push(`- Encontrado em traces Build OS: ${yn(bt.foundInTraces)}`);
    L.push(`- Operador autorizado (mascarado): ${bt.authorizedOperatorMasked ?? "—"}`);
    L.push(`- Variantes autorizadas: ${(bt.authorizedVariantsMasked ?? []).join(", ") || "—"}`);
    for (const m of bt.messages ?? []) {
      L.push(`  - [msg] ${new Date(m.createdAt).toLocaleString("pt-BR")} | ${m.prefixDetected ?? "—"} | dir=${m.direction} sender=${m.senderType ?? "—"} canal=${m.channel ?? "—"} tel=${m.phoneMasked ?? "—"} | ${m.snippet}`);
    }
    for (const t of bt.traces ?? []) {
      L.push(`  - [trace] ${new Date(t.createdAt).toLocaleString("pt-BR")} | ${t.prefixDetected ?? "—"} | tel=${t.phoneMasked ?? "—"} authorized=${yn(t.authorized)} fromMe=${yn(t.fromMe)} reason=${t.failureReason ?? "—"}`);
    }
    if (bt.verdict) L.push(`- Conclusão: ${bt.verdict}`);
  } else {
    L.push("- (não pesquisado)");
  }
  L.push("");

  L.push("## Configuração");
  L.push(`- Existe no banco: ${yn(r.buildOsConfig.exists)}`);
  L.push(`- Ativado: ${yn(r.buildOsConfig.enabled)}`);
  L.push(`- Origem: ${r.buildOsConfig.source}`);
  L.push(`- Hard disabled: ${yn(r.buildOsConfig.hardDisabled)}`);
  L.push(`- Modo: ${r.buildOsConfig.mode}`);
  L.push("");

  L.push("## Autorização do operador");
  const a = r.authorizedSenderCheck;
  L.push(`- Telefone (mascarado): ${a.normalizedPhone}`);
  L.push(`- Variantes: ${a.variants.join(", ")}`);
  L.push(`- Operador no banco: ${yn(a.dbSenderFound)}`);
  L.push(`- Ativo: ${yn(a.dbSenderActive)}`);
  L.push(`- Autorizado: ${yn(a.authorized)}`);
  L.push(`- Fonte: ${a.authorizationSource}`);
  L.push(`- Último uso: ${a.lastUsedAt ?? "—"}`);
  L.push("");

  L.push("## Projeto");
  L.push(`- Default encontrado: ${yn(r.projectCheck.defaultProjectFound)}`);
  L.push(`- Slug default: ${r.projectCheck.defaultProjectSlug ?? "—"}`);
  L.push(`- Projetos ativos: ${r.projectCheck.activeProjectsCount}`);
  L.push(`- Resolvido da mensagem: ${r.projectCheck.resolvedFromMessage ?? "—"}`);
  L.push("");

  L.push("## Detecção + Classificação");
  L.push(`- Prefixo: ${r.detectorCheck.prefixDetected ?? "—"}`);
  L.push(`- taskType: ${r.classificationCheck.taskType}`);
  L.push(`- executionIntent: ${r.classificationCheck.executionIntent}`);
  L.push(`- targetArea: ${r.classificationCheck.targetArea}`);
  L.push(`- riskLevel: ${r.classificationCheck.riskLevel}`);
  L.push("");

  L.push("## Webhook Evolution (verificar pelo card; status ao vivo é OWNER-only)");
  L.push(`- URL esperada: ${r.deployInfo.webhookRouteExpected}`);
  L.push("");

  L.push("## Últimos comandos do operador");
  if (r.lastCommands.length === 0) L.push("- nenhum comando registrado");
  for (const c of r.lastCommands) {
    L.push(`- #${c.id} | ${c.status} | proj=${c.project ?? "—"} | risco=${c.riskLevel} | promptV=${c.promptVersions} | ${new Date(c.createdAt).toLocaleString("pt-BR")}`);
  }
  L.push("");

  // Final one-line conclusion about the likely current bottleneck.
  let bottleneck: string;
  if (!r.buildOsConfig.enabled || r.buildOsConfig.hardDisabled) {
    bottleneck = "Build OS desativado em runtime (config/hard-disable).";
  } else if (!r.evolutionInstanceCheck.anyEventReceived) {
    bottleneck = "Nenhum evento da Evolution chega ao app (instância/URL/conexão).";
  } else if (r.buildTextSearch.foundInMessages && !r.buildTextSearch.foundInTraces) {
    bottleneck = "/build chega como mensagem normal mas não vira Build OS — provável divergência de número/instância (compare telefone associado x operador autorizado).";
  } else if (!r.webhookReceivedRealBuild) {
    bottleneck = "Eventos chegam, mas nenhum /build virou trace — verifique extração de texto/sender e número do operador.";
  } else {
    bottleneck = "Caminho saudável; se ainda falha, verifique envio de confirmação (failureReason nos traces).";
  }
  L.push("## Conclusão final");
  L.push(`- ${bottleneck}`);

  return L.join("\n");
}

function WebhookCard() {
  const [live, setLive] = useState<WebhookLive | null>(null);
  const [sync, setSync] = useState<SyncResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [authIssue, setAuthIssue] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function loadStatus() {
    setBusy(true); setErr(null); setAuthIssue(false); setSync(null);
    try {
      const res = await fetch("/api/evolution/webhook-config-live");
      if (res.status === 401 || res.status === 403) { setAuthIssue(true); return; }
      const d = (await res.json().catch(() => ({}))) as WebhookLive;
      if (!res.ok && !d.success) { setErr(d.error ?? "Falha ao consultar webhook."); return; }
      setLive(d);
    } catch {
      setErr("Falha de rede ao consultar o webhook.");
    } finally { setBusy(false); }
  }

  async function syncWebhook() {
    setBusy(true); setErr(null); setAuthIssue(false);
    try {
      // The server ALWAYS applies the canonical URL (getExpectedEvolutionWebhookUrl);
      // this body is informational only and cannot override the canonical host.
      const res = await fetch("/api/evolution/sync-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookUrl: EXPECTED_WEBHOOK_URL }),
      });
      if (res.status === 401 || res.status === 403) { setAuthIssue(true); return; }
      const d = (await res.json().catch(() => ({}))) as SyncResult;
      if (!res.ok && !d.success) { setErr(d.error ?? "Falha ao sincronizar."); return; }
      setSync(d);
      await loadStatus(); // refresh live status after sync
    } catch {
      setErr("Falha de rede ao sincronizar o webhook.");
    } finally { setBusy(false); }
  }

  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-900">Webhook Evolution</h3>
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={loadStatus}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40">
            {busy ? "…" : "Verificar status"}
          </button>
          <button type="button" disabled={busy} onClick={syncWebhook}
            className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-40">
            Sincronizar webhook Evolution
          </button>
        </div>
      </div>

      <p className="mt-2 text-xs text-gray-600">
        URL esperada: <code className="rounded bg-gray-100 px-1 font-mono">{EXPECTED_WEBHOOK_URL}</code>
      </p>
      <p className="mt-1 text-xs text-gray-500">
        Use isto quando o Build OS estiver <strong>HEALTHY</strong>, mas o WhatsApp real não gerar
        trace (badge &ldquo;Webhook real recebeu /build&rdquo; em FAIL).
      </p>

      {err && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{err}</p>}

      {authIssue && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Esta ação usa a integração do restaurante (login de <strong>proprietário</strong>). Faça login
          como dono do restaurante no mesmo navegador e tente novamente — a verificação/sincronização do
          webhook é por restaurante, não pela sessão admin global.
        </p>
      )}

      {live && (
        <div className="mt-3 space-y-1">
          <div className="flex flex-wrap gap-2">
            <Badge ok={!!live.isHealthy} label="Webhook saudável" />
            <Badge ok={!!live.isEnabled} label="Habilitado" />
            <Badge ok={!!live.hasMessagesUpsert} label="MESSAGES_UPSERT" />
          </div>
          <div className="mt-2 grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
            <Row k="Instância" v={live.instanceName ?? "—"} />
            <Row k="URL na Evolution" v={live.url ?? "—"} />
            <Row k="URL esperada" v={live.expectedUrl ?? EXPECTED_WEBHOOK_URL} />
            <Row k="Eventos" v={(live.events ?? []).join(", ") || "—"} />
          </div>
          {live.issues && live.issues.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-amber-800">
              {live.issues.map((i, idx) => <li key={idx}>⚠ {i}</li>)}
            </ul>
          )}
          {live.recommendation && <p className="mt-1 text-xs text-gray-500">{live.recommendation}</p>}
        </div>
      )}

      {sync && (
        <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-xs">
          <p className="font-semibold text-green-800">{sync.success ? "✅ Webhook sincronizado." : "⚠ Sincronização retornou aviso."}</p>
          <p className="mt-1 text-gray-700">URL aplicada: <code className="font-mono">{sync.webhookUrlConfigured ?? EXPECTED_WEBHOOK_URL}</code></p>
          <p className="text-gray-700">Eventos: {(sync.eventsConfigured ?? []).join(", ") || "—"}</p>
          {sync.instanceName && <p className="text-gray-700">Instância: {sync.instanceName}</p>}
          <p className="mt-2 font-medium text-gray-800">Envie <code className="font-mono">/build</code> novamente no WhatsApp e rode o diagnóstico.</p>
        </div>
      )}
    </div>
  );
}

const INPUT =
  "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-900">{title}</h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 text-xs">
      <span className="text-gray-500">{k}</span>
      <span className="font-medium text-gray-800">{v}</span>
    </div>
  );
}
