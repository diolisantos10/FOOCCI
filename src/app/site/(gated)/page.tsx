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
 */

import type { Metadata } from "next";

import { HeroSection } from "@/components/marketing/HeroSection";
import { CommissionCalculator } from "@/components/marketing/CommissionCalculator";
import { FourContractsSection } from "@/components/marketing/FourContractsSection";
import { DifferentiatorsSection } from "@/components/marketing/DifferentiatorsSection";
import { HowItWorksSection } from "@/components/marketing/HowItWorksSection";
import { PricingTeaserSection } from "@/components/marketing/PricingTeaserSection";
import { FinalCTASection } from "@/components/marketing/FinalCTASection";

const TITLE = "Foocci | Pare de pagar comissão e seja dono dos seus clientes";
const DESCRIPTION =
  "Cardápio, pedido, atendimento por IA e CRM de fidelidade em um serviço só — e conversando entre si. Calcule quanto você paga de comissão ao marketplace hoje.";

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
      <CommissionCalculator />
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
