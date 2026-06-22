import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/admin-auth";

export default function BrandingBookPage() {
  if (!isAdminAuthenticated()) redirect("/admin/login");

  return (
    <div className="min-h-full bg-white">

      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-8 py-5">
        <h1 className="text-2xl font-bold text-gray-900">Branding Book</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Identidade da marca Foocci — uso interno. Não exposto a restaurantes.
        </p>
      </div>

      <div className="mx-auto max-w-4xl space-y-10 px-8 py-8">

        {/* What Foocci is */}
        <section>
          <SectionHeading>O que é o Foocci</SectionHeading>
          <div className="mt-4 space-y-3 text-sm text-gray-700 leading-relaxed">
            <p>
              Foocci é um <strong>Sales + CRM Engine com IA</strong> para restaurantes. É uma plataforma B2B SaaS que
              entrega agentes de atendimento, CRM adaptativo e analytics de conversão para restaurantes que vendem via
              delivery e WhatsApp.
            </p>
            <p>
              O Foocci não é um marketplace. Não é um app de delivery. Não é um chatbot genérico. É a camada de
              inteligência de vendas e relacionamento que fica entre o restaurante e o cliente.
            </p>
          </div>
        </section>

        {/* What Foocci is NOT */}
        <section>
          <SectionHeading>O que o Foocci NÃO é</SectionHeading>
          <ul className="mt-4 space-y-2 text-sm text-gray-700">
            {[
              "Não é um agente único — é uma plataforma com múltiplos agentes especializados.",
              "Não é um clone de iFood ou Rappi.",
              "Não é uma ferramenta de suporte genérico (não é Zendesk para restaurantes).",
              "Não é um sistema de PDV ou ERP.",
              "Não é voltado ao consumidor final — o cliente do Foocci é o restaurante.",
            ].map((line) => (
              <li key={line} className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 text-red-400">✕</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Positioning */}
        <section>
          <SectionHeading>Posicionamento</SectionHeading>
          <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-5 space-y-3 text-sm text-gray-700">
            <PositioningRow label="Para quem">
              Restaurantes com delivery próprio (WhatsApp, cardápio digital) que querem escalar vendas e relacionamento
              sem contratar mais atendentes.
            </PositioningRow>
            <PositioningRow label="Problema">
              Atendimento manual pelo WhatsApp é lento, inconsistente e não gera dados de CRM. O restaurante perde
              vendas, não faz reativação e não sabe quem são seus melhores clientes.
            </PositioningRow>
            <PositioningRow label="Solução">
              Agentes de IA que atendem, identificam o cliente, montam o pedido, fazem checkout e alimentam o CRM —
              tudo sem intervenção humana no fluxo principal.
            </PositioningRow>
            <PositioningRow label="Diferencial">
              Não substitui o restaurante — amplifica. O operador sempre pode retomar o controle. O agente conhece o
              cardápio, o histórico do cliente e as regras do restaurante.
            </PositioningRow>
          </div>
        </section>

        {/* Product Agents */}
        <section>
          <SectionHeading>Agentes do Produto</SectionHeading>
          <p className="mt-2 text-xs text-gray-500">
            Foocci não é um agente — é uma plataforma. Os agentes são produtos independentes dentro da plataforma.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[
              {
                name:        "Waiter Agent",
                icon:        "🤖",
                description: "Atende o cliente no WhatsApp, monta o pedido, faz checkout. É o núcleo do produto.",
              },
              {
                name:        "CRM Agent",
                icon:        "📞",
                description: "Segmenta clientes, dispara campanhas de reativação e alimenta o perfil adaptativo.",
              },
              {
                name:        "WhatsApp Agent",
                icon:        "💬",
                description: "Gerencia o canal WhatsApp: roteamento de mensagens, handoff para humano, histórico de atendimento.",
              },
              {
                name:        "Analytics Agent",
                icon:        "📊",
                description: "Processa eventos de pedido e engagement para gerar métricas no dashboard do restaurante.",
              },
            ].map((agent) => (
              <div key={agent.name} className="rounded-xl border border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xl">{agent.icon}</span>
                  <span className="font-semibold text-gray-900 text-sm">{agent.name}</span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">{agent.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Color palette */}
        <section>
          <SectionHeading>Paleta de Cores</SectionHeading>
          <p className="mt-2 text-xs text-gray-500">
            Regra 90/10: 90% neutro (preto, branco, cinza) + 10% laranja. O laranja é CTA e highlight — nunca
            decorativo.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { name: "Preto",        hex: "#0B0B0B", bg: "bg-[#0B0B0B]", text: "text-white",      role: "Texto principal, fundo escuro" },
              { name: "Branco",       hex: "#FFFFFF", bg: "bg-white border border-gray-200", text: "text-gray-900", role: "Fundo padrão, superfícies" },
              { name: "Cinza claro",  hex: "#E5E5E5", bg: "bg-[#E5E5E5]", text: "text-gray-800",   role: "Bordas, fundos de suporte" },
              { name: "Laranja",      hex: "#F97316", bg: "bg-orange-500", text: "text-white",      role: "CTA, highlight — uso restrito" },
            ].map((c) => (
              <div key={c.hex} className="rounded-xl overflow-hidden border border-gray-100">
                <div className={`h-20 ${c.bg} flex items-center justify-center`}>
                  <span className={`font-mono text-sm font-semibold ${c.text}`}>{c.hex}</span>
                </div>
                <div className="p-3">
                  <p className="font-semibold text-gray-900 text-xs">{c.name}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5 leading-tight">{c.role}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Typography */}
        <section>
          <SectionHeading>Tipografia</SectionHeading>
          <div className="mt-4 space-y-3 text-sm text-gray-700">
            <TypographyRow label="Interface (UI)">
              Inter ou sistema sans-serif. Sem serifa. Peso regular (400) para corpo, semibold (600) para títulos de
              seção, bold (700) para headings principais.
            </TypographyRow>
            <TypographyRow label="Código / Mono">
              JetBrains Mono ou sistema monospace. Usado em tokens, slugs, confirmações técnicas (ex: IMPORT_MANUAL_V01).
            </TypographyRow>
            <TypographyRow label="Escala de tamanho">
              10px (labels micro) → 11–12px (captions) → 14px (corpo UI) → 16–18px (títulos de seção) → 24px (heading
              de página).
            </TypographyRow>
          </div>
        </section>

        {/* Logo / Name */}
        <section>
          <SectionHeading>Nome e Logotipo</SectionHeading>
          <div className="mt-4 space-y-3 text-sm text-gray-700">
            <Rule label="Grafia correta">
              <strong>Foocci</strong> (maiúscula no F, minúsculas no restante). Nunca FOOCCI em caps. Nunca foocci em
              minúsculas fora de URLs/slugs.
            </Rule>
            <Rule label="Fute">
              Nome alternativo / técnico. Pode ser usado em contextos internos e URLs. Não é apresentado ao cliente
              final — o cliente vê apenas o nome do restaurante.
            </Rule>
            <Rule label="Uso de cor">
              O logotipo é primariamente branco sobre fundo escuro ou preto sobre fundo claro. O laranja pode aparecer
              como acento no ícone — nunca como cor dominante do wordmark.
            </Rule>
          </div>
        </section>

        {/* Voice and tone */}
        <section>
          <SectionHeading>Voz e Tom</SectionHeading>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ToneCard label="É" positive>
              Direto, claro, profissional sem ser formal. Fala como um produto confiável que sabe o que faz. Usa
              linguagem do restaurante (cardápio, pedido, entrega, cliente), não linguagem de startup.
            </ToneCard>
            <ToneCard label="Não é" positive={false}>
              Não é fofo nem usa emojis em excesso. Não usa jargão de tecnologia com o restaurante. Não promete o que
              não entrega. Não fala de "IA revolucionária" — fala de resultados concretos.
            </ToneCard>
          </div>
        </section>

        {/* Internal note */}
        <div className="rounded-xl border border-gray-100 bg-gray-50 px-5 py-4 text-xs text-gray-400">
          <strong className="text-gray-500">Nota interna:</strong> Este Branding Book é uma referência viva — use-o ao
          criar novos fluxos, agentes ou UI. Para conteúdo aprovado de marca (logo files, variações de cor para
          impressão, etc.), consulte o Manual Operacional → Branding / Marca.
        </div>

      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-2">
      {children}
    </h2>
  );
}

function PositioningRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="w-24 shrink-0 font-semibold text-gray-500 text-xs pt-0.5">{label}</span>
      <span>{children}</span>
    </div>
  );
}

function TypographyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-semibold text-gray-900 text-xs mb-0.5">{label}</p>
      <p className="text-xs text-gray-600 leading-relaxed">{children}</p>
    </div>
  );
}

function Rule({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-semibold text-gray-900 text-xs mb-0.5">{label}</p>
      <p className="text-xs text-gray-600 leading-relaxed">{children}</p>
    </div>
  );
}

function ToneCard({ label, children, positive }: { label: string; children: React.ReactNode; positive: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${positive ? "border-green-100 bg-green-50" : "border-red-100 bg-red-50"}`}>
      <p className={`text-xs font-bold mb-2 ${positive ? "text-green-700" : "text-red-700"}`}>{label}</p>
      <p className={`text-xs leading-relaxed ${positive ? "text-green-900" : "text-red-900"}`}>{children}</p>
    </div>
  );
}
