"use client";

import { signOut } from "next-auth/react";

interface TopBarProps {
  title: string;
}

export function TopBar({ title }: TopBarProps) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-[#E5E5E5] bg-white px-6">
      {/* Left: brand */}
      <span className="text-sm font-bold tracking-tight text-[#0B0B0B]">Foocci</span>

      {/* Right: user action */}
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
      >
        <span>Sair</span>
        <span className="text-gray-300">↗</span>
      </button>
    </header>
  );
}
