import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { TopBar } from "@/components/layout/TopBar";
import { AprendizadoWhatsAppClient } from "./AprendizadoWhatsAppClient";

export const metadata = { title: "Central de Aprendizado WhatsApp" };

export default async function AprendizadoWhatsAppPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <>
      <TopBar title="Central de Aprendizado WhatsApp" />
      <AprendizadoWhatsAppClient />
    </>
  );
}
