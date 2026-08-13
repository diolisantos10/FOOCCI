import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { TopBar } from "@/components/layout/TopBar";
import { cardapioEstaVazio, deveAbrirOGuia } from "@/services/onboarding/onboardingStatus";
import DashboardClient from "./DashboardClient";

export const metadata = { title: "Início — Foocci" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: { painel?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  // Restaurante sem nada para vender não tem o que fazer num painel de gráficos
  // zerados: o primeiro acesso vai para o guia de configuração. `?painel=1` é a
  // saída (o próprio guia usa esse link para voltar) — sem ela o dono ficaria
  // preso num vaivém entre as duas telas.
  const restaurantId = session.user?.restaurantId;
  if (restaurantId) {
    const cardapioVazio = await cardapioEstaVazio(restaurantId);
    if (deveAbrirOGuia({ cardapioVazio, pediuPainel: searchParams?.painel === "1" })) {
      redirect("/onboarding");
    }
  }

  return (
    <>
      <TopBar title="Início" />
      <DashboardClient userName={session.user.name ?? "Usuário"} />
    </>
  );
}
