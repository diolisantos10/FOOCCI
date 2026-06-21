"use client";

/**
 * Meta WhatsApp provider card — Integrações → WhatsApp.
 *
 * Owner UX (non-technical): connect via Embedded Signup, see status, test the
 * connection (safe — internal number only), use Meta as provider, or roll back to
 * Evolution. Raw tokens/IDs live only inside the collapsed "Avançado" section
 * (masked). Shows nothing intrusive when the Meta feature is disabled.
 */

import { useCallback, useEffect, useState } from "react";

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
      flash(false, "Configuração do app Meta pendente no servidor. Contate o suporte Foocci para habilitar.");
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

      await loadFbSdk(appId);
      const code = await fbLogin(configId);
      window.removeEventListener("message", listener);

      if (!code) { flash(false, "Conexão cancelada."); return; }
      const res = await fetch("/api/integracoes/whatsapp/meta/connect", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, ...assets }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.data?.connected) { flash(true, "WhatsApp oficial da Meta conectado."); load(); }
      else flash(false, j?.error ?? "Falha ao conectar.");
    } catch {
      flash(false, "Não foi possível iniciar o Embedded Signup.");
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

  if (loading) return null;
  if (!status) return null;

  const meta = status.meta;
  const isMeta = status.activeProvider === "META_CLOUD_API";
  const metaConnected = meta?.connected ?? false;

  return (
    <div className="mb-5 rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-900">Provedor de WhatsApp</h2>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${isMeta ? "bg-blue-50 text-blue-700" : "bg-green-50 text-green-700"}`}>
          Ativo: {isMeta ? "Meta oficial" : "Evolution"}
        </span>
      </div>

      {msg && (
        <div className={`mt-3 rounded-lg px-3 py-2 text-xs ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>{msg.text}</div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {/* Evolution */}
        <div className={`rounded-xl border p-4 ${!isMeta ? "border-green-300 bg-green-50/40" : "border-gray-200"}`}>
          <p className="text-sm font-semibold text-gray-800">Atual — Evolution</p>
          <p className="mt-1 text-xs text-gray-500">Provedor atual do WhatsApp. Continua funcionando normalmente.</p>
          {isMeta && (
            <button type="button" disabled={!!busy} onClick={() => action("provider", { provider: "EVOLUTION" }, "Voltou para o Evolution.")}
              className="mt-3 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              Voltar para Evolution
            </button>
          )}
        </div>

        {/* Meta */}
        <div className={`rounded-xl border p-4 ${isMeta ? "border-blue-300 bg-blue-50/40" : "border-gray-200"}`}>
          <p className="text-sm font-semibold text-gray-800">Oficial Meta — WhatsApp Business Platform</p>
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
                <button type="button" disabled={!!busy} onClick={simulate}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                  {busy === "simulate" ? "Simulando…" : "Simular recebimento"}
                </button>
                {!isMeta && (
                  <button type="button" disabled={!!busy} onClick={() => action("provider", { provider: "META_CLOUD_API", confirm: true }, "Meta definida como provedor.")}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                    Usar Meta como provedor
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="mt-1 text-xs text-gray-500">Conta empresarial oficial. Conecte em poucos cliques.</p>
              <button type="button" disabled={busy === "connect"} onClick={connect}
                className="mt-3 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                {busy === "connect" ? "Conectando…" : "Conectar WhatsApp oficial da Meta"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Advanced (collapsed, masked) */}
      {status.featureEnabled && meta && (
        <div className="mt-3">
          <button type="button" onClick={() => setShowAdvanced((s) => !s)} className="text-[11px] font-medium text-gray-400 hover:text-gray-600">
            {showAdvanced ? "Ocultar avançado" : "Avançado"}
          </button>
          {showAdvanced && (
            <div className="mt-2 space-y-1 rounded-lg bg-gray-50 px-3 py-2 text-[10px] font-mono text-gray-500">
              <div>status: {meta.connectionStatus}</div>
              <div>número: {meta.displayPhoneNumber ?? "—"}</div>
              <div>phoneNumberId: {meta.phoneNumberId ?? "—"}</div>
              <div>wabaId: {meta.wabaId ?? "—"}</div>
              <div>businessId: {meta.businessId ?? "—"}</div>
              <div>token: {meta.tokenPreview ?? "—"}</div>
              <div>qualidade: {meta.qualityRating ?? "—"}</div>
              {meta.lastError && <div className="text-red-500">último erro: {meta.lastError}</div>}
              <div>webhook: /api/webhooks/meta/whatsapp</div>
              {diag?.env && (
                <div className="mt-1 border-t border-gray-200 pt-1">
                  <div className="mb-0.5 text-gray-400">configuração do servidor (Meta):</div>
                  <EnvRow label="META_WHATSAPP_ENABLED"    on={diag.env.featureEnabled} />
                  <EnvRow label="META_APP_ID"              on={diag.env.appId} />
                  <EnvRow label="META_APP_SECRET (assina webhook)" on={diag.env.appSecret} />
                  <EnvRow label="META_CONFIG_ID"           on={diag.env.configId} />
                  <EnvRow label="META_WEBHOOK_VERIFY_TOKEN" on={diag.env.webhookVerifyToken} />
                  <EnvRow label="META_TEST_PHONE"          on={diag.env.testPhone} />
                  <EnvRow label="NEXT_PUBLIC_META_APP_ID (build)"    on={diag.env.publicAppId} />
                  <EnvRow label="NEXT_PUBLIC_META_CONFIG_ID (build)" on={diag.env.publicConfigId} />
                  <div>graph: {diag.env.graphVersion}</div>
                  {typeof diag.templateRequiredFailures === "number" && (
                    <div>bloqueios por template (24h): {diag.templateRequiredFailures}</div>
                  )}
                  {!diag.env.signatureEnforced && (
                    <div className="text-amber-600">⚠ assinatura do webhook NÃO exigida (defina META_APP_SECRET)</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EnvRow({ label, on }: { label: string; on: boolean }) {
  return (
    <div className={on ? "text-green-600" : "text-gray-400"}>
      {on ? "✓" : "✗"} {label}
    </div>
  );
}

// ── FB SDK helpers ──────────────────────────────────────────────────────────────

function loadFbSdk(appId: string): Promise<void> {
  return new Promise((resolve) => {
    if (window.FB) { resolve(); return; }
    const s = document.createElement("script");
    s.src = "https://connect.facebook.net/en_US/sdk.js";
    s.async = true; s.defer = true;
    s.onload = () => { window.FB?.init({ appId, autoLogAppEvents: true, xfbml: false, version: "v21.0" }); resolve(); };
    s.onerror = () => resolve();
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
