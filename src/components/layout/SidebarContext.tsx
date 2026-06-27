"use client";

import { createContext, useContext, useState } from "react";

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
}

const SidebarContext = createContext<SidebarCtx>({
  open: false,
  toggle: () => {},
  close: () => {},
  restaurant: { name: null, logoUrl: null },
});

export function useSidebar() {
  return useContext(SidebarContext);
}

export function SidebarProvider({
  children,
  restaurant = { name: null, logoUrl: null },
}: {
  children: React.ReactNode;
  restaurant?: ShellRestaurant;
}) {
  const [open, setOpen] = useState(false);
  return (
    <SidebarContext.Provider
      value={{
        open,
        toggle: () => setOpen((v) => !v),
        close: () => setOpen(false),
        restaurant,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}
