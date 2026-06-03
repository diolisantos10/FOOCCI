/**
 * Presentational helpers for the internal Admin → AI Agents area (read-only).
 *
 * Pure render functions (no client hooks) so they run in server components.
 * Design tokens: white background, black text, orange ONLY for primary actions,
 * compact cards, clear status badges. No editing affordances in Phase 2.
 */

import Link from "next/link";
import type {
  AdminAgentProfileView,
  AgentArea,
  AgentExample,
  AgentStatus,
  AgentVisibility,
} from "@/services/agents/types";

// ── Label maps (internal/master tone, plain Portuguese) ─────────────────────────

export const AREA_LABELS: Record<AgentArea, string> = {
  ORCHESTRATOR: "Orquestrador",
  SECURITY: "Segurança & Governança",
  WAITER: "Atendimento / Vendas",
  WHATSAPP: "WhatsApp",
  CRM: "CRM",
  UI_UX: "UI/UX",
  MANUAL: "Manual / Constituição",
  QA: "QA / Testes",
  INTEGRATION: "Integrações",
  BRANDING: "Marca",
  ANALYTICS: "Analytics / Produto",
  GENERAL: "Geral",
};

const STATUS_STYLES: Record<AgentStatus, { label: string; cls: string; dot: string }> = {
  ACTIVE: { label: "Ativo", cls: "bg-green-50 text-green-700", dot: "bg-green-500" },
  DRAFT: { label: "Rascunho", cls: "bg-amber-50 text-amber-700", dot: "bg-amber-400" },
  ARCHIVED: { label: "Arquivado", cls: "bg-gray-100 text-gray-500", dot: "bg-gray-400" },
};

const VISIBILITY_STYLES: Record<AgentVisibility, { label: string; cls: string }> = {
  INTERNAL: { label: "Interno", cls: "bg-gray-100 text-gray-600" },
  RESTAURANT: { label: "Restaurante", cls: "bg-blue-50 text-blue-700" },
  PUBLIC: { label: "Público", cls: "bg-purple-50 text-purple-700" },
};

// ── Badges ──────────────────────────────────────────────────────────────────────

export function StatusBadge({ status }: { status: AgentStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

export function VisibilityBadge({ visibility }: { visibility: AgentVisibility }) {
  const v = VISIBILITY_STYLES[visibility];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${v.cls}`}>
      {v.label}
    </span>
  );
}

export function RuntimeBadge({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        enabled ? "bg-orange-50 text-orange-700" : "bg-gray-100 text-gray-500"
      }`}
      title={
        enabled
          ? "Este perfil pode influenciar o runtime (quando habilitado globalmente)."
          : "Runtime desligado — este perfil é apenas dado/visualização (Fase 2)."
      }
    >
      <span className={`h-1.5 w-1.5 rounded-full ${enabled ? "bg-orange-500" : "bg-gray-400"}`} />
      Runtime {enabled ? "ON" : "OFF"}
    </span>
  );
}

export function AreaBadge({ area }: { area: AgentArea }) {
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
      {AREA_LABELS[area]}
    </span>
  );
}

// ── Detail section renderers ─────────────────────────────────────────────────────

/** A titled block wrapper used across the detail view. */
export function Section({
  title,
  children,
  internal = false,
}: {
  title: string;
  children: React.ReactNode;
  internal?: boolean;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-900">{title}</h2>
        {internal && (
          <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-red-600">
            Interno · master-only
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

/** Render a string[] as a clean bullet list, or an empty-state line. */
export function BulletList({ items }: { items: string[] }) {
  if (!items || items.length === 0) {
    return <p className="text-sm text-gray-400">— sem itens definidos —</p>;
  }
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 text-sm text-gray-800">
          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gray-400" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Render a single text paragraph or an empty-state line. */
export function TextBlock({ text }: { text?: string }) {
  if (!text || !text.trim()) {
    return <p className="text-sm text-gray-400">— não definido —</p>;
  }
  return <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{text}</p>;
}

/** Render a monospace, read-only block (for prompt instructions). */
export function CodeBlock({ text }: { text?: string }) {
  if (!text || !text.trim()) {
    return <p className="text-sm text-gray-400">— não definido —</p>;
  }
  return (
    <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-4 text-xs leading-relaxed text-gray-800">
      {text}
    </pre>
  );
}

// ── Tab order (the "Geral" hub + one pill per agent area) ───────────────────────
// Slugs map 1:1 to the seeded code registry. Kept here so both the dashboard
// (client) and any server view share a single ordering source.

export interface AgentTabDef {
  /** "geral" or an agent slug. */
  key: string;
  label: string;
}

export const AGENT_TAB_ORDER: AgentTabDef[] = [
  { key: "geral",               label: "Geral" },
  { key: "waiter",              label: "Waiter" },
  { key: "orchestrator",        label: "Orquestrador" },
  { key: "security-governance", label: "Segurança" },
  { key: "whatsapp",            label: "WhatsApp" },
  { key: "crm",                 label: "CRM" },
  { key: "ui-ux",               label: "UI/UX" },
  { key: "manual-constitution", label: "Manual" },
  { key: "qa-test",             label: "QA" },
  { key: "integration",         label: "Integrações" },
  { key: "branding",            label: "Branding" },
  { key: "analytics-product",   label: "Analytics" },
];

// ── Read-only status row (badges only — never a toggle) ─────────────────────────

export function AgentStatusRow({ agent }: { agent: AdminAgentProfileView }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <AreaBadge area={agent.area} />
      <VisibilityBadge visibility={agent.visibility} />
      <RuntimeBadge enabled={agent.isRuntimeEnabled} />
      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
        v{agent.version}
      </span>
      {agent.updatedAt && (
        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
          Atualizado: {new Date(agent.updatedAt).toLocaleDateString("pt-BR")}
        </span>
      )}
    </div>
  );
}

// ── Extended sections (agent-specific rich content, e.g. Waiter) ────────────────

const EXTENDED_LABELS: Record<string, string> = {
  salesPrinciples: "Princípios de venda",
  menuReadingRules: "Leitura do cardápio",
  consultativeProbingRules: "Sondagem consultiva",
  groupSizeRules: "Regras por tamanho de grupo",
  lightHeavyRules: "Regras leve / completo",
  budgetRules: "Regras de orçamento",
  upsellRules: "Regras de upsell",
  closingRules: "Regras de fechamento",
  toolUsageRules: "Uso de ferramentas",
  failureHandling: "Tratamento de falhas",
  examples: "Exemplos (bom vs. ruim)",
};

function isExampleArray(value: unknown): value is AgentExample[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    typeof value[0] === "object" &&
    value[0] !== null &&
    "customerSays" in (value[0] as object)
  );
}

function ExtendedSections({ sections }: { sections?: Record<string, unknown> }) {
  if (!sections || Object.keys(sections).length === 0) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-bold uppercase tracking-wide text-gray-900">
        Seções específicas do agente
      </h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Object.entries(sections).map(([key, value]) => {
          const label = EXTENDED_LABELS[key] ?? key;

          if (isExampleArray(value)) {
            return (
              <Section key={key} title={label}>
                <ul className="space-y-3">
                  {value.map((ex, i) => (
                    <li key={i} className="rounded-lg border border-gray-100 p-3 text-sm">
                      <p className="mb-1 text-gray-500">
                        Cliente: <span className="text-gray-800">“{ex.customerSays}”</span>
                      </p>
                      <p className="text-green-700">✓ {ex.good}</p>
                      <p className="text-red-600">✗ {ex.bad}</p>
                    </li>
                  ))}
                </ul>
              </Section>
            );
          }

          if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
            return (
              <Section key={key} title={label}>
                <BulletList items={value as string[]} />
              </Section>
            );
          }

          return (
            <Section key={key} title={label}>
              <CodeBlock text={JSON.stringify(value, null, 2)} />
            </Section>
          );
        })}
      </div>
    </div>
  );
}

// ── Special identity callouts for flagship / mandatory agents ───────────────────

function WaiterCallout() {
  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50 p-5">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-orange-700">
        Garçom digital e especialista em vendas
      </h2>
      <p className="mb-3 text-sm leading-relaxed text-gray-800">
        Funcionário de IA que opera <strong>dentro da interface do restaurante</strong> (a tela de
        pedido é o salão; o cardápio são os produtos; o carrinho é a comanda; o checkout é o caixa).
        Atua como um bom garçom/vendedor — <strong>não é um chatbot</strong> e{" "}
        <strong>não é um bot de palavra-chave</strong>.
      </p>
      <ul className="grid grid-cols-1 gap-1.5 text-sm text-gray-800 sm:grid-cols-2">
        {[
          "Usa dados reais do cardápio (inventário de vendas)",
          "Entende a intenção real do cliente",
          "Recomenda apenas produtos reais",
          "Vende de forma contextual (upsell/cross-sell)",
          "Conduz o cliente até a finalização do pedido",
          "Respeita segurança e limites anti-alucinação",
        ].map((line) => (
          <li key={line} className="flex gap-2">
            <span className="text-orange-500">✓</span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 border-t border-orange-200 pt-4">
        <Link
          href="/admin/agentes/waiter/testes"
          className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-700"
        >
          🧠 Abrir Waiter Test Center
        </Link>
      </div>
    </div>
  );
}

function CrmCallout() {
  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50 p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-violet-700">
            CRM Test Center 🧠
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-gray-800">
            Avalie o comportamento do CRM Agent antes de liberar qualquer automação. Rode a suíte
            determinística de testes: segurança de contato, segmentação/tier, inteligência do cliente,
            action center, rascunho de mensagem, atribuição de campanha e review request.
          </p>
        </div>
      </div>
      <ul className="mb-4 grid grid-cols-1 gap-1.5 text-sm text-gray-700 sm:grid-cols-2">
        {[
          "Contact Safety: opt-out, cooldown, caps, quiet hours",
          "Segmentação: QUENTE / MORNO / FRIO / PERDIDO / tier",
          "Customer Intelligence: próxima melhor ação",
          "Action Center: ações e prioridades corretas",
          "Message Variation: sem desconto falso, sem spam",
          "Atribuição de campanha: COUPON_PROVEN → NONE",
          "Review Request: elegibilidade e bloqueios",
          "Sem envios, sem campanhas, sem efeitos colaterais",
        ].map((line) => (
          <li key={line} className="flex gap-2">
            <span className="text-violet-500">✓</span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
      <Link
        href="/admin/agentes/crm/testes"
        className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-700"
      >
        🧠 Abrir CRM Test Center
      </Link>
    </div>
  );
}

function SecurityCallout() {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-5">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-red-700">
        Guardião de Segurança e Governança
      </h2>
      <p className="mb-3 text-sm leading-relaxed text-gray-800">
        Camada <strong>mandatória futura</strong> que valida qualquer execução automatizada antes de
        ela acontecer. Hoje é um rascunho de arquitetura, mas seu papel já está reservado no Build OS.
      </p>
      <ul className="grid grid-cols-1 gap-1.5 text-sm text-gray-800 sm:grid-cols-2">
        {[
          "Poder de veto sobre ações de risco",
          "Classificação de risco de cada operação",
          "Proteção de segredos e credenciais",
          "Controle de permissões e escopo",
          "Segurança em produção (production safety)",
          "Defesa contra prompt injection",
          "Portões de aprovação (approval gates)",
        ].map((line) => (
          <li key={line} className="flex gap-2">
            <span className="text-red-500">✓</span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="font-medium text-gray-900">{value}</dd>
    </div>
  );
}

/**
 * Full read-only dashboard for a single agent. Shared by the dashboard tabs and
 * the /admin/agents/[slug] deep-link page. Pure render — no hooks, no mutations.
 */
export function AgentDashboard({ agent }: { agent: AdminAgentProfileView }) {
  const isWaiter   = agent.slug === "waiter";
  const isSecurity = agent.slug === "security-governance";
  const isCrm      = agent.slug === "crm";
  const isPlaceholder = agent.status === "DRAFT";

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-bold text-gray-900">{agent.name}</h2>
          <StatusBadge status={agent.status} />
        </div>
        {agent.title && <p className="text-base text-gray-600">{agent.title}</p>}
        <AgentStatusRow agent={agent} />
      </header>

      {isPlaceholder && !isSecurity && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Este agente é um <strong>rascunho / placeholder</strong>. O conteúdo estruturado será
          preenchido em fases futuras. Ele aparece no quadro porque faz parte da arquitetura
          planejada do Build OS.
        </div>
      )}

      {isWaiter    && <WaiterCallout />}
      {isSecurity  && <SecurityCallout />}
      {isCrm       && <CrmCallout />}

      <Section title="Identidade">
        <TextBlock text={agent.description} />
      </Section>

      <Section title="Missão">
        <TextBlock text={agent.mission} />
      </Section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Objetivos">
          <BulletList items={agent.objectives} />
        </Section>
        <Section title="Responsabilidades">
          <BulletList items={agent.responsibilities} />
        </Section>
        <Section title="Habilidades">
          <BulletList items={agent.skills} />
        </Section>
        <Section title="Ações permitidas">
          <BulletList items={agent.allowedActions} />
        </Section>
        {/* INTERNAL-ONLY safety sections */}
        <Section title="Ações proibidas" internal>
          <BulletList items={agent.forbiddenActions} />
        </Section>
        <Section title="Regras de segurança" internal>
          <BulletList items={agent.safetyRules} />
        </Section>
        <Section title="Ferramentas">
          <BulletList items={agent.tools} />
        </Section>
        <Section title="Áreas de conhecimento">
          <BulletList items={agent.knowledgeAreas} />
        </Section>
        <Section title="Regras de negócio">
          <BulletList items={agent.businessRules} />
        </Section>
        <Section title="Regras de escalonamento">
          <BulletList items={agent.escalationRules} />
        </Section>
        <Section title="Regras de saída">
          <BulletList items={agent.outputRules} />
        </Section>
        <Section title="Critérios de avaliação">
          <BulletList items={agent.evaluationCriteria} />
        </Section>
      </div>

      <Section title="Contexto de interface">
        <TextBlock text={agent.interfaceContext} />
      </Section>

      {/* INTERNAL-ONLY raw prompt directive */}
      <Section title="Instruções de prompt (diretiva compilada)" internal>
        <CodeBlock text={agent.promptInstructions} />
      </Section>

      <ExtendedSections sections={agent.extendedSections} />

      {/* Read-only status footer — badges/values only, never a control */}
      <Section title="Status de runtime / versão">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Meta label="Versão" value={`v${agent.version}`} />
          <Meta label="Status" value={agent.status} />
          <Meta label="Visibilidade" value={agent.visibility} />
          <Meta
            label="Runtime"
            value={agent.isRuntimeEnabled ? "Habilitado" : "Desligado (Fase 2)"}
          />
          <Meta label="Origem dos dados" value={agent.origin === "db" ? "Banco" : "Código"} />
          <Meta label="Fonte" value={agent.source ?? "—"} />
          <Meta label="Default global" value={agent.isGlobalDefault ? "Sim" : "Não"} />
          <Meta
            label="Atualizado"
            value={agent.updatedAt ? new Date(agent.updatedAt).toLocaleString("pt-BR") : "—"}
          />
        </dl>
      </Section>
    </div>
  );
}
