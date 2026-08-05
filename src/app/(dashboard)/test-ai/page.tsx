import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { TopBar } from "@/components/layout/TopBar";
import { TestAIHubClient } from "./TestAIHubClient";

export const metadata = { title: "Testar IA" };

export default async function TestAIPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const headersList = await headers();
  const host  = headersList.get("host")              ?? "localhost:3000";
  const proto = headersList.get("x-forwarded-proto") ?? "http";
  const appOrigin = `${proto}://${host}`;

  const restaurant = await prisma.restaurant.findUnique({
    where:  { id: session.user.restaurantId },
    select: { slug: true, name: true },
  });
  if (!restaurant) redirect("/dashboard");

  const pedidoUrl = `${appOrigin}/pedido/${restaurant.slug}`;

  // A tela desconta `--topbar` da altura: sem o cabeçalho, sobrava uma faixa.
  return (
    <>
      <TopBar title="Testar IA" />
      <TestAIHubClient
        restaurantName={restaurant.name}
        restaurantSlug={restaurant.slug}
        pedidoUrl={pedidoUrl}
      />
    </>
  );
}
