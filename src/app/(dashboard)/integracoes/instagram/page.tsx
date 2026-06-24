import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { TopBar } from "@/components/layout/TopBar";
import { InstagramIntegrationClient } from "./InstagramIntegrationClient";

export const metadata = { title: "Instagram — Integrações" };

export default async function InstagramIntegrationPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <>
      <TopBar title="Instagram" />
      <InstagramIntegrationClient userRole={session.user.role} />
    </>
  );
}
