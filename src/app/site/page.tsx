/**
 * Foocci public marketing website — V1 (route: `/site`).
 *
 * Isolated, public, indexable. Composed of static section components; only the
 * header, FAQ, product-preview tabs and demo form are client components.
 *
 * Positioning (official): Foocci é um sistema inteligente de vendas,
 * relacionamento e fidelização para restaurantes.
 */

import type { Metadata } from "next";

import { HeroSection } from "@/components/marketing/HeroSection";
import { ProblemSection } from "@/components/marketing/ProblemSection";
import { StrategicShiftSection } from "@/components/marketing/StrategicShiftSection";
import { PillarsSection } from "@/components/marketing/PillarsSection";
import { HowItWorksSection } from "@/components/marketing/HowItWorksSection";
import { ProductModulesSection } from "@/components/marketing/ProductModulesSection";
import { CRMSection } from "@/components/marketing/CRMSection";
import { WhatsAppSection } from "@/components/marketing/WhatsAppSection";
import { RecoverySection } from "@/components/marketing/RecoverySection";
import { EssenceBand } from "@/components/marketing/EssenceBand";
import { ComparisonSection } from "@/components/marketing/ComparisonSection";
import { DemoSection } from "@/components/marketing/DemoSection";
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
      <HeroSection />
      <ProblemSection />
      <StrategicShiftSection />
      <PillarsSection />
      <HowItWorksSection />
      <ProductModulesSection />
      <CRMSection />
      <WhatsAppSection />
      <RecoverySection />
      <EssenceBand />
      <ComparisonSection />
      <DemoSection />
      <PricingTeaserSection />
      <FAQSection />
      <FinalCTASection />
    </>
  );
}
