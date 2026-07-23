import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { TopBar } from "@/components/layout/TopBar";
import { MetaProviderCard } from "./MetaProviderCard";

export const metadata = { title: "WhatsApp — Integrações" };

// Evolution (WhatsAppIntegrationClient) is intentionally not rendered here: the product
// now runs on the official Meta Cloud API (+ Coexistence). The Evolution backend stays
// intact for any legacy connection; only the management UI was removed for clarity.
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
