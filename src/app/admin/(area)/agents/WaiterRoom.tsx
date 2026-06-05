/**
 * WaiterRoom — the Agent Room (sala do agente) for the Waiter, the template for
 * every other agent. READ-ONLY: a synthetic, scannable, executive view of the
 * agent like the department of an AI employee.
 *
 * Data sources:
 *   • Live registry facts from `agent` (AdminAgentProfileView, derived from the
 *     code constitution src/services/ai/waiter/WaiterAgentProfile.ts): status,
 *     version, isRuntimeEnabled, origin.
 *   • Curated room copy (objectives, master prompt, scope, execution, brain,
 *     skills, library, tools, safe-conduct, runtime facts, evolution) is
 *     explanatory text synthesizing the constitution + runtime audit — it does
 *     NOT change behavior.
 *
 * Strictly read-only: no editor, no DB writes, no runtime change. Nothing here
 * touches WaiterBrain/WaiterBrainV2/PromptBuilderService/AIOrderService/`/pedido`.
 */

import Link from "next/link";
import type { AdminAgentProfileView } from "@/services/agents/types";

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
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-900">{title}</h2>
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
    <ul className="grid grid-cols-1 gap-1.5 text-sm text-gray-800 sm:grid-cols-2">
      {items.map((it) => (
        <li key={it} className="flex gap-2">
          <span className={`mt-0.5 ${color}`}>{mark}</span>
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

function KpiCard({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-gray-400">{label}</p>
        <Pill tone="amber">Em breve</Pill>
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-300">—</p>
      {hint && <p className="mt-1 text-[11px] text-gray-400">{hint}</p>}
    </div>
  );
}

// ── room ────────────────────────────────────────────────────────────────────────

export function WaiterRoom({ agent }: { agent: AdminAgentProfileView }) {
  const active = agent.status === "ACTIVE";

  return (
    <div className="space-y-5">
      {/* read-only banner */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-xs text-gray-600">
        🔒 Sala do agente <strong>read-only</strong> nesta fase: nada aqui altera prompts, runtime ou comportamento em
        produção. Itens marcados como <em>Planejado</em> / <em>Em breve</em> ainda não afetam o agente.
      </div>

      {/* 1. Topo executivo */}
      <section className="rounded-xl border border-orange-200 bg-orange-50 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Waiter Agent</h1>
            <p className="text-sm text-gray-700">Cargo: Garçom vendedor de IA · Local de trabalho: <span className="font-mono">/pedido</span></p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Pill tone="blue">Produto / Runtime</Pill>
            <Pill tone={active ? "green" : "gray"}>{active ? "Ativo no registry" : agent.status}</Pill>
            <Pill tone="gray">Runtime DB: desligado · Fase atual</Pill>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/admin/agentes/waiter/testes" className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-700">
            🧠 Abrir Waiter Test Center
          </Link>
          <Link href="/admin/build-os" className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-800 hover:bg-gray-50">
            🛠️ Abrir Build OS
          </Link>
          <Link href="/admin/manual-operacional" className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-800 hover:bg-gray-50">
            📖 Abrir Manual Operacional
          </Link>
        </div>
      </section>

      {/* 2. Objetivos do agente */}
      <RoomCard title="Objetivos do agente" hint="Para que ele existe — o norte comercial.">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Conversão", "Levar o cliente até a finalização do pedido."],
            ["Ticket médio", "Aumentar o valor do pedido com sugestões relevantes."],
            ["Upsell", "Bebida/sobremesa/combo no momento certo, sem insistir."],
            ["Baixa fricção", "Conduzir com poucas perguntas e passos claros."],
            ["Zero alucinação", "Só produtos, preços e promoções reais do cardápio."],
          ].map(([t, d]) => (
            <div key={t} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-sm font-semibold text-gray-900">{t}</p>
              <p className="text-xs text-gray-600">{d}</p>
            </div>
          ))}
        </div>
      </RoomCard>

      {/* 3. KPIs */}
      <RoomCard title="KPIs de performance" badge={<Pill tone="amber">Métricas reais — em breve</Pill>}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <KpiCard label="Taxa de conversão" hint="pedidos / sessões" />
          <KpiCard label="Ticket médio" hint="R$ por pedido" />
          <KpiCard label="Taxa de upsell" hint="pedidos c/ add-on" />
          <KpiCard label="Itens por pedido" />
          <KpiCard label="Aprovação nos testes" hint="Test Center" />
        </div>
        <p className="mt-3 text-xs text-gray-400">Os cards exibem dados reais quando a telemetria do Waiter for conectada (sem números fictícios nesta fase).</p>
      </RoomCard>

      {/* 4. Prompt Mestre */}
      <RoomCard title="Prompt Mestre · Quem ele é" hint="Identidade profissional (derivada da constituição).">
        <p className="text-sm leading-relaxed text-gray-800">
          Sou o <strong>garçom digital e especialista de vendas</strong> do restaurante, operando dentro da interface
          Foocci. A tela de pedido é o salão, o cardápio é o meu inventário, o carrinho é a comanda e o checkout é o
          caixa. Atendo como um bom garçom: <strong>entendo a intenção real</strong> do cliente, recomendo apenas
          produtos reais em cards, <strong>conduzo a venda com baixa fricção</strong> e respeito restrições e recusas —
          sempre apontando o próximo passo até a finalização. <strong>Não sou um chatbot</strong> nem um bot de
          palavra-chave.
        </p>
        <p className="mt-2 font-mono text-[11px] text-gray-400">Fonte: src/services/ai/waiter/WaiterAgentProfile.ts</p>
      </RoomCard>

      {/* 5. Escopo de atuação */}
      <RoomCard title="Escopo de atuação">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-green-700">Onde trabalha</p>
            <Checks mark="✓" color="text-green-600" items={["/pedido/[slug]", "Cliente final do restaurante", "Cards, botões e categorias", "Revisão do pedido"]} />
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-red-700">Onde NÃO trabalha</p>
            <Checks mark="✕" color="text-red-500" items={["WhatsApp Agent", "CRM Agent", "Controle de pagamento", "Controle de entrega"]} />
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-700">Fluxos que usa</p>
            <Checks mark="→" color="text-blue-500" items={["Catálogo / menu real", "Carrinho e variantes", "Upsell contextual", "Revisão → finalização"]} />
          </div>
        </div>
      </RoomCard>

      {/* 6. Como ele executa */}
      <RoomCard title="Como ele executa" hint="Passo a passo do comportamento correto.">
        <ol className="space-y-2 text-sm text-gray-800">
          {[
            "Lê a intenção real do cliente (grupo, leve, orçamento, porção…).",
            "Faz no máximo UMA pergunta de qualificação quando falta contexto.",
            "Recomenda produtos reais do cardápio em cards (nunca lista em texto).",
            "Conduz a escolha e apoia variantes / opções / adicionais.",
            "Oferece bebida e sobremesa de forma contextual — uma vez, sem insistir.",
            "Conduz para a revisão do pedido com um próximo passo claro.",
            "Encaminha para a finalização — pagamento e entrega ficam com a UI.",
          ].map((s, i) => (
            <li key={s} className="flex gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-700">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
        <div className="mt-4 rounded-lg bg-gray-50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Fluxo do pedido (conduzido pelo agente + UI)</p>
          <div className="flex flex-wrap gap-1.5 text-xs">
            {["Produto principal", "Customização", "Bebida", "Sobremesa", "Promoção", "Revisão", "Entrega/retirada", "Endereço", "Pagamento", "Conclusão"].map((step, i) => (
              <span key={step} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-gray-700 ring-1 ring-gray-200">
                <span className="font-bold text-orange-600">{i + 1}</span> {step}
              </span>
            ))}
          </div>
        </div>
      </RoomCard>

      {/* 7. Brain */}
      <RoomCard title="Brain · Modelo de decisão" hint="Leitura de intenção · recomendação · venda consultiva.">
        <div className="flex flex-wrap gap-1.5">
          {["Vendedor consultivo", "Leitura de intenção", "Baixa fricção", "Uma pergunta por vez", "Visual antes de texto", "Próximo passo sempre claro", "Recusa respeitada", "Venda sem pressão excessiva"].map((b) => (
            <Pill key={b} tone="violet">{b}</Pill>
          ))}
        </div>
      </RoomCard>

      {/* 8. Skills */}
      <RoomCard title="Skills · Habilidades operacionais">
        <Checks mark="✓" color="text-green-600" items={["Leitura de intenção", "Recomendação de produto", "Upsell contextual", "Condução de pedido", "Leitura de cardápio", "Restrições alimentares", "Fechamento comercial", "Uso de cards visuais"]} />
      </RoomCard>

      {/* 9. Library */}
      <RoomCard title="Library · Fontes técnicas" badge={<Pill tone="amber">Planejado · não conectado ao runtime</Pill>}>
        <p className="text-sm text-gray-700">
          A biblioteca é a <strong>formação técnica</strong> do agente: livros, frameworks, técnicas e princípios
          profissionais convertidos em regras aplicáveis dentro do escopo do Waiter.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[
            ["Vendas consultivas", "Diagnóstico antes de oferta; recomendar com motivo."],
            ["Persuasão ética", "Ancoragem e gatilhos sem pressão; respeitar recusa."],
            ["Psicologia de decisão", "Reduzir paralisia de escolha; opções claras."],
            ["Atendimento ao cliente", "Tom acolhedor, objetivo e cordial."],
            ["Upsell / cross-sell", "Harmonização (bebida/sobremesa) no momento certo."],
            ["Gastronomia japonesa", "Leitura de leve/pesado, cru/frito, combos."],
            ["Leitura de cardápio", "Interpretar intenção vs. busca literal."],
          ].map(([t, d]) => (
            <div key={t} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-sm font-semibold text-gray-900">{t}</p>
              <p className="text-xs text-gray-600">{d}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-amber-700">⚠️ A biblioteca <strong>ainda não altera o comportamento</strong> do Waiter — é um plano de formação para fases futuras.</p>
      </RoomCard>

      {/* 10. Ferramentas */}
      <RoomCard title="Ferramentas e integrações" hint="O que o agente usa para servir e vender.">
        <div className="flex flex-wrap gap-1.5">
          {["Catálogo / menu real", "Cards de produto", "Carrinho", "Variantes / adicionais", "Best-sellers", "Revisão do pedido", "Checkout (UI)", "RestaurantBrandConfig", "Waiter Test Center"].map((t) => (
            <Pill key={t} tone="blue">{t}</Pill>
          ))}
        </div>
      </RoomCard>

      {/* 11. Código de atuação segura (linguagem positiva) */}
      <RoomCard title="Código de atuação segura" badge={<Pill tone="red">Master-only</Pill>} hint="Como ele protege o cliente e o restaurante.">
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

      {/* 12. Runtime e testes */}
      <RoomCard
        title="Runtime e testes"
        hint="Fatos do código (somente leitura)."
        badge={
          <Link href="/admin/agentes/waiter/testes" className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700">
            Abrir Waiter Test Center →
          </Link>
        }
      >
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm text-gray-800 sm:grid-cols-2">
          <div><dt className="text-xs uppercase tracking-wide text-gray-400">Motor</dt><dd className="font-mono font-medium">WaiterBrainV2</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-gray-400">Constituição</dt><dd className="font-mono font-medium">WaiterAgentProfile.ts</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-gray-400">LLM</dt><dd className="font-medium">Apenas texto curto / controlado</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-gray-400">UI</dt><dd className="font-mono font-medium">/pedido</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-gray-400">Fonte de produtos</dt><dd className="font-medium">Catálogo real</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-gray-400">Runtime DB</dt><dd className="font-medium">Desligado{agent.isRuntimeEnabled ? " (flag ON!)" : ""}</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-gray-400">Editor</dt><dd className="font-medium">Não disponível nesta fase</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-gray-400">Versão do perfil</dt><dd className="font-medium">v{agent.version} · {agent.origin === "db" ? "Banco" : "Código"}</dd></div>
        </dl>
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Cobertura de testes (suite determinística, sem OpenAI)</p>
          <div className="flex flex-wrap gap-1.5">
            {["Recomendação", "Upsell", "Restrições", "Checkout guidance", "No hallucination", "Orçamento", "Grupos / família", "Porção / categoria", "Opção leve"].map((g) => (
              <Pill key={g} tone="gray">{g}</Pill>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">Score recente não carregado nesta tela — rode no Waiter Test Center.</p>
        </div>
      </RoomCard>

      {/* 13. Evolução */}
      <RoomCard title="Evolução · O que falta" hint="Para virar template oficial + editor + runtime versionado.">
        <ul className="space-y-1.5 text-sm text-gray-700">
          {[
            "Promover esta sala a Agent Room Template oficial (reutilizável por outros agentes)",
            "Conectar KPIs reais (telemetria do Waiter) no lugar de \"Em breve\"",
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
