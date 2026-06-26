"use client";

/**
 * Meta / Instagram — integração do lojista (one-click connect v1).
 * Caminho principal: "Conectar com Facebook" → escolher Página → conectado.
 * Configuração manual vira "avançada" (accordion). Token nunca aparece;
 * nada é enviado de verdade; IA automática fica para o futuro.
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { INSTAGRAM_MODE_LABEL } from "@/services/instagram/labels";
import {
  buildInstagramSetupInstructions,
  instagramWebhookUrl,
  INSTAGRAM_WEBHOOK_FIELD,
  INSTAGRAM_REVIEW_SCOPES,
} from "@/services/instagram/instagramSetupInstructions";

type Mode = "DISABLED" | "RECEIVE_ONLY" | "REPLY_ONLY" | "FULL";
type Scope = "TEST_ACCOUNT_ONLY" | "RESTAURANT_WIDE";

interface ConfigView {
  configured: boolean;
  enabled: boolean;
  paused: boolean;
  mode: Mode;
  scope: Scope;
  instagramBusinessAccountId: string | null;
  facebookPageId: string | null;
  tokenConfigured: boolean;
  verifyTokenConfigured: boolean;
  connectedVia: string | null;
  connectedAt: string | null;
  facebookPageName: string | null;
  instagramUsername: string | null;
  metaConnectAvailable: boolean;
  missingEnv: string[];
  webhookUrl: string | null;
  lastWebhookAt: string | null;
  lastError: string | null;
  env?: InstagramEnv | null;
}

interface InstagramEnv {
  appId: boolean;
  appSecret: boolean;
  webhookVerifyToken: boolean;
  instagramAppSecret: boolean;
  baseUrl: boolean;
  encryptionKey: boolean;
  signatureEnforced: boolean;
  webhookReachable: boolean;
}

interface PageCandidate {
  pageId: string; pageName: string;
  instagramBusinessAccountId: string | null; instagramUsername: string | null; hasInstagram: boolean;
}
interface FriendlyTest { webhook: string; parser: string; centralChannel: string; realSend: string; runtimeTouched: boolean }

const MODE_LABEL = INSTAGRAM_MODE_LABEL;

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("pt-BR"); } catch { return iso; }
}
function randomVerifyToken(): string {
  const a = new Uint8Array(18); crypto.getRandomValues(a);
  return "foocci-" + Array.from(a).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function isConnected(v: ConfigView | null): boolean {
  return !!v && (v.connectedVia === "oauth" || v.tokenConfigured);
}

const META_FLASH: Record<string, { kind: "ok" | "err" | "info"; text: string }> = {
  blocked_env: { kind: "err", text: "Conexão automática indisponível no momento. Fale com o suporte Foocci." },
  blocked_base_url: { kind: "err", text: "Conexão automática indisponível no momento. Fale com o suporte Foocci." },
  error: { kind: "err", text: "Não foi possível concluir a conexão com a Meta. Tente novamente." },
  no_pages: { kind: "err", text: "Nenhuma Página do Facebook foi encontrada na sua conta." },
  forbidden: { kind: "err", text: "Apenas o proprietário ou gerente pode conectar." },
  select_page: { kind: "info", text: "Conexão encontrada. Escolha a Página do Facebook conectada ao Instagram do restaurante." },
};

export function InstagramIntegrationClient({ userRole }: { userRole: string }) {
  const canEdit = userRole === "OWNER" || userRole === "MANAGER";
  const [view, setView] = useState<ConfigView | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err" | "info"; text: string } | null>(null);
  const [flow, setFlow] = useState<"normal" | "select_page">("normal");
  const [candidates, setCandidates] = useState<PageCandidate[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  // Support mode — technical/platform tooling (webhook, manual setup, checklist,
  // internal diagnostics) is hidden from the lojista and only shown to Foocci
  // support via ?suporte=1. SSR-safe: starts false, set on the client after mount.
  const [supportMode, setSupportMode] = useState(false);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setSupportMode(p.get("suporte") === "1" || p.get("support") === "1");
  }, []);

  // manual advanced
  const [pageId, setPageId] = useState("");
  const [igId, setIgId] = useState("");
  const [mode, setMode] = useState<Mode>("RECEIVE_ONLY");
  const [scope, setScope] = useState<Scope>("TEST_ACCOUNT_ONLY");
  const [replaceToken, setReplaceToken] = useState(false);
  const [pageToken, setPageToken] = useState("");
  const [verifyToken, setVerifyToken] = useState("");

  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<FriendlyTest | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/integrations/instagram");
    const json = await res.json().catch(() => ({}));
    const v: ConfigView | null = json?.data ?? null;
    setView(v);
    if (v) { setPageId(v.facebookPageId ?? ""); setIgId(v.instagramBusinessAccountId ?? ""); setMode(v.mode); setScope(v.scope); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Read ?meta=... once on mount.
  useEffect(() => {
    const flash = new URLSearchParams(window.location.search).get("meta");
    if (!flash) return;
    if (META_FLASH[flash]) setMsg(META_FLASH[flash]);
    if (flash === "select_page") {
      setFlow("select_page");
      fetch("/api/integrations/meta/oauth/candidates").then((r) => r.json()).then((j) => setCandidates(j?.data?.candidates ?? [])).catch(() => {});
    }
  }, []);

  async function save(patch: Record<string, unknown>, okText = "Configuração salva com segurança.") {
    setSaving(true); setMsg(null);
    const res = await fetch("/api/integrations/instagram", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setMsg({ kind: "err", text: json?.error ?? "Não foi possível salvar." }); return false; }
    setMsg({ kind: "ok", text: okText }); setReplaceToken(false); setPageToken(""); await load();
    return true;
  }

  async function saveManual() {
    const patch: Record<string, unknown> = { facebookPageId: pageId || null, instagramBusinessAccountId: igId || null, mode, scope };
    if (replaceToken && pageToken.trim()) patch.pageAccessToken = pageToken.trim();
    if (verifyToken.trim()) patch.verifyToken = verifyToken.trim();
    await save(patch); setVerifyToken("");
  }

  async function selectPageId(pId: string) {
    setSaving(true); setMsg(null);
    const res = await fetch("/api/integrations/meta/oauth/select-page", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pageId: pId }) });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setMsg({ kind: "err", text: json?.error ?? "Não foi possível conectar esta Página." }); return; }
    setFlow("normal"); setMsg({ kind: "ok", text: "Conectado! As mensagens do Instagram Direct vão aparecer na Central." });
    window.history.replaceState({}, "", "/integracoes/instagram");
    await load();
  }

  async function disconnect() {
    if (!confirm("Desconectar o Instagram? O histórico de conversas é preservado.")) return;
    setSaving(true);
    await fetch("/api/integrations/meta/oauth/disconnect", { method: "POST" });
    setSaving(false); setMsg({ kind: "ok", text: "Integração desconectada. O histórico foi preservado." });
    await load();
  }

  async function runTest() {
    setTesting(true); setTest(null);
    const res = await fetch("/api/integrations/instagram/test", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setTesting(false); setTest(json?.data?.friendly ?? null);
  }

  function copy(text: string, key: string) {
    navigator.clipboard?.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(null), 1500); });
  }

  if (loading) return <div className="p-6 text-sm text-muted">Carregando…</div>;
  const connected = isConnected(view);
  const env = view?.env ?? null;

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 space-y-6 text-ink">
      <div>
        <Link href="/integracoes" className="text-sm text-muted hover:text-ink2">← Integrações</Link>
        <h1 className="mt-1 text-2xl font-bold">Instagram</h1>
        <p className="text-sm text-muted">Receba mensagens do Instagram Direct na Central de Atendimento.</p>
      </div>

      {msg && (
        <div className={`rounded-lg px-3 py-2 text-sm ${msg.kind === "ok" ? "bg-emerald-50 text-emerald-700" : msg.kind === "info" ? "bg-sky-50 text-sky-700" : "bg-red-50 text-red-700"}`}>{msg.text}</div>
      )}

      {/* ── Page selection (após retorno do OAuth) ── */}
      {flow === "select_page" && (
        <section className="rounded-xl border border-sky-200 bg-paper p-4">
          <h2 className="text-sm font-semibold">Escolha a Página do Facebook</h2>
          <p className="mt-1 text-sm text-muted">Conectada ao Instagram profissional do restaurante.</p>
          <div className="mt-3 space-y-2">
            {candidates.length === 0 && <p className="text-sm text-muted">Nenhuma Página encontrada.</p>}
            {candidates.map((c) => (
              <div key={c.pageId} className="flex items-center justify-between rounded-lg border border-line2 px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{c.pageName || "Página do Facebook"}</p>
                  <p className="text-xs text-muted">
                    {c.hasInstagram ? `Instagram conectado: ${c.instagramUsername ? "@" + c.instagramUsername : "sim"}` : "Esta Página não possui Instagram profissional conectado."}
                  </p>
                </div>
                <button disabled={!c.hasInstagram || saving} onClick={() => selectPageId(c.pageId)}
                  className="rounded-md bg-purple-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-40">
                  Conectar esta Página
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Não conectado: Conectar com Facebook (caminho principal) ── */}
      {flow === "normal" && !connected && (
        <section className="rounded-xl border border-line2 bg-paper p-6 text-center">
          <p className="text-sm text-ink2">Conecte sua conta da Meta para receber o Instagram Direct na Central.</p>
          <a href="/api/integrations/meta/oauth/start"
            className="mt-3 inline-block rounded-md bg-[#1877F2] px-5 py-2.5 font-semibold text-white hover:bg-[#166fe0]">
            Conectar com Facebook
          </a>
          <p className="mt-2 text-xs text-muted">Você será direcionado para a Meta para autorizar o Foocci.</p>
          {view && !view.metaConnectAvailable && (
            <div className="mx-auto mt-3 max-w-md rounded-md bg-amber-50 px-3 py-2 text-left text-xs text-amber-700">
              <p>Conexão automática indisponível no momento. Fale com o suporte Foocci.</p>
              {supportMode && (
                <ul className="mt-1 list-disc pl-4 font-mono">
                  {(view.missingEnv ?? []).map((m) => <li key={m}>{m}</li>)}
                </ul>
              )}
            </div>
          )}
        </section>
      )}

      {/* ── Conectado ── */}
      {flow === "normal" && connected && (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-emerald-800">Conectado</h2>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">{view?.paused ? "Pausado" : "Ativo"}</span>
          </div>
          <div className="mt-2 grid grid-cols-1 gap-y-1 text-sm sm:grid-cols-2">
            <p>Página: <b>{view?.facebookPageName ?? view?.facebookPageId ?? "—"}</b></p>
            <p>Instagram: <b>{view?.instagramUsername ? "@" + view.instagramUsername : (view?.instagramBusinessAccountId ?? "—")}</b></p>
            <p>Modo: <b>{MODE_LABEL[view?.mode ?? "RECEIVE_ONLY"]}</b></p>
            <p>Último Direct recebido: <b>{fmtDate(view?.lastWebhookAt ?? null)}</b></p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={runTest} disabled={testing} className="rounded-md bg-purple-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-50">{testing ? "Testando…" : "Rodar diagnóstico"}</button>
            {canEdit && view?.mode !== "REPLY_ONLY" && <button onClick={() => save({ mode: "REPLY_ONLY" }, "Resposta manual ativada.")} disabled={saving} className="rounded-md border border-line2 px-3 py-1.5 text-sm hover:bg-paper">Ativar resposta manual</button>}
            {canEdit && <button onClick={() => save({ paused: !view?.paused })} disabled={saving} className="rounded-md border border-line2 px-3 py-1.5 text-sm hover:bg-paper">{view?.paused ? "Despausar" : "Pausar"}</button>}
            {canEdit && <button onClick={disconnect} disabled={saving} className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-paper">Desconectar</button>}
            <Link href="/atendimento" className="rounded-md border border-line2 px-3 py-1.5 text-sm hover:bg-paper">Abrir Central de Atendimento</Link>
          </div>
        </section>
      )}

      {/* Diagnóstico amigável */}
      {test && (
        <section className="rounded-xl border border-line2 bg-paper p-4 text-sm">
          <h2 className="text-sm font-semibold">Diagnóstico</h2>
          <div className="mt-2 space-y-0.5">
            <p>Conta conectada: <b>{view?.facebookPageId ? "OK" : "pendente"}</b></p>
            <p>Instagram profissional: <b>{view?.instagramBusinessAccountId ? "OK" : "pendente"}</b></p>
            <p>Token salvo com segurança: <b>{view?.tokenConfigured ? "OK" : "pendente"}</b></p>
            <p>Webhook: <b>{test.webhook}</b></p>
            <p>Central: <b>{test.centralChannel}</b></p>
            <p>Envio real: <b>{test.realSend}</b></p>
            <p className="text-xs text-muted">Nenhuma mensagem foi enviada.{supportMode ? ` (runtimeTouched: ${String(test.runtimeTouched)})` : ""}</p>
          </div>
        </section>
      )}

      {/* Onde vou responder */}
      <section className="rounded-xl border border-sky-200 bg-sky-50 p-4">
        <h2 className="text-sm font-semibold text-sky-800">Onde vou responder?</h2>
        <p className="mt-1 text-sm text-sky-700">
          As mensagens do Instagram Direct aparecerão em <b>Atendimento</b>, com o selo <b>Instagram DM</b>.
          Você poderá responder pela mesma Central quando o modo <b>Responder manualmente</b> estiver ativo.
        </p>
        <Link href="/atendimento" className="mt-2 inline-block text-sm font-semibold text-sky-700 hover:text-sky-900">Abrir Central de Atendimento →</Link>
      </section>

      {/* ── Avançado · Uso interno Foocci — prontidão da plataforma (support gate) ── */}
      {supportMode && (
      <details className="rounded-xl border border-line2 bg-paper p-4">
        <summary className="cursor-pointer text-sm font-semibold text-ink2">Avançado · Uso interno Foocci</summary>
        <div className="mt-3 space-y-4 text-sm text-ink2">
          <button
            onClick={() => copy(buildInstagramSetupInstructions(), "setup")}
            className="rounded-md border border-line2 px-3 py-1.5 text-xs font-semibold text-ink2 hover:bg-[#FAFAF8]"
          >
            {copied === "setup" ? "Copiado!" : "Copiar instruções de setup Instagram"}
          </button>

          {/* A — Variáveis no servidor (✓/✗, nomes apenas — nunca valores) */}
          {env && (
            <div className="space-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">A · Variáveis no servidor</p>
              <IgCheck ok={env.appId}              label="META_APP_ID ou FACEBOOK_APP_ID" />
              <IgCheck ok={env.appSecret}          label="META_APP_SECRET ou FACEBOOK_APP_SECRET" />
              <IgCheck ok={env.webhookVerifyToken} label="INSTAGRAM_WEBHOOK_VERIFY_TOKEN" />
              <IgCheck ok={env.instagramAppSecret} label="INSTAGRAM_APP_SECRET (recomendado)" soft />
              <IgCheck ok={env.baseUrl}            label="FOOCCI_BASE_URL ou APP_URL" />
              <IgCheck ok={env.encryptionKey}      label="ENCRYPTION_KEY" />
            </div>
          )}

          {/* B — Webhook */}
          <div className="space-y-0.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">B · Webhook</p>
            <IgItem label={`URL: ${view?.webhookUrl ?? instagramWebhookUrl()}`} />
            <IgCheck ok={env?.webhookReachable ?? false} label="Endpoint público / alcançável" />
            <IgCheck ok={(env?.webhookVerifyToken ?? false) || (view?.verifyTokenConfigured ?? false)} label="Verify token configurado" />
            <IgCheck ok={env?.signatureEnforced ?? false} label="Assinatura exigida (INSTAGRAM_APP_SECRET)" soft />
            {env && !env.signatureEnforced && <div className="text-amber-600">⚠ Assinatura não exigida — defina INSTAGRAM_APP_SECRET.</div>}
            <IgItem label={`Campo/evento a assinar: ${INSTAGRAM_WEBHOOK_FIELD}`} />
          </div>

          {/* C — Permissões (App Review) */}
          <div className="space-y-0.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">C · Permissões (App Review)</p>
            {INSTAGRAM_REVIEW_SCOPES.map((s) => <IgItem key={s} label={s} />)}
            <div className="text-amber-600">⚠ instagram_manage_messages e pages_messaging exigem App Review. Antes da aprovação, use uma conta Tester.</div>
          </div>

          {/* D — Fluxo de teste seguro */}
          <div className="space-y-0.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">D · Fluxo de teste seguro</p>
            <IgItem label="1. Conectar com Facebook → escolher Página" />
            <IgItem label="2. Rodar diagnóstico (não envia nenhuma mensagem)" />
            <IgItem label="3. Enviar DM de uma conta Tester" />
            <IgItem label="4. Conferir na Central de Atendimento (selo Instagram DM)" />
            <IgItem label="5. Responder manualmente pela Central" />
          </div>
        </div>
      </details>
      )}

      {/* Webhook (support gate) */}
      {supportMode && (
      <section className="rounded-xl border border-line2 bg-paper p-4">
        <h2 className="text-sm font-semibold">Webhook</h2>
        <p className="mt-1 text-sm text-muted">Callback URL para o painel da Meta (configurada automaticamente quando você conecta).</p>
        {view?.webhookUrl ? (
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-md bg-[#F4F4F2] px-3 py-2 text-xs">{view.webhookUrl}</code>
            <button onClick={() => copy(view.webhookUrl ?? "", "wh")} className="rounded-md border border-line2 px-3 py-2 text-xs hover:bg-[#FAFAF8]">{copied === "wh" ? "Copiado!" : "Copiar"}</button>
          </div>
        ) : (
          <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Configure <code className="font-mono">FOOCCI_BASE_URL=https://foocci.com.br</code> no Railway para gerar a URL pública do webhook.
          </p>
        )}
      </section>
      )}

      {/* Configuração manual avançada (accordion, support gate) */}
      {supportMode && (
      <details className="rounded-xl border border-line2 bg-paper p-4">
        <summary className="cursor-pointer text-sm font-semibold text-ink2">Configuração manual avançada</summary>
        <div className="mt-3 space-y-3">
          <p className="text-xs text-muted">Use apenas se preferir configurar manualmente em vez de &ldquo;Conectar com Facebook&rdquo;.</p>
          <Field label="Facebook Page ID" value={pageId} onChange={setPageId} placeholder="ex.: 1029384756" disabled={!canEdit} />
          <Field label="Instagram Business Account ID" value={igId} onChange={setIgId} placeholder="ex.: 1789...456" disabled={!canEdit} />

          <div>
            <label className="block text-sm font-medium">Page Access Token</label>
            {view?.tokenConfigured && !replaceToken ? (
              <div className="mt-1 flex items-center gap-2">
                <span className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Token configurado ✓</span>
                {canEdit && <button onClick={() => setReplaceToken(true)} className="text-sm text-purple-600 hover:underline">Substituir token</button>}
              </div>
            ) : (
              <input type="password" value={pageToken} onChange={(e) => setPageToken(e.target.value)} disabled={!canEdit}
                placeholder="Cole o Page Access Token (não será exibido depois de salvo)" autoComplete="off"
                className="mt-1 w-full rounded-md border border-line2 px-3 py-2 text-sm" />
            )}
            <p className="mt-1 text-xs text-muted">Guardado de forma criptografada. O Foocci nunca exibe o token salvo.</p>
          </div>

          <div>
            <label className="block text-sm font-medium">Verify Token</label>
            <div className="mt-1 flex items-center gap-2">
              <input value={verifyToken} onChange={(e) => setVerifyToken(e.target.value)} disabled={!canEdit}
                placeholder={view?.verifyTokenConfigured ? "Já configurado — gere um novo para substituir" : "Gere e cole o mesmo valor na Meta"}
                className="flex-1 rounded-md border border-line2 px-3 py-2 text-sm" />
              {canEdit && <button onClick={() => setVerifyToken(randomVerifyToken())} className="rounded-md border border-line2 px-3 py-2 text-xs hover:bg-[#FAFAF8]">Gerar</button>}
              {verifyToken && <button onClick={() => copy(verifyToken, "vt")} className="rounded-md border border-line2 px-3 py-2 text-xs hover:bg-[#FAFAF8]">{copied === "vt" ? "Copiado!" : "Copiar"}</button>}
            </div>
            <p className="mt-1 text-xs text-amber-600">Copie este token agora. Por segurança, ele não será exibido novamente.</p>
          </div>

          <div>
            <label className="block text-sm font-medium">Modo de operação</label>
            <div className="mt-1 space-y-1">
              {(["DISABLED", "RECEIVE_ONLY", "REPLY_ONLY"] as Mode[]).map((m) => (
                <label key={m} className="flex items-center gap-2 text-sm"><input type="radio" name="mode" checked={mode === m} onChange={() => setMode(m)} disabled={!canEdit} />{MODE_LABEL[m]}</label>
              ))}
              <label className="flex items-center gap-2 text-sm text-muted"><input type="radio" disabled checked={false} readOnly />{MODE_LABEL.FULL}</label>
            </div>
            <p className="mt-1 text-xs text-muted">A IA automática no Instagram ainda não está ativada. Nesta fase, o Foocci apenas recebe mensagens e permite resposta manual pela Central.</p>
          </div>

          {canEdit && (
            <div className="flex justify-end">
              <button onClick={saveManual} disabled={saving} className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-ink disabled:opacity-50">{saving ? "Salvando…" : "Salvar configuração manual"}</button>
            </div>
          )}
        </div>
      </details>
      )}

      {/* Checklist da Meta (support gate) */}
      {supportMode && (
      <section className="rounded-xl border border-line2 bg-paper p-4">
        <h2 className="text-sm font-semibold">Checklist da Meta</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {[
            { label: "Instagram é conta profissional (Business/Criador)", done: !!view?.instagramUsername },
            { label: "Instagram conectado a uma Página do Facebook", done: !!view?.facebookPageId },
            { label: "Conta Meta conectada ao Foocci", done: connected },
            { label: "Page Access Token salvo com segurança", done: !!view?.tokenConfigured },
            { label: "Webhook configurado / mensagens chegando", done: !!view?.lastWebhookAt },
            { label: "Diagnóstico do Foocci aprovado", done: !!test && test.parser === "OK" },
            { label: "Modo inicial recomendado: Receber mensagens", done: view?.mode === "RECEIVE_ONLY" || view?.mode === "REPLY_ONLY" },
          ].map((c) => (
            <li key={c.label} className="flex items-start gap-2"><span className={c.done ? "text-emerald-500" : "text-muted"}>{c.done ? "✓" : "○"}</span><span className={c.done ? "text-ink2" : "text-muted"}>{c.label}</span></li>
          ))}
        </ul>
      </section>
      )}
    </div>
  );
}

function IgCheck({ ok, label, soft }: { ok: boolean; label: string; soft?: boolean }) {
  const okColor = soft ? "text-ink2" : "text-emerald-600";
  return (
    <div className={`text-xs ${ok ? okColor : soft ? "text-muted" : "text-red-500"}`}>
      {ok ? "✓" : soft ? "○" : "✗"} {label}
    </div>
  );
}

function IgItem({ label }: { label: string }) {
  return <div className="text-xs text-muted">• {label}</div>;
}

function Field({ label, value, onChange, placeholder, disabled }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; disabled?: boolean }) {
  return (
    <div>
      <label className="block text-sm font-medium">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} className="mt-1 w-full rounded-md border border-line2 px-3 py-2 text-sm" />
    </div>
  );
}
