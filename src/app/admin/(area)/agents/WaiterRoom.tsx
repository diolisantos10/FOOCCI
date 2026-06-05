/**
 * WaiterRoom — the first "Agent Room" (sala do agente), using the Waiter Agent as
 * the template. READ-ONLY: a synthetic, scannable operational view of the agent,
 * like the department/room of an AI employee.
 *
 * Data sources:
 *   • Live registry facts come from `agent` (AdminAgentProfileView, derived from
 *     the code constitution src/services/ai/waiter/WaiterAgentProfile.ts): status,
 *     version, isRuntimeEnabled.
 *   • The curated, concise room copy (responsibilities, brain, skills, limits,
 *     mandatory flow, runtime facts, library, next-steps) is explanatory text that
 *     synthesizes the constitution + runtime audit — it does NOT change behavior.
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

function Pill({ children, tone = "gray" }: { children: React.ReactNode; tone?: "gray" | "green" | "blue" | "amber" | "violet" | "red" }) {
  const cls = {
    gray: "bg-gray-100 text-gray-600",
    green: "bg-green-50 text-green-700",
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    violet: "bg-violet-50 text-violet-700",
    red: "bg-red-50 text-red-700",
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

function Checks({ items, tone = "gray" }: { items: string[]; tone?: "ok" | "no" | "gray" }) {
  const mark = tone === "ok" ? "✓" : tone === "no" ? "✕" : "•";
  const color = tone === "ok" ? "text-green-600" : tone === "no" ? "text-red-500" : "text-gray-400";
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

// ── room ────────────────────────────────────────────────────────────────────────

export function WaiterRoom({ agent }: { agent: AdminAgentProfileView }) {
  const active = agent.status === "ACTIVE";

  return (
    <div className="space-y-5">
      {/* read-only banner */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-xs text-gray-600">
        🔒 Sala do agente <strong>read-only</strong> nesta fase: nada aqui altera prompts, runtime ou comportamento em
        produção. Itens marcados como <em>Planejado</em> ainda não afetam o agente.
      </div>

      {/* 1. Cabeçalho / Identidade */}
      <section className="rounded-xl border border-orange-200 bg-orange-50 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Waiter Agent</h1>
            <p className="text-sm text-gray-700">Cargo: Garçom vendedor de IA</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Pill tone="blue">Grupo: Produto / Runtime</Pill>
            <Pill tone={active ? "green" : "gray"}>{active ? "Ativo no registry" : agent.status}</Pill>
            <Pill tone="gray">Runtime DB: desligado · Fase atual</Pill>
            <Pill tone="gray">Local: /pedido</Pill>
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

      {/* 2. Missão */}
      <RoomCard title="Missão">
        <p className="text-sm leading-relaxed text-gray-800">
          O Waiter Agent conduz o cliente até a finalização do pedido, sugerindo produtos reais do cardápio,
          respeitando restrições e aumentando o ticket médio com baixa fricção.
        </p>
      </RoomCard>

      {/* 3. Departamento e local de trabalho */}
      <RoomCard title="Departamento e local de trabalho">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm text-gray-800 sm:grid-cols-2">
          <div><dt className="text-xs uppercase tracking-wide text-gray-400">Departamento</dt><dd className="font-medium">Vendas / Pedido</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-gray-400">Atua em</dt><dd className="font-medium font-mono">/pedido/[slug]</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-gray-400">Usuário atendido</dt><dd className="font-medium">Cliente final do restaurante</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-gray-400">Interface principal</dt><dd className="font-medium">Cards, botões, categorias e revisão do pedido</dd></div>
        </dl>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Pill tone="red">Não é WhatsApp Agent</Pill>
          <Pill tone="red">Não é CRM Agent</Pill>
        </div>
      </RoomCard>

      {/* 4. Responsabilidades */}
      <RoomCard title="Responsabilidades">
        <Checks
          tone="ok"
          items={[
            "Entender a intenção do cliente",
            "Sugerir produtos reais",
            "Conduzir a escolha",
            "Apoiar variantes / opções / adicionais",
            "Oferecer bebida",
            "Oferecer sobremesa",
            "Respeitar restrições",
            "Conduzir para revisão / finalização",
          ]}
        />
      </RoomCard>

      {/* 5. Brain / Como ele pensa */}
      <RoomCard title="Brain · Como ele pensa">
        <div className="flex flex-wrap gap-1.5">
          {[
            "Vendedor consultivo",
            "Baixa fricção",
            "Uma pergunta por vez",
            "Visual antes de texto",
            "Próximo passo sempre claro",
            "Recusa respeitada",
            "Venda sem pressão excessiva",
          ].map((b) => (
            <Pill key={b} tone="violet">{b}</Pill>
          ))}
        </div>
      </RoomCard>

      {/* 6. Skills */}
      <RoomCard title="Skills">
        <Checks
          items={[
            "Leitura de intenção",
            "Recomendação de produto",
            "Upsell contextual",
            "Condução de pedido",
            "Leitura de cardápio",
            "Restrições alimentares",
            "Fechamento comercial",
            "Uso de cards visuais",
          ]}
        />
      </RoomCard>

      {/* 7. Library / Biblioteca técnica (planejado) */}
      <RoomCard title="Library · Biblioteca técnica" badge={<Pill tone="amber">Planejado · não conectado ao runtime</Pill>}>
        <p className="text-sm text-gray-700">
          A biblioteca será a <strong>formação técnica</strong> do agente. Ela transforma livros, técnicas e referências
          profissionais em princípios aplicáveis dentro do escopo do Waiter.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[
            "Vendas consultivas",
            "Persuasão ética",
            "Psicologia de decisão",
            "Atendimento ao cliente",
            "Upsell / cross-sell",
            "Gastronomia japonesa",
            "Leitura de cardápio",
          ].map((c) => (
            <Pill key={c} tone="gray">{c}</Pill>
          ))}
        </div>
        <p className="mt-3 text-xs text-amber-700">
          ⚠️ A biblioteca <strong>ainda não altera comportamento</strong> do Waiter. É um plano de formação para fases futuras.
        </p>
      </RoomCard>

      {/* 8. Ferramentas e integrações */}
      <RoomCard title="Ferramentas e integrações" hint="O que o agente usa para servir e vender.">
        <div className="flex flex-wrap gap-1.5">
          {[
            "Catálogo / menu real",
            "Cards de produto",
            "Carrinho",
            "Opções / variantes / adicionais",
            "Revisão do pedido",
            "Best-sellers",
            "RestaurantBrandConfig",
            "Waiter Test Center",
          ].map((t) => (
            <Pill key={t} tone="blue">{t}</Pill>
          ))}
        </div>
      </RoomCard>

      {/* 9. Limites / Código de conduta */}
      <RoomCard title="Limites · Código de conduta" badge={<Pill tone="red">Master-only</Pill>}>
        <Checks
          tone="no"
          items={[
            "Não inventar produto",
            "Não inventar preço",
            "Não prometer desconto inexistente",
            "Não ignorar alergias / restrições",
            "Não finalizar pedido sem confirmação",
            "Não controlar pagamento",
            "Não controlar entrega fora do fluxo",
            "Não listar o cardápio inteiro em texto",
            "Não insistir infinitamente em upsell",
          ]}
        />
      </RoomCard>

      {/* 10. Runtime atual (read-only) */}
      <RoomCard title="Runtime atual" hint="Fatos do código (somente leitura).">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm text-gray-800 sm:grid-cols-2">
          <div><dt className="text-xs uppercase tracking-wide text-gray-400">Constituição</dt><dd className="font-mono font-medium">WaiterAgentProfile.ts</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-gray-400">Motor</dt><dd className="font-mono font-medium">WaiterBrainV2</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-gray-400">LLM</dt><dd className="font-medium">Apenas para texto curto / controlado</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-gray-400">UI</dt><dd className="font-mono font-medium">/pedido</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-gray-400">Fonte de produtos</dt><dd className="font-medium">Catálogo real</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-gray-400">Testes</dt><dd className="font-medium">Waiter Test Center</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-gray-400">Runtime DB</dt><dd className="font-medium">Desligado{agent.isRuntimeEnabled ? " (flag ON!)" : ""}</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-gray-400">Editor</dt><dd className="font-medium">Não disponível nesta fase</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-gray-400">Versão do perfil</dt><dd className="font-medium">v{agent.version}</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-gray-400">Origem dos dados</dt><dd className="font-medium">{agent.origin === "db" ? "Banco" : "Código (registry)"}</dd></div>
        </dl>
      </RoomCard>

      {/* 11. Fluxo obrigatório */}
      <RoomCard title="Fluxo obrigatório do pedido" hint="Sequência conduzida pelo agente + UI.">
        <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[
            "Produto principal",
            "Customização",
            "Bebida",
            "Sobremesa",
            "Promoção opcional",
            "Revisão",
            "Entrega / retirada",
            "Endereço",
            "Pagamento",
            "Conclusão",
          ].map((step, i) => (
            <li key={step} className="flex items-center gap-2 text-sm text-gray-800">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-700">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-gray-500">
          Pagamento e entrega são conduzidos pela <strong>UI</strong> — o Waiter nunca confirma pagamento nem altera a entrega.
        </p>
      </RoomCard>

      {/* 12. Testes */}
      <RoomCard
        title="Testes e validação"
        badge={
          <Link href="/admin/agentes/waiter/testes" className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700">
            Abrir Waiter Test Center →
          </Link>
        }
      >
        <p className="mb-2 text-sm text-gray-700">Grupos de teste existentes (suite determinística, sem OpenAI):</p>
        <div className="flex flex-wrap gap-1.5">
          {[
            "Recomendação",
            "Upsell",
            "Restrições",
            "Checkout guidance",
            "No hallucination",
            "Orçamento",
            "Grupos / família",
            "Porção / categoria",
            "Opção leve",
          ].map((g) => (
            <Pill key={g} tone="gray">{g}</Pill>
          ))}
        </div>
        <p className="mt-3 text-xs text-gray-500">Score recente não carregado nesta tela — rode no Waiter Test Center.</p>
      </RoomCard>

      {/* 13. Próximos passos para merge */}
      <RoomCard title="Próximos passos para o merge com o runtime" hint="Checklist (read-only).">
        <ul className="space-y-1.5 text-sm text-gray-700">
          {[
            "Comparar a sala com o runtime real",
            "Trazer regras implícitas do WaiterBrainV2 para a constituição",
            "Definir o Agent Room Template final",
            "Criar versionamento antes do editor",
            "Conectar a biblioteca técnica",
            "Ativar o editor somente com rollback / testes",
            "Só depois permitir runtime ler configuração editável",
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
