"use client";

/**
 * Meta WhatsApp provider card — Integrações → WhatsApp.
 *
 * Owner UX rule: NO technical setup. The owner only ever clicks "Conectar WhatsApp
 * oficial da Meta" → logs in with Meta → picks company/number → "Conectado", then can
 * "Testar conexão", "Usar como principal" or "Voltar para a conexão anterior". The
 * owner never sees or pastes tokens, App IDs, Config IDs, verify tokens, webhook URLs,
 * WABA/Phone Number IDs or API versions, and never sees internal provider names.
 *
 * All technical detail (env readiness, webhook URL, masked IDs, setup checklist, copy
 * instructions) lives ONLY in the collapsed "Avançado" section for the Foocci team.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { buildMetaSetupInstructions, metaWebhookUrl, META_WEBHOOK_FIELD } from "@/services/whatsapp/metaSetupInstructions";

interface MetaPublic {
  connected: boolean;
  connectionStatus: string;
  displayPhoneNumber: string | null;
  wabaId: string | null;
  phoneNumberId: string | null;
  businessId: string | null;
  tokenPreview: string | null;
  lastError: string | null;
  qualityRating: string | null;
  metaCrmEnabled: boolean;
}
interface StatusResp {
  featureEnabled: boolean;
  activeProvider: string;
  meta: MetaPublic | null;
}

interface DiagEnv {
  featureEnabled:     boolean;
  appId:              boolean;
  appSecret:          boolean;
  configId:           boolean;
  webhookVerifyToken: boolean;
  testPhone:          boolean;
  publicAppId:        boolean;
  publicConfigId:     boolean;
  signatureEnforced:  boolean;
  graphVersion:       string;
}
interface DiagResp {
  env?:                      DiagEnv;
  webhookConfigured?:        boolean;
  templateRequiredFailures?: number;
}

declare global {
  interface Window { FB?: { init: (o: object) => void; login: (cb: (r: unknown) => void, o: object) => void } }
}

export function MetaProviderCard() {
  const [status, setStatus]   = useState<StatusResp | null>(null);
  const [diag, setDiag]       = useState<DiagResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState<string | null>(null);
  const [msg, setMsg]         = useState<{ ok: boolean; text: string } | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [copied, setCopied]   = useState(false);

  const appId    = process.env.NEXT_PUBLIC_META_APP_ID;
  const configId = process.env.NEXT_PUBLIC_META_CONFIG_ID;

  const load = useCallback(() => {
    fetch("/api/integracoes/whatsapp/meta/status")
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((j) => setStatus(j.data as StatusResp))
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  }, []);
  // Env-readiness (OWNER/MANAGER only; silently absent otherwise).
  const loadDiag = useCallback(() => {
    fetch("/api/integracoes/whatsapp/meta/diagnostics")
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((j) => setDiag(j.data as DiagResp))
      .catch(() => setDiag(null));
  }, []);
  useEffect(() => { load(); loadDiag(); }, [load, loadDiag]);

  const flash = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 6000); };

  // ── Embedded Signup ──────────────────────────────────────────────────────────
  async function connect() {
    if (!appId || !configId) {
      flash(false, "Precisa de autorização da Foocci para ativar. Fale com o suporte Foocci.");
      return;
    }
    setBusy("connect");
    try {
      // Capture phone_number_id / waba_id from the Embedded Signup session event.
      let assets: { phoneNumberId?: string; wabaId?: string } = {};
      const listener = (ev: MessageEvent) => {
        if (typeof ev.data !== "string") return;
        try {
          const d = JSON.parse(ev.data);
          if (d?.type === "WA_EMBEDDED_SIGNUP" && d?.data) {
            assets = { phoneNumberId: d.data.phone_number_id, wabaId: d.data.waba_id };
          }
        } catch { /* ignore non-JSON messages */ }
      };
      window.addEventListener("message", listener);

      const sdkLoaded = await loadFbSdk(appId);
      if (!sdkLoaded) {
        window.removeEventListener("message", listener);
        flash(false, "Não foi possível carregar o serviço da Meta. Verifique sua conexão e tente novamente.");
        return;
      }
      const code = await fbLogin(configId);
      window.removeEventListener("message", listener);

      if (!code) { flash(false, "Conexão cancelada."); return; }
      const res = await fetch("/api/integracoes/whatsapp/meta/connect", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, ...assets }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.data?.connected) {
        const warning = !j.data.healthCheckPassed ? " A verificação da API será concluída em instantes." : "";
        flash(true, `WhatsApp oficial da Meta conectado.${warning}`);
        load();
      } else {
        flash(false, j?.data?.error ?? j?.error ?? "Não foi possível concluir a conexão. Tente novamente.");
      }
    } catch {
      flash(false, "Não foi possível iniciar a conexão. Tente novamente.");
    } finally { setBusy(null); }
  }

  async function action(path: string, body: object, okText: string) {
    setBusy(path);
    try {
      const res = await fetch(`/api/integracoes/whatsapp/meta/${path}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => null);
      if (res.ok) { flash(true, okText); load(); loadDiag(); }
      else flash(false, j?.error ?? "Falha na operação.");
    } catch { flash(false, "Sem conexão."); }
    finally { setBusy(null); }
  }

  // Safe inbound simulation — runs the real normalizer, no message sent, no persistence.
  async function simulate() {
    setBusy("simulate");
    try {
      const res = await fetch("/api/integracoes/whatsapp/meta/simulate", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
      });
      const j = await res.json().catch(() => null);
      const r = j?.data?.routing as { restaurantMatched?: boolean; wouldDispatchBrain?: boolean } | undefined;
      if (res.ok && r) {
        flash(true, `Simulação OK — restaurante ${r.restaurantMatched ? "reconhecido" : "não reconhecido"}, Brain ${r.wouldDispatchBrain ? "responderia" : "não responderia"}. Nenhuma mensagem real foi enviada.`);
      } else flash(false, j?.error ?? "Falha na simulação.");
    } catch { flash(false, "Sem conexão."); }
    finally { setBusy(null); }
  }

  // Copy the internal team setup checklist (env-var NAMES only — never values).
  async function copyInstructions() {
    try {
      await navigator.clipboard.writeText(buildMetaSetupInstructions());
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      flash(false, "Não foi possível copiar.");
    }
  }

  if (loading) return null;
  if (!status) return null;

  const meta = status.meta;
  const isMeta = status.activeProvider === "META_CLOUD_API";
  const metaConnected = meta?.connected ?? false;
  const env = diag?.env;

  return (
    <div className="mb-5 rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-900">Conexão de WhatsApp</h2>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${isMeta ? "bg-blue-50 text-blue-700" : "bg-green-50 text-green-700"}`}>
          Em uso: {isMeta ? "WhatsApp oficial da Meta" : "WhatsApp atual"}
        </span>
      </div>

      {msg && (
        <div className={`mt-3 rounded-lg px-3 py-2 text-xs ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>{msg.text}</div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {/* Current connection */}
        <div className={`rounded-xl border p-4 ${!isMeta ? "border-green-300 bg-green-50/40" : "border-gray-200"}`}>
          <p className="text-sm font-semibold text-gray-800">WhatsApp atual</p>
          <p className="mt-1 text-xs text-gray-500">Sua conexão de WhatsApp atual. Continua funcionando normalmente.</p>
          {isMeta && (
            <button type="button" disabled={!!busy} onClick={() => action("provider", { provider: "EVOLUTION" }, "Pronto — voltou para a conexão anterior.")}
              className="mt-3 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              Voltar para a conexão anterior
            </button>
          )}
        </div>

        {/* Meta */}
        <div className={`rounded-xl border p-4 ${isMeta ? "border-blue-300 bg-blue-50/40" : "border-gray-200"}`}>
          <p className="text-sm font-semibold text-gray-800">WhatsApp oficial da Meta</p>
          {!status.featureEnabled ? (
            <p className="mt-1 text-xs text-gray-400">Em breve — disponível quando ativado pela Foocci.</p>
          ) : metaConnected ? (
            <>
              <p className="mt-1 text-xs text-green-700">✓ Conectado{meta?.displayPhoneNumber ? ` · ${meta.displayPhoneNumber}` : ""}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" disabled={!!busy} onClick={() => action("test", {}, "Mensagem de teste enviada (número interno).")}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                  Testar conexão
                </button>
                {!isMeta && (
                  <button type="button" disabled={!!busy} onClick={() => action("provider", { provider: "META_CLOUD_API", confirm: true }, "Pronto — WhatsApp oficial da Meta agora é o principal.")}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                    Usar como principal
                  </button>
                )}
              </div>
              {/* CRM via Meta toggle */}
              <div className="mt-3 flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
                <div>
                  <p className="text-xs font-semibold text-gray-800">Campanhas CRM via Meta</p>
                  <p className="text-[11px] text-gray-500">Enviar mensagens de CRM pelo WhatsApp oficial da Meta em vez do Evolution.</p>
                </div>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => action(
                    "crm-toggle",
                    { enabled: !meta?.metaCrmEnabled },
                    meta?.metaCrmEnabled ? "CRM voltou para o Evolution." : "CRM agora usa o WhatsApp oficial da Meta."
                  )}
                  className={`ml-3 flex-shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
                    meta?.metaCrmEnabled
                      ? "bg-blue-600 text-white hover:bg-blue-700"
                      : "border border-gray-300 bg-white text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {meta?.metaCrmEnabled ? "Ativado" : "Ativar"}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-1 text-xs text-gray-500">Faça login com a Meta e escolha sua empresa e número. Sem códigos para digitar.</p>
              <button type="button" disabled={busy === "connect"} onClick={connect}
                className="mt-3 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                {busy === "connect" ? "Conectando…" : "Conectar WhatsApp oficial da Meta"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Advanced — platform setup checklist (OWNER/MANAGER only; no secrets). */}
      {diag && (
        <div className="mt-3">
          <button type="button" onClick={() => setShowAdvanced((s) => !s)} className="text-[11px] font-medium text-gray-400 hover:text-gray-600">
            {showAdvanced ? "Ocultar avançado" : "Avançado · configuração da plataforma"}
          </button>
          {showAdvanced && (
            <div className="mt-2 space-y-3 rounded-lg bg-gray-50 px-3 py-3 text-[11px] text-gray-600">
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={copyInstructions}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-50">
                  {copied ? "Copiado ✓" : "Copiar instruções para configurar Meta"}
                </button>
                {metaConnected && (
                  <button type="button" disabled={!!busy} onClick={simulate}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-[11px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                    {busy === "simulate" ? "Simulando…" : "Simular recebimento (diagnóstico)"}
                  </button>
                )}
              </div>

              {/* A — Foocci platform readiness (from server env, booleans only) */}
              {env && (
                <SetupSection title="A · Plataforma Foocci">
                  <Check ok={env.featureEnabled}     label="Integração Meta habilitada" />
                  <Check ok={env.appId}              label="App ID configurado" />
                  <Check ok={env.appSecret}          label="App Secret configurado" />
                  <Check ok={env.configId}           label="Config ID (Embedded Signup) configurado" />
                  <Check ok={env.webhookVerifyToken} label="Verify Token do webhook configurado" />
                  <Check ok={env.publicAppId}        label="App ID público (navegador) configurado" />
                  <Check ok={env.publicConfigId}     label="Config ID público (navegador) configurado" />
                  <Check ok={env.testPhone}          label="Telefone de teste configurado (recomendado)" soft />
                  <div className="text-gray-400">Versão da Graph API: {env.graphVersion}</div>
                  {!env.signatureEnforced && (
                    <div className="text-amber-600">⚠ Assinatura do webhook não exigida — defina META_APP_SECRET.</div>
                  )}
                </SetupSection>
              )}

              {/* B — Meta Business setup (guidance + the few auto-detectable items) */}
              <SetupSection title="B · Configuração no Meta Business">
                <Check ok={env?.webhookVerifyToken ?? false} label="Verify token igual ao configurado na Foocci" />
                <SetupItem label={`URL do webhook: ${metaWebhookUrl()}`} />
                <SetupItem label={`Campo a assinar: ${META_WEBHOOK_FIELD}`} />
                <SetupItem label="App Meta criado · produto WhatsApp adicionado · Embedded Signup criado" />
                <SetupItem label="Permissões: whatsapp_business_messaging, whatsapp_business_management" />
              </SetupSection>

              {/* C — Safe test flow */}
              <SetupSection title="C · Fluxo de teste seguro">
                <SetupItem label="1. Testar conexão (apenas número interno)" />
                <SetupItem label="2. Simular recebimento (não envia nada)" />
                <SetupItem label="3. Conectar (login Meta → escolher empresa/número)" />
                <SetupItem label="4. Receber inbound do número interno" />
                <SetupItem label="5. Conferir Central de Conversas" />
                <SetupItem label="6. Voltar para a conexão anterior (rollback)" />
              </SetupSection>

              {/* Masked connection details — only when connected; IDs masked, token preview only */}
              {meta && (
                <SetupSection title="Conexão (mascarado)">
                  <div className="space-y-0.5 font-mono text-[10px] text-gray-500">
                    <div>status: {meta.connectionStatus}</div>
                    <div>número: {meta.displayPhoneNumber ?? "—"}</div>
                    <div>phoneNumberId: {maskId(meta.phoneNumberId)}</div>
                    <div>wabaId: {maskId(meta.wabaId)}</div>
                    <div>token: {meta.tokenPreview ?? "—"}</div>
                    <div>qualidade: {meta.qualityRating ?? "—"}</div>
                    {meta.lastError && <div className="text-red-500">último erro: {meta.lastError}</div>}
                  </div>
                </SetupSection>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Masks a technical id, showing only the last 4 chars (never a secret to begin with). */
function maskId(v: string | null): string {
  if (!v) return "—";
  return v.length <= 4 ? "••••" : `••••${v.slice(-4)}`;
}

function SetupSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{title}</p>
      {children}
    </div>
  );
}

function Check({ ok, label, soft }: { ok: boolean; label: string; soft?: boolean }) {
  const okColor = soft ? "text-gray-600" : "text-green-600";
  return (
    <div className={ok ? okColor : (soft ? "text-gray-400" : "text-red-500")}>
      {ok ? "✓" : (soft ? "○" : "✗")} {label}
    </div>
  );
}

function SetupItem({ label }: { label: string }) {
  return <div className="text-gray-500">• {label}</div>;
}

// ── FB SDK helpers ──────────────────────────────────────────────────────────────

function loadFbSdk(appId: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.FB) {
      // Re-init to ensure the correct appId is active (handles reconnect after appId change).
      window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version: "v21.0" });
      resolve(true);
      return;
    }
    const s = document.createElement("script");
    s.src = "https://connect.facebook.net/en_US/sdk.js";
    s.async = true; s.defer = true;
    s.onload = () => { window.FB?.init({ appId, autoLogAppEvents: true, xfbml: false, version: "v21.0" }); resolve(true); };
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

function fbLogin(configId: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (!window.FB) { resolve(null); return; }
    window.FB.login(
      (resp: unknown) => {
        const code = (resp as { authResponse?: { code?: string } })?.authResponse?.code ?? null;
        resolve(code);
      },
      { config_id: configId, response_type: "code", override_default_response_type: true, extras: { setup: {} } },
    );
  });
}
