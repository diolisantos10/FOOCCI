import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { TopBar } from "@/components/layout/TopBar";
import { AnalyticsClient } from "./AnalyticsClient";

export const metadata = { title: "Analytics — Foocci" };

export default async function AnalyticsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <>
      <TopBar title="Analytics" />
      <AnalyticsClient />
    </>
  );
}
