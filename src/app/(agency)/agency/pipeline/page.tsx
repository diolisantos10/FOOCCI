"use client";

import { useState } from "react";
import {
  GitBranch, AlertCircle, Clock, ChevronLeft, ChevronRight, Plus,
} from "lucide-react";
import { PipelineStage, Project } from "@/lib/agency/mock-data";
import { useAgencyStore } from "@/lib/agency/store";
import Link from "next/link";

const COLUMNS: { key: PipelineStage; label: string; color: string; dot: string }[] = [
  { key: "briefing",   label: "Briefing",   color: "#8E8E9A", dot: "#C0C0BC" },
  { key: "diagnosis",  label: "Diagnosis",  color: "#D97706", dot: "#D97706" },
  { key: "planning",   label: "Planning",   color: "#3B82F6", dot: "#3B82F6" },
  { key: "production", label: "Production", color: "#8B5CF6", dot: "#8B5CF6" },
  { key: "review",     label: "Review",     color: "#F97316", dot: "#F97316" },
  { key: "delivery",   label: "Delivery",   color: "#0D9488", dot: "#0D9488" },
  { key: "ongoing",    label: "Ongoing",    color: "#16A34A", dot: "#16A34A" },
  { key: "completed",  label: "Completed",  color: "#A1A1AA", dot: "#D0D0CC" },
];

const STAGE_ORDER = COLUMNS.map((c) => c.key);

const STATUS_META: Record<string, { color: string; label: string }> = {
  active:    { color: "#16A34A", label: "Active" },
  at_risk:   { color: "#CA8A04", label: "At Risk" },
  blocked:   { color: "#DC2626", label: "Blocked" },
  completed: { color: "#A1A1AA", label: "Done" },
  paused:    { color: "#C0C0BC", label: "Paused" },
};

interface KanbanCardProps {
  project: Project;
  currentStage: PipelineStage;
  onMove: (dir: 1 | -1) => void;
  recentlyMoved: boolean;
}

function KanbanCard({ project, currentStage, onMove, recentlyMoved }: KanbanCardProps) {
  const status     = STATUS_META[project.status] ?? { color: "#A1A1AA", label: project.status };
  const isCritical = project.priority === "critical";
  const isHighRisk = project.status === "at_risk" || project.status === "blocked";
  const stageIdx   = STAGE_ORDER.indexOf(currentStage);
  const canPrev    = stageIdx > 0;
  const canNext    = stageIdx < STAGE_ORDER.length - 1;

  return (
    <div
      className="group/card relative rounded-xl border bg-white transition-all"
      style={{
        borderColor: recentlyMoved ? "#5B5BD6" : isHighRisk ? "#FECACA" : "#E5E5E2",
        boxShadow: recentlyMoved
          ? "0 0 0 2px #EEEEFD, 0 1px 2px 0 rgba(0,0,0,0.04)"
          : "0 1px 2px 0 rgba(0,0,0,0.04)",
      }}
    >
      <Link href={`/agency/projects/${project.id}`} className="block p-4 hover:no-underline">
        {/* Status + priority */}
        <div className="mb-3 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: status.color }}>
            <span className="h-[5px] w-[5px] flex-none rounded-full" style={{ backgroundColor: status.color }} />
            {status.label}
          </span>
          {isCritical && (
            <span className="rounded-[4px] bg-[#FEE2E2] px-[5px] py-[2px] text-[9px] font-bold uppercase tracking-wide text-[#991B1B]">
              Critical
            </span>
          )}
          {!isCritical && project.priority === "high" && (
            <span className="rounded-[4px] bg-[#FFF0E8] px-[5px] py-[2px] text-[9px] font-semibold uppercase tracking-wide text-[#9A3412]">
              High
            </span>
          )}
        </div>

        {/* Name */}
        <p className="line-clamp-2 text-[12.5px] font-semibold leading-snug text-[#0A0A0A] transition-colors group-hover/card:text-[#5B5BD6]">
          {project.name}
        </p>
        <p className="mt-1 text-[11px] text-[#A1A1AA]">{project.clientName}</p>

        {/* Footer */}
        <div className="mt-3.5 flex items-center justify-between border-t border-[#F5F5F3] pt-3">
          <div className="flex items-center gap-1 text-[10px] text-[#C0C0BC]">
            <Clock size={9} />
            <span className="mono-num">{project.deadline.slice(5)}</span>
          </div>
          {isHighRisk && (
            <AlertCircle size={12} style={{ color: project.status === "blocked" ? "#DC2626" : "#CA8A04" }} />
          )}
        </div>
      </Link>

      {/* Stage controls — appear on hover */}
      <div className="flex items-center justify-between border-t border-[#F5F5F3] px-2 py-2 opacity-0 transition-opacity group-hover/card:opacity-100">
        <button
          onClick={() => onMove(-1)}
          disabled={!canPrev}
          className="flex items-center gap-0.5 rounded-[5px] px-2 py-1 text-[10px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-20"
          style={{ color: canPrev ? "#52525B" : "#D0D0CC" }}
        >
          <ChevronLeft size={10} strokeWidth={2} />
          Prev
        </button>
        <span className="text-[9px] font-semibold uppercase tracking-[0.06em] text-[#D0D0CC]">Move</span>
        <button
          onClick={() => onMove(1)}
          disabled={!canNext}
          className="flex items-center gap-0.5 rounded-[5px] px-2 py-1 text-[10px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-20"
          style={{ color: canNext ? "#52525B" : "#D0D0CC" }}
        >
          Next
          <ChevronRight size={10} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

export default function PipelinePage() {
  const { projects, moveProjectStage } = useAgencyStore();
  const [recentMoves, setRecentMoves] = useState<Record<string, boolean>>({});

  function moveStage(id: string, dir: 1 | -1) {
    const project = projects.find((p) => p.id === id);
    if (!project) return;
    const idx     = STAGE_ORDER.indexOf(project.stage);
    const nextIdx = idx + dir;
    if (nextIdx < 0 || nextIdx >= STAGE_ORDER.length) return;
    const next = STAGE_ORDER[nextIdx] as PipelineStage;

    moveProjectStage(id, next);
    setRecentMoves((prev) => ({ ...prev, [id]: true }));
    setTimeout(() => setRecentMoves((prev) => ({ ...prev, [id]: false })), 1500);
  }

  return (
    <div className="min-h-full" style={{ backgroundColor: "#F5F5F3" }}>
      <div className="px-8 py-7">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#EEF6FF]">
              <GitBranch size={15} strokeWidth={1.75} className="text-[#3B82F6]" />
            </div>
            <div>
              <h1 className="text-[18px] font-bold text-[#0A0A0A]" style={{ letterSpacing: "-0.01em" }}>
                Pipeline
              </h1>
              <p className="text-[12px] text-[#A1A1AA]">
                {projects.length} project{projects.length !== 1 ? "s" : ""} · hover a card to move stages
              </p>
            </div>
          </div>

          {/* Legend + New Project */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-4 text-[11px] text-[#A1A1AA]">
              {[
                { color: "#16A34A", label: "Active" },
                { color: "#CA8A04", label: "At Risk" },
                { color: "#DC2626", label: "Blocked" },
              ].map((l) => (
                <span key={l.label} className="flex items-center gap-1.5">
                  <span className="h-[6px] w-[6px] rounded-full" style={{ backgroundColor: l.color }} />
                  {l.label}
                </span>
              ))}
            </div>
            <Link
              href="/agency/orchestrator"
              className="flex items-center gap-1.5 rounded-lg bg-[#5B5BD6] px-3 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#4848C2]"
            >
              <Plus size={12} /> New
            </Link>
          </div>
        </div>

        {/* Kanban board */}
        <div className="flex gap-3 overflow-x-auto pb-6" style={{ scrollbarWidth: "none" }}>
          {COLUMNS.map((col) => {
            const colProjects = projects.filter((p) => p.stage === col.key);
            return (
              <div key={col.key} className="w-[216px] flex-none">
                {/* Column header */}
                <div className="mb-3 flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <span className="h-[6px] w-[6px] rounded-full" style={{ backgroundColor: col.dot }} />
                    <span className="text-[11px] font-semibold uppercase tracking-[0.07em]" style={{ color: col.color }}>
                      {col.label}
                    </span>
                  </div>
                  <span
                    className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[9px] font-bold"
                    style={{
                      backgroundColor: colProjects.length > 0 ? `${col.dot}18` : "#F0F0EE",
                      color: colProjects.length > 0 ? col.color : "#C0C0BC",
                    }}
                  >
                    {colProjects.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="min-h-[100px] space-y-2">
                  {colProjects.map((project) => (
                    <KanbanCard
                      key={project.id}
                      project={project}
                      currentStage={project.stage}
                      onMove={(dir) => moveStage(project.id, dir)}
                      recentlyMoved={!!recentMoves[project.id]}
                    />
                  ))}
                  {colProjects.length === 0 && (
                    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#EAEAE8] py-8 gap-1">
                      <span className="text-[9px] font-semibold uppercase tracking-[0.07em] text-[#D0D0CC]">Empty</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div className="w-4 flex-none" />
        </div>
      </div>
    </div>
  );
}
