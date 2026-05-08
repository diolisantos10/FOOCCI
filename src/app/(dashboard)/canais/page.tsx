import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TopBar } from "@/components/layout/TopBar";
import { CanaisClient } from "./CanaisClient";

export const metadata = { title: "Canais" };

export default async function CanaisPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const restaurant = await prisma.restaurant.findUnique({
    where:  { id: session.user.restaurantId },
    select: { slug: true },
  });

  return (
    <>
      <TopBar title="Canais & Links Rastreáveis" />
      <CanaisClient restaurantSlug={restaurant?.slug ?? ""} />
    </>
  );
}
