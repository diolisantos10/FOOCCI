import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { TopBar } from "@/components/layout/TopBar";
import { GoogleIntegrationClient } from "./GoogleIntegrationClient";

export const metadata = { title: "Google — Integrações" };

export default async function GoogleIntegrationPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <>
      <TopBar title="Google" />
      <GoogleIntegrationClient userRole={session.user.role} />
    </>
  );
}
