"use client";

/**
 * Meta / Instagram — integração do lojista (não é ferramenta de dev).
 * Conecta a conta Meta e traz o Instagram Direct para a Central de Atendimento.
 * Token nunca é exibido; nada é enviado de verdade; IA automática fica para o futuro.
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { INSTAGRAM_MODE_LABEL } from "@/services/instagram/labels";

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
  webhookUrl: string;
  lastWebhookAt: string | null;
  lastError: string | null;
  allowlistedExternalUserIds: string[];
}

interface FriendlyTest {
  webhook: string; parser: string; centralChannel: string; realSend: string; runtimeTouched: boolean;
}

const MODE_LABEL = INSTAGRAM_MODE_LABEL;

function statusLabel(v: ConfigView | null): { text: string; tone: string } {
  if (!v || !v.configured) return { text: "Não configurado", tone: "bg-gray-100 text-gray-600" };
  if (v.lastError) return { text: "Erro de conexão", tone: "bg-red-100 text-red-700" };
  if (v.paused) return { text: "Pausado", tone: "bg-amber-100 text-amber-700" };
  if (v.enabled && v.mode === "REPLY_ONLY") return { text: "Resposta manual ativa", tone: "bg-emerald-100 text-emerald-700" };
  if (v.enabled && v.mode === "RECEIVE_ONLY") return v.lastWebhookAt
    ? { text: "Recebendo mensagens", tone: "bg-emerald-100 text-emerald-700" }
    : { text: "Aguardando configuração da Meta", tone: "bg-sky-100 text-sky-700" };
  if (v.tokenConfigured || v.facebookPageId) return { text: "Aguardando configuração da Meta", tone: "bg-sky-100 text-sky-700" };
  return { text: "Não configurado", tone: "bg-gray-100 text-gray-600" };
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("pt-BR"); } catch { return iso; }
}

function randomVerifyToken(): string {
  const a = new Uint8Array(18);
  crypto.getRandomValues(a);
  return "foocci-" + Array.from(a).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function InstagramIntegrationClient({ userRole }: { userRole: string }) {
  const canEdit = userRole === "OWNER" || userRole === "MANAGER";
  const [view, setView] = useState<ConfigView | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // form fields
  const [pageId, setPageId] = useState("");
  const [igId, setIgId] = useState("");
  const [mode, setMode] = useState<Mode>("DISABLED");
  const [scope, setScope] = useState<Scope>("TEST_ACCOUNT_ONLY");
  const [replaceToken, setReplaceToken] = useState(false);
  const [pageToken, setPageToken] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<FriendlyTest | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/integrations/instagram");
    const json = await res.json().catch(() => ({}));
    const v: ConfigView | null = json?.data ?? null;
    setView(v);
    if (v) {
      setPageId(v.facebookPageId ?? "");
      setIgId(v.instagramBusinessAccountId ?? "");
      setMode(v.mode);
      setScope(v.scope);
    }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save(patch: Record<string, unknown>) {
    setSaving(true); setMsg(null);
    const res = await fetch("/api/integrations/instagram", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setMsg({ kind: "err", text: json?.error ?? "Não foi possível salvar." }); return false; }
    setMsg({ kind: "ok", text: "Configuração salva com segurança." });
    setReplaceToken(false); setPageToken("");
    await load();
    return true;
  }

  async function saveAll() {
    const patch: Record<string, unknown> = {
      facebookPageId: pageId || null,
      instagramBusinessAccountId: igId || null,
      mode, scope,
    };
    if (replaceToken && pageToken.trim()) patch.pageAccessToken = pageToken.trim();
    if (verifyToken.trim()) patch.verifyToken = verifyToken.trim();
    await save(patch);
    setVerifyToken("");
  }

  async function runTest() {
    setTesting(true); setTest(null);
    const res = await fetch("/api/integrations/instagram/test", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setTesting(false);
    setTest(json?.data?.friendly ?? null);
  }

  function copy(text: string, key: string) {
    navigator.clipboard?.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(null), 1500); });
  }

  if (loading) return <div className="p-6 text-sm text-gray-500">Carregando…</div>;

  const st = statusLabel(view);

  const checklist: { label: string; done: boolean }[] = [
    { label: "Instagram é conta profissional (Business/Criador)", done: false },
    { label: "Instagram conectado a uma Página do Facebook", done: !!view?.facebookPageId },
    { label: "Meta App criado", done: false },
    { label: "Instagram Messaging habilitado no app", done: false },
    { label: "Webhook configurado na Meta com a Callback URL", done: !!view?.lastWebhookAt },
    { label: "Verify token validado", done: !!view?.verifyTokenConfigured },
    { label: "Page Access Token salvo no Foocci", done: !!view?.tokenConfigured },
    { label: "Diagnóstico do Foocci aprovado", done: !!test && test.parser === "OK" },
    { label: "Modo inicial recomendado: Receber mensagens", done: view?.mode === "RECEIVE_ONLY" || view?.mode === "REPLY_ONLY" },
  ];

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 space-y-6 text-gray-800">
      <div>
        <Link href="/integracoes" className="text-sm text-gray-500 hover:text-gray-700">← Integrações</Link>
        <h1 className="mt-1 text-2xl font-bold">Meta / Instagram</h1>
        <p className="text-sm text-gray-500">Receba e responda mensagens do Instagram Direct pela Central de Atendimento.</p>
      </div>

      {msg && (
        <div className={`rounded-lg px-3 py-2 text-sm ${msg.kind === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{msg.text}</div>
      )}

      {/* 1. Status */}
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Status da integração</h2>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.tone}`}>{st.text}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <Info label="Modo atual" value={MODE_LABEL[view?.mode ?? "DISABLED"]} />
          <Info label="Canal pausado" value={view?.paused ? "Sim" : "Não"} />
          <Info label="Token configurado" value={view?.tokenConfigured ? "Sim" : "Não"} ok={view?.tokenConfigured} />
          <Info label="Última mensagem recebida" value={fmtDate(view?.lastWebhookAt ?? null)} />
          <Info label="Último erro" value={view?.lastError ? "Sim" : "Nenhum"} ok={!view?.lastError} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {canEdit && (
            <button onClick={() => save({ paused: !view?.paused })} disabled={saving}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50">
              {view?.paused ? "Despausar integração" : "Pausar integração"}
            </button>
          )}
          <button onClick={runTest} disabled={testing}
            className="rounded-md bg-purple-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-50">
            {testing ? "Testando…" : "Testar integração"}
          </button>
        </div>
        {test && (
          <div className="mt-3 rounded-lg bg-gray-50 p-3 text-sm">
            <p>Webhook: <b>{test.webhook}</b></p>
            <p>Leitura de mensagens: <b>{test.parser}</b></p>
            <p>Canal na Central: <b>{test.centralChannel}</b></p>
            <p>Envio real: <b>{test.realSend}</b></p>
            <p className="text-xs text-gray-500">Nenhuma mensagem foi enviada. (runtimeTouched: {String(test.runtimeTouched)})</p>
          </div>
        )}
      </section>

      {/* 8. Onde vou responder */}
      <section className="rounded-xl border border-sky-200 bg-sky-50 p-4">
        <h2 className="text-sm font-semibold text-sky-800">Onde vou responder?</h2>
        <p className="mt-1 text-sm text-sky-700">
          As mensagens do Instagram Direct aparecerão em <b>Atendimento</b>, com o selo <b>Instagram DM</b>.
          Você poderá responder pela mesma Central quando o modo <b>Responder manualmente</b> estiver ativo.
        </p>
        <Link href="/atendimento" className="mt-2 inline-block text-sm font-semibold text-sky-700 hover:text-sky-900">Abrir Central de Atendimento →</Link>
      </section>

      {/* 3. Webhook */}
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Webhook</h2>
        <p className="mt-1 text-sm text-gray-500">Copie esta URL e cole no painel da Meta como Callback URL do Webhook.</p>
        <div className="mt-2 flex items-center gap-2">
          <code className="flex-1 overflow-x-auto rounded-md bg-gray-100 px-3 py-2 text-xs">{view?.webhookUrl}</code>
          <button onClick={() => copy(view?.webhookUrl ?? "", "wh")} className="rounded-md border border-gray-300 px-3 py-2 text-xs hover:bg-gray-50">
            {copied === "wh" ? "Copiado!" : "Copiar"}
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-500">Eventos necessários na Meta: <b>messages</b> (e, se disponível, delivery/read).</p>
      </section>

      {/* 2. Dados da Meta */}
      <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <h2 className="text-sm font-semibold">Dados da Meta</h2>
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
              placeholder="Cole o Page Access Token (não será exibido depois de salvo)"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" autoComplete="off" />
          )}
          <p className="mt-1 text-xs text-gray-500">Guardado de forma criptografada. O Foocci nunca exibe o token salvo.</p>
        </div>

        <div>
          <label className="block text-sm font-medium">Verify Token</label>
          <div className="mt-1 flex items-center gap-2">
            <input value={verifyToken} onChange={(e) => setVerifyToken(e.target.value)} disabled={!canEdit}
              placeholder={view?.verifyTokenConfigured ? "Já configurado — gere um novo para substituir" : "Gere e cole o mesmo valor na Meta"}
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm" />
            {canEdit && <button onClick={() => setVerifyToken(randomVerifyToken())} className="rounded-md border border-gray-300 px-3 py-2 text-xs hover:bg-gray-50">Gerar</button>}
            {verifyToken && <button onClick={() => copy(verifyToken, "vt")} className="rounded-md border border-gray-300 px-3 py-2 text-xs hover:bg-gray-50">{copied === "vt" ? "Copiado!" : "Copiar"}</button>}
          </div>
          <p className="mt-1 text-xs text-gray-500">Use o mesmo valor aqui e no painel da Meta. Guardamos apenas uma versão protegida — não dá para recuperar o valor antigo.</p>
        </div>
      </section>

      {/* 4. Modo de operação */}
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Modo de operação</h2>
        <div className="mt-2 space-y-2">
          {(["DISABLED", "RECEIVE_ONLY", "REPLY_ONLY"] as Mode[]).map((m) => (
            <label key={m} className="flex items-center gap-2 text-sm">
              <input type="radio" name="mode" checked={mode === m} onChange={() => setMode(m)} disabled={!canEdit} />
              {MODE_LABEL[m]}
            </label>
          ))}
          <label className="flex items-center gap-2 text-sm text-gray-400">
            <input type="radio" name="mode" disabled checked={false} readOnly />
            {MODE_LABEL.FULL}
          </label>
        </div>
        <p className="mt-2 rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-500">
          A IA automática no Instagram ainda não está ativada. Nesta fase, o Foocci apenas recebe mensagens e permite resposta manual pela Central.
        </p>
      </section>

      {/* 5. Segurança / Scope */}
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Segurança</h2>
        <div className="mt-2 space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="scope" checked={scope === "TEST_ACCOUNT_ONLY"} onChange={() => setScope("TEST_ACCOUNT_ONLY")} disabled={!canEdit} />
            Conta de teste (somente números autorizados)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="scope" checked={scope === "RESTAURANT_WIDE"} onChange={() => setScope("RESTAURANT_WIDE")} disabled={!canEdit} />
            Restaurante inteiro
          </label>
        </div>
        {scope === "RESTAURANT_WIDE" && (
          <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
            ⚠ Use apenas depois de validar recebimento e resposta manual.
          </p>
        )}
      </section>

      {/* Save */}
      {canEdit && (
        <div className="flex justify-end">
          <button onClick={saveAll} disabled={saving}
            className="rounded-md bg-purple-600 px-5 py-2 font-semibold text-white hover:bg-purple-500 disabled:opacity-50">
            {saving ? "Salvando…" : "Salvar configuração"}
          </button>
        </div>
      )}

      {/* 7. Checklist Meta */}
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Checklist da Meta</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {checklist.map((c) => (
            <li key={c.label} className="flex items-start gap-2">
              <span className={c.done ? "text-emerald-500" : "text-gray-300"}>{c.done ? "✓" : "○"}</span>
              <span className={c.done ? "text-gray-700" : "text-gray-500"}>{c.label}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Detalhes técnicos (accordion) */}
      <details className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
        <summary className="cursor-pointer font-semibold text-gray-600">Detalhes técnicos</summary>
        <div className="mt-2 space-y-1 text-xs text-gray-500">
          <p>Canal interno: <code>INSTAGRAM_DIRECT</code> · Webhook: <code>/api/webhooks/instagram</code> (GET verify + POST eventos).</p>
          <p>Token criptografado (AES-256-GCM); verify token guardado como hash; assinatura <code>X-Hub-Signature-256</code> validada quando o app secret está configurado.</p>
          <p>Modos: DISABLED / RECEIVE_ONLY / REPLY_ONLY (FULL reservado para IA futura). Scope: TEST_ACCOUNT_ONLY / RESTAURANT_WIDE.</p>
          <p>O diagnóstico é hermético: <code>noRealInstagramSend=true</code>, <code>runtimeTouched=false</code>.</p>
        </div>
      </details>
    </div>
  );
}

function Info({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div>
      <span className="text-gray-500">{label}: </span>
      <span className={ok === undefined ? "text-gray-800" : ok ? "text-emerald-600" : "text-gray-800"}>{value}</span>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, disabled }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; disabled?: boolean }) {
  return (
    <div>
      <label className="block text-sm font-medium">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} disabled={disabled}
        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
    </div>
  );
}
