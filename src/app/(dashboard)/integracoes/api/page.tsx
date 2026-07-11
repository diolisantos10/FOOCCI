import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { TopBar } from "@/components/layout/TopBar";
import { ApiConnectionsClient } from "./ApiConnectionsClient";

export const metadata = { title: "Conexões externas (API) — Foocci" };

export default async function ApiConnectionsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <>
      <TopBar title="Conexões externas" />
      <ApiConnectionsClient userRole={session.user.role} />
    </>
  );
}
