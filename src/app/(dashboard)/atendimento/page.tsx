import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { TopBar } from "@/components/layout/TopBar";
import { AtendimentoClient } from "./AtendimentoClient";

export const metadata = { title: "Atendimento" };

export default async function AtendimentoPage({
  searchParams,
}: {
  searchParams: { conv?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const isOwner = session.user.role === "OWNER";
  const isManagerOrOwner = ["OWNER", "MANAGER"].includes(session.user.role ?? "");

  return (
    <>
      <TopBar title="Atendimento" />
      <AtendimentoClient
        userId={session.user.id}
        initialConvId={searchParams.conv}
        isOwner={isOwner}
        isManagerOrOwner={isManagerOrOwner}
      />
    </>
  );
}
