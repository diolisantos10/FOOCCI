/**
 * Foocci public marketing website (route: `/site`).
 *
 * REPAGINAÇÃO COMERCIAL (2026-08-02) — `docs/foocci-site/os-repaginacao-comercial.md`.
 *
 * The page used to have ELEVEN sections and 19 phone-screens of scroll, and it never
 * said what Foocci has that the competition does not. It described the product; it did
 * not argue. Now it argues, in seven sections, in the order the OS defines:
 *
 *   1. The thesis — four contracts that don't talk, or one that does
 *   2. The commission calculator — the owner does the maths on their own numbers
 *   3. The anchoring — ~R$ 700 apart vs one contract
 *   4. The three differentiators nobody else publishes
 *   5. How it works, in three steps (the detail lives in /site/como-funciona)
 *   6. Plans
 *   7. Proof + final CTA
 *
 * What was deliberately dropped: JourneySection, IntelligenceSection,
 * HospitalitySection, ProblemSection, DemoSection, RevenueRelationshipSection,
 * ProductModulesSection, ComparisonSection and FAQSection. Several said the same thing
 * with different cards, and repeated white-card blocks flatten the hierarchy. The
 * components still exist and are used by the inner pages.
 *
 * The essence stays: the hero keeps the host scene, and the numbers are there to prove
 * the story, not to replace it.
 *
 * REENQUADRAMENTO DO GANCHO (2026-08-04, ordem do CEO). A ordem das seções não mudou —
 * o que mudou foi de quem é o ponto de vista. O hero falava do NOSSO posicionamento de
 * mercado ("todo mundo vende um pedaço") antes de tocar na dor do dono. Agora abre com
 * a pergunta que o dono já se faz — quanto o marketplace leva — e emenda direto na
 * calculadora, que responde com o que sobra no bolso dele. A tese dos quatro serviços
 * que não se falam continua no site, na `FourContractsSection` (3), que é onde ela cabe.
 */

import type { Metadata } from "next";

import { HeroSection } from "@/components/marketing/HeroSection";
import { SinaisDeVenda } from "@/components/marketing/SinaisDeVenda";
import { CommissionCalculator } from "@/components/marketing/CommissionCalculator";
import { FourContractsSection } from "@/components/marketing/FourContractsSection";
import { DifferentiatorsSection } from "@/components/marketing/DifferentiatorsSection";
import { HowItWorksSection } from "@/components/marketing/HowItWorksSection";
import { PricingTeaserSection } from "@/components/marketing/PricingTeaserSection";
import { FinalCTASection } from "@/components/marketing/FinalCTASection";
import { chamadaComercial } from "@/lib/site/canalDeVendas";

const TITLE = "Foocci | Calcule quanto sobra no seu bolso todo mês";
const DESCRIPTION =
  "Descubra em 30 segundos quanto a comissão do delivery leva do seu faturamento — e quanto sobraria com o Foocci, num valor fixo por mês. Cardápio, pedido, atendimento por IA e CRM em um serviço só.";

// Indexability (index, follow) is centralized in src/app/site/layout.tsx for the
// whole /site subtree — do not set `robots` per page.
export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "Foocci",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function SitePage() {
  return (
    <>
      {/* 1 · A tese */}
      <HeroSection />
      {/* 2 · A conta que fecha a venda */}
      <CommissionCalculator chamada={chamadaComercial()} />
      {/* 3 · Quatro contratos ou um */}
      <FourContractsSection />
      {/* 4 · O que só tem aqui */}
      <DifferentiatorsSection />
      {/* 5 · Como funciona, em 3 passos */}
      <HowItWorksSection />
      {/* 6 · Planos */}
      <PricingTeaserSection />
      {/* 7 · Prova + CTA final */}
      <FinalCTASection />
    </>
  );
}
