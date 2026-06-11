/**
 * Foocci public marketing website — Creative Direction V3 (route: `/site`).
 *
 * "Hospitalidade digital inteligente" — thesis: relacionamento → recorrência →
 * faturamento. Editorial 11-section rhythm (see docs/foocci-site/
 * creative-direction-v3-hospitalidade.md). Pre-launch: gated + noindex via the
 * /site layout; no sales, no WhatsApp, no lead capture.
 *
 * Positioning (official): Foocci é um sistema inteligente de vendas,
 * relacionamento e fidelização para restaurantes.
 */

import type { Metadata } from "next";

import { HeroSection } from "@/components/marketing/HeroSection";
import { JourneySection } from "@/components/marketing/JourneySection";
import { IntelligenceSection } from "@/components/marketing/IntelligenceSection";
import { HospitalitySection } from "@/components/marketing/HospitalitySection";
import { ProblemSection } from "@/components/marketing/ProblemSection";
import { DemoSection } from "@/components/marketing/DemoSection";
import { RevenueRelationshipSection } from "@/components/marketing/RevenueRelationshipSection";
import { ProductModulesSection } from "@/components/marketing/ProductModulesSection";
import { ComparisonSection } from "@/components/marketing/ComparisonSection";
import { PricingTeaserSection } from "@/components/marketing/PricingTeaserSection";
import { FAQSection } from "@/components/marketing/FAQSection";
import { FinalCTASection } from "@/components/marketing/FinalCTASection";

const TITLE = "Foocci | Sistema inteligente de vendas e CRM para restaurantes";
const DESCRIPTION =
  "A Foocci está preparando uma nova forma de ajudar restaurantes a vender mais, atender melhor no WhatsApp, ativar CRM e aumentar recorrência.";

// PRE-LAUNCH: indexability (noindex, follow) is centralized in
// src/app/site/layout.tsx for the whole /site subtree. At launch (~julho), flip
// it there so the public pages become indexable.
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
      {/* 1 · Hero emocional premium (anfitrião) */}
      <HeroSection />
      {/* 2 · Jornada visual — relacionamento → recorrência */}
      <JourneySection />
      {/* 3 · Inteligência trabalhando (produto: showcase + cards conectados) */}
      <IntelligenceSection />
      {/* 4 · Mais que tecnologia, hospitalidade */}
      <HospitalitySection />
      {/* 4 · Problema: restaurantes perdem relacionamento */}
      <ProblemSection />
      {/* 5 · Foocci como sistema inteligente (preview do produto) */}
      <DemoSection />
      {/* 6 · Relacionamento que vira faturamento (âncora escura, #crm) */}
      <RevenueRelationshipSection />
      {/* 7 · Módulos (#solucoes) */}
      <ProductModulesSection />
      {/* 8 · Comparativo Foocci vs chatbot comum */}
      <ComparisonSection />
      {/* 9 · Pré-lançamento / planos */}
      <PricingTeaserSection />
      {/* 10 · FAQ */}
      <FAQSection />
      {/* 11 · CTA final com mascote */}
      <FinalCTASection />
    </>
  );
}
