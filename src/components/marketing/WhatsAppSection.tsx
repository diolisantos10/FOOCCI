/**
 * WhatsApp section. Server component.
 * Careful wording — does not promise full WhatsApp behavior.
 */

import { CheckIcon, WhatsAppIcon } from "./icons";

const POINTS = [
  "Ajuda a organizar conversas e direcionar clientes.",
  "Mantém o contexto do cardápio e do cliente.",
  "Registra histórico para o relacionamento continuar.",
  "Pode integrar ao seu fluxo de pedidos.",
];

export function WhatsAppSection() {
  return (
    <section className="bg-gray-50 py-20">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 lg:grid-cols-2 lg:px-8">
        {/* Mock panel (illustrative, no metrics) */}
        <div className="order-2 lg:order-1">
          <div className="mx-auto max-w-sm overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-lg">
            <div className="flex items-center gap-3 bg-[#075E54] px-4 py-3 text-white">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
                <WhatsAppIcon className="h-5 w-5" />
              </span>
              <span className="text-sm font-semibold">Atendimento do restaurante</span>
            </div>
            <div className="space-y-2.5 bg-[#ECE5DD] px-3 py-4">
              <div className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-[#DCF8C6] px-3 py-2 text-[13px] text-gray-800 shadow-sm">
                  Boa noite! Queria fazer um pedido 🙂
                </div>
              </div>
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-[13px] text-gray-800 shadow-sm">
                  Claro! Posso te ajudar a montar o pedido pelo nosso cardápio.
                </div>
              </div>
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-[13px] text-gray-800 shadow-sm">
                  Quer que eu já deixe registrado pra facilitar da próxima vez?
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="order-1 lg:order-2">
          <h2 className="text-3xl font-bold tracking-tight text-[#0B0B0B] sm:text-4xl">
            Transforme seu WhatsApp em um canal de venda e relacionamento.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-gray-600">
            A Foocci ajuda a organizar conversas, direcionar clientes, registrar
            histórico e manter oportunidades vivas.
          </p>
          <ul className="mt-6 space-y-3">
            {POINTS.map((p) => (
              <li key={p} className="flex items-start gap-3">
                <CheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" />
                <span className="text-base text-gray-700">{p}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
