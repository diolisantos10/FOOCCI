import { ComingSoon } from "@/components/ComingSoon";

export const metadata = { title: "Marketing — Foocci" };

export default function MarketingSettingsPage() {
  return (
    <ComingSoon
      icon="📣"
      title="Marketing"
      description="Configure campanhas automáticas, recuperação de clientes e promoções diretamente pelo painel."
      features={[
        "Campanhas de WhatsApp agendadas",
        "Recuperação de clientes inativos",
        "Promoções relâmpago com horário configurado",
        "Cupons de desconto para novos clientes",
      ]}
    />
  );
}
