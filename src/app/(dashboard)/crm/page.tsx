import { ComingSoon } from "@/components/ComingSoon";

export const metadata = { title: "CRM" };

export default function CRMPage() {
  return (
    <ComingSoon
      icon="📊"
      title="CRM"
      description="Gerencie relacionamentos com clientes, visualize histórico de pedidos, segmente sua base e crie experiências personalizadas."
      features={[
        "Perfil completo de cada cliente",
        "Histórico de pedidos e valor médio",
        "Segmentação por comportamento",
        "Tags e notas por cliente",
        "Filtros avançados e exportação",
      ]}
    />
  );
}
