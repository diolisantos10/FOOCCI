import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { TopBar } from "@/components/layout/TopBar";
import OnboardingClient from "./OnboardingClient";

export const metadata = { title: "Configuração — Foocci" };

export default async function OnboardingPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  return (
    <>
      <TopBar title="Configuração do restaurante" />
      <OnboardingClient />
    </>
  );
}
