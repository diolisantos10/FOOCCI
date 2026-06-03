"use client";

/**
 * Build OS → Configuração (Priority 1.4.1).
 *
 * Interactive admin panel: enable/disable Build OS and manage authorized
 * operators WITHOUT touching env vars / Railway. Talks only to the admin-only
 * /api/admin/build-os/* routes. Internal/admin only.
 */

import { useCallback, useEffect, useState } from "react";

interface EffectiveStatus {
  enabled: boolean;
  source: "database" | "env_fallback" | "hard_disabled" | "default_off";
  mode: "INTERNAL_ONLY" | "PRODUCT";
  hardDisabled: boolean;
  hasDbConfig: boolean;
  envEnabledFallback: boolean;
  allowEnvPhonesFallback: boolean;
  activeDbSenderCount: number;
  envPhoneFallbackActive: boolean;
  updatedAt: string | null;
}

interface Sender {
  id: string;
  name: string | null;
  rawPhone: string | null;
  phone: string;
  role: string;
  isActive: boolean;
  allowedProjectIds: string[];
  notes: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

const SOURCE_LABELS: Record<EffectiveStatus["source"], string> = {
  database: "Banco de dados (admin)",
  env_fallback: "Fallback de ambiente (env)",
  hard_disabled: "Desligado por emergência (env)",
  default_off: "Desligado (padrão)",
};

export function BuildOsConfigPanel() {
  const [status, setStatus] = useState<EffectiveStatus | null>(null);
  const [config, setConfig] = useState<{ allowEnvAuthorizedPhonesFallback: boolean } | null>(null);
  const [senders, setSenders] = useState<Sender[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [cfgRes, sendRes] = await Promise.all([
        fetch("/api/admin/build-os/config"),
        fetch("/api/admin/build-os/authorized-senders"),
      ]);
      if (cfgRes.ok) {
        const d = (await cfgRes.json()) as { status: EffectiveStatus; config: { allowEnvAuthorizedPhonesFallback: boolean } | null };
        setStatus(d.status);
        setConfig(d.config);
      }
      if (sendRes.ok) {
        const d = (await sendRes.json()) as { data: Sender[] };
        setSenders(d.data);
      }
    } catch {
      setError("Falha ao carregar configuração.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function patchConfig(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/build-os/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Falha ao salvar.");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function patchSender(id: string, body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/build-os/authorized-senders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Falha ao atualizar operador.");
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function removeSender(id: string) {
    if (!confirm("Remover este operador? (Para desativar sem remover, use o botão Desativar.)")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/build-os/authorized-senders/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Falha ao remover operador.");
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-sm text-gray-400">Carregando…</p>;

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
        Área <strong>interna / admin</strong>. A configuração normal acontece aqui — não é preciso
        editar variáveis no Railway. As variáveis de ambiente continuam apenas como{" "}
        <strong>bootstrap/emergência</strong>.
      </div>

      {/* Status card */}
      {status && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-900">Status do Build OS</h3>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-semibold ${
                    status.enabled ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${status.enabled ? "bg-green-500" : "bg-gray-400"}`} />
                  {status.enabled ? "Ativado" : "Desativado"}
                </span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  Origem: {SOURCE_LABELS[status.source]}
                </span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  Modo: {status.mode === "PRODUCT" ? "Produto" : "Interno"}
                </span>
              </div>
            </div>
            {!status.hardDisabled ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy || status.enabled}
                  onClick={() => patchConfig({ isEnabled: true })}
                  className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-40"
                >
                  Ativar
                </button>
                <button
                  type="button"
                  disabled={busy || !status.enabled}
                  onClick={() => patchConfig({ isEnabled: false })}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                >
                  Desativar
                </button>
              </div>
            ) : (
              <span className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                🔒 BUILDOS_HARD_DISABLED ativo (emergência)
              </span>
            )}
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <Meta label="Config no banco" value={status.hasDbConfig ? "Sim" : "Não (usando env)"} />
            <Meta label="env BUILDOS_ENABLED" value={status.envEnabledFallback ? "true" : "não/false"} />
            <Meta label="Operadores ativos (DB)" value={String(status.activeDbSenderCount)} />
            <Meta label="Fallback de telefones env" value={status.envPhoneFallbackActive ? "ativo" : "desativado"} />
            {status.updatedAt && (
              <Meta label="Atualizado" value={new Date(status.updatedAt).toLocaleString("pt-BR")} />
            )}
          </dl>

          <label className="mt-4 flex items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              disabled={busy}
              checked={config?.allowEnvAuthorizedPhonesFallback ?? true}
              onChange={(e) => patchConfig({ allowEnvAuthorizedPhonesFallback: e.target.checked })}
            />
            Permitir fallback dos telefones de ambiente (env) mesmo com operadores no banco
          </label>
          <p className="mt-2 text-xs text-gray-400">
            Precedência de ativação: BUILDOS_HARD_DISABLED → configuração do banco → BUILDOS_ENABLED.
          </p>
        </div>
      )}

      {/* Authorized operators */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-900">
            Operadores autorizados ({senders.length})
          </h3>
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            className="rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-600"
          >
            {showAdd ? "Fechar" : "+ Adicionar operador"}
          </button>
        </div>

        {showAdd && <AddSenderForm busy={busy} onDone={() => { setShowAdd(false); load(); }} onError={setError} />}

        {senders.length === 0 ? (
          <p className="text-sm text-gray-400">
            Nenhum operador no banco. Enquanto não houver, o fallback de telefones de ambiente (env) é usado.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-400">
                  <th className="px-3 py-2">Nome</th>
                  <th className="px-3 py-2">Telefone</th>
                  <th className="px-3 py-2">Normalizado</th>
                  <th className="px-3 py-2">Papel</th>
                  <th className="px-3 py-2">Ativo</th>
                  <th className="px-3 py-2">Último uso</th>
                  <th className="px-3 py-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {senders.map((s) => (
                  <tr key={s.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-3 py-2 text-gray-900">{s.name ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-500">{s.rawPhone ?? s.phone}</td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-400">{s.phone}</td>
                    <td className="px-3 py-2 text-gray-600">{s.role}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${s.isActive ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {s.isActive ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-400">
                      {s.lastUsedAt ? new Date(s.lastUsedAt).toLocaleString("pt-BR") : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => patchSender(s.id, { isActive: !s.isActive })}
                          className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                        >
                          {s.isActive ? "Desativar" : "Ativar"}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => removeSender(s.id)}
                          className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-40"
                        >
                          Remover
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Test instructions */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-900">Como testar</h3>
        <p className="mb-2 text-sm text-gray-600">
          Com o Build OS <strong>ativado</strong> e o seu número como operador ativo, envie no WhatsApp do
          restaurante (do seu celular autorizado):
        </p>
        <CopyableCommand text="/build Teste de comando interno do Build OS." />
        <ul className="mt-3 space-y-1 text-xs text-gray-500">
          <li>• Deve chegar uma confirmação no WhatsApp com o rascunho do prompt.</li>
          <li>• O comando aparece na aba <strong>Comandos</strong>.</li>
          <li>• Responda ENVIAR / CANCELAR / AJUSTAR: [correção] / STATUS para conduzir.</li>
          <li>• Não vira conversa de cliente e não aciona Waiter/Claude/GitHub/IA.</li>
        </ul>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="font-medium text-gray-800">{value}</dd>
    </div>
  );
}

function AddSenderForm({
  busy,
  onDone,
  onError,
}: {
  busy: boolean;
  onDone: () => void;
  onError: (e: string | null) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("operator");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    onError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/admin/build-os/authorized-senders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name || null, phone, role, notes: notes || null }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        onError(d.error ?? "Falha ao adicionar operador.");
        return;
      }
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mb-4 grid grid-cols-1 gap-3 rounded-lg border border-gray-100 bg-gray-50 p-4 sm:grid-cols-2">
      <Field label="Nome">
        <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Dioli" />
      </Field>
      <Field label="Telefone (com DDI/DDD)">
        <input className={INPUT} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+5511999999999" required />
      </Field>
      <Field label="Papel">
        <input className={INPUT} value={role} onChange={(e) => setRole(e.target.value)} placeholder="operator" />
      </Field>
      <Field label="Notas">
        <input className={INPUT} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="opcional" />
      </Field>
      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={busy || saving || !phone.trim()}
          className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-40"
        >
          {saving ? "Salvando…" : "Salvar operador"}
        </button>
        <span className="ml-3 text-xs text-gray-400">
          O telefone é normalizado automaticamente (variações do 9º dígito são reconhecidas).
        </span>
      </div>
    </form>
  );
}

const INPUT =
  "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      {children}
    </label>
  );
}

function CopyableCommand({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2">
      <code className="flex-1 text-xs text-gray-100">{text}</code>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
        className="shrink-0 rounded bg-gray-700 px-2 py-1 text-xs text-gray-100 hover:bg-gray-600"
      >
        {copied ? "Copiado ✓" : "Copiar"}
      </button>
    </div>
  );
}
