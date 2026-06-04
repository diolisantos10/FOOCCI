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
  whatsappChannel: {
    configured: boolean;
    instanceName: string | null;
    enabled: boolean;
    legacyFallbackEnabled: boolean;
  };
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

      {/* Bootstrap / repair card */}
      <BootstrapCard onApplied={load} onError={setError} />

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

      {/* Build OS WhatsApp Master/Admin channel */}
      {status && (
        <MasterChannelCard
          channel={status.whatsappChannel}
          busy={busy}
          onSave={(body) => patchConfig(body)}
        />
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
        <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
          A configuração também pode ser inicializada por <strong>script interno seguro</strong> para
          ambientes de desenvolvimento/admin — sem Railway/UI. Ex.:{" "}
          <code className="rounded bg-gray-200 px-1">npm run buildos:bootstrap</code>,{" "}
          <code className="rounded bg-gray-200 px-1">npm run buildos:verify</code> (ver{" "}
          <code>docs/BUILDOS_BOOTSTRAP.md</code>).
        </p>
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

// ── Bootstrap / repair card ─────────────────────────────────────────────────────

interface BootstrapPlan {
  normalizedPhone: string;
  rawPhone: string;
  phoneVariants: string[];
  name: string;
  role: string;
  actions: string[];
}
interface BootstrapResult {
  dryRun: boolean;
  plan: BootstrapPlan;
  applied: boolean;
  configEnabled?: boolean;
  projectSeed?: { created: number; updated: number };
  senderAction?: "created" | "updated";
}

function BootstrapCard({
  onApplied,
  onError,
}: {
  onApplied: () => void;
  onError: (e: string | null) => void;
}) {
  const [name, setName] = useState("Diego");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("OWNER");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<BootstrapResult | null>(null);
  const [applied, setApplied] = useState<BootstrapResult | null>(null);

  async function call(dryRun: boolean): Promise<BootstrapResult | null> {
    onError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/build-os/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name || undefined, phone, role: role || undefined, dryRun }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        onError(d.error ?? "Falha no bootstrap.");
        return null;
      }
      return d.result as BootstrapResult;
    } finally {
      setBusy(false);
    }
  }

  async function doPreview() {
    setApplied(null);
    const r = await call(true);
    if (r) setPreview(r);
  }
  async function doApply() {
    const r = await call(false);
    if (r) {
      setApplied(r);
      setPreview(null);
      onApplied();
    }
  }

  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-5">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-900">
        Inicializar / Reparar Build OS
      </h3>
      <p className="mt-1 text-sm text-gray-600">
        Use para ativar o Build OS e cadastrar um operador autorizado sem acessar Railway ou
        credenciais. Roda no ambiente do app (banco já configurado). Idempotente — não apaga dados.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Nome">
          <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} placeholder="Diego" />
        </Field>
        <Field label="Telefone (com DDI/DDD)">
          <input className={INPUT} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+5511999999999" />
        </Field>
        <Field label="Função/cargo">
          <input className={INPUT} value={role} onChange={(e) => setRole(e.target.value)} placeholder="OWNER" />
        </Field>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !phone.trim()}
          onClick={doPreview}
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        >
          Pré-visualizar
        </button>
        <button
          type="button"
          disabled={busy || !phone.trim()}
          onClick={doApply}
          className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-40"
        >
          Aplicar bootstrap
        </button>
      </div>

      {/* Dry-run preview */}
      {preview && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 text-sm">
          <p className="mb-2 font-semibold text-gray-800">Pré-visualização (nenhum dado gravado)</p>
          <dl className="grid grid-cols-1 gap-1.5 text-xs sm:grid-cols-2">
            <Meta label="Telefone original" value={preview.plan.rawPhone} />
            <Meta label="Telefone normalizado" value={preview.plan.normalizedPhone} />
            <Meta label="Variantes reconhecidas" value={preview.plan.phoneVariants.join("  |  ")} />
            <Meta label="Operador" value={`${preview.plan.name} (${preview.plan.role})`} />
          </dl>
          <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Ações planejadas</p>
          <ul className="mt-1 space-y-1 text-xs text-gray-700">
            {preview.plan.actions.map((a, i) => (
              <li key={i} className="flex gap-2"><span className="text-gray-400">•</span><span>{a}</span></li>
            ))}
          </ul>
        </div>
      )}

      {/* Apply result */}
      {applied && (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4 text-sm">
          <p className="mb-2 font-semibold text-green-800">✅ Bootstrap aplicado com sucesso</p>
          <ul className="space-y-1 text-xs text-gray-700">
            <li>• BuildOSConfig ativado ({String(applied.configEnabled)}).</li>
            <li>• Foocci default/ativo confirmado (projetos criados {applied.projectSeed?.created ?? 0}, atualizados {applied.projectSeed?.updated ?? 0}).</li>
            <li>• Operador {applied.plan.name} ({applied.plan.normalizedPhone}) {applied.senderAction === "created" ? "criado" : "atualizado/reativado"}.</li>
            <li>• Variantes reconhecidas: {applied.plan.phoneVariants.join("  |  ")}.</li>
          </ul>
          <p className="mt-3 mb-1 text-xs text-gray-600">Agora teste no WhatsApp (do celular autorizado):</p>
          <CopyableCommand text="/build Teste de comando interno do Build OS." />
        </div>
      )}
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

interface MasterStatus {
  configured: boolean;
  instanceName: string | null;
  enabled: boolean;
  existsInEvolution: boolean;
  expectedWebhookUrl: string;
  operatorMasked: string | null;
  health: {
    connectionState: string | null;
    connectedNumberMasked: string | null;
    webhookUrl: string | null;
    webhookEnabled: boolean | null;
    hasMessagesUpsert: boolean;
    urlMatchesExpected: boolean;
    lastEventAt: string | null;
    lastEventAgeMinutes: number | null;
    issues: string[];
  } | null;
  numbersInvolved: { authorizedOperatorMasked: string | null } | null;
  readiness: {
    instanceNameSaved: boolean;
    instanceExists: boolean;
    connectionOpen: boolean;
    webhookOk: boolean;
    messagesUpsert: boolean;
    operatorActive: boolean;
    lastEventReceived: boolean;
    allReady: boolean;
  };
  availableInstances: Array<{ instanceName: string; restaurant: string | null }>;
}

function ChecklistRow({ ok, label, hint }: { ok: boolean; label: string; hint?: string }) {
  return (
    <li className="flex items-start gap-2 text-xs">
      <span className={ok ? "text-green-600" : "text-gray-400"}>{ok ? "✅" : "⬜"}</span>
      <span className={ok ? "text-gray-800" : "text-gray-500"}>
        {label}
        {!ok && hint ? <span className="text-gray-400"> — {hint}</span> : null}
      </span>
    </li>
  );
}

function MasterChannelCard({
  channel,
  busy,
  onSave,
}: {
  channel: { configured: boolean; instanceName: string | null; enabled: boolean; legacyFallbackEnabled: boolean };
  busy: boolean;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const [instanceName, setInstanceName] = useState(channel.instanceName ?? "");
  const [status, setStatus] = useState<MasterStatus | null>(null);
  const [checkBusy, setCheckBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [qrBusy, setQrBusy] = useState(false);
  const [qr, setQr] = useState<{ connected?: boolean; base64?: string | null; pairingCode?: string | null; note?: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setInstanceName(channel.instanceName ?? ""); }, [channel.instanceName]);

  async function loadQr() {
    setQrBusy(true); setErr(null); setMsg(null); setQr(null);
    try {
      const res = await fetch("/api/admin/build-os/master-channel/qr");
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) { setErr(d.error ?? "Falha ao gerar QR."); return; }
      setQr(d.result);
    } finally { setQrBusy(false); }
  }

  // Load status once on mount so the instance dropdown + checklist are populated
  // without the user having to click "Verificar conexão" first.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/build-os/master-channel");
        const d = await res.json().catch(() => ({}));
        if (!cancelled && res.ok && d.ok) setStatus(d.status as MasterStatus);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  async function verify() {
    setCheckBusy(true); setErr(null); setMsg(null);
    try {
      const res = await fetch("/api/admin/build-os/master-channel");
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) { setErr(d.error ?? "Falha ao verificar."); return; }
      setStatus(d.status as MasterStatus);
    } finally { setCheckBusy(false); }
  }

  async function sync() {
    setSyncBusy(true); setErr(null); setMsg(null);
    try {
      const res = await fetch("/api/admin/build-os/master-channel/sync", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) { setErr(d.error ?? "Falha ao sincronizar webhook."); return; }
      setMsg(d.result?.note ?? "Webhook sincronizado no Canal Master.");
      await verify();
    } finally { setSyncBusy(false); }
  }

  const h = status?.health;
  return (
    <div className={`rounded-xl border p-5 ${channel.configured ? "border-green-200 bg-green-50" : "border-amber-300 bg-amber-50"}`}>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-900">Canal WhatsApp Master/Admin</h3>
      <p className="mt-1 text-xs text-gray-600">
        Este é o <strong>número receptor dos comandos internos</strong> do Diego/CEO e dos operadores autorizados.
        Ele é <strong>separado dos WhatsApps dos restaurantes</strong> (sushicazza etc.). Informe o nome da instância
        Evolution dedicada ao Build OS.
      </p>

      {!channel.configured && (
        <p className="mt-2 rounded-lg bg-amber-100 px-3 py-2 text-xs font-medium text-amber-800">
          ⚠️ Canal Build OS Master não configurado. Comandos internos NÃO devem usar instâncias de restaurante.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-end gap-3">
        {status && status.availableInstances.length > 0 && (
          <Field label="Usar uma instância existente">
            <select
              className={INPUT + " w-56"}
              value={status.availableInstances.some((i) => i.instanceName === instanceName) ? instanceName : ""}
              onChange={(e) => { if (e.target.value) setInstanceName(e.target.value); }}
            >
              <option value="">— escolher —</option>
              {status.availableInstances.map((i) => (
                <option key={i.instanceName} value={i.instanceName}>
                  {i.instanceName}{i.restaurant ? ` (${i.restaurant})` : ""}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Nome da instância (Evolution) do Build OS">
          <input
            className={INPUT + " w-64"}
            value={instanceName}
            onChange={(e) => setInstanceName(e.target.value)}
            placeholder="ex.: futi-admin"
          />
        </Field>
        <button
          type="button"
          disabled={busy}
          onClick={() => onSave({ whatsappInstanceName: instanceName.trim() || null })}
          className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-40"
        >
          Salvar instância
        </button>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <label className="flex items-center gap-2 text-xs text-gray-700">
          <input
            type="checkbox"
            disabled={busy}
            checked={channel.enabled}
            onChange={(e) => onSave({ whatsappEnabled: e.target.checked })}
          />
          Canal Master ativo (processa comandos Build OS desta instância)
        </label>
        <label className="flex items-center gap-2 text-xs text-gray-700">
          <input
            type="checkbox"
            disabled={busy}
            checked={channel.legacyFallbackEnabled}
            onChange={(e) => onSave({ legacyRestaurantInstanceFallbackEnabled: e.target.checked })}
          />
          <span>
            Permitir <strong>fallback legado — não recomendado</strong> (tratar instâncias de restaurante como canal
            Build OS quando não houver Master configurado)
          </span>
        </label>
      </div>

      {/* Actions */}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={verify}
          disabled={checkBusy || syncBusy}
          className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-black disabled:opacity-40"
        >
          {checkBusy ? "Verificando…" : "Verificar conexão"}
        </button>
        <button
          type="button"
          onClick={sync}
          disabled={checkBusy || syncBusy}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-40"
        >
          {syncBusy ? "Sincronizando…" : "Sincronizar webhook"}
        </button>
        <button
          type="button"
          onClick={loadQr}
          disabled={checkBusy || syncBusy || qrBusy}
          className="rounded-lg border border-orange-300 bg-orange-50 px-3 py-1.5 text-sm font-semibold text-orange-700 hover:bg-orange-100 disabled:opacity-40"
        >
          {qrBusy ? "Gerando QR…" : "Conectar Canal Master (QR)"}
        </button>
      </div>
      <p className="mt-1 text-[11px] text-gray-400">
        &quot;Conectar Canal Master (QR)&quot; gera o QR Code para conectar o número receptor do <strong>Futi Admin</strong> —
        aqui mesmo, sem abrir a integração do restaurante.
      </p>

      {/* QR / pairing for the Master number — Build OS context only */}
      {qr && (
        <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50 p-3 text-xs">
          {qr.connected ? (
            <p className="font-semibold text-green-700">✅ Canal Master já conectado.</p>
          ) : qr.base64 ? (
            <div className="flex flex-col items-start gap-2">
              <p className="text-gray-700">
                Escaneie com o WhatsApp do <strong>número receptor do Futi Admin</strong> (Aparelhos conectados →
                Conectar aparelho). Este número é interno do Admin — <strong>não</strong> é WhatsApp de restaurante.
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr.base64} alt="QR Code do Canal Master" className="h-56 w-56 rounded bg-white p-2" />
              {qr.pairingCode && <p className="font-mono text-sm">Código: {qr.pairingCode}</p>}
            </div>
          ) : qr.pairingCode ? (
            <p>Código de pareamento: <span className="font-mono text-sm font-semibold">{qr.pairingCode}</span></p>
          ) : (
            <p className="text-gray-600">{qr.note ?? "QR indisponível."}</p>
          )}
        </div>
      )}

      {err && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{err}</p>}
      {msg && <p className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">{msg}</p>}

      {/* Live status */}
      {status && (
        <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
          {!status.instanceName ? (
            <p className="text-xs text-amber-700">Defina e salve o nome da instância do Canal Master primeiro.</p>
          ) : !status.existsInEvolution ? (
            <div className="text-xs text-red-700">
              <p className="font-semibold">Canal Master configurado, mas instância &quot;{status.instanceName}&quot; não encontrada na Evolution.</p>
              <p className="mt-1 text-gray-600">
                Próximo passo: escolha uma instância <strong>existente</strong> no seletor acima (ela já tem credenciais
                Evolution) e clique em &quot;Conectar Canal Master (QR)&quot; aqui mesmo. Uma instância dedicada totalmente nova
                (sem credenciais) ainda não pode ser criada por esta tela — <strong>não</strong> use a integração do
                restaurante. Depois volte e clique em &quot;Verificar conexão&quot;.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-x-6 gap-y-1 text-xs text-gray-700 sm:grid-cols-2">
              <span>Conexão: <strong className={h?.connectionState === "open" ? "text-green-700" : "text-red-700"}>{h?.connectionState?.toUpperCase() ?? "DESCONHECIDA"}</strong></span>
              <span>Número conectado: <span className="font-mono">{h?.connectedNumberMasked ?? "—"}</span></span>
              <span>Operador autorizado: <span className="font-mono">{status.numbersInvolved?.authorizedOperatorMasked ?? "—"}</span></span>
              <span>Webhook habilitado: {h?.webhookEnabled === null || h?.webhookEnabled === undefined ? "—" : String(h.webhookEnabled)}</span>
              <span>URL bate com a esperada: {String(h?.urlMatchesExpected ?? false)}</span>
              <span>MESSAGES_UPSERT: {h?.hasMessagesUpsert ? "sim" : "não"}</span>
              <span className="sm:col-span-2">Último evento: {h?.lastEventAt ? `${new Date(h.lastEventAt).toLocaleString("pt-BR")} (há ${h.lastEventAgeMinutes} min)` : "nunca"}</span>
              {h?.issues && h.issues.length > 0 && (
                <ul className="sm:col-span-2 mt-1 list-disc space-y-0.5 pl-5 text-red-700">
                  {h.issues.map((i, idx) => <li key={idx}>{i}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* Readiness checklist — only "Pronto para testar" when ALL items pass */}
      {status && (
        <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Prontidão para testar /build</p>
          <ul className="mt-2 space-y-1">
            <ChecklistRow ok={status.readiness.instanceNameSaved} label="instanceName salvo" hint="salve o nome da instância acima" />
            <ChecklistRow ok={status.readiness.instanceExists} label="instância existe na Evolution" hint="crie/conecte em Integrações → WhatsApp" />
            <ChecklistRow ok={status.readiness.connectionOpen} label="conexão OPEN" hint="conecte o WhatsApp (QR) da instância Master" />
            <ChecklistRow ok={status.readiness.webhookOk} label="webhook correto (habilitado + URL esperada)" hint="clique em Sincronizar webhook" />
            <ChecklistRow ok={status.readiness.messagesUpsert} label="MESSAGES_UPSERT ativo" hint="clique em Sincronizar webhook" />
            <ChecklistRow ok={status.readiness.operatorActive} label={`operador autorizado ativo${status.operatorMasked ? ` (${status.operatorMasked})` : " (+55***5223)"}`} hint="cadastre o operador Diego" />
            <ChecklistRow ok={status.readiness.lastEventReceived} label="último evento recebido nesta instância" hint="envie uma mensagem de teste para a instância Master" />
          </ul>
          {status.readiness.allReady ? (
            <p className="mt-3 rounded-lg bg-green-100 px-3 py-2 text-sm font-semibold text-green-800">
              ✅ Pronto para testar /build — envie &quot;/build teste&quot; do número {status.operatorMasked ?? "+55***5223"} para o número conectado no Canal Master.
            </p>
          ) : (
            <p className="mt-3 rounded-lg bg-amber-100 px-3 py-2 text-sm font-medium text-amber-800">
              ⏳ Ainda não está pronto. Resolva os itens pendentes acima — o /build NÃO vai funcionar até todos estarem OK.
            </p>
          )}
        </div>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
        <Meta label="Configurado" value={channel.configured ? "Sim" : "Não"} />
        <Meta label="Instância" value={channel.instanceName ?? "—"} />
        <Meta label="Ativo" value={channel.enabled ? "Sim" : "Não"} />
      </dl>
    </div>
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
