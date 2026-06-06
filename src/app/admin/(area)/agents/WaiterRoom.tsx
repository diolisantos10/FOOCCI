/**
 * WaiterRoom — the Agent Room (sala do agente) for the Waiter, the template for
 * every other agent. READ-ONLY: an operational dashboard of the agent like the
 * department of an AI employee, organized into internal tabs (no new routes).
 *
 * v1.3 — Documental merge with the real runtime. Each real Waiter piece
 * (constitution, brains, prompt builder, orchestrator, /pedido, APIs, Test
 * Center, library) is MIRRORED here with metadata: role, in-production?,
 * deterministic vs LLM, source-of-truth?, risk of touching, status. This is a
 * documentation overlay — it does NOT read, import, or change any runtime code.
 *
 * Tabs: Dashboard · Perfil · Operação · Brain & Skills · Library · Runtime &
 * Testes · Governança.
 *
 * Data sources:
 *   • Live registry facts from `agent` (AdminAgentProfileView, derived from the
 *     code constitution src/services/ai/waiter/WaiterAgentProfile.ts): status,
 *     version, isRuntimeEnabled, origin.
 *   • RUNTIME_MAP below: a static, audited description of the real architecture
 *     (file paths + traits). Strings only — no runtime import.
 *
 * Strictly read-only: no editor, no DB writes, no runtime change. Nothing here
 * touches WaiterBrain/WaiterBrainV2/PromptBuilderService/AIOrderService/`/pedido`.
 * KPIs show honest placeholders ("Aguardando tracking") — no invented numbers.
 */

"use client";

import Link from "next/link";
import { useState } from "react";
import type { AdminAgentProfileView } from "@/services/agents/types";
import { WAITER_LIBRARY, WAITER_LIBRARY_CATEGORIES } from "./waiterLibrary";

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

function Checks({ items, mark = "•", color = "text-gray-400" }: { items: string[]; mark?: string; color?: string }) {
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

// ── runtime architecture map (static documentation overlay) ─────────────────────

const TABS = [
  "Dashboard",
  "Perfil",
  "Operação",
  "Brain & Skills",
  "Library",
  "Runtime & Testes",
  "Governança",
] as const;
type Tab = (typeof TABS)[number];

type Kind = "Determinístico" | "LLM" | "Misto" | "UI" | "Dados";
type Risk = "Alto" | "Médio" | "Baixo";
type Truth = "Sim" | "Não" | "Parcial";
type PieceStatus = "Ativo" | "Legado" | "Planejado" | "Futuro editável";

interface RuntimePiece {
  name: string;
  file: string;
  /** Primary home tab for the detailed card. */
  tab: Tab;
  role: string;
  prod: boolean;
  kind: Kind;
  truth: Truth;
  risk: Risk;
  status: PieceStatus;
}

/**
 * Audited snapshot of the real Waiter architecture. Strings only — this array
 * never imports or executes runtime code. Keep in sync manually with the audit.
 */
const RUNTIME_MAP: readonly RuntimePiece[] = [
  {
    name: "WaiterAgentProfile.ts",
    file: "src/services/ai/waiter/WaiterAgentProfile.ts",
    tab: "Perfil",
    role: "Constituição do agente: identidade, missão, responsabilidades, skills, princípios de venda, regras de cardápio e exemplos. buildWaiterProfileDirective() compila tudo num bloco compacto de prompt.",
    prod: true,
    kind: "Determinístico",
    truth: "Sim",
    risk: "Alto",
    status: "Futuro editável",
  },
  {
    name: "WaiterBrainV2",
    file: "src/services/ai/WaiterBrainV2.ts",
    tab: "Brain & Skills",
    role: "Motor event-driven do web /pedido. Reage a eventos da UI (ON_ENTRY, ON_ITEM_ADDED, ON_CART_UPDATED…) e retorna { message, cards }. Produtos sempre via cards, nunca em texto.",
    prod: true,
    kind: "Determinístico",
    truth: "Sim",
    risk: "Alto",
    status: "Ativo",
  },
  {
    name: "WaiterBrain (v1)",
    file: "src/services/ai/WaiterBrain.ts",
    tab: "Brain & Skills",
    role: "Camada de decisão por intenção do caminho WhatsApp (AIOrderService.processTurn). Funções puras que produzem um directive injetado no prompt.",
    prod: true,
    kind: "Determinístico",
    truth: "Parcial",
    risk: "Alto",
    status: "Ativo",
  },
  {
    name: "PromptBuilderService",
    file: "src/services/ai/PromptBuilderService.ts",
    tab: "Runtime & Testes",
    role: "Monta o array de mensagens OpenAI: identidade/marca, cardápio real com IDs e preços (âncora anti-alucinação), draft do pedido, perfil do cliente e regras de segurança.",
    prod: true,
    kind: "Determinístico",
    truth: "Parcial",
    risk: "Alto",
    status: "Ativo",
  },
  {
    name: "AIOrderService",
    file: "src/services/ai/AIOrderService.ts",
    tab: "Operação",
    role: "Orquestrador do turno: runWebTurn (web /pedido) e processTurn (WhatsApp). Injeta a constituição + diretivas, executa tool-calls (máx. 6), faz fallback/handoff e loga.",
    prod: true,
    kind: "Misto",
    truth: "Não",
    risk: "Alto",
    status: "Ativo",
  },
  {
    name: "/pedido (UI)",
    file: "src/app/pedido/[slug]/PedidoClient.tsx",
    tab: "Operação",
    role: "A interface do cliente — o salão onde o Waiter trabalha. Cards, carrinho, variantes, adicionais e revisão; emite eventos para a API. Checkout/pagamento são da UI.",
    prod: true,
    kind: "UI",
    truth: "Não",
    risk: "Alto",
    status: "Ativo",
  },
  {
    name: "APIs do pedido",
    file: "src/app/api/pedido/[slug]/route.ts",
    tab: "Operação",
    role: "POST /api/pedido/[slug] aciona runWebTurn (coração do runtime web). Sub-rotas: draft, finalize, delivery-quote, validate-coupon, identify-customer, repeat-order, payment-status, pix-payment.",
    prod: true,
    kind: "Determinístico",
    truth: "Não",
    risk: "Alto",
    status: "Ativo",
  },
  {
    name: "Waiter Test Center",
    file: "src/app/api/admin/ai/waiter-tests/run/route.ts",
    tab: "Runtime & Testes",
    role: "Suíte determinística contra o catálogo real (waiterScenarios + waiterEvaluator). Sem OpenAI, sem gravar no banco, sem WhatsApp. Gera score de qualidade.",
    prod: true,
    kind: "Determinístico",
    truth: "Sim",
    risk: "Baixo",
    status: "Ativo",
  },
  {
    name: "waiterLibrary.ts",
    file: "src/app/admin/(area)/agents/waiterLibrary.ts",
    tab: "Library",
    role: "Dados curados de formação técnica (gavetas + técnicas). Data-only do admin: NÃO é lido pelo runtime e não altera nenhum prompt.",
    prod: false,
    kind: "Dados",
    truth: "Não",
    risk: "Baixo",
    status: "Planejado",
  },
];

/** Supporting runtime modules that the orchestrator depends on (read-only note). */
const RUNTIME_DEPS: readonly string[] = [
  "AITools (definições + executor de tools)",
  "UpsellEngine (candidatos de upsell)",
  "ConversationGuardrails (limites de bebida/sobremesa)",
  "BehaviorEngine (tokens / blocos de comportamento)",
  "SalesProfile (perfil de venda)",
  "bestSellers (ordenação por mais vendidos)",
  "BrandConfigService (RestaurantBrandConfig)",
];

function riskTone(r: Risk): Tone {
  return r === "Alto" ? "red" : r === "Médio" ? "amber" : "green";
}
function statusTone(s: PieceStatus): Tone {
  return s === "Ativo" ? "green" : s === "Legado" ? "gray" : s === "Planejado" ? "amber" : "violet";
}
function truthTone(t: Truth): Tone {
  return t === "Sim" ? "blue" : t === "Parcial" ? "amber" : "gray";
}

/** Detailed mirror card for one real runtime piece. */
function PieceCard({ p }: { p: RuntimePiece }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900">{p.name}</p>
          <p className="truncate font-mono text-[10px] text-gray-400">{p.file}</p>
        </div>
        <Pill tone={statusTone(p.status)}>{p.status}</Pill>
      </div>
      <p className="mt-1.5 text-sm leading-snug text-gray-700">{p.role}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Pill tone={p.prod ? "green" : "gray"}>{p.prod ? "Em produção" : "Fora do runtime"}</Pill>
        <Pill tone="violet">{p.kind}</Pill>
        <Pill tone={truthTone(p.truth)}>Fonte da verdade: {p.truth}</Pill>
        <Pill tone={riskTone(p.risk)}>Risco: {p.risk}</Pill>
      </div>
    </div>
  );
}

function piecesFor(tab: Tab): RuntimePiece[] {
  return RUNTIME_MAP.filter((p) => p.tab === tab);
}

// ── room ────────────────────────────────────────────────────────────────────────

export function WaiterRoom({ agent }: { agent: AdminAgentProfileView }) {
  const active = agent.status === "ACTIVE";
  const [tab, setTab] = useState<Tab>("Dashboard");

  const inProd = RUNTIME_MAP.filter((p) => p.prod).length;
  const truthPieces = RUNTIME_MAP.filter((p) => p.truth === "Sim").length;

  return (
    <div className="space-y-4">
      {/* read-only banner */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-[11px] text-gray-600">
        🔒 Sala do agente <strong>read-only</strong> nesta fase: este é um <strong>espelho documental</strong> do runtime
        real — não lê, importa nem altera código de produção. KPIs exibem dados reais só quando a telemetria for
        conectada (sem números fictícios).
      </div>

      {/* compact header — always visible across tabs */}
      <section className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Waiter Agent</h1>
            <p className="text-xs text-gray-700">Garçom vendedor de IA · Local de trabalho: <span className="font-mono">/pedido</span></p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Pill tone="blue">Produto / Runtime</Pill>
            <Pill tone={active ? "green" : "gray"}>{active ? "Ativo no registry" : agent.status}</Pill>
            <Pill tone="gray">Runtime DB: desligado</Pill>
          </div>
        </div>
      </section>

      {/* internal tab navigation */}
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
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm text-gray-800 sm:grid-cols-4">
              <div><dt className="text-[11px] uppercase tracking-wide text-gray-400">Status</dt><dd className="font-medium">{active ? "Ativo no registry" : agent.status}</dd></div>
              <div><dt className="text-[11px] uppercase tracking-wide text-gray-400">Local de trabalho</dt><dd className="font-mono font-medium">/pedido</dd></div>
              <div><dt className="text-[11px] uppercase tracking-wide text-gray-400">Runtime DB</dt><dd className="font-medium">Desligado{agent.isRuntimeEnabled ? " (flag ON!)" : ""}</dd></div>
              <div><dt className="text-[11px] uppercase tracking-wide text-gray-400">Versão do perfil</dt><dd className="font-medium">v{agent.version} · {agent.origin === "db" ? "Banco" : "Código"}</dd></div>
            </dl>
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

          <RoomCard title="Estado real do Waiter (arquitetura)" hint="Resumo do runtime espelhado nesta sala." badge={<Pill tone="green">Espelho documental</Pill>}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: "Peças mapeadas", value: String(RUNTIME_MAP.length) },
                { label: "Em produção", value: String(inProd) },
                { label: "Fontes da verdade", value: String(truthPieces) },
                { label: "Runtime DB", value: "Desligado" },
              ].map((k) => (
                <div key={k.label} className="rounded-lg border border-gray-200 bg-white p-3">
                  <p className="text-lg font-bold text-gray-900">{k.value}</p>
                  <p className="text-[11px] uppercase tracking-wide text-gray-400">{k.label}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
              <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
                <p className="mb-1 font-semibold uppercase tracking-wide text-gray-500">Caminhos de runtime</p>
                <p>• <strong>Web /pedido</strong> → <span className="font-mono">runWebTurn</span> + <strong>WaiterBrainV2</strong> (event-driven).</p>
                <p>• <strong>WhatsApp</strong> → <span className="font-mono">processTurn</span> + <strong>WaiterBrain v1</strong> (intenção).</p>
                <p className="mt-1">Constituição injetada no prompt do <strong>web</strong>; LLM só gera texto curto.</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
                <p className="mb-1 font-semibold uppercase tracking-wide text-gray-500">Fonte da verdade</p>
                <p><span className="font-mono">WaiterAgentProfile.ts</span> alimenta o runtime <strong>e</strong> esta sala (via registry). O mapa completo está na aba <strong>Runtime &amp; Testes</strong>.</p>
              </div>
            </div>
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
              Os tiles passam a exibir dados reais quando a telemetria do Waiter for conectada. Nesta fase, todos seguem
              como <em>aguardando tracking</em> — nenhum número é inventado.
            </p>
          </RoomCard>

          <RoomCard title="Objetivos do Waiter" hint="O norte comercial e operacional do agente.">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Aumentar conversão", "Levar o cliente até a finalização do pedido."],
                ["Aumentar ticket médio", "Sugestões relevantes que elevam o valor do pedido."],
                ["Reduzir abandono", "Manter o cliente engajado até concluir."],
                ["Baixa fricção", "Conduzir com poucas perguntas e passos claros."],
                ["Sugerir produtos reais", "Sempre do cardápio — itens, preços e promoções reais."],
                ["Melhorar experiência", "Atendimento ágil, visual e consultivo."],
                ["Aceite de bebida/sobremesa", "Oferecer no momento certo, sem insistir."],
                ["Evitar erro de catálogo", "Nada de item inexistente ou preço incorreto."],
              ].map(([t, d]) => (
                <div key={t} className="rounded-lg border border-gray-200 bg-gray-50 p-2.5">
                  <p className="text-sm font-semibold text-gray-900">{t}</p>
                  <p className="text-xs text-gray-600">{d}</p>
                </div>
              ))}
            </div>
          </RoomCard>
        </div>
      )}

      {/* ── Perfil ──────────────────────────────────────────────────────────── */}
      {tab === "Perfil" && (
        <div className="space-y-4">
          <RoomCard title="Perfil do agente" hint="Identidade profissional (derivada da constituição).">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm text-gray-800 sm:grid-cols-2 lg:grid-cols-3">
              <div><dt className="text-[11px] uppercase tracking-wide text-gray-400">Cargo</dt><dd className="font-medium">Garçom vendedor de IA</dd></div>
              <div><dt className="text-[11px] uppercase tracking-wide text-gray-400">Departamento</dt><dd className="font-medium">Produto / Runtime</dd></div>
              <div><dt className="text-[11px] uppercase tracking-wide text-gray-400">Local de trabalho</dt><dd className="font-mono font-medium">/pedido</dd></div>
              <div><dt className="text-[11px] uppercase tracking-wide text-gray-400">Usuário atendido</dt><dd className="font-medium">Cliente final do restaurante</dd></div>
              <div><dt className="text-[11px] uppercase tracking-wide text-gray-400">Status</dt><dd className="font-medium">{active ? "Ativo no registry" : agent.status}</dd></div>
              <div><dt className="text-[11px] uppercase tracking-wide text-gray-400">Constituição</dt><dd className="font-mono font-medium">WaiterAgentProfile.ts</dd></div>
            </dl>
            <p className="mt-3 mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Missão</p>
            <p className="text-sm leading-relaxed text-gray-700">
              Aumentar conversão e ticket médio conduzindo o pedido com baixa fricção, recomendando apenas produtos reais
              do cardápio e melhorando a experiência do cliente até a finalização.
            </p>
            <p className="mt-3 mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">O que ele é</p>
            <p className="text-sm leading-relaxed text-gray-700">
              Um <strong>garçom digital e especialista de vendas</strong>: a tela de pedido é o salão, o cardápio é o
              inventário, o carrinho é a comanda e o checkout é o caixa. Entende a intenção real, recomenda em cards e
              conduz a venda apontando sempre o próximo passo. <strong>Não é um chatbot de palavra-chave.</strong>
            </p>
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

          <RoomCard title="Constituição no runtime" hint="A peça real que define a identidade — espelhada da arquitetura.">
            <div className="grid grid-cols-1 gap-2.5">
              {piecesFor("Perfil").map((p) => <PieceCard key={p.file} p={p} />)}
            </div>
          </RoomCard>
        </div>
      )}

      {/* ── Operação ────────────────────────────────────────────────────────── */}
      {tab === "Operação" && (
        <div className="space-y-4">
          <RoomCard title="Operação atual" hint="Onde atua, o que entrega e como conduz o pedido.">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-green-700">Onde atua</p>
                <Checks mark="✓" color="text-green-600" items={["/pedido/[slug]", "Cliente final do restaurante", "Cards, botões e categorias", "Revisão do pedido"]} />
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Fora do escopo</p>
                <Checks mark="•" color="text-gray-400" items={["WhatsApp Agent", "CRM Agent", "Pagamento (fica com a UI)", "Entrega (fica com a UI)"]} />
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-700">Interface usada</p>
                <Checks mark="→" color="text-blue-500" items={["Catálogo / menu real", "Carrinho e variantes", "Adicionais / opções", "Revisão → finalização"]} />
              </div>
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

            <div className="mt-4 rounded-lg bg-gray-50 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Fluxo obrigatório do pedido (agente + UI)</p>
              <div className="flex flex-wrap gap-1.5 text-xs">
                {["Produto principal", "Customização", "Bebida", "Sobremesa", "Promoção", "Revisão", "Entrega/retirada", "Endereço", "Pagamento", "Conclusão"].map((step, i) => (
                  <span key={step} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-gray-700 ring-1 ring-gray-200">
                    <span className="font-bold text-orange-600">{i + 1}</span> {step}
                  </span>
                ))}
              </div>
            </div>

            <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-gray-500">Ferramentas e integrações</p>
            <div className="flex flex-wrap gap-1.5">
              {["Catálogo / menu real", "Cards de produto", "Carrinho", "Variantes / adicionais", "Best-sellers", "Revisão do pedido", "Checkout (UI)", "RestaurantBrandConfig", "Waiter Test Center"].map((t) => (
                <Pill key={t} tone="blue">{t}</Pill>
              ))}
            </div>
          </RoomCard>

          <RoomCard title="Peças de operação no runtime" hint="UI, APIs e orquestrador reais — espelhados da arquitetura.">
            <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
              {piecesFor("Operação").map((p) => <PieceCard key={p.file} p={p} />)}
            </div>
          </RoomCard>
        </div>
      )}

      {/* ── Brain & Skills ──────────────────────────────────────────────────── */}
      {tab === "Brain & Skills" && (
        <div className="space-y-4">
          <RoomCard title="Brain · modelo de decisão" hint="Como ele pensa ao atender e vender.">
            <div className="flex flex-wrap gap-1.5">
              {["Vendedor consultivo", "Leitura de intenção", "Baixa fricção", "Uma pergunta por vez", "Visual antes de texto", "Próximo passo sempre claro", "Recusa respeitada", "Venda sem pressão excessiva"].map((b) => (
                <Pill key={b} tone="violet">{b}</Pill>
              ))}
            </div>
          </RoomCard>
          <RoomCard title="Skills · habilidades operacionais" hint="O que ele sabe fazer na prática.">
            <Checks mark="✓" color="text-green-600" items={["Leitura de intenção", "Recomendação de produto", "Upsell contextual", "Condução de pedido", "Leitura de cardápio", "Restrições alimentares", "Fechamento comercial", "Uso de cards visuais"]} />
          </RoomCard>
          <RoomCard title="Motores de decisão no runtime" hint="Os cérebros reais — espelhados da arquitetura.">
            <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
              {piecesFor("Brain & Skills").map((p) => <PieceCard key={p.file} p={p} />)}
            </div>
            <p className="mt-2 text-[11px] text-gray-400">
              Há dois caminhos: <strong>WaiterBrainV2</strong> no web <span className="font-mono">/pedido</span> e
              <strong> WaiterBrain v1</strong> no WhatsApp. Ambos são determinísticos; o LLM apenas redige o texto curto.
            </p>
          </RoomCard>
        </div>
      )}

      {/* ── Library (v0.2 — content unchanged) ──────────────────────────────── */}
      {tab === "Library" && (
        <div className="space-y-4">
          <RoomCard
            title="Library v0.2 · Formação técnica"
            hint="A formação profissional do Waiter: organiza fontes técnicas em gavetas de conhecimento, técnicas aplicáveis e testes de qualidade."
            badge={<Pill tone="amber">Em formação · não conectado ao runtime</Pill>}
          >
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
              A Library é a formação profissional do Waiter. Ela organiza fontes técnicas em gavetas de conhecimento,
              técnicas aplicáveis e testes de qualidade. <strong>Ainda não altera o runtime.</strong>
            </p>

            {/* mini KPIs */}
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: "Técnicas mapeadas", value: String(WAITER_LIBRARY.length) },
                { label: "Gavetas / categorias", value: String(WAITER_LIBRARY_CATEGORIES.length) },
                { label: "Ativas no runtime", value: "0" },
                { label: "Status geral", value: "Em formação" },
              ].map((k) => (
                <div key={k.label} className="rounded-lg border border-gray-200 bg-white p-3">
                  <p className="text-lg font-bold text-gray-900">{k.value}</p>
                  <p className="text-[11px] uppercase tracking-wide text-gray-400">{k.label}</p>
                </div>
              ))}
            </div>

            {/* gavetas de conhecimento */}
            <p className="mt-4 mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Gavetas de conhecimento</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {WAITER_LIBRARY_CATEGORIES.map((c) => {
                const n = WAITER_LIBRARY.filter((t) => t.category === c).length;
                return (
                  <div key={c} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <p className="text-sm font-semibold text-gray-900">{c}</p>
                    <p className="mt-0.5 text-xs text-gray-500">{n} {n === 1 ? "técnica" : "técnicas"}</p>
                    <span className="mt-1.5 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">Em formação</span>
                  </div>
                );
              })}
            </div>

            {/* técnicas — cards compactos */}
            <p className="mt-4 mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Técnicas</p>
            <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
              {WAITER_LIBRARY.map((t) => (
                <div key={t.source + t.technique} className="rounded-lg border border-gray-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold leading-tight text-gray-900">{t.technique}</p>
                    <Pill tone="violet">{t.category}</Pill>
                  </div>
                  <p className="mt-1 text-sm text-gray-800">{t.application}</p>
                  <dl className="mt-1.5 space-y-0.5 text-[11px] leading-snug text-gray-600">
                    <div><dt className="inline font-semibold text-gray-400">Fonte: </dt><dd className="inline">{t.source}</dd></div>
                    <div><dt className="inline font-semibold text-gray-400">Para que serve: </dt><dd className="inline">{t.purpose}</dd></div>
                    <div><dt className="inline font-semibold text-amber-600">Regra de uso: </dt><dd className="inline">{t.usageRule}</dd></div>
                    <div><dt className="inline font-semibold text-blue-600">Teste de qualidade: </dt><dd className="inline">{t.qualityTest}</dd></div>
                  </dl>
                  <span className="mt-2 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">{t.status}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-gray-400">
              Sínteses operacionais curadas (sem trechos longos de obras). Quando houver muitas técnicas, esta aba
              passará a mostrar um resumo com &quot;Ver tudo&quot; e gavetas por categoria. A ativação no runtime virá em
              fase futura, com revisão, testes e governança.
            </p>
          </RoomCard>
        </div>
      )}

      {/* ── Runtime & Testes ────────────────────────────────────────────────── */}
      {tab === "Runtime & Testes" && (
        <div className="space-y-4">
          <RoomCard title="Runtime atual" hint="Fatos do código (somente leitura).">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm text-gray-800 sm:grid-cols-2 lg:grid-cols-4">
              <div><dt className="text-xs uppercase tracking-wide text-gray-400">Motor (web)</dt><dd className="font-mono font-medium">WaiterBrainV2</dd></div>
              <div><dt className="text-xs uppercase tracking-wide text-gray-400">Motor (WhatsApp)</dt><dd className="font-mono font-medium">WaiterBrain v1</dd></div>
              <div><dt className="text-xs uppercase tracking-wide text-gray-400">Constituição</dt><dd className="font-mono font-medium">WaiterAgentProfile.ts</dd></div>
              <div><dt className="text-xs uppercase tracking-wide text-gray-400">Prompt</dt><dd className="font-mono font-medium">PromptBuilderService</dd></div>
              <div><dt className="text-xs uppercase tracking-wide text-gray-400">Orquestrador</dt><dd className="font-mono font-medium">AIOrderService</dd></div>
              <div><dt className="text-xs uppercase tracking-wide text-gray-400">LLM</dt><dd className="font-medium">Apenas texto curto / controlado</dd></div>
              <div><dt className="text-xs uppercase tracking-wide text-gray-400">Fonte de produtos</dt><dd className="font-medium">Catálogo real</dd></div>
              <div><dt className="text-xs uppercase tracking-wide text-gray-400">Runtime DB</dt><dd className="font-medium">Desligado{agent.isRuntimeEnabled ? " (flag ON!)" : ""}</dd></div>
            </dl>
          </RoomCard>

          <RoomCard title="Mapa de arquitetura" hint="Cada peça real do Waiter, espelhada (read-only)." badge={<Pill tone="green">{RUNTIME_MAP.length} peças</Pill>}>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-200 text-[10px] uppercase tracking-wide text-gray-400">
                    <th className="py-1.5 pr-3 font-semibold">Peça / arquivo</th>
                    <th className="px-2 font-semibold">Aba</th>
                    <th className="px-2 font-semibold">Prod</th>
                    <th className="px-2 font-semibold">Tipo</th>
                    <th className="px-2 font-semibold">Verdade</th>
                    <th className="px-2 font-semibold">Risco</th>
                    <th className="pl-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {RUNTIME_MAP.map((p) => (
                    <tr key={p.file} className="border-b border-gray-100 align-top">
                      <td className="py-1.5 pr-3">
                        <p className="font-semibold text-gray-900">{p.name}</p>
                        <p className="font-mono text-[10px] text-gray-400">{p.file}</p>
                      </td>
                      <td className="px-2 text-gray-700">{p.tab}</td>
                      <td className="px-2">{p.prod ? "✓" : "—"}</td>
                      <td className="px-2 text-gray-700">{p.kind}</td>
                      <td className="px-2 text-gray-700">{p.truth}</td>
                      <td className="px-2"><span className={p.risk === "Alto" ? "font-semibold text-red-600" : p.risk === "Médio" ? "text-amber-600" : "text-green-600"}>{p.risk}</span></td>
                      <td className="pl-2 text-gray-700">{p.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </RoomCard>

          <RoomCard title="Peças de runtime / prompt" hint="Montagem do prompt e suíte de testes — espelhadas da arquitetura.">
            <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
              {piecesFor("Runtime & Testes").map((p) => <PieceCard key={p.file} p={p} />)}
            </div>
            <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-gray-500">Dependências de runtime</p>
            <div className="flex flex-wrap gap-1.5">
              {RUNTIME_DEPS.map((d) => <Pill key={d} tone="gray">{d}</Pill>)}
            </div>
          </RoomCard>

          <RoomCard
            title="Testes"
            hint="Suite determinística (sem OpenAI, sem gravação)."
            badge={
              <Link href="/admin/agentes/waiter/testes" className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700">
                Abrir Waiter Test Center →
              </Link>
            }
          >
            <div className="flex flex-wrap gap-1.5">
              {["Recomendação", "Upsell", "Restrições", "Checkout guidance", "No hallucination", "Orçamento", "Grupos / família", "Porção / categoria", "Opção leve"].map((g) => (
                <Pill key={g} tone="gray">{g}</Pill>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-500">Score recente não carregado nesta tela — rode no Waiter Test Center.</p>
          </RoomCard>
        </div>
      )}

      {/* ── Governança ──────────────────────────────────────────────────────── */}
      {tab === "Governança" && (
        <div className="space-y-4">
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
                "Mostra produtos em cards visuais, não em listas longas",
                "Oferece upsell uma vez e respeita a recusa",
              ]}
            />
          </RoomCard>

          <RoomCard title="Hardcoded vs. editável" hint="O que é fixo no código hoje e o que pode virar editável no futuro.">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-red-700">Hardcoded hoje</p>
                <Checks mark="•" color="text-gray-400" items={["Constituição (WaiterAgentProfile.ts)", "Lógica WaiterBrainV2 / v1", "Montagem do prompt", "Tools e guardrails"]} />
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-violet-700">Futuro editável</p>
                <Checks mark="→" color="text-violet-500" items={["Seções da constituição via DB", "Biblioteca técnica conectada", "Parâmetros de venda por restaurante", "Perfil versionado (origin=db)"]} />
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-blue-700">Trava de segurança</p>
                <Checks mark="✓" color="text-green-600" items={["isRuntimeEnabled desligado", "Sem editor nesta fase", "Sala 100% read-only", "Library não conectada ao runtime"]} />
              </div>
            </div>
          </RoomCard>

          <RoomCard title="Próximos passos / governança" hint="Caminho até template oficial + editor + runtime versionado.">
            <ul className="space-y-1 text-sm text-gray-700">
              {[
                "Promover esta sala a Agent Room Template oficial (reutilizável por outros agentes)",
                "Derivar a sala da constituição (sem duplicar texto à mão) — read-only",
                "Conectar KPIs reais (telemetria do Waiter) no lugar de \"Aguardando tracking\"",
                "Trazer regras implícitas do WaiterBrainV2 para a constituição",
                "Criar versionamento do perfil (rollback/histórico) antes do editor",
                "Conectar a biblioteca técnica (sem efeito no runtime até validar)",
                "Ativar o editor somente com rollback + testes",
                "Só depois permitir o runtime ler configuração editável (runtime versionado)",
              ].map((s) => (
                <li key={s} className="flex gap-2">
                  <span className="mt-0.5 text-gray-400">☐</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </RoomCard>
        </div>
      )}
    </div>
  );
}
