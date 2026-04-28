"use client";

import { useEffect } from "react";

export function AppVersionLogger() {
  useEffect(() => {
    console.info(
      `[Foocci] APP_VERSION=${process.env.NEXT_PUBLIC_APP_VERSION ?? "dev"} | ${new Date().toISOString()}`
    );
  }, []);
  return null;
}
