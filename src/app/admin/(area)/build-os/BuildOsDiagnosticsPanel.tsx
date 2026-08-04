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
    /** phone_number_id do número Master na Meta. */
    channelId: string | null;
    enabled: boolean;
    legacyFallbackEnabled: boolean;
  };
  eventFreshness?: {
    available: boolean;
    generatedAt?: string;
    /** Fonte declarada: a Meta não grava log bruto de evento. */
    source?: string;
    rawEventLogAvailable?: boolean;
    lastTraceAt?: string | null;
    lastTraceAgeMinutes?: number | null;
    lastTraceChannelId?: string | null;
    staleThresholdMinutes?: number;
    stale?: boolean;
    expectedChannelId?: string | null;
    masterChannelConfigured?: boolean;
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
    lastBuildTraceChannelId?: string | null;
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
  /** Prontidão do canal Master na Meta. Substituiu `evolutionInstanceCheck`. */
  channelCheck: {
    available: boolean;
    configured?: boolean;
    phoneNumberIdSet?: boolean;
    accessTokenSet?: boolean;
    phoneNumberIdMasked?: string | null;
    rawEventLogAvailable?: boolean;
    rawEventLogNote?: string;
  };
  recentMessages: Array<{
    createdAt: string; channelId: string | null;
    fromMe: boolean | null; fromMeNote: string | null;
    senderMasked: string | null;
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

// O bloco "Saúde da instância Evolution" vivia aqui: conexão da instância, número
// conectado, sincronização de webhook e status de entrega por instância. Saiu em
// 04/08/2026 com a Evolution. Na Meta não há instância para consultar nem webhook
// por número para sincronizar — a inscrição é do aplicativo, e quem cuida dela é o
// especialista `meta`. O que sobreviveu é a prontidão do canal (`channelCheck`) e
// o rastro do Build OS.


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

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
        Diagnóstico <strong>interno/admin</strong> do caminho de comando do WhatsApp. Roda no
        ambiente do app (sem console, sem Railway, sem credenciais). Não envia nada a Claude/GitHub.
      </div>

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
                  <p className="mt-1 text-lg font-bold text-gray-900">Configurado — phone_number_id {report.buildOsChannel.channelId}</p>
                  <p className="mt-1 text-sm text-gray-700">
                    Este é o canal interno do Build OS — separado dos WhatsApps de restaurante. Ativo:{" "}
                    {String(report.buildOsChannel.enabled)}.
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-1 text-lg font-bold text-amber-800">Canal Admin/Sistema do Build OS não configurado</p>
                  <p className="mt-1 text-sm text-amber-800">
                    Comandos internos pertencem ao centro administrativo do Foocci e NÃO usam o número de nenhum
                    restaurante. Defina <code>BUILDOS_META_PHONE_NUMBER_ID</code> e <code>BUILDOS_META_ACCESS_TOKEN</code>
                    (número dedicado da Meta) — ver <strong>Configuração → Canal WhatsApp Master/Admin</strong>.
                  </p>
                </>
              )}
              {report.buildOsChannel.legacyFallbackEnabled && (
                <p className="mt-2 rounded-lg bg-amber-100 px-3 py-2 text-xs font-medium text-amber-800">
                  ⚠️ Fallback legado ativo — o número de um restaurante pode agir como canal Build OS. Não recomendado.
                </p>
              )}
            </div>
          )}

          {/* Event freshness — answers "resent /build but nothing shows" */}
          {report.eventFreshness?.available && (
            <div className={`rounded-xl border p-5 ${report.eventFreshness.stale ? "border-red-300 bg-red-50" : "border-green-200 bg-green-50"}`}>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Chegada de comandos no handler do Build OS</p>
              <p className="mt-1 text-lg font-bold text-gray-900">
                {report.eventFreshness.lastTraceAgeMinutes === null || report.eventFreshness.lastTraceAgeMinutes === undefined
                  ? "Nenhum comando registrado"
                  : `Último comando registrado há ${report.eventFreshness.lastTraceAgeMinutes} min`}
              </p>
              <p className="mt-1 text-sm text-gray-700">
                Último rastro: {report.eventFreshness.lastTraceAt ? new Date(report.eventFreshness.lastTraceAt).toLocaleString("pt-BR") : "nunca"}
                {report.eventFreshness.lastTraceChannelId ? ` · canal ${report.eventFreshness.lastTraceChannelId}` : ""}
                {" · "}gerado em {report.eventFreshness.generatedAt ? new Date(report.eventFreshness.generatedAt).toLocaleString("pt-BR") : "—"}
              </p>
              <p className="mt-1 text-sm text-gray-700">
                Canal esperado para teste: <strong>{report.eventFreshness.expectedChannelId ?? "—"}</strong>
              </p>
              {/* Guardrail 1 na tela: vazio aqui NÃO prova que a Meta parou de entregar. */}
              <p className="mt-1 text-xs text-gray-500">
                Fonte: {report.eventFreshness.source ?? "rastro do Build OS"}. Vazio significa
                &quot;nenhum comando chegou ao handler&quot; — <strong>não</strong> prova que a Meta parou de entregar
                mensagens.
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

          {/* Prontidão do canal Master na Meta (substituiu "Instância Evolution testada") */}
          <Card title="Canal Master na Meta (prontidão)">
            <Row k="Canal pronto (número + token)" v={report.channelCheck.configured ? "Sim" : "NÃO — /build por WhatsApp não funciona"} />
            <Row k="phone_number_id definido" v={report.channelCheck.phoneNumberIdSet ? "Sim" : "não"} />
            <Row k="token definido" v={report.channelCheck.accessTokenSet ? "Sim" : "não"} />
            <Row k="phone_number_id (mascarado)" v={report.channelCheck.phoneNumberIdMasked ?? "—"} />
            {/* Guardrail 1 explícito na tela: o que NÃO dá para concluir daqui. */}
            <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
              ⚠️ {report.channelCheck.rawEventLogNote ??
                "A Meta não grava log bruto de evento. A evidência de chegada é o rastro do Build OS abaixo — rastro vazio NÃO prova que a Meta parou de entregar."}
            </p>
          </Card>

          {/* Últimos comandos que chegaram ao handler do Build OS (mascarado) */}
          {report.recentMessages && report.recentMessages.length > 0 && (
            <Card title={`Últimos comandos no handler do Build OS (${report.recentMessages.length})`}>
              <p className="mb-2 text-xs text-gray-500">
                Tudo mascarado/sanitizado — sem telefone completo, sem texto da mensagem. Fonte: o rastro
                do Build OS. Procure uma linha com <strong>prefixo /build</strong> e veja onde parou.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-left text-gray-400">
                      <th className="py-1">Quando</th>
                      <th>Canal</th>
                      <th>fromMe</th>
                      <th>Telefone</th>
                      <th>Prefixo</th>
                      <th>Candidato</th>
                      <th>Autoriz.</th>
                      <th>Criou</th>
                      <th>failureReason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.recentMessages.map((m, i) => (
                      <Fragment key={i}>
                        <tr className="border-t border-gray-100 align-top">
                          <td className="py-1">{new Date(m.createdAt).toLocaleTimeString("pt-BR")}</td>
                          <td className="font-mono">{m.channelId ?? "—"}</td>
                          <td>{m.fromMe === null ? "—" : String(m.fromMe)}</td>
                          <td className="font-mono">{m.senderMasked ?? "—"}</td>
                          <td className={m.prefixDetected ? "font-semibold text-orange-700" : ""}>{m.prefixDetected ?? "—"}</td>
                          <td>{m.buildCommandCandidate ? "sim" : "não"}</td>
                          <td>{m.authorized === null ? "—" : String(m.authorized)}</td>
                          <td>{String(m.commandCreated)}</td>
                          <td className="text-red-600">{m.failureReason ?? "—"}</td>
                        </tr>
                        {m.fromMeNote && (
                          <tr className="bg-amber-50">
                            <td colSpan={9} className="px-2 py-1 text-[11px] text-amber-700">ℹ️ {m.fromMeNote}</td>
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
                : "Se você já enviou /build no WhatsApp e isto continua vazio, o comando não chegou a este código. Duas causas possíveis, e esta tela não distingue entre elas: (a) deploy antigo; (b) a Meta não entregou a mensagem (inscrição do webhook do aplicativo, ou número diferente do Canal Master). Confirme o deploy e o número, e envie /build novamente."}
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

// O card "Webhook Evolution" vivia aqui: lia o webhook ao vivo na Evolution e
// reaplicava a URL correta com um clique. Saiu em 04/08/2026. Na Meta a inscrição
// do webhook é do APLICATIVO, não de cada número — não há o que sincronizar por
// restaurante, e mexer nela é trabalho do especialista `meta`.

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
    L.push(`- phone_number_id: ${r.buildOsChannel.channelId ?? "—"}`);
    L.push(`- Ativo: ${yn(r.buildOsChannel.enabled)}`);
    L.push(`- Fallback legado (restaurante como Build OS): ${yn(r.buildOsChannel.legacyFallbackEnabled)}`);
    if (!r.buildOsChannel.configured) L.push("- ⚠️ Canal Master não configurado — comandos internos NÃO devem usar o número de nenhum restaurante.");
    L.push("");
  }

  if (r.eventFreshness?.available) {
    L.push("## Chegada de comandos no handler do Build OS");
    L.push(`- Fonte: ${r.eventFreshness.source ?? "rastro do Build OS"} (a Meta não grava log bruto de evento)`);
    L.push(`- Último rastro: ${r.eventFreshness.lastTraceAt ?? "nunca"} (há ${r.eventFreshness.lastTraceAgeMinutes ?? "—"} min, canal ${r.eventFreshness.lastTraceChannelId ?? "—"})`);
    L.push(`- Relatório gerado em: ${r.eventFreshness.generatedAt ?? "—"}`);
    L.push(`- Desatualizado (stale > ${r.eventFreshness.staleThresholdMinutes ?? "?"} min): ${yn(r.eventFreshness.stale)}`);
    L.push(`- Canal esperado para teste: ${r.eventFreshness.expectedChannelId ?? "—"}`);
    L.push("- ⚠️ Rastro vazio significa 'nenhum comando chegou ao handler' — NÃO prova que a Meta parou de entregar.");
    if (r.eventFreshness.stale) L.push(`- ⚠️ ${r.eventFreshness.orientation ?? ""}`);
    if (r.buildArrivalCheck?.available) {
      L.push(`- Último /build registrado: ${r.buildArrivalCheck.lastBuildAnyAt ?? "nenhum"} (há ${r.buildArrivalCheck.lastBuildAgeMinutes ?? "—"} min)`);
      L.push(`- Último /build veio do Canal Master: ${yn(r.buildArrivalCheck.lastBuildTraceFromMasterChannel)} (canal: ${r.buildArrivalCheck.lastBuildTraceChannelId ?? "—"})`);
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

  L.push("## Canal Master na Meta (prontidão)");
  const ch = r.channelCheck;
  L.push(`- Canal pronto (número + token): ${yn(ch.configured)}`);
  L.push(`- phone_number_id definido: ${yn(ch.phoneNumberIdSet)}`);
  L.push(`- token definido: ${yn(ch.accessTokenSet)}`);
  L.push(`- phone_number_id (mascarado): ${ch.phoneNumberIdMasked ?? "—"}`);
  L.push(`- ⚠️ ${ch.rawEventLogNote ?? "A Meta não grava log bruto de evento; a evidência de chegada é o rastro do Build OS."}`);
  L.push("");

  L.push("## Últimos comandos no handler do Build OS");
  if (r.recentMessages.length === 0) L.push("- (nenhum)");
  for (const m of r.recentMessages) {
    L.push(`- ${new Date(m.createdAt).toLocaleString("pt-BR")} | canal=${m.channelId ?? "—"} fromMe=${yn(m.fromMe)} | tel=${m.senderMasked ?? "—"} | prefix=${m.prefixDetected ?? "—"} candidate=${yn(m.buildCommandCandidate)} authorized=${yn(m.authorized)} created=${yn(m.commandCreated)}${m.failureReason ? ` | reason=${m.failureReason}` : ""}`);
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
  } else if (!r.channelCheck.configured) {
    bottleneck = "Canal Master na Meta não configurado (BUILDOS_META_PHONE_NUMBER_ID / BUILDOS_META_ACCESS_TOKEN) — /build por WhatsApp não funciona.";
  } else if (r.buildTextSearch.foundInMessages && !r.buildTextSearch.foundInTraces) {
    bottleneck = "/build chega como mensagem normal mas não vira Build OS — provável divergência de número/instância (compare telefone associado x operador autorizado).";
  } else if (!r.webhookReceivedRealBuild) {
    bottleneck = "Nenhum /build virou rastro. Duas causas possíveis, e este relatório NÃO distingue: (a) a Meta não entregou a mensagem ao app; (b) chegou mas o número do operador não confere. Confira a inscrição do webhook na Meta e o operador autorizado.";
  } else {
    bottleneck = "Caminho saudável; se ainda falha, verifique envio de confirmação (failureReason nos traces).";
  }
  L.push("## Conclusão final");
  L.push(`- ${bottleneck}`);

  return L.join("\n");
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
