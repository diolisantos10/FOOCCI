import { ComingSoon } from "@/components/ComingSoon";

export const metadata = { title: "Integrações" };

export default function IntegracoesPage() {
  return (
    <ComingSoon
      icon="🔌"
      title="Integrações"
      description="Conecte o Foocci ao seu sistema de PDV, plataformas de delivery, gateways de pagamento e outras ferramentas do seu negócio."
      features={[
        "iFood e Rappi (importação de cardápio)",
        "Mercado Pago e PagSeguro",
        "PDVs via API",
        "Google Meu Negócio",
        "Webhooks e API pública",
      ]}
    />
  );
}
