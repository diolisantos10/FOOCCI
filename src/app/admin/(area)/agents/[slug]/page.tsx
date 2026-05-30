/**
 * Admin → AI Agents → [slug] — detail (Phase 2, READ-ONLY).
 *
 * Renders the full structured profile of a single agent. Server-rendered inside
 * the admin-protected (area) layout. Internal-only sections (Forbidden Actions,
 * Safety Rules, Prompt Instructions) are shown here — this area is master-only
 * and never exposed to restaurant users.
 *
 * Strictly read-only: no edit controls in this phase.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminAgentProfile } from "@/services/agents/AgentProfileService";
import type { AgentExample } from "@/services/agents/types";
import {
  AreaBadge,
  BulletList,
  CodeBlock,
  RuntimeBadge,
  Section,
  StatusBadge,
  TextBlock,
  VisibilityBadge,
} from "../_components";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function AgentDetailPage({ params }: PageProps) {
  const { slug } = await params;

  let agent;
  try {
    agent = await getAdminAgentProfile(slug);
  } catch {
    return (
      <div className="min-h-full bg-white px-8 py-6">
        <p className="text-sm text-red-600">
          Não foi possível carregar este agente. Tente novamente.
        </p>
      </div>
    );
  }

  if (!agent) notFound();

  const isWaiter = agent.slug === "waiter";
  const isPlaceholder = agent.status === "DRAFT";

  return (
    <div className="min-h-full space-y-6 bg-white px-8 py-6 text-gray-900">
      {/* Breadcrumb / back */}
      <Link href="/admin/agents" className="text-sm font-medium text-orange-600 hover:underline">
        ← Voltar para AI Agents
      </Link>

      {/* Header */}
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">{agent.name}</h1>
          <StatusBadge status={agent.status} />
        </div>
        {agent.title && <p className="text-base text-gray-600">{agent.title}</p>}
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
      </header>

      {/* Placeholder notice */}
      {isPlaceholder && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Este agente é um <strong>rascunho / placeholder</strong>. O conteúdo estruturado será
          preenchido em fases futuras. Ele aparece no quadro porque faz parte da arquitetura
          planejada do Build OS.
        </div>
      )}

      {/* Waiter identity callout — the flagship agent */}
      {isWaiter && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-5">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-orange-700">
            Garçom digital e agente de vendas
          </h2>
          <p className="mb-3 text-sm leading-relaxed text-gray-800">
            Funcionário de IA que opera <strong>dentro da interface do restaurante</strong> (a tela
            de pedido é o salão; o cardápio são os produtos; o carrinho é a comanda; o checkout é o
            caixa). Atua como um bom garçom/vendedor — <strong>não é um chatbot</strong> e{" "}
            <strong>não é um bot de palavra-chave</strong>.
          </p>
          <ul className="grid grid-cols-1 gap-1.5 text-sm text-gray-800 sm:grid-cols-2">
            {[
              "Lê dados reais do cardápio (inventário de vendas)",
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
        </div>
      )}

      {/* Identity / description */}
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

      {/* Extended sections (agent-specific rich content, e.g. Waiter) */}
      <ExtendedSections sections={agent.extendedSections} />

      {/* Runtime status footer */}
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

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="font-medium text-gray-900">{value}</dd>
    </div>
  );
}

// ── Extended sections renderer ──────────────────────────────────────────────────

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
