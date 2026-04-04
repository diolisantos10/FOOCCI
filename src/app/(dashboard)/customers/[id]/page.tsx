import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { TopBar } from "@/components/layout/TopBar";
import { prisma } from "@/lib/prisma";
import CustomerProfileClient from "./CustomerProfileClient";

export const metadata = { title: "Perfil do Cliente" };

export default async function CustomerDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const customer = await prisma.customer.findUnique({
    where: { id: params.id },
    select: {
      id:          true,
      name:        true,
      phone:       true,
      email:       true,
      totalOrders: true,
      totalSpend:  true,
      lastOrderAt: true,
      createdAt:   true,
      isActive:    true,
      restaurantId: true,
    },
  });

  if (!customer || customer.restaurantId !== session.user.restaurantId) {
    notFound();
  }

  return (
    <>
      <TopBar title={customer.name} />
      <CustomerProfileClient
        id={customer.id}
        name={customer.name}
        phone={customer.phone}
        email={customer.email}
        totalOrders={customer.totalOrders}
        totalSpend={Number(customer.totalSpend)}
        lastOrderAt={customer.lastOrderAt?.toISOString() ?? null}
        createdAt={customer.createdAt.toISOString()}
        isActive={customer.isActive}
      />
    </>
  );
}
