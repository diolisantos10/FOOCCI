import { ComingSoon } from "@/components/ComingSoon";

export const metadata = { title: "Marketing" };

export default function MarketingPage() {
  return (
    <ComingSoon
      icon="📢"
      title="Marketing"
      description="Crie campanhas, envie mensagens em massa pelo WhatsApp, programe promoções e meça resultados — tudo em um único lugar."
      features={[
        "Campanhas de WhatsApp em massa",
        "Cupons e promoções por tempo limitado",
        "Mensagens automáticas de reativação",
        "Análise de conversão por campanha",
        "Integração com base de clientes",
      ]}
    />
  );
}
