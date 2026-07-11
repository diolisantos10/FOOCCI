"use client";

/**
 * Ficha Técnica do agente (Prompt Room) — admin/master only.
 *
 * A "ficha de funcionário" TÉCNICA de cada agente de IA: missão, funções,
 * pode/não-pode, regras, domínio, escalação — o que qualquer IA-piloto precisa
 * ler para "saber quem é". SEM comportamento/tom (isso é configuração do
 * restaurante, outro cano). Inclui o seletor de IA-piloto, que troca o
 * roteamento via governança do Brain (CR → aprovar → aplicar).
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminAgentProfileView } from "@/services/agents/types";

// ── helpers ──────────────────────────────────────────────────────────────────────

const joinLines = (items: string[]): string => (items ?? []).join("\n");
const splitLines = (text: string): string[] =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
      {children}
    </label>
  );
}

function ListEditor({
  label,
  hint,
  value,
  onChange,
  tone = "default",
  rows = 6,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  tone?: "default" | "danger";
  rows?: number;
}) {
  const danger = tone === "danger";
  return (
    <section
      className={`rounded-xl border bg-white p-5 ${danger ? "border-red-300" : "border-gray-200"}`}
    >
      <div className="mb-2 flex items-center gap-2">
        <h3
          className={`text-sm font-semibold uppercase tracking-wide ${danger ? "text-red-700" : "text-gray-900"}`}
        >
          {label}
        </h3>
        {danger && (
          <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-red-600">
            Limite rígido
          </span>
        )}
      </div>
      {hint && <p className="mb-2 text-xs text-gray-500">{hint}</p>}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder="Um item por linha…"
        className={`w-full rounded-lg border p-3 font-mono text-xs leading-relaxed text-gray-900 focus:outline-none focus:ring-2 ${
          danger
            ? "border-red-200 bg-red-50/40 focus:ring-red-300"
            : "border-gray-200 bg-gray-50 focus:ring-orange-300"
        }`}
      />
      <p className="mt-1 text-[11px] text-gray-400">Um item por linha.</p>
    </section>
  );
}

// ── IA-Piloto (engine routing) ───────────────────────────────────────────────────

type Provider = "OPENAI" | "CLAUDE" | "GEMINI";
const PROVIDER_LABELS: Record<Provider, string> = {
  OPENAI: "OpenAI",
  CLAUDE: "Claude",
  GEMINI: "Gemini",
};
const PROVIDERS: Provider[] = ["OPENAI", "CLAUDE", "GEMINI"];

interface EngineInfo {
  routing: { provider: string; model: string | null; source: "db" | "code"; taskProfile: string };
  configuredProviders: string[];
}

function PilotCard({ slug }: { slug: string }) {
  const [info, setInfo] = useState<EngineInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [provider, setProvider] = useState<Provider>("OPENAI");
  const [reviewer, setReviewer] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/agents/profiles/${slug}/engine`, { cache: "no-store" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "falha ao ler roteamento");
      setInfo({ routing: data.routing, configuredProviders: data.configuredProviders ?? [] });
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "erro desconhecido");
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const providerNotConfigured =
    info !== null && !info.configuredProviders.includes(provider);

  async function swapPilot() {
    const name = reviewer.trim();
    if (!name) {
      setResult({ ok: false, text: "Informe seu nome (revisor humano) antes de trocar o piloto." });
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      // 1) Change request governado (nunca nasce aprovado)
      const crRes = await fetch("/api/admin/brain/change-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestedByType: "CEO",
          target: "AI_ENGINE_ROUTING",
          summary: `Trocar IA-piloto do agente ${slug} para ${PROVIDER_LABELS[provider]}`,
          rationale: `Troca de piloto solicitada por ${name} pela Ficha Técnica do agente (${slug}), taskProfile REASON.`,
          proposedChange: { agentId: slug, provider, taskProfile: "REASON" },
        }),
      });
      const crData = await crRes.json();
      if (!crData.ok || !crData.request?.id) {
        throw new Error(`criação do change request falhou: ${crData.error ?? "erro"}`);
      }
      const crId: string = crData.request.id;

      // 2) Aprovação humana (reviewedBy = nome real)
      const approveRes = await fetch(`/api/admin/brain/change-requests/${crId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", reviewedBy: name }),
      });
      const approveData = await approveRes.json();
      if (!approveData.ok) {
        throw new Error(`aprovação falhou: ${approveData.error ?? "erro"}`);
      }

      // 3) Apply (quality gate roda aqui quando exigido)
      const applyRes = await fetch(`/api/admin/brain/change-requests/${crId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appliedBy: name }),
      });
      const applyData = await applyRes.json();
      if (applyData.ok) {
        setResult({
          ok: true,
          text: `Piloto aplicado: ${PROVIDER_LABELS[provider]} (CR ${crId}).${
            applyData.result?.gate ? ` Gate: ${applyData.result.gate.reason}` : ""
          }`,
        });
        await load();
      } else {
        const gate = applyData.result?.gate;
        setResult({
          ok: false,
          text: gate && !gate.passed
            ? `Quality gate reprovado — mudança NÃO aplicada: ${gate.reason}`
            : `Apply falhou: ${applyData.error ?? applyData.result?.error ?? "erro desconhecido"}`,
        });
      }
    } catch (err) {
      setResult({ ok: false, text: err instanceof Error ? err.message : "erro desconhecido" });
    } finally {
      setBusy(false);
    }
  }

  const currentProvider = info?.routing.provider ?? "—";
  const currentLabel =
    PROVIDER_LABELS[currentProvider as Provider] ?? currentProvider;

  return (
    <section className="rounded-xl border border-violet-200 bg-violet-50/50 p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-violet-800">
          🧠 IA-Piloto
        </h3>
        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-violet-700">
          governado pelo Brain
        </span>
      </div>

      {loadError && (
        <p className="mb-3 text-sm text-red-600">Não foi possível ler o roteamento: {loadError}</p>
      )}

      {info && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-gray-800">
          <span>
            Piloto atual: <strong>{currentLabel}</strong>
            {info.routing.model ? ` (${info.routing.model})` : ""}
          </span>
          <span className="rounded-full bg-white px-2 py-0.5 text-xs text-gray-500">
            {info.routing.source === "db"
              ? "roteamento governado (DB)"
              : "preferência de código (sem CR aplicado)"}
          </span>
          <span className="rounded-full bg-white px-2 py-0.5 text-xs text-gray-500">
            taskProfile: {info.routing.taskProfile}
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <FieldLabel>Novo piloto</FieldLabel>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as Provider)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
          >
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {PROVIDER_LABELS[p]}
                {info && !info.configuredProviders.includes(p) ? " (sem chave)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>Seu nome (revisor humano)</FieldLabel>
          <input
            value={reviewer}
            onChange={(e) => setReviewer(e.target.value)}
            placeholder="ex.: Diolinaldo"
            className="w-56 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
          />
        </div>
        <button
          type="button"
          onClick={swapPilot}
          disabled={busy}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:opacity-50"
        >
          {busy ? "Trocando…" : "Trocar piloto"}
        </button>
      </div>

      {providerNotConfigured && (
        <p className="mt-2 text-xs font-medium text-amber-700">
          ⚠️ {PROVIDER_LABELS[provider]} não tem chave de API configurada neste ambiente — o
          roteamento será gravado, mas o runtime cairá em fallback seguro até a chave existir.
        </p>
      )}

      <p className="mt-2 text-xs text-gray-500">
        Fluxo governado: cria change request (AI_ENGINE_ROUTING) → aprovação humana → apply (com
        quality gate quando exigido). Nada muda sem essa trilha.
      </p>

      {result && (
        <p className={`mt-3 text-sm font-medium ${result.ok ? "text-green-700" : "text-red-600"}`}>
          {result.ok ? "✓ " : "✗ "}
          {result.text}
        </p>
      )}
    </section>
  );
}

// ── Ficha Técnica (editable sheet) ───────────────────────────────────────────────

export function TechSheet({ agent }: { agent: AdminAgentProfileView }) {
  const router = useRouter();

  const [name, setName] = useState(agent.name);
  const [title, setTitle] = useState(agent.title ?? "");
  const [mission, setMission] = useState(agent.mission ?? "");
  const [responsibilities, setResponsibilities] = useState(joinLines(agent.responsibilities));
  const [allowedActions, setAllowedActions] = useState(joinLines(agent.allowedActions));
  const [forbiddenActions, setForbiddenActions] = useState(joinLines(agent.forbiddenActions));
  const [businessRules, setBusinessRules] = useState(joinLines(agent.businessRules));
  const [knowledgeAreas, setKnowledgeAreas] = useState(joinLines(agent.knowledgeAreas));
  const [escalationRules, setEscalationRules] = useState(joinLines(agent.escalationRules));

  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setSaving(true);
    setSaveResult(null);
    try {
      const res = await fetch(`/api/admin/agents/profiles/${agent.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || agent.name,
          title: title.trim(),
          mission,
          responsibilities: splitLines(responsibilities),
          allowedActions: splitLines(allowedActions),
          forbiddenActions: splitLines(forbiddenActions),
          businessRules: splitLines(businessRules),
          knowledgeAreas: splitLines(knowledgeAreas),
          escalationRules: splitLines(escalationRules),
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "falha ao salvar");
      setSaveResult({ ok: true, text: "Ficha salva no banco (origem passa a ser DB)." });
      router.refresh();
    } catch (err) {
      setSaveResult({ ok: false, text: err instanceof Error ? err.message : "erro desconhecido" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Aviso de escopo — TÉCNICO apenas */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <strong>Ficha técnica interna</strong> — aqui mora só o TÉCNICO do agente (missão, funções,
        limites, regras, domínio, escalação). <strong>Comportamento/tom é definido pela
        configuração do restaurante</strong>, em outro cano — não edite personalidade aqui.
      </div>

      {/* Seletor de IA-Piloto */}
      <PilotCard slug={agent.slug} />

      {/* Identidade */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-900">
          Identidade
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel>Nome</FieldLabel>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900"
            />
          </div>
          <div>
            <FieldLabel>Cargo</FieldLabel>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="ex.: Garçom digital e especialista em vendas"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900"
            />
          </div>
        </div>
        <div className="mt-4">
          <FieldLabel>Missão</FieldLabel>
          <textarea
            value={mission}
            onChange={(e) => setMission(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm leading-relaxed text-gray-900"
          />
        </div>
      </section>

      {/* Seções em lista */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ListEditor
          label="Funções"
          hint="Pelo que este agente responde no dia a dia."
          value={responsibilities}
          onChange={setResponsibilities}
        />
        <ListEditor
          label="Pode fazer"
          hint="Ações permitidas ao agente."
          value={allowedActions}
          onChange={setAllowedActions}
        />
        <ListEditor
          label="NÃO pode fazer"
          hint="Limites rígidos — a IA-piloto nunca cruza estas linhas."
          value={forbiddenActions}
          onChange={setForbiddenActions}
          tone="danger"
        />
        <ListEditor
          label="Regras de negócio"
          hint="Regras operacionais que o agente obedece."
          value={businessRules}
          onChange={setBusinessRules}
        />
        <ListEditor
          label="Domínio"
          hint="Áreas de conhecimento do agente."
          value={knowledgeAreas}
          onChange={setKnowledgeAreas}
        />
        <ListEditor
          label="Escalação"
          hint="Quando e para quem o agente escala."
          value={escalationRules}
          onChange={setEscalationRules}
        />
      </div>

      {/* Salvar */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-700 disabled:opacity-50"
        >
          {saving ? "Salvando…" : "Salvar ficha técnica"}
        </button>
        {saveResult && (
          <p className={`text-sm font-medium ${saveResult.ok ? "text-green-700" : "text-red-600"}`}>
            {saveResult.ok ? "✓ " : "✗ "}
            {saveResult.text}
          </p>
        )}
        <p className="text-xs text-gray-400">
          Regras de segurança (piso imutável) e instruções de prompt não são editáveis aqui.
        </p>
      </div>
    </div>
  );
}
