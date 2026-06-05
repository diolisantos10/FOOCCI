/**
 * Strategic shift. Server component.
 * Positions Foocci as strengthening direct channels — not attacking marketplaces.
 * Includes a passive-model vs Foocci comparison.
 */

import { CheckIcon, MinusIcon } from "./icons";
import { SectionHeading } from "./SectionHeading";

const PASSIVE = [
  "Link de cardápio",
  "Atendimento solto",
  "Cliente sem histórico",
  "Venda isolada",
];

const SMART = [
  "Pedido conduzido",
  "Cliente identificado",
  "CRM ativo",
  "Recorrência construída",
];

export function StrategicShiftSection() {
  return (
    <section aria-labelledby="shift-title" className="bg-white py-20">
      <div className="mx-auto max-w-5xl px-5 lg:px-8">
        <SectionHeading
          id="shift-title"
          eyebrow="Mudança estratégica"
          title="Pedido direto não cresce só com link. Cresce com experiência."
          subtitle="Ter um cardápio online é só o começo. O restaurante que quer vender mais precisa conduzir o cliente, entender seu histórico e manter relacionamento depois da compra."
        />

        {/* Passive vs Foocci */}
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-7">
            <h3 className="text-sm font-semibold uppercase tracking-widest text-gray-400">
              Modelo passivo
            </h3>
            <ul className="mt-5 space-y-3">
              {PASSIVE.map((item) => (
                <li key={item} className="flex items-center gap-3 text-gray-600">
                  <MinusIcon className="h-5 w-5 shrink-0 text-gray-400" />
                  <span className="text-base">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border-2 border-brand-200 bg-white p-7 shadow-sm">
            <h3 className="text-sm font-semibold uppercase tracking-widest text-brand-600">
              Com a Foocci
            </h3>
            <ul className="mt-5 space-y-3">
              {SMART.map((item) => (
                <li key={item} className="flex items-center gap-3 text-gray-800">
                  <CheckIcon className="h-5 w-5 shrink-0 text-brand-500" />
                  <span className="text-base font-medium">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <figure className="mx-auto mt-12 max-w-xl text-center">
          <blockquote className="text-lg font-semibold text-[#0B0B0B]">
            “Marketplace entrega pedido.{" "}
            <span className="text-brand-500">Relacionamento constrói cliente.</span>”
          </blockquote>
          <figcaption className="mt-3 text-sm text-gray-500">
            A Foocci fortalece os seus canais diretos para você vender mais com margem.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
