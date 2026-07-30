/**
 * Admin → Agente de CRM — a escada, com o restaurante escolhido aqui.
 *
 * Os interruptores do agente saíram do painel do lojista. O motivo é de
 * produto, não de código: ligar a IA numa campanha é decisão de quem opera o
 * Foocci. O dono do restaurante quer saber se vendeu — o painel dele ficou só
 * com o resultado.
 *
 * As rotas são as mesmas do painel (`/api/crm/agent`, `/agent/activation`,
 * `/crm/automations`); a única diferença é o admin poder declarar de quem é o
 * restaurante. Não existe segunda mecânica para manter em sincronia.
 */

import { CrmAgenteEscadaPanel } from "./CrmAgenteEscadaPanel";

const DEGRAUS: Array<{ label: string; detail: string }> = [
  {
    label: "0. Desligado",
    detail: "A inteligência inteira off. O restaurante roda o CRM na mão — nada que o agente escreveu chega a cliente.",
  },
  {
    label: "1. Aprendiz",
    detail: "Ligada, mas nenhuma campanha ativada. Ele observa, mede e acumula frases campeãs em sombra. Nada vai ao cliente.",
  },
  {
    label: "2. Ativo por campanha",
    detail: "Campanha por campanha, com o ganho projetado à vista. Só sobe onde a evidência já existe — e o botão de pânico desliga tudo de uma vez.",
  },
];

export default function AdminCrmAgentePage() {
  return (
    <div className="min-h-full space-y-4 bg-white px-8 py-6">
      <section className="rounded-xl border border-brand-200 bg-brand-50 p-4">
        <h1 className="text-xl font-bold text-gray-900">🪜 Agente de CRM — escada por restaurante</h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-700">
          Os controles do agente moram aqui, e não no painel do lojista. Ligar a IA numa campanha é
          operação do produto; o dono do restaurante vê o <strong>resultado</strong> e não precisa
          carregar o interruptor de um agente que ainda está aprendendo.
        </p>
        <p className="mt-2 text-[11px] font-semibold text-green-700">
          🔒 Aprendiz é o default seguro: o agente observa e mede; nada que ele escreveu vai a cliente.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {DEGRAUS.map((d) => (
          <div key={d.label} className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-sm font-bold text-gray-900">{d.label}</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-600">{d.detail}</p>
          </div>
        ))}
      </section>

      <CrmAgenteEscadaPanel />
    </div>
  );
}
