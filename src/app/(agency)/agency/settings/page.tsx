"use client";

import { useState } from "react";
import {
  Settings, User, Bell, Palette, Shield, Database,
  ChevronRight, Bot, RotateCcw, HardDrive, AlertTriangle,
  FolderKanban, Users, CheckSquare, FileDown, FileText,
} from "lucide-react";
import { useAgencyStore } from "@/lib/agency/store";

const GROUPS = [
  {
    label: "Account",
    icon: User,
    color: "#5B5BD6",
    items: [
      { label: "Profile",           desc: "Name, email, and personal preferences" },
      { label: "Appearance",        desc: "Theme, density, and display settings" },
      { label: "Language & Region", desc: "Locale, timezone, and date format" },
    ],
  },
  {
    label: "Notifications",
    icon: Bell,
    color: "#D97706",
    items: [
      { label: "Alert preferences", desc: "When and how to be notified" },
      { label: "Project updates",   desc: "Pipeline changes and task completions" },
    ],
  },
  {
    label: "Design System",
    icon: Palette,
    color: "#EA580C",
    items: [
      { label: "Brand colors",  desc: "Customize accent and UI colors" },
      { label: "Typography",    desc: "Font and size preferences" },
    ],
  },
  {
    label: "Agents",
    icon: Bot,
    color: "#8B5CF6",
    items: [
      { label: "Agent configuration",  desc: "Default behaviors and parameters" },
      { label: "Orchestrator rules",   desc: "Pipeline logic and agent selection" },
    ],
  },
  {
    label: "Data",
    icon: Database,
    color: "#0D9488",
    items: [
      { label: "Export", desc: "Download your workspace data" },
      { label: "Import", desc: "Migrate from other tools" },
    ],
  },
  {
    label: "Security",
    icon: Shield,
    color: "#DC2626",
    items: [
      { label: "Access control", desc: "Manage who can access the platform" },
      { label: "Audit log",      desc: "Track all actions in the system" },
    ],
  },
];

export default function SettingsPage() {
  const { clients, projects, tasks, deliverables, briefings, activity, resetStore } = useAgencyStore();
  const [confirmReset, setConfirmReset] = useState(false);

  function handleReset() {
    resetStore();
    setConfirmReset(false);
  }

  const stats = [
    { label: "Clients",      value: clients.length,      icon: Users,         color: "#5B5BD6" },
    { label: "Projects",     value: projects.length,     icon: FolderKanban,  color: "#8B5CF6" },
    { label: "Tasks",        value: tasks.length,        icon: CheckSquare,   color: "#0D9488" },
    { label: "Deliverables", value: deliverables.length, icon: FileDown,      color: "#D97706" },
    { label: "Briefings",    value: briefings.length,    icon: FileText,      color: "#EA580C" },
    { label: "Activity Log", value: activity.length,     icon: Database,      color: "#A1A1AA" },
  ];

  return (
    <div className="min-h-full" style={{ backgroundColor: "#F5F5F3" }}>
      <div className="px-8 py-7">
        {/* Header */}
        <div className="mb-7 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F4F4F5]">
            <Settings size={15} strokeWidth={1.75} className="text-[#71717A]" />
          </div>
          <div>
            <h1 className="text-[18px] font-bold text-[#0A0A0A]">Settings</h1>
            <p className="text-[12px] text-[#A1A1AA]">Platform configuration and workspace management</p>
          </div>
        </div>

        {/* ── Workspace Panel ────────────────────────────────────────── */}
        <div
          className="mb-6 overflow-hidden rounded-xl border border-[#E5E5E2] bg-white"
          style={{ boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)" }}
        >
          {/* Panel header */}
          <div className="flex items-center justify-between border-b border-[#F0F0EE] px-6 py-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#F0FDF4]">
                <HardDrive size={13} strokeWidth={1.75} className="text-[#16A34A]" />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-[#0A0A0A]">Workspace</p>
                <p className="text-[11px] text-[#A1A1AA]">Auto-saved to localStorage · Persists across sessions</p>
              </div>
            </div>
            <span className="flex items-center gap-1.5 rounded-full bg-[#DCFCE7] px-2.5 py-1 text-[10px] font-semibold text-[#166534]">
              <span className="h-[5px] w-[5px] rounded-full bg-[#16A34A]" />
              Persistent
            </span>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-6 divide-x divide-[#F5F5F3] border-b border-[#F0F0EE]">
            {stats.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="px-5 py-4 text-center">
                  <div className="mx-auto mb-1.5 flex h-7 w-7 items-center justify-center rounded-lg" style={{ backgroundColor: `${s.color}12` }}>
                    <Icon size={12} style={{ color: s.color }} strokeWidth={1.75} />
                  </div>
                  <p className="mono-num text-[18px] font-bold text-[#0A0A0A]" style={{ letterSpacing: "-0.02em" }}>
                    {s.value}
                  </p>
                  <p className="mt-0.5 text-[10px] font-medium text-[#A1A1AA]">{s.label}</p>
                </div>
              );
            })}
          </div>

          {/* Reset section */}
          <div className="px-6 py-4">
            {!confirmReset ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[12.5px] font-medium text-[#52525B]">Reset demo data</p>
                  <p className="text-[11px] text-[#A1A1AA]">
                    Restores the workspace to the original mock dataset. All user changes will be lost.
                  </p>
                </div>
                <button
                  onClick={() => setConfirmReset(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-[#E5E5E2] px-4 py-2 text-[12px] font-medium text-[#52525B] transition-colors hover:border-[#DC2626] hover:text-[#DC2626]"
                >
                  <RotateCcw size={12} /> Reset
                </button>
              </div>
            ) : (
              <div className="flex items-start gap-4 rounded-xl border border-[#FECACA] bg-[#FFF5F5] px-5 py-4">
                <AlertTriangle size={16} className="mt-0.5 flex-none text-[#DC2626]" />
                <div className="flex-1">
                  <p className="text-[13px] font-semibold text-[#991B1B]">Reset workspace?</p>
                  <p className="mt-0.5 text-[11px] text-[#DC2626]">
                    This will delete all clients, projects, tasks, and activity you created.
                    The original mock dataset will be restored. This cannot be undone.
                  </p>
                </div>
                <div className="flex flex-none items-center gap-2">
                  <button
                    onClick={() => setConfirmReset(false)}
                    className="rounded-lg border border-[#E5E5E2] bg-white px-3 py-1.5 text-[12px] font-medium text-[#52525B] transition-colors hover:border-[#D0D0CC]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleReset}
                    className="flex items-center gap-1.5 rounded-lg bg-[#DC2626] px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#B91C1C]"
                  >
                    <RotateCcw size={11} /> Confirm Reset
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Settings groups ────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-4">
          {GROUPS.map((group) => {
            const Icon = group.icon;
            return (
              <div
                key={group.label}
                className="overflow-hidden rounded-xl border border-[#E5E5E2] bg-white"
                style={{ boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)" }}
              >
                <div className="flex items-center gap-3 border-b border-[#F0F0EE] px-5 py-4">
                  <div
                    className="flex h-7 w-7 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `${group.color}12` }}
                  >
                    <Icon size={13} strokeWidth={1.75} style={{ color: group.color }} />
                  </div>
                  <h2 className="text-[13px] font-semibold text-[#0A0A0A]">{group.label}</h2>
                </div>
                <div>
                  {group.items.map((item, i) => (
                    <button
                      key={item.label}
                      className="group flex w-full items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-[#FAFAF9]"
                      style={{ borderBottom: i < group.items.length - 1 ? "1px solid #F5F5F3" : "none" }}
                    >
                      <div>
                        <p className="text-[12.5px] font-medium text-[#0A0A0A] transition-colors group-hover:text-[#5B5BD6]">
                          {item.label}
                        </p>
                        <p className="text-[11px] text-[#A1A1AA]">{item.desc}</p>
                      </div>
                      <ChevronRight size={12} className="text-[#D0D0CC] transition-colors group-hover:text-[#5B5BD6]" />
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* System info */}
        <div
          className="mt-6 rounded-xl border border-[#E5E5E2] bg-white px-6 py-4"
          style={{ boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)" }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] font-semibold text-[#0A0A0A]">Dioli Agency OS</p>
              <p className="text-[11px] text-[#A1A1AA]">Version 1.0.0 · MVP · Internal use only · Zustand + localStorage persistence</p>
            </div>
            <span className="flex items-center gap-1.5 rounded-full bg-[#DCFCE7] px-3 py-1.5 text-[11px] font-semibold text-[#166534]">
              <span className="h-[6px] w-[6px] rounded-full bg-[#16A34A]" />
              All systems operational
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
