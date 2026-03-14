"use client";

/**
 * /dashboard/settings/whatsapp
 *
 * Evolution API configuration page — OWNER only.
 * Allows the restaurant owner to enter and update their Evolution API
 * credentials (instance name, base URL, API key, webhook secret).
 *
 * Credentials are stored AES-256-GCM encrypted in the DB.
 * This page never displays full secret values — only masked previews.
 *
 * Also shows current instance connection state via GET /api/evolution/status.
 */

import { useState, useEffect, FormEvent } from "react";

interface ConfigView {
  instanceName: string;
  baseUrl: string;
  apiKeyPreview: string;
  webhookSecretPreview: string;
  isActive: boolean;
  updatedAt: string;
}

interface InstanceStatus {
  state: "open" | "close" | "connecting";
  instance: string;
}

const STATE_LABELS: Record<string, string> = {
  open: "Conectado",
  close: "Desconectado",
  connecting: "Conectando…",
};

const STATE_COLORS: Record<string, string> = {
  open: "bg-green-100 text-green-700",
  close: "bg-red-100 text-red-700",
  connecting: "bg-yellow-100 text-yellow-800",
};

export default function WhatsAppSettingsPage() {
  const [config, setConfig] = useState<ConfigView | null>(null);
  const [status, setStatus] = useState<InstanceStatus | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form fields
  const [instanceName, setInstanceName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");

  useEffect(() => {
    fetchConfig();
  }, []);

  async function fetchConfig() {
    setLoadingConfig(true);
    try {
      const res = await fetch("/api/evolution/config");
      if (res.ok) {
        const json = await res.json();
        const data: ConfigView = json.data;
        setConfig(data);
        setInstanceName(data.instanceName);
        setBaseUrl(data.baseUrl);
        // Do not prefill secrets — user must re-enter to update
      } else if (res.status !== 404) {
        const json = await res.json();
        setErrorMsg(json.error ?? "Erro ao carregar configuração");
      }
      // 404 = not configured yet, form starts empty — that's expected
    } catch {
      setErrorMsg("Falha de rede");
    } finally {
      setLoadingConfig(false);
    }
  }

  async function fetchStatus() {
    setLoadingStatus(true);
    setStatus(null);
    try {
      const res = await fetch("/api/evolution/status");
      if (res.ok) {
        const json = await res.json();
        setStatus(json.data);
      } else {
        const json = await res.json();
        setErrorMsg(json.error ?? "Erro ao verificar status");
      }
    } catch {
      setErrorMsg("Falha de rede ao verificar status");
    } finally {
      setLoadingStatus(false);
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSuccessMsg(null);
    setErrorMsg(null);

    if (!apiKey.trim() || !webhookSecret.trim()) {
      setErrorMsg("Preencha a API Key e o Webhook Secret para salvar.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/evolution/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instanceName: instanceName.trim(),
          baseUrl: baseUrl.trim(),
          apiKey: apiKey.trim(),
          webhookSecret: webhookSecret.trim(),
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error ?? "Erro ao salvar configuração");
        return;
      }

      setConfig(json.data);
      setApiKey("");
      setWebhookSecret("");
      setSuccessMsg("Configuração salva com sucesso.");
    } catch {
      setErrorMsg("Falha de rede ao salvar");
    } finally {
      setSaving(false);
    }
  }

  // ─── render ──────────────────────────────────────────────────

  if (loadingConfig) {
    return (
      <div className="p-6 text-sm text-gray-400">Carregando configuração…</div>
    );
  }

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/webhooks/evolution`
      : "/api/webhooks/evolution";

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold text-gray-900">
        WhatsApp — Evolution API
      </h1>
      <p className="mb-6 text-sm text-gray-500">
        Configure a integração com sua instância Evolution API para receber e enviar mensagens WhatsApp.
        As credenciais são armazenadas criptografadas (AES-256-GCM).
      </p>

      {/* Current config summary */}
      {config && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-gray-700">Configuração atual</h2>
            <button
              onClick={fetchStatus}
              disabled={loadingStatus}
              className="rounded-lg border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              {loadingStatus ? "Verificando…" : "Verificar conexão"}
            </button>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-gray-500">Instância</dt>
            <dd className="font-mono text-gray-900">{config.instanceName}</dd>

            <dt className="text-gray-500">Base URL</dt>
            <dd className="truncate font-mono text-gray-900">{config.baseUrl}</dd>

            <dt className="text-gray-500">API Key</dt>
            <dd className="font-mono text-gray-400">{config.apiKeyPreview}</dd>

            <dt className="text-gray-500">Webhook Secret</dt>
            <dd className="font-mono text-gray-400">{config.webhookSecretPreview}</dd>

            <dt className="text-gray-500">Status</dt>
            <dd>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  config.isActive
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-700"
                }`}
              >
                {config.isActive ? "Ativo" : "Inativo"}
              </span>
            </dd>

            <dt className="text-gray-500">Atualizado em</dt>
            <dd className="text-gray-600">
              {new Date(config.updatedAt).toLocaleString("pt-BR")}
            </dd>
          </dl>

          {status && (
            <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3">
              <span className="text-sm text-gray-500">Estado da instância:</span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATE_COLORS[status.state] ?? "bg-gray-100 text-gray-600"}`}
              >
                {STATE_LABELS[status.state] ?? status.state}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Webhook URL info box */}
      <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
          URL do Webhook Evolution
        </p>
        <p className="break-all font-mono text-sm text-blue-900">{webhookUrl}</p>
        <p className="mt-1 text-xs text-blue-600">
          Configure esta URL na sua instância Evolution API como destino dos webhooks.
          Ative os eventos: <code className="font-semibold">messages.upsert</code>,{" "}
          <code className="font-semibold">messages.update</code>,{" "}
          <code className="font-semibold">connection.update</code>.
        </p>
      </div>

      {/* Feedback messages */}
      {successMsg && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {errorMsg}
          <button className="ml-2 underline" onClick={() => setErrorMsg(null)}>
            fechar
          </button>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSave} className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-gray-800">
          {config ? "Atualizar credenciais" : "Configurar integração"}
        </h2>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Nome da instância <span className="text-red-500">*</span>
            </label>
            <input
              value={instanceName}
              onChange={(e) => setInstanceName(e.target.value)}
              required
              placeholder="meu-restaurante"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <p className="mt-1 text-xs text-gray-400">
              Nome exato da instância configurada no seu servidor Evolution.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Base URL <span className="text-red-500">*</span>
            </label>
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              required
              type="url"
              placeholder="https://evo.example.com"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              API Key <span className="text-red-500">*</span>
            </label>
            <input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              required
              type="password"
              autoComplete="new-password"
              placeholder={config ? "Deixe em branco para manter a atual" : "Chave de API Evolution"}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            {config && (
              <p className="mt-1 text-xs text-gray-400">
                Atual: <span className="font-mono">{config.apiKeyPreview}</span>
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Webhook Secret <span className="text-red-500">*</span>
            </label>
            <input
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              required
              type="password"
              autoComplete="new-password"
              placeholder={config ? "Deixe em branco para manter o atual" : "Segredo para verificação do webhook"}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            {config && (
              <p className="mt-1 text-xs text-gray-400">
                Atual: <span className="font-mono">{config.webhookSecretPreview}</span>
              </p>
            )}
            <p className="mt-1 text-xs text-gray-400">
              Configure o mesmo valor como <code>WEBHOOK_SECRET</code> na sua instância Evolution.
              Usado para verificar a autenticidade dos webhooks recebidos.
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? "Salvando…" : "Salvar configuração"}
          </button>
        </div>
      </form>
    </div>
  );
}
