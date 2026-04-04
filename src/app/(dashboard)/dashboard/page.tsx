import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { TopBar } from "@/components/layout/TopBar";
import DashboardClient from "./DashboardClient";

export const metadata = { title: "Dashboard — Foocci" };

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <>
      <TopBar title="Dashboard" />
      <DashboardClient userName={session.user.name ?? "Usuário"} />
    </>
  );
}
