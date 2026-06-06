/**
 * WaiterRoom — the Agent Room (sala do agente) for the Waiter, the template for
 * every other agent. READ-ONLY: a synthetic, scannable dashboard of the agent
 * like the department of an AI employee. Results on top, theory/formation below.
 *
 * Data sources:
 *   • Live registry facts from `agent` (AdminAgentProfileView, derived from the
 *     code constitution src/services/ai/waiter/WaiterAgentProfile.ts): status,
 *     version, isRuntimeEnabled, origin.
 *   • Curated room copy (objectives, identity, operation, brain, skills, library,
 *     runtime facts, governance) is explanatory text synthesizing the
 *     constitution + runtime audit — it does NOT change behavior.
 *
 * Strictly read-only: no editor, no DB writes, no runtime change. Nothing here
 * touches WaiterBrain/WaiterBrainV2/PromptBuilderService/AIOrderService/`/pedido`.
 * KPIs show honest placeholders ("Aguardando tracking") — no invented numbers.
 */

import Link from "next/link";
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

/** Band separator that chunks the page into dashboard sections. */
function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <h2 className="text-[11px] font-bold uppercase tracking-widest text-gray-400">{children}</h2>
      <div className="h-px flex-1 bg-gray-200" />
    </div>
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

// ── room ────────────────────────────────────────────────────────────────────────

export function WaiterRoom({ agent }: { agent: AdminAgentProfileView }) {
  const active = agent.status === "ACTIVE";

  return (
    <div className="space-y-4">
      {/* read-only banner */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-[11px] text-gray-600">
        🔒 Sala do agente <strong>read-only</strong> nesta fase: nada aqui altera prompts, runtime ou comportamento em
        produção. Cards de KPI exibem dados reais quando a telemetria for conectada — sem números fictícios.
      </div>

      {/* ── Cabeçalho / identidade compacto ─────────────────────────────────── */}
      <section className="rounded-xl border border-orange-200 bg-orange-50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Waiter Agent</h1>
            <p className="text-sm text-gray-700">Garçom vendedor de IA · Local de trabalho: <span className="font-mono">/pedido</span></p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Pill tone="blue">Produto / Runtime</Pill>
            <Pill tone={active ? "green" : "gray"}>{active ? "Ativo no registry" : agent.status}</Pill>
            <Pill tone="gray">Runtime DB: desligado</Pill>
          </div>
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-gray-700">
          Garçom digital e especialista de vendas dentro da interface Foocci: <strong>entende a intenção real</strong> do
          cliente, recomenda apenas produtos reais em cards e <strong>conduz a venda com baixa fricção</strong> até a
          finalização. Não é um chatbot de palavra-chave.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/admin/agentes/waiter/testes" className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-700">
            🧠 Waiter Test Center
          </Link>
          <Link href="/admin/build-os" className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-800 hover:bg-gray-50">
            🛠️ Build OS
          </Link>
          <Link href="/admin/manual-operacional" className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-800 hover:bg-gray-50">
            📖 Manual Operacional
          </Link>
        </div>
        <p className="mt-2 font-mono text-[10px] text-orange-700/70">Fonte: src/services/ai/waiter/WaiterAgentProfile.ts</p>
      </section>

      {/* ── Performance & objetivos ─────────────────────────────────────────── */}
      <GroupLabel>Performance &amp; resultados</GroupLabel>

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
          Os tiles passam a exibir dados reais quando a telemetria do Waiter for conectada. Nesta fase, todos seguem como
          <em> aguardando tracking</em> — nenhum número é inventado.
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

      {/* ── Operação atual ──────────────────────────────────────────────────── */}
      <GroupLabel>Operação atual</GroupLabel>

      <RoomCard title="Operação atual" hint="Onde atua, o que entrega e como conduz o pedido.">
        {/* onde atua */}
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
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-700">Fluxos que usa</p>
            <Checks mark="→" color="text-blue-500" items={["Catálogo / menu real", "Carrinho e variantes", "Upsell contextual", "Revisão → finalização"]} />
          </div>
        </div>

        {/* responsabilidades */}
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

        {/* fluxo obrigatório */}
        <div className="mt-4 rounded-lg bg-gray-50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Fluxo do pedido (agente + UI)</p>
          <div className="flex flex-wrap gap-1.5 text-xs">
            {["Produto principal", "Customização", "Bebida", "Sobremesa", "Promoção", "Revisão", "Entrega/retirada", "Endereço", "Pagamento", "Conclusão"].map((step, i) => (
              <span key={step} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-gray-700 ring-1 ring-gray-200">
                <span className="font-bold text-orange-600">{i + 1}</span> {step}
              </span>
            ))}
          </div>
        </div>

        {/* ferramentas */}
        <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-gray-500">Ferramentas e integrações</p>
        <div className="flex flex-wrap gap-1.5">
          {["Catálogo / menu real", "Cards de produto", "Carrinho", "Variantes / adicionais", "Best-sellers", "Revisão do pedido", "Checkout (UI)", "RestaurantBrandConfig", "Waiter Test Center"].map((t) => (
            <Pill key={t} tone="blue">{t}</Pill>
          ))}
        </div>
      </RoomCard>

      {/* ── Inteligência & formação ─────────────────────────────────────────── */}
      <GroupLabel>Inteligência &amp; formação</GroupLabel>

      <RoomCard title="Brain &amp; Skills" hint="Como ele pensa e o que sabe fazer.">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-violet-700">Brain · modelo de decisão</p>
        <div className="flex flex-wrap gap-1.5">
          {["Vendedor consultivo", "Leitura de intenção", "Baixa fricção", "Uma pergunta por vez", "Visual antes de texto", "Próximo passo sempre claro", "Recusa respeitada", "Venda sem pressão excessiva"].map((b) => (
            <Pill key={b} tone="violet">{b}</Pill>
          ))}
        </div>
        <p className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wide text-green-700">Skills · habilidades operacionais</p>
        <Checks mark="✓" color="text-green-600" items={["Leitura de intenção", "Recomendação de produto", "Upsell contextual", "Condução de pedido", "Leitura de cardápio", "Restrições alimentares", "Fechamento comercial", "Uso de cards visuais"]} />
      </RoomCard>

      {/* Library v0.2 — formation mini-dashboard (gavetas + técnicas), read-only. Content unchanged. */}
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
          Sínteses operacionais curadas (sem trechos longos de obras). A ativação no runtime virá em fase futura, com
          revisão, testes e governança.
        </p>
      </RoomCard>

      {/* ── Runtime, testes & governança ────────────────────────────────────── */}
      <GroupLabel>Runtime, testes &amp; governança</GroupLabel>

      <RoomCard title="Runtime atual" hint="Fatos do código (somente leitura).">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm text-gray-800 sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-xs uppercase tracking-wide text-gray-400">Motor</dt><dd className="font-mono font-medium">WaiterBrainV2</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-gray-400">Constituição</dt><dd className="font-mono font-medium">WaiterAgentProfile.ts</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-gray-400">LLM</dt><dd className="font-medium">Apenas texto curto / controlado</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-gray-400">UI</dt><dd className="font-mono font-medium">/pedido</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-gray-400">Fonte de produtos</dt><dd className="font-medium">Catálogo real</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-gray-400">Runtime DB</dt><dd className="font-medium">Desligado{agent.isRuntimeEnabled ? " (flag ON!)" : ""}</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-gray-400">Editor</dt><dd className="font-medium">Indisponível nesta fase</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-gray-400">Versão do perfil</dt><dd className="font-medium">v{agent.version} · {agent.origin === "db" ? "Banco" : "Código"}</dd></div>
        </dl>
      </RoomCard>

      <RoomCard
        title="Testes"
        hint="Suite determinística (sem OpenAI, sem gravação)."
        badge={
          <Link href="/admin/agentes/waiter/testes" className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700">
            Abrir Test Center →
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

      <RoomCard title="Próximos passos / governança" hint="Caminho até template oficial + editor + runtime versionado.">
        <ul className="space-y-1 text-sm text-gray-700">
          {[
            "Promover esta sala a Agent Room Template oficial (reutilizável por outros agentes)",
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
  );
}
