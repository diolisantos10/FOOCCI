import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { TopBar } from "@/components/layout/TopBar";
import OrdersClient from "./OrdersClient";

export const metadata = { title: "Pedidos — Foocci" };

export default async function OrdersPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const isOwner = session.user.role === "OWNER";
  const isManagerOrOwner = ["OWNER", "MANAGER"].includes(session.user.role ?? "");

  return (
    <>
      <TopBar title="Pedidos" />
      <OrdersClient isOwner={isOwner} isManagerOrOwner={isManagerOrOwner} />
    </>
  );
}
