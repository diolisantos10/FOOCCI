"use client";

import { Search, Bell, Plus } from "lucide-react";

interface AgencyHeaderProps {
  title: string;
  subtitle?: string;
  action?: {
    label: string;
    onClick?: () => void;
  };
}

export function AgencyHeader({ title, subtitle, action }: AgencyHeaderProps) {
  return (
    <header className="flex h-14 flex-none items-center justify-between border-b border-[#E8E8E5] bg-white px-8">
      <div>
        <h1 className="text-[15px] font-semibold text-[#0A0A0A]">{title}</h1>
        {subtitle && (
          <p className="text-[12px] text-[#71717A] mt-0.5">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button
          className="flex h-8 items-center gap-2 rounded-md border border-[#E8E8E5] bg-[#FAFAF9] px-3 text-[12px] text-[#71717A] transition-colors hover:border-[#D4D4D0] hover:text-[#0A0A0A]"
        >
          <Search size={12} />
          <span>Search...</span>
          <kbd className="ml-2 rounded border border-[#E8E8E5] px-1 text-[10px] text-[#A1A1AA]">
            ⌘K
          </kbd>
        </button>
        <button className="relative flex h-8 w-8 items-center justify-center rounded-md border border-[#E8E8E5] text-[#71717A] transition-colors hover:border-[#D4D4D0] hover:text-[#0A0A0A]">
          <Bell size={14} />
          <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-[#5B5BD6] text-[8px] text-white">
            3
          </span>
        </button>
        {action && (
          <button
            onClick={action.onClick}
            className="flex h-8 items-center gap-1.5 rounded-md bg-[#5B5BD6] px-3 text-[12px] font-medium text-white transition-colors hover:bg-[#4C4CB8]"
          >
            <Plus size={13} />
            {action.label}
          </button>
        )}
      </div>
    </header>
  );
}
