/**
 * Admin → Brain — read-only status panel of the Foocci Brain v1.
 *
 * Pure server component, NO data mutation, NO client fetching: shows the
 * architecture status (what exists, who consumes it, what's next). The Brain
 * never touches the live runtime — this page is documentation that breathes.
 */

const MODULES: Array<{ name: string; status: "PRONTO" | "PARCIAL" | "FUTURO"; detail: string }> = [
  { name: "Contrato cognitivo (BrainReasoningRequest/Result)", status: "PRONTO", detail: "Contrato raiz reutilizável; o Waiter já mapeia para ele." },
  { name: "Brain Director (governança)", status: "PRONTO", detail: "Mudanças do Brain viram change requests; aprovação é sempre humana; nada executa sozinho." },
  { name: "AI Engine Router", status: "PRONTO", detail: "Default atual preservado (OpenAI). Troca de motor exige change request — nunca em runtime." },
  { name: "Knowledge Base Contract + adapter de restaurante", status: "PRONTO", detail: "Snapshot agregado e sem PII: pagamentos, delivery, cardápio, materiais, evidências." },
  { name: "Reasoning Layer (guardrails + coerência + fallback)", status: "PRONTO", detail: "Nascida no Waiter; contrato canônico re-exportado pelo Brain." },
  { name: "Training Center (propostas → aprovação humana)", status: "PRONTO", detail: "Casos reais viram propostas; aprovado vira pool de aprendizado; runtime intocado." },
  { name: "Quality Gate (P0=0 antes de produção)", status: "PRONTO", detail: "Gate do Waiter exposto no contrato do Brain." },
  { name: "Evidence Layer (provas de resultado)", status: "PRONTO", detail: "Provas sanitizadas; uso comercial exige aprovação + flag pública." },
  { name: "CRM / WhatsApp / Analytics como consumidores", status: "FUTURO", detail: "Mesmo contrato, mesmos guardrails, mesmo Director." },
  { name: "Persistência de change requests do Director", status: "FUTURO", detail: "v1 é in-memory por design — contrato antes de banco." },
];

const AGENTS: Array<{ name: string; connected: boolean; note: string }> = [
  { name: "Waiter", connected: true, note: "Consumidor de referência (adapter Brain ↔ Waiter Reasoning)." },
  { name: "CRM", connected: false, note: "Próximo a conectar." },
  { name: "WhatsApp", connected: false, note: "Próximo a conectar." },
  { name: "Analytics", connected: false, note: "Próximo a conectar." },
];

function StatusPill({ status }: { status: "PRONTO" | "PARCIAL" | "FUTURO" }) {
  const cls =
    status === "PRONTO" ? "bg-green-50 text-green-700" : status === "PARCIAL" ? "bg-amber-50 text-amber-700" : "bg-violet-50 text-violet-700";
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{status === "PRONTO" ? "Pronto" : status === "PARCIAL" ? "Parcial" : "Futuro"}</span>;
}

export default function AdminBrainPage() {
  return (
    <div className="min-h-full space-y-4 bg-white px-8 py-6">
      <section className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
        <h1 className="text-xl font-bold text-gray-900">🧠 Foocci Brain — v1 em construção</h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-700">
          A IA não é o produto. <strong>O Brain é o produto.</strong> A IA é o motor; o Brain é a arquitetura;
          o Brain Director é o guardião; a Knowledge Base é a verdade; os agentes são os executores;
          o treinamento melhora; a qualidade protege; as provas validam.
        </p>
        <p className="mt-2 text-[11px] font-semibold text-green-700">
          🔒 Camada 100% segura: o Brain raciocina e propõe — nunca altera o atendimento real sozinho. Runtime intocado.
        </p>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-900">Camadas da arquitetura</h2>
        <ol className="mt-2 grid grid-cols-1 gap-1 text-sm text-gray-800 sm:grid-cols-3">
          {["CEO / Dono do negócio", "Brain Director (guardião)", "Foocci Brain (arquitetura)", "AI Engine Router (motores)", "Knowledge Base (verdade)", "Agent Departments (executores)", "Training Center (melhora)", "Quality & Simulation (protege)", "Evidence Layer (valida)"].map((l, i) => (
            <li key={l} className="flex gap-2"><span className="font-bold text-indigo-600">{i + 1}.</span><span>{l}</span></li>
          ))}
        </ol>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-900">Módulos</h2>
        <div className="mt-2 space-y-1.5">
          {MODULES.map((m) => (
            <div key={m.name} className="flex flex-wrap items-baseline gap-2 border-b border-gray-100 pb-1.5 text-sm last:border-0">
              <StatusPill status={m.status} />
              <span className="font-semibold text-gray-900">{m.name}</span>
              <span className="text-xs text-gray-500">{m.detail}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-900">Agentes conectados</h2>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-4">
          {AGENTS.map((a) => (
            <div key={a.name} className="rounded-lg border border-gray-200 p-3">
              <p className="text-sm font-bold text-gray-900">{a.name}</p>
              <p className="mt-1"><span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${a.connected ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"}`}>{a.connected ? "Conectado" : "Futuro"}</span></p>
              <p className="mt-1 text-[11px] text-gray-500">{a.note}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-900">Próximos passos</h2>
        <ul className="mt-2 space-y-1 text-sm text-gray-700">
          {[
            "Conectar o CRM como segundo consumidor do contrato cognitivo.",
            "Persistir change requests do Brain Director (hoje in-memory por design).",
            "Knowledge snapshot mais rico (horários detalhados, promoções).",
            "Roteamento de motor por agente via change request governado.",
          ].map((s) => (
            <li key={s} className="flex gap-2"><span className="text-gray-400">☐</span><span>{s}</span></li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-gray-400">Docs: docs/business-brain-architecture.md · docs/foocci-brain-v1.md</p>
      </section>
    </div>
  );
}
