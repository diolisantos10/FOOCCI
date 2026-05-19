"use client";

import { useEffect } from "react";

export function AutoPrintTrigger() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 900);
    return () => clearTimeout(t);
  }, []);
  return null;
}
