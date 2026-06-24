import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { TopBar } from "@/components/layout/TopBar";
import { WhatsAppIntegrationClient } from "./WhatsAppIntegrationClient";

export const metadata = { title: "WhatsApp — Integrações" };

export default async function WhatsAppIntegrationPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <>
      <TopBar title="WhatsApp" />
      <WhatsAppIntegrationClient userRole={session.user.role} />
    </>
  );
}
