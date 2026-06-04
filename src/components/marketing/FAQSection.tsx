"use client";

/**
 * FAQ accordion. Client component.
 */

import { useState } from "react";
import { PlusIcon } from "./icons";

const FAQS = [
  {
    q: "A Foocci é um chatbot?",
    a: "Não. A Foocci é um sistema de vendas, relacionamento e fidelização. Ela conduz o pedido, registra o cliente e ajuda ele a voltar — não apenas responde mensagens.",
  },
  {
    q: "Preciso trocar meu sistema atual?",
    a: "Não precisa começar do zero. A Foocci se soma à sua operação para fortalecer o pedido direto, o WhatsApp e o relacionamento com o cliente.",
  },
  {
    q: "A Foocci funciona com WhatsApp?",
    a: "Sim. Ela ajuda a organizar conversas, direcionar o cliente para o pedido e manter o histórico para o relacionamento continuar.",
  },
  {
    q: "A Foocci substitui meu atendente?",
    a: "Não. Ela apoia o atendimento, cuida do que é repetitivo e deixa sua equipe livre para focar no que realmente importa.",
  },
  {
    q: "Ela serve para restaurante pequeno?",
    a: "Sim. A Foocci foi pensada para ser simples e crescer junto com a operação, do restaurante pequeno ao grande.",
  },
  {
    q: "Preciso entender de tecnologia para usar?",
    a: "Não. A linguagem é simples e a configuração inicial é feita junto com você na demonstração.",
  },
  {
    q: "Como funciona a demonstração?",
    a: "Mostramos a Foocci aplicada ao seu restaurante — com seu cardápio, seus clientes e sua operação — para você ver o valor na prática.",
  },
];

export function FAQSection() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="perguntas" className="scroll-mt-20 bg-gray-50 py-20">
      <div className="mx-auto max-w-3xl px-5 lg:px-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[#0B0B0B] sm:text-4xl">
            Perguntas frequentes
          </h2>
        </div>

        <div className="mt-10 divide-y divide-gray-200 overflow-hidden rounded-2xl border border-gray-200 bg-white">
          {FAQS.map((item, i) => {
            const isOpen = open === i;
            return (
              <div key={item.q}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-gray-50"
                >
                  <span className="text-base font-semibold text-[#0B0B0B]">{item.q}</span>
                  <PlusIcon
                    className={`h-5 w-5 shrink-0 text-brand-500 transition-transform duration-200 ${
                      isOpen ? "rotate-45" : ""
                    }`}
                  />
                </button>
                {isOpen && (
                  <p className="px-5 pb-5 text-base leading-relaxed text-gray-600">{item.a}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
