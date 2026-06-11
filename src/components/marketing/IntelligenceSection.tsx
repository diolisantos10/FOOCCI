/**
 * Home — "inteligência trabalhando" block (placed right after the journey).
 * Server component.
 *
 * Turns the page from "image + text" into a product moment: a composed product
 * showcase plus four connected capability cards. Pre-launch: illustrative only,
 * no metrics, no claims.
 */

import { Eyebrow } from "./premium";
import { FoocciProductShowcase } from "./FoocciProductShowcase";
import { ProductFlowCards } from "./ProductFlowCards";

export function IntelligenceSection() {
  return (
    <section
      aria-labelledby="inteligencia-title"
      className="relative overflow-hidden bg-gradient-to-b from-white to-gray-50 py-20 lg:py-24"
    >
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>Sistema inteligente em ação</Eyebrow>
          <h2
            id="inteligencia-title"
            className="mt-3 text-3xl font-semibold tracking-tight text-[#0B0B0B] sm:text-4xl"
          >
            Por trás de cada experiência, existe inteligência trabalhando.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-gray-600">
            O sistema Foocci conecta pedido, cliente, histórico e campanhas para
            transformar cada atendimento em uma nova oportunidade de relacionamento.
          </p>
        </div>

        <div className="mt-12 lg:mt-14">
          <FoocciProductShowcase />
        </div>

        <div className="mt-12 lg:mt-16">
          <ProductFlowCards />
        </div>
      </div>
    </section>
  );
}
