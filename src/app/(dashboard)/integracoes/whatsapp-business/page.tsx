import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { TopBar } from "@/components/layout/TopBar";
import { MetaProviderCard } from "../whatsapp/MetaProviderCard";

export const metadata = { title: "WhatsApp Business (Meta) — Integrações" };

export default async function WhatsAppBusinessIntegrationPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <>
      <TopBar title="WhatsApp Business (Meta)" />
      <div className="mx-auto max-w-lg px-6 pt-6">
        <div className="mb-4">
          <h1 className="text-base font-bold text-gray-900">WhatsApp oficial da Meta</h1>
          <p className="mt-1 text-sm text-gray-500">
            Conexão oficial via WhatsApp Cloud API — usada para atendimento e campanhas de CRM.
            Conecte com um clique fazendo login na Meta. Sem códigos para digitar.
          </p>
        </div>
        <MetaProviderCard />
      </div>
    </>
  );
}
