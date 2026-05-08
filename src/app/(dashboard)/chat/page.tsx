import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { TopBar } from "@/components/layout/TopBar";
import { ChatClient } from "./ChatClient";

export const metadata = { title: "Chat IA" };

export default async function ChatPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <>
      <TopBar title="Chat IA" />
      <ChatClient userId={session.user.id} />
    </>
  );
}
