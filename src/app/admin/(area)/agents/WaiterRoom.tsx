/**
 * WaiterRoom — the Agent Room (sala do agente) for the Waiter.
 *
 * v1.3 — Documental merge with the real runtime. The Room mirrors the REAL
 * Waiter that ships today (engines, constitution, prompt, orchestrator, /pedido,
 * Test Center, Library) using the structured, read-only map in
 * `@/services/agents/waiterRuntimeMap`. It is a documentation overlay: it does
 * NOT import or change any runtime code, and KPIs stay honest placeholders.
 *
 * Tabs: Dashboard · Perfil · Operação · Brain & Skills · Library · Runtime &
 * Testes · Governança.
 */

"use client";

import Link from "next/link";
import { useState } from "react";
import type { AdminAgentProfileView } from "@/services/agents/types";
import { AgentLibraryPanel } from "./AgentLibraryPanel";
import { WaiterRuntimeCockpit } from "./WaiterRuntimeCockpit";
import {
  WAITER_RUNTIME_COMPONENTS,
  WAITER_RUNTIME_SERVICES,
  WAITER_RUNTIME_FLOWS,
  WAITER_RUNTIME_RULES,
  WAITER_RUNTIME_TEST_GROUPS,
  WAITER_RUNTIME_GAPS,
  componentsForTab,
  runtimeMergeSummary,
  INTELLIGENCE_LABELS,
  PRODUCTION_LABELS,
  RISK_LABELS,
  CURRENT_STATUS_LABELS,
  MERGE_STATUS_LABELS,
  type WaiterTab as Tab,
  type WaiterRuntimeComponent,
  type RiskLevel,
  type MergeStatus,
  type ProductionStatus,
  type CurrentStatus,
} from "@/services/agents/waiterRuntimeMap";
import {
  WAITER_TEST_COVERAGE,
  WAITER_EVAL_CRITERIA,
  WAITER_TOMORROW_PLAN,
  WAITER_RELEASE_STATUS,
  COVERAGE_LABELS,
  backlogByPriority,
  coverageSummary,
  backlogSummary,
  type CoverageStatus,
  type BacklogPriority,
} from "@/services/agents/waiterIntelligenceBacklog";

// ── small presentational helpers (room-local) ──────────────────────────────────

function RoomCard({
  title,
  hint,
  badge,
  children,
}: {
  title: string;
  hint?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-900">{title}</h3>
          {hint && <p className="text-xs text-gray-500">{hint}</p>}
        </div>
        {badge}
      </div>
      {children}
    </section>
  );
}

type Tone = "gray" | "green" | "blue" | "amber" | "violet" | "red";

function Pill({ children, tone = "gray" }: { children: React.ReactNode; tone?: Tone }) {
  const cls: Record<Tone, string> = {
    gray: "bg-gray-100 text-gray-600",
    green: "bg-green-50 text-green-700",
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    violet: "bg-violet-50 text-violet-700",
    red: "bg-red-50 text-red-700",
  };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cls[tone]}`}>{children}</span>;
}

function Checks({ items, mark = "•", color = "text-gray-400" }: { items: readonly string[]; mark?: string; color?: string }) {
  return (
    <ul className="grid grid-cols-1 gap-1 text-sm text-gray-800 sm:grid-cols-2">
      {items.map((it) => (
        <li key={it} className="flex gap-2">
          <span className={`mt-0.5 ${color}`}>{mark}</span>
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

/** Performance KPI tile — honest placeholder, never a fake number. */
function KpiCard({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-xl font-bold text-gray-300">—</p>
      <p className="mt-0.5 text-[10px] font-semibold text-amber-600">Aguardando tracking</p>
      {hint && <p className="mt-0.5 text-[10px] text-gray-400">{hint}</p>}
    </div>
  );
}

// ── tone helpers for the runtime-map enums ──────────────────────────────────────

function riskTone(r: RiskLevel): Tone {
  return r === "HIGH" ? "red" : r === "MEDIUM" ? "amber" : "green";
}
function mergeTone(m: MergeStatus): Tone {
  return m === "MIRRORED" ? "green" : m === "NEEDS_REVIEW" ? "amber" : m === "FUTURE" ? "violet" : "gray";
}
function prodTone(p: ProductionStatus): Tone {
  return p === "PRODUCTION" ? "green" : p === "ADMIN_TOOL" ? "blue" : "gray";
}
function currentTone(c: CurrentStatus): Tone {
  return c === "ACTIVE" ? "green" : c === "LEGACY" ? "gray" : c === "HARDCODED" ? "amber" : "violet";
}
function coverageTone(s: CoverageStatus): Tone {
  return s === "AUTOMATED" ? "green" : s === "PARTIAL" ? "amber" : s === "MANUAL" ? "blue" : "red";
}
function priorityTone(p: BacklogPriority): Tone {
  return p === "P0" ? "red" : p === "P1" ? "amber" : "violet";
}

/** Mirror card for one real runtime component. */
function ComponentCard({ c }: { c: WaiterRuntimeComponent }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900">{c.title}</p>
          <p className="truncate font-mono text-[10px] text-gray-400">{c.filePath}</p>
        </div>
        <Pill tone={mergeTone(c.mergeStatus)}>{MERGE_STATUS_LABELS[c.mergeStatus]}</Pill>
      </div>
      <p className="mt-1.5 text-sm leading-snug text-gray-700">{c.description}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Pill tone={prodTone(c.productionStatus)}>{PRODUCTION_LABELS[c.productionStatus]}</Pill>
        <Pill tone="violet">{INTELLIGENCE_LABELS[c.intelligenceType]}</Pill>
        {c.sourceOfTruth && <Pill tone="blue">Fonte da verdade</Pill>}
        <Pill tone={riskTone(c.riskLevel)}>Risco: {RISK_LABELS[c.riskLevel]}</Pill>
        <Pill tone={currentTone(c.currentStatus)}>{CURRENT_STATUS_LABELS[c.currentStatus]}</Pill>
      </div>
    </div>
  );
}

const TABS: readonly Tab[] = [
  "Dashboard",
  "Perfil",
  "Operação",
  "Brain & Skills",
  "Library",
  "Runtime & Testes",
  "Runtime Merge",
  "Governança",
];

// ── room ────────────────────────────────────────────────────────────────────────

export function WaiterRoom({ agent }: { agent: AdminAgentProfileView }) {
  const active = agent.status === "ACTIVE";
  const [tab, setTab] = useState<Tab>("Dashboard");

  const summary = runtimeMergeSummary();
  const allRows = [...WAITER_RUNTIME_COMPONENTS, ...WAITER_RUNTIME_SERVICES];

  return (
    <div className="space-y-4">
      {/* read-only banner */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-[11px] text-gray-600">
        🔒 Sala do agente <strong>read-only</strong>: este é o <strong>espelho documental</strong> do Waiter que roda hoje —
        não lê, importa nem altera código de produção. O Waiter atual continua funcionando como fallback.
      </div>

      {/* compact header — always visible */}
      <section className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Waiter Agent</h1>
            <p className="text-xs text-gray-700">Garçom vendedor de IA · Local de trabalho: <span className="font-mono">/pedido</span></p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Pill tone="blue">Produto / Runtime</Pill>
            <Pill tone={active ? "green" : "gray"}>{active ? "Ativo no registry" : agent.status}</Pill>
            <Pill tone="amber">Waiter {WAITER_RELEASE_STATUS.version} · {WAITER_RELEASE_STATUS.label}</Pill>
            <Pill tone="gray">Runtime DB: desligado</Pill>
          </div>
        </div>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-700">
          {WAITER_RELEASE_STATUS.notes.map((n) => (
            <li key={n} className="flex gap-1"><span className="text-orange-500">•</span><span>{n}</span></li>
          ))}
        </ul>
      </section>

      {/* tab navigation */}
      <nav className="flex flex-wrap gap-1 rounded-xl border border-gray-200 bg-white p-1">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              tab === t ? "bg-orange-600 text-white" : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {t}
          </button>
        ))}
      </nav>

      {/* ── Dashboard ───────────────────────────────────────────────────────── */}
      {tab === "Dashboard" && (
        <div className="space-y-4">
          <RoomCard title="Visão executiva" hint="Quem é, onde trabalha e atalhos rápidos.">
            <p className="max-w-3xl text-sm leading-relaxed text-gray-700">
              Garçom digital e especialista de vendas dentro da interface Foocci: <strong>entende a intenção real</strong> do
              cliente, recomenda apenas produtos reais em cards e <strong>conduz a venda com baixa fricção</strong> até a
              finalização.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/admin/agentes/waiter/testes" className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-700">
                🧠 Abrir Test Center
              </Link>
              <Link href="/admin/build-os" className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-800 hover:bg-gray-50">
                🛠️ Build OS
              </Link>
              <Link href="/admin/manual-operacional" className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-800 hover:bg-gray-50">
                📖 Manual Operacional
              </Link>
            </div>
          </RoomCard>

          <RoomCard title="Estado real do Waiter atual" hint="O que roda hoje, espelhado do código." badge={<Pill tone="green">{summary.mirrored}/{summary.total} espelhados</Pill>}>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Motor atual", value: "WaiterBrainV2 / AIOrderService", status: "Ativo no runtime atual", tone: "green" as Tone },
                { label: "Constituição", value: "WaiterAgentProfile", status: "Espelhada · fonte da verdade", tone: "blue" as Tone },
                { label: "Prompt / catálogo", value: "PromptBuilderService", status: "Catálogo real injetado", tone: "green" as Tone },
                { label: "UI onde atua", value: "/pedido", status: "Em produção", tone: "green" as Tone },
                { label: "Test Center", value: "Waiter Test Center", status: "Disponível", tone: "blue" as Tone },
                { label: "Library", value: "Agent Library", status: "Formação · fora do runtime", tone: "amber" as Tone },
                { label: "Status de merge", value: "Espelho documental", status: `${summary.mirrored}/${summary.total} peças`, tone: "green" as Tone },
                { label: "Risco atual", value: "Runtime sensível", status: "Sala 100% read-only", tone: "amber" as Tone },
              ].map((k) => (
                <div key={k.label} className="rounded-lg border border-gray-200 bg-white p-3">
                  <p className="text-[11px] uppercase tracking-wide text-gray-400">{k.label}</p>
                  <p className="text-sm font-bold text-gray-900">{k.value}</p>
                  <p className="mt-1"><Pill tone={k.tone}>{k.status}</Pill></p>
                </div>
              ))}
            </div>
          </RoomCard>

          <RoomCard title="Próximos passos para ativação" hint="Caminho seguro até evoluir o Waiter sem perder o que funciona.">
            <ul className="space-y-1 text-sm text-gray-700">
              {[
                "Concluir o merge documental (esta sala espelha o Waiter real).",
                "Validar o Waiter Test Center (rodar a suíte e revisar resultados).",
                "Testar com restaurante fechado (sem impacto em clientes reais).",
                "Definir uma flag de ativação futura (por restaurante).",
                "Manter o Waiter atual como fallback durante toda a transição.",
              ].map((s) => (
                <li key={s} className="flex gap-2"><span className="mt-0.5 text-gray-400">☐</span><span>{s}</span></li>
              ))}
            </ul>
          </RoomCard>

          <RoomCard title="KPIs de performance" hint="O que o Waiter entrega em vendas e experiência." badge={<Pill tone="amber">Métricas reais — em breve</Pill>}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <KpiCard label="Conversão assistida" hint="pedidos / sessões conduzidas" />
              <KpiCard label="Ticket médio influenciado" hint="R$ por pedido conduzido" />
              <KpiCard label="Incremental de upsell" hint="% de pedidos com add-on" />
              <KpiCard label="Aceite de bebida" hint="% que aceita a bebida" />
              <KpiCard label="Aceite de sobremesa" hint="% que aceita a sobremesa" />
              <KpiCard label="Pedidos conduzidos" hint="volume total atendido" />
              <KpiCard label="Abandono reduzido" hint="queda no abandono de carrinho" />
              <KpiCard label="Score de testes" hint="Waiter Test Center" />
            </div>
            <p className="mt-2.5 text-[11px] text-gray-400">
              Os tiles exibem dados reais quando a telemetria for conectada — nesta fase seguem como <em>aguardando
              tracking</em> (nenhum número inventado).
            </p>
          </RoomCard>
        </div>
      )}

      {/* ── Perfil ──────────────────────────────────────────────────────────── */}
      {tab === "Perfil" && (
        <div className="space-y-4">
          <RoomCard title="Perfil do agente" hint="Síntese visual da constituição (WaiterAgentProfile).">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm text-gray-800 sm:grid-cols-2 lg:grid-cols-3">
              <div><dt className="text-[11px] uppercase tracking-wide text-gray-400">Cargo</dt><dd className="font-medium">Garçom vendedor de IA</dd></div>
              <div><dt className="text-[11px] uppercase tracking-wide text-gray-400">Departamento</dt><dd className="font-medium">Produto / Runtime</dd></div>
              <div><dt className="text-[11px] uppercase tracking-wide text-gray-400">Local de trabalho</dt><dd className="font-mono font-medium">/pedido</dd></div>
              <div><dt className="text-[11px] uppercase tracking-wide text-gray-400">Público atendido</dt><dd className="font-medium">Cliente final do restaurante</dd></div>
              <div><dt className="text-[11px] uppercase tracking-wide text-gray-400">Status</dt><dd className="font-medium">{active ? "Ativo no registry" : agent.status}</dd></div>
              <div><dt className="text-[11px] uppercase tracking-wide text-gray-400">Constituição</dt><dd className="font-mono font-medium">WaiterAgentProfile.ts</dd></div>
            </dl>
            <p className="mt-3 mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Missão</p>
            <p className="text-sm leading-relaxed text-gray-700">
              Aumentar conversão e ticket médio conduzindo o pedido com baixa fricção, recomendando apenas produtos reais
              do cardápio e melhorando a experiência do cliente até a finalização.
            </p>
            <p className="mt-3 mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Relação com cardápio e vendas</p>
            <p className="text-sm leading-relaxed text-gray-700">
              A tela de pedido é o salão, o cardápio é o inventário, o carrinho é a comanda e o checkout é o caixa. Lê o
              cardápio como inventário de vendas e usa bebida/sobremesa como oportunidade comercial contextual.
            </p>
            <p className="mt-2 text-[11px] text-gray-400">Síntese visual — a fonte da verdade é <span className="font-mono">WaiterAgentProfile.ts</span> (evita duplicidade).</p>
          </RoomCard>

          <RoomCard title="Escopo &amp; não confundir" hint="Onde o Waiter atua — e o que ele não é.">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-green-700">Escopo</p>
            <Checks mark="✓" color="text-green-600" items={["Atende em /pedido/[slug]", "Cliente final do restaurante", "Cards, botões e categorias", "Condução até a revisão do pedido"]} />
            <div className="mt-3 rounded-lg bg-gray-50 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Não confundir</p>
              <div className="flex flex-wrap gap-1.5">
                <Pill tone="gray">Waiter ≠ WhatsApp Agent</Pill>
                <Pill tone="gray">Waiter ≠ CRM Agent</Pill>
              </div>
            </div>
          </RoomCard>

          <RoomCard title="Constituição no runtime" hint="A peça real que define a identidade.">
            <div className="grid grid-cols-1 gap-2.5">
              {componentsForTab("Perfil").map((c) => <ComponentCard key={c.filePath + c.title} c={c} />)}
            </div>
          </RoomCard>
        </div>
      )}

      {/* ── Operação ────────────────────────────────────────────────────────── */}
      {tab === "Operação" && (
        <div className="space-y-4">
          <RoomCard title="Como o Waiter trabalha hoje" hint="Do primeiro contato à conclusão do pedido.">
            <div className="flex flex-wrap gap-1.5 text-xs">
              {WAITER_RUNTIME_FLOWS.map((step, i) => (
                <span key={step} className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2 py-0.5 text-gray-700 ring-1 ring-gray-200">
                  <span className="font-bold text-orange-600">{i + 1}</span> {step}
                </span>
              ))}
            </div>
            <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-gray-500">Responsabilidades · como conduz</p>
            <ol className="space-y-1.5 text-sm text-gray-800">
              {[
                "Lê a intenção real do cliente (grupo, leve, orçamento, porção…).",
                "Faz no máximo UMA pergunta de qualificação quando falta contexto.",
                "Recomenda produtos reais do cardápio em cards (nunca lista em texto).",
                "Conduz a escolha e apoia variantes / opções / adicionais.",
                "Oferece bebida e sobremesa de forma contextual — uma vez, sem insistir.",
                "Conduz para a revisão com um próximo passo claro até a finalização.",
              ].map((s, i) => (
                <li key={s} className="flex gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-100 text-[11px] font-bold text-orange-700">{i + 1}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          </RoomCard>

          <RoomCard title="Serviços envolvidos" hint="Orquestrador, UI e APIs reais do fluxo do pedido.">
            <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
              {componentsForTab("Operação").map((c) => <ComponentCard key={c.filePath + c.title} c={c} />)}
            </div>
          </RoomCard>
        </div>
      )}

      {/* ── Brain & Skills ──────────────────────────────────────────────────── */}
      {tab === "Brain & Skills" && (
        <div className="space-y-4">
          <RoomCard title="Motor de decisão atual" hint="A inteligência real — determinística; o LLM só redige texto curto.">
            <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
              {componentsForTab("Brain & Skills").map((c) => <ComponentCard key={c.filePath + c.title} c={c} />)}
            </div>
            <p className="mt-2 text-[11px] text-gray-400">
              Dois caminhos: <strong>WaiterBrainV2</strong> no web <span className="font-mono">/pedido</span> e
              <strong> WaiterBrain v1</strong> no WhatsApp. Interpreta intenção, casa com o cardápio (resolveMenuIntent),
              recomenda, conduz o pedido e faz upsell de forma determinística.
            </p>
          </RoomCard>

          <RoomCard title="Skills · habilidades operacionais">
            <Checks mark="✓" color="text-green-600" items={["Leitura de intenção", "Recomendação de produto", "Upsell contextual", "Condução de pedido", "Leitura de cardápio", "Restrições alimentares", "Fechamento comercial", "Uso de cards visuais"]} />
          </RoomCard>

          <RoomCard title="Regras operacionais já existentes" badge={<Pill tone="green">Boas práticas</Pill>} hint="Comportamento positivo que o Waiter já segue hoje.">
            <Checks mark="✓" color="text-green-600" items={WAITER_RUNTIME_RULES} />
          </RoomCard>
        </div>
      )}

      {/* ── Library — live workbench + backlog ──────────────────────────────── */}
      {tab === "Library" && (
        <div className="space-y-4">
          <AgentLibraryPanel agentSlug="waiter" />
          <RoomCard title="Backlog da Library" hint="Evolução futura — não conectada ao runtime nesta fase." badge={<Pill tone="violet">Futuro</Pill>}>
            <Checks
              mark="→"
              color="text-violet-500"
              items={[
                "Processamento do livro completo por chunks",
                "Leitura automática completa + síntese profunda",
                "Extração do suprassumo (o essencial de cada obra)",
                "Gavetas por obra + status de curadoria",
                "Possível compartilhamento futuro entre agentes",
                "Conexão ao runtime só com flag, testes e versionamento",
              ]}
            />
          </RoomCard>
        </div>
      )}

      {/* ── Runtime Merge — REAL cockpit (live APIs, not documentation) ──────── */}
      {tab === "Runtime Merge" && <WaiterRuntimeCockpit />}

      {/* ── Runtime & Testes ────────────────────────────────────────────────── */}
      {tab === "Runtime & Testes" && (
        <div className="space-y-4">
          <RoomCard title="Componentes reais do runtime" hint="Cada peça do Waiter que roda hoje (read-only)." badge={<Pill tone="green">{allRows.length} itens</Pill>}>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-200 text-[10px] uppercase tracking-wide text-gray-400">
                    <th className="py-1.5 pr-3 font-semibold">Componente / arquivo</th>
                    <th className="px-2 font-semibold">Prod</th>
                    <th className="px-2 font-semibold">Tipo</th>
                    <th className="px-2 font-semibold">Risco</th>
                    <th className="pl-2 font-semibold">Merge</th>
                  </tr>
                </thead>
                <tbody>
                  {allRows.map((c) => (
                    <tr key={c.filePath + c.title} className="border-b border-gray-100 align-top">
                      <td className="py-1.5 pr-3">
                        <p className="font-semibold text-gray-900">{c.title}</p>
                        <p className="font-mono text-[10px] text-gray-400">{c.filePath}</p>
                      </td>
                      <td className="px-2 text-gray-700">{PRODUCTION_LABELS[c.productionStatus]}</td>
                      <td className="px-2 text-gray-700">{INTELLIGENCE_LABELS[c.intelligenceType]}</td>
                      <td className="px-2"><span className={c.riskLevel === "HIGH" ? "font-semibold text-red-600" : c.riskLevel === "MEDIUM" ? "text-amber-600" : "text-green-600"}>{RISK_LABELS[c.riskLevel]}</span></td>
                      <td className="pl-2 text-gray-700">{MERGE_STATUS_LABELS[c.mergeStatus]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </RoomCard>

          <RoomCard
            title="Test Center"
            hint="Suíte determinística (sem OpenAI, sem gravação)."
            badge={
              <Link href="/admin/agentes/waiter/testes" className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700">
                Abrir Waiter Test Center →
              </Link>
            }
          >
            <div className="space-y-1">
              {WAITER_RUNTIME_TEST_GROUPS.map((g) => (
                <div key={g.id} className="flex flex-wrap items-baseline gap-2 border-b border-gray-100 pb-1 text-xs last:border-0">
                  <Pill tone="gray">{g.label}</Pill>
                  <span className="text-gray-600">{g.validates}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Score recente não carregado nesta tela — rode no Waiter Test Center. Falta cobrir: telemetria real e
              cenários por restaurante específico.
            </p>
          </RoomCard>

          <RoomCard
            title="Plano de teste de amanhã"
            hint="Cobertura por cenário crítico + ordem de teste manual."
            badge={(() => { const s = coverageSummary(); return <Pill tone="green">{s.automated} auto · {s.partial} parcial · {s.manual + s.gap} manual</Pill>; })()}
          >
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
              ⚠️ Teste com <strong>restaurante fechado</strong> antes de ativar qualquer mudança. KPIs/score reais ainda
              não têm telemetria nesta tela.
            </div>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {WAITER_TEST_COVERAGE.map((c) => (
                <div key={c.id} className="flex items-baseline gap-2 border-b border-gray-100 pb-1 text-xs last:border-0">
                  <Pill tone={coverageTone(c.status)}>{COVERAGE_LABELS[c.status]}</Pill>
                  <span className="font-medium text-gray-800">{c.label}</span>
                </div>
              ))}
            </div>
            <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-gray-500">Amanhã testar nesta ordem</p>
            <ol className="grid grid-cols-1 gap-1 text-sm text-gray-800 sm:grid-cols-2">
              {WAITER_TOMORROW_PLAN.map((s, i) => (
                <li key={s} className="flex gap-2"><span className="text-gray-400">☐</span><span><span className="font-semibold text-gray-500">{i + 1}.</span> {s}</span></li>
              ))}
            </ol>
          </RoomCard>

          <RoomCard title="Critérios de avaliação" hint="O que é medido automaticamente vs. validação manual.">
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {WAITER_EVAL_CRITERIA.map((c) => (
                <div key={c.label} className="flex items-baseline gap-2 text-xs">
                  <Pill tone={c.automated ? "green" : "blue"}>{c.automated ? "Auto" : "Manual"}</Pill>
                  <span className="text-gray-700">{c.label}</span>
                </div>
              ))}
            </div>
          </RoomCard>
        </div>
      )}

      {/* ── Governança ──────────────────────────────────────────────────────── */}
      {tab === "Governança" && (
        <div className="space-y-4">
          <RoomCard title="Mapa de risco do merge" hint="O que é seguro agora e o que exige cuidado." >
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-green-700">Pode espelhar/documentar agora</p>
                <Checks mark="✓" color="text-green-600" items={["Constituição (visual)", "Mapa de componentes", "Fluxo do pedido", "Grupos de teste"]} />
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-violet-700">Pode virar configuração depois</p>
                <Checks mark="→" color="text-violet-500" items={["Seções da constituição via DB", "Parâmetros de venda por restaurante", "Perfil versionado (origin=db)"]} />
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700">Só entra no runtime com flag</p>
                <Checks mark="•" color="text-amber-500" items={["Library influenciando o prompt", "Constituição editável lida pelo runtime", "Mudança de comportamento de venda"]} />
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-red-700">Não mexer sem teste / precisa rollback</p>
                <Checks mark="•" color="text-red-500" items={["WaiterBrainV2 / AIOrderService", "PromptBuilderService", "/pedido e APIs do pedido", "Checkout / pagamento"]} />
              </div>
            </div>
            <p className="mb-2 mt-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Lacunas conhecidas (merge)</p>
            <div className="space-y-1">
              {WAITER_RUNTIME_GAPS.map((g) => (
                <div key={g.title} className="flex flex-wrap items-baseline gap-2 text-xs">
                  <Pill tone={mergeTone(g.mergeStatus)}>{MERGE_STATUS_LABELS[g.mergeStatus]}</Pill>
                  <span className="font-medium text-gray-800">{g.title}:</span>
                  <span className="text-gray-600">{g.detail}</span>
                </div>
              ))}
            </div>
          </RoomCard>

          <RoomCard
            title="Backlog de inteligência"
            hint="Correções e evoluções priorizadas (P0 antes de uso real)."
            badge={(() => { const s = backlogSummary(); return <Pill tone="red">{s.p0} P0 · {s.p1} P1 · {s.p2} P2</Pill>; })()}
          >
            {(["P0", "P1", "P2"] as BacklogPriority[]).map((p) => (
              <div key={p} className="mb-3 last:mb-0">
                <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <Pill tone={priorityTone(p)}>{p}</Pill>
                  {p === "P0" ? "Antes de uso real" : p === "P1" ? "Melhora comercial" : "Evolução"}
                </p>
                <ul className="space-y-1">
                  {backlogByPriority(p).map((b) => (
                    <li key={b.id} className="rounded-lg border border-gray-200 bg-white p-2 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-gray-900">{b.title}</span>
                        <Pill tone={b.risk === "HIGH" ? "red" : b.risk === "MEDIUM" ? "amber" : "green"}>Risco {b.risk}</Pill>
                        <span className="ml-auto text-[10px] text-gray-400">{b.phase}</span>
                      </div>
                      <p className="mt-0.5 text-gray-600">{b.problem}</p>
                      <p className="mt-0.5 text-gray-500"><span className="font-semibold">Próximo passo:</span> {b.nextStep}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </RoomCard>

          <RoomCard title="Plano de migração futura" hint="Fases controladas — o Waiter atual segue como fallback.">
            <ol className="space-y-1.5 text-sm text-gray-800">
              {[
                ["Fase 1 — Espelho documental", "A Room mostra o Waiter real. (atual)"],
                ["Fase 2 — Test Center cobre comportamento", "Testes validam cada regra."],
                ["Fase 3 — Configurações editáveis versionadas", "AgentProfileVersion / rollback."],
                ["Fase 4 — Runtime lê configurações aprovadas", "Flag por restaurante."],
                ["Fase 5 — Library influencia runtime", "Só técnicas ativas, testadas e versionadas."],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-bold text-gray-600">{i + 1}</span>
                  <span><strong>{t}</strong> — {d}</span>
                </li>
              ))}
            </ol>
          </RoomCard>

          <RoomCard title="Rollback" badge={<Pill tone="green">Fallback garantido</Pill>}>
            <p className="text-sm leading-relaxed text-gray-700">
              O Waiter atual (WaiterBrainV2 + AIOrderService + WaiterAgentProfile) <strong>permanece como fallback</strong> até
              a migração controlada. Nenhuma mudança de comportamento entra sem flag, testes e versionamento — e qualquer
              ativação futura pode ser revertida voltando ao perfil/código atual. <span className="font-mono">isRuntimeEnabled</span> permanece desligado.
            </p>
          </RoomCard>

          <RoomCard title="Atuação segura" badge={<Pill tone="green">Boas práticas</Pill>} hint="Como ele protege o cliente e o restaurante.">
            <Checks
              mark="✓"
              color="text-green-600"
              items={[
                "Recomenda sempre produtos reais do cardápio",
                "Usa apenas os preços oficiais do cardápio",
                "Só menciona promoções que existem de fato",
                "Respeita alergias e restrições alimentares",
                "Conduz à confirmação antes de finalizar o pedido",
                "Deixa pagamento e entrega com a interface",
              ]}
            />
          </RoomCard>
        </div>
      )}
    </div>
  );
}
