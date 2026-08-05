import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { TopBar } from "@/components/layout/TopBar";
import { MetaProviderCard } from "./MetaProviderCard";

export const metadata = { title: "WhatsApp — Integrações" };

// Canal único: a conta oficial da Meta (+ Coexistência). O painel de QR/pareamento
// que existia aqui (`WhatsAppIntegrationClient`) foi apagado em 04/08/2026 junto com
// a Evolution — na Meta não há QR: o número é conectado pela própria Meta.
export default async function WhatsAppIntegrationPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <>
      <TopBar title="WhatsApp" />
      <div className="mx-auto max-w-2xl px-4 pt-4 sm:px-6">
        <MetaProviderCard />
      </div>
    </>
  );
}
