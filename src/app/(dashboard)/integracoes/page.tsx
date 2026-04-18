import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { TopBar } from "@/components/layout/TopBar";
import { IntegrationsCenterClient } from "./IntegrationsCenterClient";

export const metadata = { title: "Integrações — Foocci" };

export default async function IntegracoesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <>
      <TopBar title="Integrações" />
      <IntegrationsCenterClient userRole={session.user.role} />
    </>
  );
}
