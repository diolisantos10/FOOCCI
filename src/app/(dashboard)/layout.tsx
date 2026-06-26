import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/layout/Sidebar";
import { SidebarProvider } from "@/components/layout/SidebarContext";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Internal E2E bypass: middleware already validated the x-e2e-token and
  // injected x-e2e-bypass. Skip the session check for those requests.
  const isE2E = headers().get("x-e2e-bypass") === "1";

  let session = null;
  if (!isE2E) {
    try {
      session = await getServerSession(authOptions);
    } catch {
      // Throws when NEXTAUTH_SECRET is missing; treat as unauthenticated.
    }

    if (!session) {
      redirect("/login");
    }
  }

  // Partner restaurant brand for the sidebar co-brand lockup.
  let restaurant: { name: string; logoUrl: string | null } | null = null;
  if (session?.user?.restaurantId) {
    restaurant = await prisma.restaurant.findUnique({
      where: { id: session.user.restaurantId },
      select: { name: true, logoUrl: true },
    });
  }

  return (
    <SidebarProvider>
      <div className="flex h-screen overflow-hidden bg-canvas">
        <Sidebar
          restaurantName={restaurant?.name ?? null}
          restaurantLogoUrl={restaurant?.logoUrl ?? null}
        />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
