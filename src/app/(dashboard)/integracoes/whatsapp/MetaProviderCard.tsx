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
import { MetaTemplatesPanel } from "./MetaTemplatesPanel";

interface MetaPublic {
  connected: boolean;
  connectionStatus: string;
  displayPhoneNumber: string | null;
  wabaId: string | null;
  phoneNumberId: string | null;
  businessId: string | null;
  tokenPreview: string | null;
  tokenExpiresAt: string | null;
  tokenExpiringSoon: boolean;
  lastError: string | null;
  qualityRating: string | null;
  metaCrmEnabled: boolean;
  coexistence?: boolean;
}
interface StatusResp {
  featureEnabled: boolean;
  /** Sempre "META_CLOUD_API" desde 04/08/2026 — canal único. */
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
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  // Support-only manual connect (gate ?suporte=1). Lets the Foocci team paste
  // credentials obtained via Meta's "Integrar com API" path before the 1-click
  // Embedded Signup (partner verification) is live. Never shown to merchants.
  const [supportMode, setSupportMode] = useState(false);
  const [manual, setManual] = useState({ phoneNumberId: "", wabaId: "", accessToken: "", displayPhoneNumber: "" });
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setSupportMode(p.get("suporte") === "1" || p.get("support") === "1");
  }, []);

  const appId    = process.env.NEXT_PUBLIC_META_APP_ID;
  const configId = process.env.NEXT_PUBLIC_META_CONFIG_ID;
  // Coexistence config (Business App number → Cloud API, keeping it on the phone).
  // Falls back to the standard config when a dedicated one isn't set.
  const coexistenceConfigId = process.env.NEXT_PUBLIC_META_COEXISTENCE_CONFIG_ID || configId;

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

  // ── Coexistence: connect a number that stays on the WhatsApp Business App (phone) ──
  // Launches Embedded Signup with featureType=whatsapp_business_app_onboarding. The
  // merchant scans a QR in the Business App; the number is added to the Cloud API
  // WITHOUT being registered/evicted from the phone. Finalizes via /connect with
  // coexistence:true (skips /register).
  async function connectCoexistence() {
    if (!appId || !coexistenceConfigId) {
      flash(false, "Precisa de autorização da Foocci para ativar. Fale com o suporte Foocci.");
      return;
    }
    setBusy("coexistence");
    try {
      let assets: { phoneNumberId?: string; wabaId?: string } = {};
      const listener = (ev: MessageEvent) => {
        if (typeof ev.data !== "string") return;
        try {
          const d = JSON.parse(ev.data);
          // Coexistence emits the same WA_EMBEDDED_SIGNUP envelope with the linked assets.
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
      const code = await fbLogin(coexistenceConfigId, "whatsapp_business_app_onboarding");
      window.removeEventListener("message", listener);

      if (!code) { flash(false, "Conexão cancelada."); return; }
      const res = await fetch("/api/integracoes/whatsapp/meta/connect", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, ...assets, coexistence: true }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.data?.connected) {
        flash(true, "Número conectado em modo Coexistência — segue no celular e no bot ao mesmo tempo.");
        load(); loadDiag();
      } else {
        flash(false, j?.data?.error ?? j?.error ?? "Não foi possível concluir a coexistência. Confirme que o número está no WhatsApp Business e tente de novo.");
      }
    } catch {
      flash(false, "Não foi possível iniciar a conexão. Tente novamente.");
    } finally { setBusy(null); }
  }

  // Support-only: connect by pasting credentials from Meta's "Integrar com API"
  // path (phone number id, WABA id, permanent/system token). Hits the same
  // /connect endpoint the Embedded Signup uses — token never leaves the server.
  async function manualConnect() {
    const phoneNumberId = manual.phoneNumberId.trim();
    const wabaId        = manual.wabaId.trim();
    const accessToken   = manual.accessToken.trim();
    if (!phoneNumberId || !wabaId || !accessToken) {
      flash(false, "Preencha número (phone number id), conta (WABA id) e token.");
      return;
    }
    setBusy("manual");
    try {
      const res = await fetch("/api/integracoes/whatsapp/meta/connect", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumberId, wabaId, accessToken,
          displayPhoneNumber: manual.displayPhoneNumber.trim() || undefined,
        }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.data?.connected) {
        const warning = !j.data.healthCheckPassed ? " A verificação da API será concluída em instantes." : "";
        flash(true, `WhatsApp oficial da Meta conectado.${warning}`);
        setManual({ phoneNumberId: "", wabaId: "", accessToken: "", displayPhoneNumber: "" });
        load(); loadDiag();
      } else {
        flash(false, j?.data?.error ?? j?.error ?? "Não foi possível conectar. Confira os 3 valores e tente de novo.");
      }
    } catch {
      flash(false, "Sem conexão. Tente novamente.");
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

  // Remove the Meta connection entirely so the owner can re-run Embedded Signup and
  // pick the correct number (e.g. Meta's +1 test number was connected by mistake).
  async function disconnectMeta() {
    setBusy("disconnect");
    try {
      const res = await fetch("/api/integracoes/whatsapp/meta/disconnect", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
      });
      const j = await res.json().catch(() => null);
      if (res.ok) {
        flash(true, "WhatsApp da Meta desconectado. Toque em “Conectar” para escolher o número certo.");
        setConfirmDisconnect(false);
        load(); loadDiag();
      } else flash(false, j?.error ?? "Falha ao desconectar.");
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
  const metaConnected = meta?.connected ?? false;
  const env = diag?.env;

  return (
    <div className="mb-5 rounded-2xl border border-line2 bg-paper p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-ink">Conexão de WhatsApp</h2>
        {/* Canal único: não há mais "qual provedor está em uso" para decidir. */}
        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
          Em uso: WhatsApp oficial da Meta
        </span>
      </div>

      {msg && (
        <div className={`mt-3 rounded-lg px-3 py-2 text-xs ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>{msg.text}</div>
      )}

      {/* Uma coluna só: com um provedor não há mais dois cards lado a lado. */}
      <div className="mt-4 grid gap-3">
        {/* O card "WhatsApp atual" (Evolution) vivia aqui, ao lado do card da Meta,
            com "Voltar para a conexão anterior" e "Desconectar e liberar número".
            Saiu em 04/08/2026: com um provedor só, um botão de "voltar" deixaria o
            restaurante MUDO — nenhum canal de saída, sem erro visível. E não há mais
            número para "liberar": ele já está registrado na Meta. */}

        {/* Meta */}
        <div className="rounded-xl border border-blue-300 bg-blue-50/40 p-4">
          <p className="text-sm font-semibold text-ink">WhatsApp oficial da Meta</p>
          {!status.featureEnabled ? (
            <p className="mt-1 text-xs text-muted">Em breve — disponível quando ativado pela Foocci.</p>
          ) : metaConnected ? (
            <>
              <p className="mt-1 text-xs text-green-700">✓ Conectado{meta?.displayPhoneNumber ? ` · ${meta.displayPhoneNumber}` : ""}</p>
              {meta?.coexistence && (
                <span className="mt-1 inline-block rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                  Coexistência · número segue no celular
                </span>
              )}
              {meta?.tokenExpiringSoon && (
                <div className="mt-2 rounded-md bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">
                  ⚠ Autorização expira em breve{meta.tokenExpiresAt ? ` (${new Date(meta.tokenExpiresAt).toLocaleDateString("pt-BR")})` : ""}. Reconecte o WhatsApp antes dessa data para não perder o envio de mensagens.
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" disabled={!!busy} onClick={() => action("test", {}, "Mensagem de teste enviada (número interno).")}
                  className="rounded-lg border border-line2 px-3 py-1.5 text-xs font-medium text-ink2 hover:bg-[#FAFAF8] disabled:opacity-50">
                  Testar conexão
                </button>
                <button type="button" disabled={!!busy} onClick={() => action("repair-inbound", {}, "Recebimento reativado. Mande uma mensagem no WhatsApp do restaurante — a IA deve responder.")}
                  className="rounded-lg border border-line2 px-3 py-1.5 text-xs font-medium text-ink2 hover:bg-[#FAFAF8] disabled:opacity-50">
                  {busy === "repair-inbound" ? "Reparando…" : "Reparar recebimento"}
                </button>
              </div>
              {/* CRM via Meta toggle */}
              <div className="mt-3 flex items-center justify-between rounded-lg border border-line2 bg-[#FAFAF8] px-3 py-2.5">
                <div>
                  <p className="text-xs font-semibold text-ink">Campanhas CRM via Meta</p>
                  <p className="text-[11px] text-muted">Enviar mensagens de CRM pelo WhatsApp oficial da Meta em vez da conexão atual.</p>
                </div>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => action(
                    "crm-toggle",
                    { enabled: !meta?.metaCrmEnabled },
                    meta?.metaCrmEnabled ? "CRM voltou para a conexão atual." : "CRM agora usa o WhatsApp oficial da Meta."
                  )}
                  className={`ml-3 flex-shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
                    meta?.metaCrmEnabled
                      ? "bg-blue-600 text-white hover:bg-blue-700"
                      : "border border-line2 bg-paper text-ink2 hover:bg-[#F4F4F2]"
                  }`}
                >
                  {meta?.metaCrmEnabled ? "Ativado" : "Ativar"}
                </button>
              </div>

              {/* Message templates — required for CRM marketing via Meta. */}
              <MetaTemplatesPanel />

              {/* Reconfigure / disconnect — lets the owner fix a wrong or test number
                  (Meta auto-provisions a +1 test number for new apps). "Reconfigurar"
                  re-runs the Meta login so a different number can be picked; the new
                  choice overwrites the old one. "Desconectar" removes the connection. */}
              <div className="mt-3 rounded-lg border border-line2 bg-[#FAFAF8] px-3 py-2.5">
                <p className="text-[11px] text-muted">
                  Número errado? Se aparecer um número de teste (ex.: começando com +1), reconfigure
                  para fazer login na Meta de novo e escolher o número do seu restaurante.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button type="button" disabled={busy === "connect"} onClick={connect}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                    {busy === "connect" ? "Abrindo Meta…" : "Reconfigurar / trocar número"}
                  </button>
                  {!confirmDisconnect ? (
                    <button type="button" disabled={!!busy} onClick={() => setConfirmDisconnect(true)}
                      className="rounded-lg border border-line2 px-3 py-1.5 text-xs font-medium text-ink2 hover:bg-paper disabled:opacity-50">
                      Desconectar
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      <button type="button" disabled={busy === "disconnect"} onClick={disconnectMeta}
                        className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                        {busy === "disconnect" ? "Desconectando…" : "Confirmar desconexão"}
                      </button>
                      <button type="button" disabled={!!busy} onClick={() => setConfirmDisconnect(false)}
                        className="rounded-lg border border-line2 px-3 py-1.5 text-xs font-medium text-ink2 hover:bg-paper disabled:opacity-50">
                        Cancelar
                      </button>
                    </span>
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="mt-1 text-xs text-muted">Faça login com a Meta e escolha sua empresa e número. Sem códigos para digitar.</p>
              <button type="button" disabled={busy === "connect"} onClick={connect}
                className="mt-3 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                {busy === "connect" ? "Conectando…" : "Conectar WhatsApp oficial da Meta"}
              </button>

              {/* Coexistence — keep the number on the phone AND connect the bot. */}
              <div className="mt-4 rounded-lg border border-line2 bg-[#FAFAF8] p-3">
                <p className="text-[11px] font-semibold text-ink2">Manter o número no celular (Coexistência)</p>
                <p className="mt-0.5 text-[10px] text-muted">
                  Use quando o restaurante quer continuar respondendo pelo WhatsApp no aparelho e, ao mesmo
                  tempo, deixar o bot/CRM atender no mesmo número. O histórico dos últimos 6 meses é sincronizado.
                </p>
                <ul className="mt-2 space-y-0.5 text-[10px] text-muted">
                  <li>• O número precisa já estar ativo no <strong>WhatsApp Business</strong> (app verde) há pelo menos 7 dias.</li>
                  <li>• App atualizado (v2.24.17+) e câmera para ler o QR Code.</li>
                  <li>• Ao clicar, escolha “conectar sua conta do WhatsApp Business” e leia o QR no aparelho.</li>
                </ul>
                <button type="button" disabled={busy === "coexistence"} onClick={connectCoexistence}
                  className="mt-2 rounded-lg border border-green-600 bg-white px-3 py-1.5 text-[11px] font-semibold text-green-700 hover:bg-green-50 disabled:opacity-50">
                  {busy === "coexistence" ? "Abrindo Meta…" : "Conectar número que está no celular"}
                </button>
              </div>

              {/* Support-only manual connect (Integrar com API path). Gate ?suporte=1. */}
              {supportMode && (
                <div className="mt-4 rounded-lg border border-dashed border-amber-300 bg-amber-50/50 p-3">
                  <p className="text-[11px] font-semibold text-amber-800">Conexão manual · uso interno Foocci</p>
                  <p className="mt-0.5 text-[10px] text-amber-700">
                    Cole os 3 valores do painel da Meta (WhatsApp → Configuração da API). O token vai criptografado pro servidor.
                  </p>
                  <div className="mt-2 grid gap-2">
                    <input value={manual.phoneNumberId} onChange={(e) => setManual((m) => ({ ...m, phoneNumberId: e.target.value }))}
                      placeholder="Identificador do número de telefone (phone number id)"
                      className="w-full rounded-md border border-line2 px-2 py-1.5 text-[11px]" />
                    <input value={manual.wabaId} onChange={(e) => setManual((m) => ({ ...m, wabaId: e.target.value }))}
                      placeholder="Identificador da conta do WhatsApp Business (WABA id)"
                      className="w-full rounded-md border border-line2 px-2 py-1.5 text-[11px]" />
                    <input value={manual.displayPhoneNumber} onChange={(e) => setManual((m) => ({ ...m, displayPhoneNumber: e.target.value }))}
                      placeholder="Número exibido, ex: +55 11 99999-9999 (opcional)"
                      className="w-full rounded-md border border-line2 px-2 py-1.5 text-[11px]" />
                    <textarea value={manual.accessToken} onChange={(e) => setManual((m) => ({ ...m, accessToken: e.target.value }))}
                      placeholder="Token de acesso (permanente / system user)" rows={2}
                      className="w-full rounded-md border border-line2 px-2 py-1.5 font-mono text-[10px]" />
                    <button type="button" disabled={busy === "manual"} onClick={manualConnect}
                      className="rounded-lg bg-amber-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
                      {busy === "manual" ? "Conectando…" : "Conectar com estes dados"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Advanced — platform setup checklist (OWNER/MANAGER only; no secrets). */}
      {diag && (
        <div className="mt-3">
          <button type="button" onClick={() => setShowAdvanced((s) => !s)} className="text-[11px] font-medium text-muted hover:text-ink2">
            {showAdvanced ? "Ocultar avançado" : "Avançado · configuração da plataforma"}
          </button>
          {showAdvanced && (
            <div className="mt-2 space-y-3 rounded-lg bg-[#FAFAF8] px-3 py-3 text-[11px] text-ink2">
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={copyInstructions}
                  className="rounded-lg border border-line2 bg-paper px-3 py-1.5 text-[11px] font-semibold text-ink2 hover:bg-[#FAFAF8]">
                  {copied ? "Copiado ✓" : "Copiar instruções para configurar Meta"}
                </button>
                {metaConnected && (
                  <button type="button" disabled={!!busy} onClick={simulate}
                    className="rounded-lg border border-line2 bg-paper px-3 py-1.5 text-[11px] font-medium text-ink2 hover:bg-[#FAFAF8] disabled:opacity-50">
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
                  <div className="text-muted">Versão da Graph API: {env.graphVersion}</div>
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
                  <div className="space-y-0.5 font-mono text-[10px] text-muted">
                    <div>status: {meta.connectionStatus}</div>
                    <div>número: {meta.displayPhoneNumber ?? "—"}</div>
                    <div>phoneNumberId: {maskId(meta.phoneNumberId)}</div>
                    <div>wabaId: {maskId(meta.wabaId)}</div>
                    <div>token: {meta.tokenPreview ?? "—"}</div>
                    <div>token expira: {meta.tokenExpiresAt ? new Date(meta.tokenExpiresAt).toLocaleDateString("pt-BR") : "nunca"}</div>
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
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{title}</p>
      {children}
    </div>
  );
}

function Check({ ok, label, soft }: { ok: boolean; label: string; soft?: boolean }) {
  const okColor = soft ? "text-ink2" : "text-green-600";
  return (
    <div className={ok ? okColor : (soft ? "text-muted" : "text-red-500")}>
      {ok ? "✓" : (soft ? "○" : "✗")} {label}
    </div>
  );
}

function SetupItem({ label }: { label: string }) {
  return <div className="text-muted">• {label}</div>;
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

function fbLogin(configId: string, featureType?: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (!window.FB) { resolve(null); return; }
    const extras: Record<string, unknown> = { setup: {} };
    // Coexistence: launches the "connect your existing WhatsApp Business App" flow
    // (QR scan in the app) instead of the standard WABA selection.
    if (featureType) extras.featureType = featureType;
    window.FB.login(
      (resp: unknown) => {
        const code = (resp as { authResponse?: { code?: string } })?.authResponse?.code ?? null;
        resolve(code);
      },
      { config_id: configId, response_type: "code", override_default_response_type: true, extras },
    );
  });
}
