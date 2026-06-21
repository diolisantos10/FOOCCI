import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { TopBar } from "@/components/layout/TopBar";
import { PrintStationsClient } from "./PrintStationsClient";

export const metadata = { title: "Impressão — Integrações" };

export default async function ImpressaoIntegrationPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <>
      <TopBar title="Impressão (Cozinhas)" />
      <PrintStationsClient userRole={session.user.role} />
    </>
  );
}
