/**
 * Comparison: chatbot vs Foocci. Server component.
 * Two cards that stack on mobile (no HTML table — mobile-friendly by design).
 */

import { CheckIcon, MinusIcon } from "./icons";

const CHATBOT = [
  "Responde perguntas",
  "Segue fluxo engessado",
  "Parece robótico",
  "Para quando a conversa acaba",
  "Não cria relacionamento",
];

const FOOCCI = [
  "Conduz o cliente até o pedido",
  "Usa contexto de cardápio e cliente",
  "Mantém linguagem humana e comercial",
  "Continua no CRM e no relacionamento",
  "Ajuda clientes a voltarem",
];

export function ComparisonSection() {
  return (
    <section className="bg-gray-50 py-20">
      <div className="mx-auto max-w-5xl px-5 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[#0B0B0B] sm:text-4xl">
            A Foocci não é um chatbot. É uma operação comercial inteligente.
          </h2>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {/* Chatbot */}
          <div className="rounded-2xl border border-gray-200 bg-white p-7">
            <h3 className="text-lg font-semibold text-gray-500">Chatbot comum</h3>
            <ul className="mt-5 space-y-3">
              {CHATBOT.map((item) => (
                <li key={item} className="flex items-start gap-3 text-gray-600">
                  <MinusIcon className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
                  <span className="text-base">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Foocci */}
          <div className="rounded-2xl border-2 border-brand-200 bg-white p-7 shadow-sm">
            <h3 className="text-lg font-bold text-[#0B0B0B]">Foocci</h3>
            <ul className="mt-5 space-y-3">
              {FOOCCI.map((item) => (
                <li key={item} className="flex items-start gap-3 text-gray-800">
                  <CheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" />
                  <span className="text-base font-medium">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="mx-auto mt-10 max-w-2xl text-center text-lg font-semibold text-[#0B0B0B]">
          Chatbot responde.{" "}
          <span className="text-brand-500">Foocci vende, relaciona e ajuda o cliente a voltar.</span>
        </p>
      </div>
    </section>
  );
}
