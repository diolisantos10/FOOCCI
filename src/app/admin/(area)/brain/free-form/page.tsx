/**
 * Admin → Brain → Free-form — a escada governada do raciocínio livre.
 *
 * Server component com o contexto fixo da escada + o painel operacional
 * (client component) que mostra modo atual, gates, evidência de sombra e os
 * botões de promoção/rollback. Promover NUNCA pula degrau — os gates rodam no
 * servidor a cada transição; aqui é só a interface humana.
 */

import Link from "next/link";
import { BrainFreeFormPanel } from "./BrainFreeFormPanel";

const STEPS: Array<{ mode: string; label: string; detail: string }> = [
  { mode: "SHADOW_ONLY", label: "1. Shadow", detail: "O Brain observa e loga; o recepcionista responde. Default seguro — sem linha no banco = shadow." },
  { mode: "ALLOWLIST", label: "2. Allowlist", detail: "Só telefones do time recebem respostas do Brain. Exige gates PASS + confirm explícito." },
  { mode: "RESTAURANT_WIDE", label: "3. Restaurante inteiro", detail: "Clientes REAIS recebem respostas. Exige reconhecimento explícito + gates + Change Request CRITICAL." },
];

export default function AdminBrainFreeFormPage() {
  return (
    <div className="min-h-full space-y-4 bg-white px-8 py-6">
      <section className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
        <h1 className="text-xl font-bold text-gray-900">🪜 Brain Free-form — escada governada</h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-700">
          O raciocínio livre do Brain só sobe de degrau com <strong>evidência auditável</strong>: golden set p0=0,
          verdade completa e desempenho provado em sombra. Nada aqui envia mensagem, cria pedido ou Pix —
          tudo é <strong>config-only</strong>, com rollback de 30 segundos.
        </p>
        <p className="mt-2 text-[11px] font-semibold text-green-700">
          🔒 SHADOW_ONLY é o default seguro: o Brain observa e loga; o recepcionista continua atendendo.
        </p>
        <p className="mt-2 text-[11px] text-gray-500">
          <Link href="/admin/brain" className="font-semibold text-indigo-600 hover:underline">← Voltar ao painel do Brain</Link>
        </p>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-900">Degraus da escada</h2>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.mode} className="rounded-lg border border-gray-200 p-3">
              <p className="text-sm font-bold text-gray-900">{s.label}</p>
              <p className="mt-1 font-mono text-[10px] text-gray-400">{s.mode}</p>
              <p className="mt-1 text-[11px] text-gray-500">{s.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <BrainFreeFormPanel />
    </div>
  );
}
