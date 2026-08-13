import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/layout/Sidebar";
import { SidebarProvider } from "@/components/layout/SidebarContext";
import { AssistantProvider } from "@/components/help/AssistantProvider";
import { GlobalAlertEngine } from "@/components/layout/GlobalAlertEngine";
import { carregarResumoDoGuia, type ResumoDoGuia } from "@/services/onboarding/onboardingStatus";

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
  // O guia de configuração é calculado UMA vez aqui e desce pelo contexto: o menu
  // lateral ("Começar aqui") e o vazio do painel precisam da mesma resposta, e
  // duas leituras independentes divergiriam na primeira mudança de regra.
  let guia: ResumoDoGuia | null = null;
  if (session?.user?.restaurantId) {
    const rid = session.user.restaurantId;
    const [r, brand, resumo] = await Promise.all([
      prisma.restaurant.findUnique({ where: { id: rid }, select: { name: true, logoUrl: true } }),
      prisma.restaurantBrandConfig.findUnique({ where: { restaurantId: rid }, select: { brandPersona: true } }),
      carregarResumoDoGuia(rid),
    ]);
    guia = resumo;
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
    <SidebarProvider restaurant={restaurant} guia={guia}>
      {/* O Assistente não tem faixa própria: ele é uma pílula DENTRO do `TopBar`
          (ver AssistantPill). O provedor guarda o estado aqui em cima porque o
          `TopBar` é remontado a cada rota — a conversa precisa sobreviver. */}
      <AssistantProvider>
        <div className="flex h-screen overflow-hidden bg-canvas">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <main className="flex-1 overflow-y-auto">{children}</main>
          </div>
          <GlobalAlertEngine />
        </div>
      </AssistantProvider>
    </SidebarProvider>
  );
}
