import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import OrdersClient from "./OrdersClient";

export const metadata = { title: "Pedidos — Foocci" };

export default async function OrdersPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return <OrdersClient />;
}
