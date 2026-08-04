import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/layout/Sidebar";
import { SidebarProvider } from "@/components/layout/SidebarContext";
import { AssistantBar } from "@/components/help/AssistantBar";
import { GlobalAlertEngine } from "@/components/layout/GlobalAlertEngine";

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

  // Partner restaurant brand for the TopBar account cluster. The logo the owner
  // uploads on the "Marca" page is stored in RestaurantBrandConfig.brandPersona
  // (JSON), NOT Restaurant.logoUrl — so prefer that, falling back to the
  // restaurant record. Same for the display name (brandName overrides).
  let restaurant = { name: null as string | null, logoUrl: null as string | null };
  if (session?.user?.restaurantId) {
    const rid = session.user.restaurantId;
    const [r, brand] = await Promise.all([
      prisma.restaurant.findUnique({ where: { id: rid }, select: { name: true, logoUrl: true } }),
      prisma.restaurantBrandConfig.findUnique({ where: { restaurantId: rid }, select: { brandPersona: true } }),
    ]);
    if (r) {
      const persona = (brand?.brandPersona ?? {}) as { logoUrl?: unknown; brandName?: unknown };
      const personaLogo = typeof persona.logoUrl === "string" ? persona.logoUrl.trim() : "";
      const personaName = typeof persona.brandName === "string" ? persona.brandName.trim() : "";
      restaurant = {
        name: personaName || r.name,
        logoUrl: personaLogo || r.logoUrl || null,
      };
    }
  }

  return (
    <SidebarProvider restaurant={restaurant}>
      <div className="flex h-screen overflow-hidden bg-canvas">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* O Assistente vive no TOPO do painel — sempre à mão, em toda tela.
              Altura publicada em `--assistant-bar` (globals.css). */}
          <AssistantBar />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
        <GlobalAlertEngine />
      </div>
    </SidebarProvider>
  );
}
