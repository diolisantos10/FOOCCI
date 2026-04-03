import { ComingSoon } from "@/components/ComingSoon";

export const metadata = { title: "Personalização" };

export default function PersonalizacaoPage() {
  return (
    <ComingSoon
      icon="🎨"
      title="Personalização do Foocci"
      description="Adapte cores, fontes, logotipo e a identidade visual do seu cardápio digital e das mensagens do agente de WhatsApp."
      features={[
        "Tema de cores personalizado",
        "Logotipo e favicon do cardápio",
        "Banners e destaques na home",
        "Mensagens personalizadas por ocasião",
        "Modo escuro para o cardápio",
      ]}
    />
  );
}
