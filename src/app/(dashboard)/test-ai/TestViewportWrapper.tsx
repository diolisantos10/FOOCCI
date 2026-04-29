"use client";

import type { ReactNode } from "react";

export type ViewMode = "mobile" | "desktop";

interface Props {
  mode:     ViewMode;
  children: ReactNode;
}

/**
 * Wraps the chat area in a realistic phone frame (mobile) or
 * full-width container (desktop) for UX testing purposes.
 * Does NOT affect AI logic, orders, or backend.
 */
export function TestViewportWrapper({ mode, children }: Props) {
  if (mode === "desktop") {
    return (
      <div className="mx-auto flex w-full max-w-[900px] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        {children}
      </div>
    );
  }

  // Mobile — realistic phone frame
  return (
    <div className="flex flex-1 items-center justify-center overflow-auto py-4">
      <div
        className="flex shrink-0 flex-col overflow-hidden shadow-2xl"
        style={{
          width:        390,
          height:       700,
          borderRadius: "2.5rem",
          border:       "10px solid #0f172a",
          background:   "#0f172a",
        }}
      >
        {/* Simulated iOS status bar */}
        <div className="flex shrink-0 items-center justify-between bg-slate-900 px-5 py-1.5 text-[10px] font-semibold text-white">
          <span>9:41</span>
          <span className="text-white/50">●●● WiFi 🔋</span>
        </div>

        {/* Content — fills the phone screen, scrolls internally */}
        <div
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          style={{ borderRadius: "0 0 1.8rem 1.8rem", background: "#fff" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
