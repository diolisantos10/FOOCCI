"use client";

import { createContext, useContext, useState } from "react";
import type { ResumoDoGuia } from "@/services/onboarding/onboardingStatus";

export interface ShellRestaurant {
  name:    string | null;
  logoUrl: string | null;
}

interface SidebarCtx {
  open: boolean;
  toggle: () => void;
  close: () => void;
  /** Partner restaurant brand, surfaced in the TopBar account cluster. */
  restaurant: ShellRestaurant;
  /**
   * Guia de configuração, calculado no servidor (layout do painel). `null` quando
   * não há restaurante no contexto ou o banco falhou — e aí nada é afirmado sobre
   * o guia, nem que falta nem que está pronto.
   */
  guia: ResumoDoGuia | null;
}

const SidebarContext = createContext<SidebarCtx>({
  open: false,
  toggle: () => {},
  close: () => {},
  restaurant: { name: null, logoUrl: null },
  guia: null,
});

export function useSidebar() {
  return useContext(SidebarContext);
}

export function SidebarProvider({
  children,
  restaurant = { name: null, logoUrl: null },
  guia = null,
}: {
  children: React.ReactNode;
  restaurant?: ShellRestaurant;
  guia?: ResumoDoGuia | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <SidebarContext.Provider
      value={{
        open,
        toggle: () => setOpen((v) => !v),
        close: () => setOpen(false),
        restaurant,
        guia,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}
