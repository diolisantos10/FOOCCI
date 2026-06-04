"use client";

/**
 * FAQ accordion (home). Client component. Includes pre-launch questions.
 */

import { useState } from "react";
import { PlusIcon } from "./icons";

const FAQS = [
  {
    q: "A Foocci já está disponível?",
    a: "A Foocci está em fase piloto e terá abertura comercial em breve.",
  },
  {
    q: "Posso contratar agora?",
    a: "A contratação ainda não está aberta. Neste momento, o site apresenta a proposta, a visão e o funcionamento da Foocci.",
  },
  {
    q: "Quando será o lançamento?",
    a: "O lançamento comercial será anunciado em breve.",
  },
  {
    q: "A Foocci é um chatbot?",
    a: "Não. A Foocci usa inteligência artificial, mas é um sistema de vendas, relacionamento e fidelização para restaurantes.",
  },
  {
    q: "Preciso trocar meu sistema atual?",
    a: "Não necessariamente. A Foocci pode atuar como uma camada comercial para melhorar pedido direto, atendimento e relacionamento.",
  },
  {
    q: "A Foocci funciona com WhatsApp?",
    a: "Sim, o WhatsApp é um dos canais centrais da experiência Foocci, principalmente para atendimento, relacionamento e retorno de clientes.",
  },
  {
    q: "A Foocci substitui meu atendente?",
    a: "Não. Ela ajuda a equipe a atender melhor, vender com mais contexto e manter o restaurante no controle.",
  },
  {
    q: "Ela serve para restaurante pequeno?",
    a: "Sim. A Foocci foi pensada para simplificar vendas, relacionamento e recorrência sem exigir uma operação complexa.",
  },
  {
    q: "Preciso entender de tecnologia?",
    a: "Não. A tecnologia trabalha no bastidor. A experiência precisa ser simples para o dono, a equipe e o cliente.",
  },
];

export function FAQSection() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="perguntas" className="scroll-mt-20 bg-white py-20">
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
