"use client";

/**
 * Build OS → Diagnóstico (admin-only, read-only by default).
 *
 * One-click health report for the WhatsApp command path + an internal simulated
 * command (dry-run or real). No console/fetch/Railway needed. No Claude/GitHub/LLM.
 */

import { useState } from "react";

const DEFAULT_PHONE = "+5511989400692";
const DEFAULT_MESSAGE = "/build Faz um RAIO-X do checkout Pix. Não implemente nada ainda.";

interface Report {
  deployInfo: {
    commitSha: string; branch: string; appVersion: string; nodeEnv: string;
    buildMarker: string; webhookRouteExpected: string; healthEndpoint: string;
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
  webhookReceivedRealBuild: boolean;
  lastWebhookAt: string | null;
  recentWebhookTraces: Array<{
    id: string; maskedPhone: string | null; prefixDetected: string | null;
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

export function BuildOsDiagnosticsPanel() {
  const [phone, setPhone] = useState(DEFAULT_PHONE);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [simResult, setSimResult] = useState<string | null>(null);

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
        </div>
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
              <table className="w-full text-xs">
                <thead><tr className="text-left text-gray-400">
                  <th className="py-1">#</th><th>Telefone</th><th>Prefixo</th><th>fromMe</th>
                  <th>Config</th><th>Autoriz.</th><th>Criou</th><th>Respondeu</th><th>Falha</th><th>Quando</th>
                </tr></thead>
                <tbody>
                  {report.recentWebhookTraces.map((t) => (
                    <tr key={t.id} className="border-t border-gray-100">
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
                    </tr>
                  ))}
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
