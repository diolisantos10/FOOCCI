import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { TopBar } from "@/components/layout/TopBar";
import { FacebookIntegrationClient } from "./FacebookIntegrationClient";

export const metadata = { title: "Facebook — Integrações" };

export default async function FacebookIntegrationPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <>
      <TopBar title="Facebook" />
      <FacebookIntegrationClient userRole={session.user.role} />
    </>
  );
}
