"use client";

/**
 * Admin → Meta: the credentials of the ONE Foocci app inside Meta.
 *
 * Two rules shape this screen, both learned the hard way in this repo:
 *
 * 1. A badge is not evidence. The Instagram integration showed "Conectado / Ativo" for
 *    nine days with a dead token. So every field states WHERE its live value comes from
 *    (database, Railway, or missing), and "Testar conexão" reports Meta's own answer.
 *
 * 2. Blank means unchanged, never cleared. Secrets can only ever be shown masked, so a
 *    Save on a freshly loaded form must not wipe what the operator cannot see. Removing
 *    a value is a separate, explicit action.
 */

import { useCallback, useEffect, useState } from "react";

type CredentialSource = "db" | "env" | "missing";

interface MaskedCredentials {
  appId: string | null;
  appSecretPreview: string | null;
  configId: string | null;
  coexistenceConfigId: string | null;
  webhookVerifyTokenPreview: string | null;
  graphVersion: string | null;
  igAppId: string | null;
  igAppSecretPreview: string | null;
  igWebhookVerifyTokenPreview: string | null;
  systemUserTokenPreview: string | null;
  sources: Record<string, CredentialSource>;
  lastTestAt: string | null;
  lastTestOk: boolean | null;
  lastTestError: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

interface HealthResult {
  ok: boolean;
  error?: string;
  appId?: string;
  appName?: string;
  category?: string;
  link?: string;
  privacyPolicyUrl?: string;
  termsOfServiceUrl?: string;
  appDomains?: string[];
  warnings: string[];
}

interface FieldDef {
  key: string;
  label: string;
  hint?: string;
  secret: boolean;
  previewKey?: keyof MaskedCredentials;
  valueKey?: keyof MaskedCredentials;
  placeholder?: string;
}

const WHATSAPP_FIELDS: FieldDef[] = [
  { key: "appId", label: "ID do Aplicativo", hint: "Público — aparece nas URLs de login.", secret: false, valueKey: "appId" },
  { key: "appSecret", label: "Chave Secreta do Aplicativo", hint: "A chave mestra. Quem a tem faz qualquer coisa em nome da Foocci.", secret: true, previewKey: "appSecretPreview" },
  { key: "configId", label: "ID da configuração (Embedded Signup)", secret: false, valueKey: "configId" },
  { key: "coexistenceConfigId", label: "ID da configuração de coexistência", hint: "Para número que continua no celular. Em branco usa o ID acima.", secret: false, valueKey: "coexistenceConfigId" },
  { key: "webhookVerifyToken", label: "Token de verificação do webhook", secret: true, previewKey: "webhookVerifyTokenPreview" },
  { key: "graphVersion", label: "Versão da Graph API", hint: "Em branco usa v21.0.", secret: false, valueKey: "graphVersion", placeholder: "v21.0" },
];

const INSTAGRAM_FIELDS: FieldDef[] = [
  { key: "igAppId", label: "ID do Aplicativo (Instagram)", secret: false, valueKey: "igAppId" },
  { key: "igAppSecret", label: "Chave Secreta (Instagram)", secret: true, previewKey: "igAppSecretPreview" },
  { key: "igWebhookVerifyToken", label: "Token de verificação do webhook (Instagram)", secret: true, previewKey: "igWebhookVerifyTokenPreview" },
];

const ADVANCED_FIELDS: FieldDef[] = [
  {
    key: "systemUserToken",
    label: "Token de usuário do sistema",
    hint: "Opcional. Permite operar a Graph API sem pegar emprestado o token de um restaurante.",
    secret: true,
    previewKey: "systemUserTokenPreview",
  },
];

const SOURCE_LABEL: Record<CredentialSource, { text: string; className: string }> = {
  db:      { text: "salvo aqui",  className: "bg-emerald-900/50 text-emerald-300" },
  env:     { text: "via Railway", className: "bg-sky-900/50 text-sky-300" },
  missing: { text: "faltando",    className: "bg-red-900/50 text-red-300" },
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function MetaCredentialsClient() {
  const [data, setData] = useState<MaskedCredentials | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const [testing, setTesting] = useState(false);
  const [health, setHealth] = useState<HealthResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/meta/credentials");
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? `Falha ao carregar (HTTP ${res.status}).`);
      }
      setData(json.data as MaskedCredentials);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Falha ao carregar as credenciais.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleSave() {
    const filled = Object.entries(draft).filter(([, v]) => v.trim().length > 0);
    if (filled.length === 0) {
      setSaveMessage({ kind: "error", text: "Nenhum campo preenchido — não há o que salvar." });
      return;
    }

    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch("/api/admin/meta/credentials", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(filled)),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? `Falha ao salvar (HTTP ${res.status}).`);
      }
      setData(json.data as MaskedCredentials);
      setDraft({});
      setSaveMessage({ kind: "ok", text: `Salvo. ${filled.length} campo(s) atualizado(s).` });
    } catch (err) {
      setSaveMessage({ kind: "error", text: err instanceof Error ? err.message : "Falha ao salvar." });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setHealth(null);
    try {
      const res = await fetch("/api/admin/meta/credentials/test", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? `Falha no teste (HTTP ${res.status}).`);
      }
      setHealth(json.data as HealthResult);
      await load();
    } catch (err) {
      setHealth({ ok: false, error: err instanceof Error ? err.message : "Falha no teste.", warnings: [] });
    } finally {
      setTesting(false);
    }
  }

  function renderField(field: FieldDef) {
    const source = data?.sources?.[field.key] ?? "missing";
    const badge = SOURCE_LABEL[source];
    const current = field.secret
      ? (field.previewKey ? (data?.[field.previewKey] as string | null) : null)
      : (field.valueKey ? (data?.[field.valueKey] as string | null) : null);

    return (
      <div key={field.key} className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={`meta-${field.key}`} className="text-sm font-medium text-gray-200">
            {field.label}
          </label>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badge.className}`}>
            {badge.text}
          </span>
        </div>

        {field.hint ? <p className="text-xs text-gray-500">{field.hint}</p> : null}

        <input
          id={`meta-${field.key}`}
          type={field.secret ? "password" : "text"}
          autoComplete="off"
          value={draft[field.key] ?? ""}
          onChange={(e) => setDraft((d) => ({ ...d, [field.key]: e.target.value }))}
          placeholder={
            current
              ? `Atual: ${current} — deixe em branco para manter`
              : field.placeholder ?? "Não configurado"
          }
          className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-600 outline-none transition-colors focus:border-violet-500"
        />
      </div>
    );
  }

  /* ---------- carregando ---------- */
  if (loading) {
    return (
      <div className="p-6">
        <div className="h-7 w-64 animate-pulse rounded bg-gray-800" />
        <div className="mt-6 space-y-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-4 w-48 animate-pulse rounded bg-gray-800" />
              <div className="h-9 w-full animate-pulse rounded-lg bg-gray-800/60" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ---------- erro ---------- */
  if (loadError) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-red-900/60 bg-red-950/40 p-4">
          <p className="text-sm font-semibold text-red-300">Não consegui carregar as credenciais</p>
          <p className="mt-1 text-sm text-red-200/80">{loadError}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 rounded-lg bg-red-900/60 px-3 py-1.5 text-sm font-medium text-red-100 hover:bg-red-900"
          >
            Tentar de novo
          </button>
        </div>
      </div>
    );
  }

  const nothingConfigured =
    data && Object.values(data.sources ?? {}).every((s) => s === "missing");

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <header>
        <h1 className="text-xl font-semibold text-white">Aplicativo Meta</h1>
        <p className="mt-1 text-sm text-gray-400">
          Existe <strong className="text-gray-200">um único</strong> aplicativo da Foocci dentro
          da Meta, e ele serve WhatsApp <em>e</em> Instagram. O que quebra aqui derruba os dois
          canais ao mesmo tempo.
        </p>
      </header>

      {/* Aviso de custódia — a chave secreta é chave mestra */}
      <div className="mt-4 rounded-xl border border-amber-900/60 bg-amber-950/30 p-3">
        <p className="text-xs leading-relaxed text-amber-200/90">
          🔑 <strong>A Chave Secreta é chave mestra.</strong> Ela é guardada criptografada e{" "}
          <strong>nunca</strong> é devolvida por esta tela — só a prévia mascarada. Não cole essa
          chave em conversa, documento ou mensagem: esta casa já perdeu dois segredos assim.
        </p>
      </div>

      {/* Vazio — nada configurado em lugar nenhum */}
      {nothingConfigured ? (
        <div className="mt-4 rounded-xl border border-gray-800 bg-gray-900/60 p-4">
          <p className="text-sm font-medium text-gray-200">Nenhuma credencial configurada ainda</p>
          <p className="mt-1 text-sm text-gray-400">
            Pegue os valores em <span className="text-gray-300">Meta → Configurações do app → Básico</span>{" "}
            e cole abaixo. Enquanto estiver vazio, WhatsApp e Instagram não conseguem falar com a Meta.
          </p>
        </div>
      ) : null}

      {/* Estado do último teste */}
      {data?.lastTestAt ? (
        <div
          className={`mt-4 rounded-xl border p-3 text-xs ${
            data.lastTestOk
              ? "border-emerald-900/60 bg-emerald-950/30 text-emerald-200/90"
              : "border-red-900/60 bg-red-950/30 text-red-200/90"
          }`}
        >
          Último teste em <strong>{formatDate(data.lastTestAt)}</strong>:{" "}
          {data.lastTestOk ? "credenciais aceitas pela Meta." : `recusado — ${data.lastTestError ?? "erro não registrado"}`}
        </div>
      ) : null}

      {/* Formulário */}
      <section className="mt-6 space-y-5">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-500">
          WhatsApp e aplicativo
        </h2>
        {WHATSAPP_FIELDS.map(renderField)}
      </section>

      <section className="mt-8 space-y-5">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-500">Instagram</h2>
        {INSTAGRAM_FIELDS.map(renderField)}
      </section>

      <section className="mt-8 space-y-5">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-500">Avançado</h2>
        {ADVANCED_FIELDS.map(renderField)}
      </section>

      {/* Ações */}
      <div className="sticky bottom-0 mt-8 flex flex-col gap-3 border-t border-gray-800 bg-gray-950/95 py-4 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
        >
          {saving ? "Salvando…" : "Salvar credenciais"}
        </button>
        <button
          type="button"
          onClick={() => void handleTest()}
          disabled={testing}
          className="rounded-xl border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 transition-colors hover:bg-gray-800 disabled:opacity-50"
        >
          {testing ? "Testando…" : "Testar conexão com a Meta"}
        </button>

        {saveMessage ? (
          <span className={`text-sm ${saveMessage.kind === "ok" ? "text-emerald-400" : "text-red-400"}`}>
            {saveMessage.text}
          </span>
        ) : null}
      </div>

      {/* Resultado do teste */}
      {health ? (
        <section className="mt-2 mb-8 rounded-xl border border-gray-800 bg-gray-900/60 p-4">
          <h2 className="text-sm font-semibold text-white">Resultado do teste</h2>

          {health.ok ? (
            <>
              <p className="mt-1 text-sm text-emerald-400">A Meta aceitou as credenciais.</p>
              <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <div><dt className="text-gray-500">Nome do app</dt><dd className="text-gray-200">{health.appName ?? "—"}</dd></div>
                <div><dt className="text-gray-500">ID</dt><dd className="text-gray-200">{health.appId ?? "—"}</dd></div>
                <div><dt className="text-gray-500">Categoria</dt><dd className="text-gray-200">{health.category ?? "—"}</dd></div>
                <div><dt className="text-gray-500">Domínios</dt><dd className="text-gray-200">{health.appDomains?.length ? health.appDomains.join(", ") : "nenhum"}</dd></div>
                <div className="sm:col-span-2"><dt className="text-gray-500">Termos de Serviço</dt><dd className="break-all text-gray-200">{health.termsOfServiceUrl ?? "—"}</dd></div>
                <div className="sm:col-span-2"><dt className="text-gray-500">Política de Privacidade</dt><dd className="break-all text-gray-200">{health.privacyPolicyUrl ?? "—"}</dd></div>
              </dl>
            </>
          ) : (
            <p className="mt-1 text-sm text-red-400">{health.error ?? "Falhou, sem mensagem."}</p>
          )}

          {health.warnings.length > 0 ? (
            <div className="mt-4 rounded-lg border border-amber-900/60 bg-amber-950/30 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">
                Problemas que reprovam a revisão do app
              </p>
              <ul className="mt-2 space-y-1.5">
                {health.warnings.map((w) => (
                  <li key={w} className="text-sm leading-relaxed text-amber-200/90">• {w}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
