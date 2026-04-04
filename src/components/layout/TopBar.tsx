"use client";

import { signOut } from "next-auth/react";

interface TopBarProps {
  title: string;
}

export function TopBar({ title }: TopBarProps) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-[#E5E5E5] bg-white px-6">
      <h1 className="text-sm font-bold tracking-tight text-[#0B0B0B]">{title}</h1>
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
      >
        Sair
      </button>
    </header>
  );
}
