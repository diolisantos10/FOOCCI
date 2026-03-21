"use client";

import { useState } from "react";
import {
  Cpu, Zap, Bot, GitBranch, AlertTriangle,
  CheckCircle2, Loader2, Circle, Check,
} from "lucide-react";
import { MOCK_AGENTS } from "@/lib/agency/mock-data";
import Link from "next/link";

type OrchestratorState = "idle" | "analyzing" | "plan_ready" | "approved";

const MOCK_OUTPUT = {
  pipeline: [
    { stage: "Briefing",   status: "complete", note: "Brief received and analyzed." },
    { stage: "Diagnosis",  status: "complete", note: "Market and business context assessed." },
    { stage: "Planning",   status: "current",  note: "Pipeline defined. Agents selected. Ready to execute." },
    { stage: "Production", status: "upcoming", note: "Agents execute tasks in assigned sequence." },
    { stage: "Review",     status: "upcoming", note: "Internal quality check before delivery." },
    { stage: "Delivery",   status: "upcoming", note: "Final output delivered to client." },
  ],
  agents: ["Marketing Strategist", "Copy Agent", "Design Agent", "Traffic Agent"],
  tasks: [
    { seq: "01", agent: "Marketing Strategist", task: "Define positioning and audience personas" },
    { seq: "02", agent: "Copy Agent",           task: "Write campaign copy — 3 angle variants" },
    { seq: "03", agent: "Design Agent",         task: "Produce 6 ad creatives (feed + stories)" },
    { seq: "04", agent: "Traffic Agent",        task: "Build Meta Ads campaign structure and targeting" },
  ],
  risks: [
    { level: "high",   text: "Missing client photography — Design Agent output will be blocked until assets are received." },
    { level: "medium", text: "Deadline is 14 days. Recommend parallel execution between Copy and Design to compress timeline." },
  ],
};

const FIELD_LABEL = "text-[10px] font-semibold uppercase tracking-[0.08em] text-[#71717A]";
const INPUT_BASE  = "w-full rounded-lg border border-[#E5E5E2] bg-[#FAFAF9] px-3 py-2.5 text-[13px] text-[#0A0A0A] outline-none transition-colors focus:border-[#5B5BD6] focus:bg-white";

const STEPS = [
  { n: "01", label: "Submit brief",        state: ["analyzing", "plan_ready", "approved"] },
  { n: "02", label: "Orchestrator analyzes", state: ["analyzing", "plan_ready", "approved"] },
  { n: "03", label: "Pipeline generated",  state: ["plan_ready", "approved"] },
  { n: "04", label: "Agents assigned",     state: ["plan_ready", "approved"] },
  { n: "05", label: "Approve & activate",  state: ["approved"] },
];

export default function OrchestratorPage() {
  const [orchState, setOrchState] = useState<OrchestratorState>("idle");
  const [form, setForm] = useState({
    client: "", type: "", goal: "", deadline: "", budget: "", notes: "",
  });

  const canRun     = !!form.goal.trim() && !!form.type && !!form.client;
  const isAnalyzing = orchState === "analyzing";
  const showOutput  = orchState === "plan_ready" || orchState === "approved";
  const isApproved  = orchState === "approved";

  function handleAnalyze() {
    setOrchState("analyzing");
    setTimeout(() => setOrchState("plan_ready"), 1800);
  }

  function handleApprove() {
    setOrchState("approved");
  }

  function handleReset() {
    setOrchState("idle");
    setForm({ client: "", type: "", goal: "", deadline: "", budget: "", notes: "" });
  }

  return (
    <div className="min-h-full" style={{ backgroundColor: "#F5F5F3" }}>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="border-b border-[#E5E5E2] bg-white px-8 py-5">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-[#EEEEFD]">
            <Cpu size={18} strokeWidth={1.75} className="text-[#5B5BD6]" />
          </div>
          <div>
            <h1 className="text-[20px] font-bold text-[#0A0A0A]" style={{ letterSpacing: "-0.02em" }}>
              Orchestrator
            </h1>
            <p className="mt-0.5 text-[13px] text-[#71717A]">
              Submit a project brief and receive a complete execution plan — pipeline, agents, tasks, and risk flags.
            </p>
          </div>
        </div>

        {/* Step strip */}
        <div className="mt-5 flex items-center gap-0 border-t border-[#F0F0EE] pt-4">
          {STEPS.map((step, i, arr) => {
            const isActive   = step.state.includes(orchState);
            const isRunning  = orchState === "analyzing" && step.n === "02";
            return (
              <div key={step.n} className="flex items-center">
                <div className="flex items-center gap-2">
                  <span
                    className="mono-num text-[10px] font-bold transition-colors"
                    style={{ color: isActive ? "#5B5BD6" : "#D0D0CC" }}
                  >
                    {isRunning ? (
                      <Loader2 size={10} className="animate-spin text-[#5B5BD6]" />
                    ) : step.n}
                  </span>
                  <span
                    className="text-[11px] font-medium transition-colors"
                    style={{ color: isActive ? "#0A0A0A" : "#C0C0BC" }}
                  >
                    {step.label}
                  </span>
                </div>
                {i < arr.length - 1 && (
                  <span className="mx-3" style={{ color: isActive ? "#A1A1AA" : "#E5E5E2" }}>→</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-6 px-8 py-7">

        {/* ── Left: Input Form ───────────────────────────────────────── */}
        <div className="col-span-2">
          <div
            className="overflow-hidden rounded-xl border border-[#E5E5E2] bg-white"
            style={{ boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)" }}
          >
            <div className="border-b border-[#F0F0EE] px-5 py-4">
              <p className="text-[13px] font-semibold text-[#0A0A0A]">Project Brief</p>
              <p className="mt-0.5 text-[11px] text-[#A1A1AA]">
                The more precise the brief, the more accurate the execution plan.
              </p>
            </div>
            <div className="space-y-4 px-5 py-5">
              {/* Client */}
              <div>
                <label className={`mb-1.5 block ${FIELD_LABEL}`}>Client</label>
                <select
                  value={form.client}
                  onChange={(e) => setForm({ ...form, client: e.target.value })}
                  disabled={isApproved}
                  className={INPUT_BASE}
                >
                  <option value="">Select client...</option>
                  <option>Santioh</option>
                  <option>Sushikasa</option>
                  <option>Dioli Studio</option>
                </select>
              </div>

              {/* Type */}
              <div>
                <label className={`mb-1.5 block ${FIELD_LABEL}`}>Project Type</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  disabled={isApproved}
                  className={INPUT_BASE}
                >
                  <option value="">Select type...</option>
                  <option>Paid Media Campaign</option>
                  <option>Brand Identity / Rebrand</option>
                  <option>SEO &amp; Content</option>
                  <option>Social Media</option>
                  <option>Landing Page</option>
                  <option>Full Marketing Strategy</option>
                  <option>Performance Analysis</option>
                </select>
              </div>

              {/* Goal */}
              <div>
                <label className={`mb-1.5 block ${FIELD_LABEL}`}>Business Goal</label>
                <textarea
                  rows={3}
                  value={form.goal}
                  onChange={(e) => setForm({ ...form, goal: e.target.value })}
                  disabled={isApproved}
                  placeholder="What does this project need to achieve? Be specific."
                  className={`${INPUT_BASE} resize-none placeholder-[#D0D0CC]`}
                />
              </div>

              {/* Deadline + Budget */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`mb-1.5 block ${FIELD_LABEL}`}>Deadline</label>
                  <input
                    type="date"
                    value={form.deadline}
                    onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                    disabled={isApproved}
                    className={INPUT_BASE}
                  />
                </div>
                <div>
                  <label className={`mb-1.5 block ${FIELD_LABEL}`}>Budget</label>
                  <input
                    type="text"
                    value={form.budget}
                    onChange={(e) => setForm({ ...form, budget: e.target.value })}
                    disabled={isApproved}
                    placeholder="e.g. R$ 15,000"
                    className={`${INPUT_BASE} placeholder-[#D0D0CC]`}
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className={`mb-1.5 block ${FIELD_LABEL}`}>Additional Context</label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  disabled={isApproved}
                  placeholder="Constraints, references, dependencies..."
                  className={`${INPUT_BASE} resize-none placeholder-[#D0D0CC]`}
                />
              </div>

              {/* CTA */}
              {!isApproved ? (
                <button
                  onClick={handleAnalyze}
                  disabled={!canRun || isAnalyzing}
                  className="flex w-full items-center justify-center gap-2 rounded-lg py-3 text-[13px] font-semibold transition-all"
                  style={{
                    backgroundColor: canRun && !isAnalyzing ? "#5B5BD6" : "#E5E5E2",
                    color: canRun && !isAnalyzing ? "#FFFFFF" : "#A1A1AA",
                    cursor: canRun && !isAnalyzing ? "pointer" : "not-allowed",
                  }}
                >
                  {isAnalyzing ? (
                    <><Loader2 size={14} className="animate-spin" /> Analyzing...</>
                  ) : (
                    <><Zap size={14} /> Run Orchestrator</>
                  )}
                </button>
              ) : (
                <button
                  onClick={handleReset}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#E5E5E2] py-3 text-[13px] font-medium text-[#52525B] transition-colors hover:border-[#D0D0CC]"
                >
                  Start new brief
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Right: Output Panel ────────────────────────────────────── */}
        <div className="col-span-3 space-y-4">

          {/* Idle empty state */}
          {orchState === "idle" && (
            <div className="flex min-h-[460px] items-center justify-center rounded-xl border-2 border-dashed border-[#E5E5E2]">
              <div className="max-w-xs text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#EEEEFD]">
                  <Cpu size={22} className="text-[#5B5BD6]" />
                </div>
                <p className="text-[14px] font-semibold text-[#0A0A0A]">Orchestrator ready</p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-[#A1A1AA]">
                  Fill in the project brief on the left and run the analysis to generate your execution plan.
                </p>
              </div>
            </div>
          )}

          {/* Analyzing state */}
          {isAnalyzing && (
            <div className="flex min-h-[460px] items-center justify-center rounded-xl border border-[#E5E5E2] bg-white">
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#EEEEFD]">
                  <Loader2 size={22} className="animate-spin text-[#5B5BD6]" />
                </div>
                <p className="text-[14px] font-semibold text-[#0A0A0A]">Analyzing project...</p>
                <p className="mt-1 text-[12px] text-[#A1A1AA]">Defining pipeline · Selecting agents · Mapping tasks</p>
              </div>
            </div>
          )}

          {/* Plan output */}
          {showOutput && (
            <>
              {/* Status banner */}
              {isApproved ? (
                <div className="flex items-center gap-3 rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] px-5 py-4">
                  <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[#DCFCE7]">
                    <Check size={14} className="text-[#16A34A]" strokeWidth={2.5} />
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-[#166534]">Project created and added to pipeline</p>
                    <p className="text-[11px] text-[#15803D]">
                      Visit{" "}
                      <Link href="/agency/projects" className="font-semibold underline underline-offset-2">
                        Projects
                      </Link>
                      {" "}to view the new project.
                    </p>
                  </div>
                  <span className="ml-auto text-[10px] font-semibold uppercase tracking-[0.06em] text-[#15803D]">
                    Approved
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2.5 rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] px-5 py-3">
                  <CheckCircle2 size={14} className="text-[#16A34A]" />
                  <p className="text-[12px] font-semibold text-[#166534]">Execution plan generated</p>
                  <span className="ml-auto text-[11px] text-[#A1A1AA]">Review and approve to create the project</span>
                </div>
              )}

              {/* Suggested pipeline */}
              <div
                className="overflow-hidden rounded-xl border border-[#E5E5E2] bg-white"
                style={{ boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)" }}
              >
                <div className="flex items-center gap-2 border-b border-[#F0F0EE] px-5 py-3.5">
                  <GitBranch size={13} className="text-[#3B82F6]" />
                  <p className="text-[13px] font-semibold text-[#0A0A0A]">Suggested Pipeline</p>
                </div>
                <div className="divide-y divide-[#F5F5F3]">
                  {MOCK_OUTPUT.pipeline.map((step, i) => {
                    const Icon  = step.status === "complete" ? CheckCircle2 : step.status === "current" ? Zap : Circle;
                    const color = step.status === "complete" ? "#16A34A" : step.status === "current" ? "#5B5BD6" : "#D0D0CC";
                    return (
                      <div key={i} className="flex items-center gap-3.5 px-5 py-3.5">
                        <Icon size={14} strokeWidth={step.status === "complete" ? 2.5 : 1.75} style={{ color, flexShrink: 0 }} />
                        <div className="flex-1">
                          <p className="text-[12.5px] font-semibold" style={{ color: step.status === "upcoming" ? "#A1A1AA" : "#0A0A0A" }}>
                            {step.stage}
                          </p>
                          <p className="text-[11px] text-[#A1A1AA]">{step.note}</p>
                        </div>
                        {step.status === "current" && (
                          <span className="rounded-full bg-[#EEEEFD] px-2.5 py-0.5 text-[10px] font-semibold text-[#5B5BD6]">
                            Entry point
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Agents + Tasks */}
              <div className="grid grid-cols-2 gap-4">
                <div className="overflow-hidden rounded-xl border border-[#E5E5E2] bg-white" style={{ boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)" }}>
                  <div className="flex items-center gap-2 border-b border-[#F0F0EE] px-4 py-3">
                    <Bot size={12} className="text-[#8B5CF6]" />
                    <p className="text-[12px] font-semibold text-[#0A0A0A]">Agents Selected</p>
                    <span className="ml-auto text-[10px] text-[#A1A1AA]">{MOCK_OUTPUT.agents.length} agents</span>
                  </div>
                  <div className="divide-y divide-[#F5F5F3]">
                    {MOCK_OUTPUT.agents.map((name) => {
                      const agent = MOCK_AGENTS.find((a) => a.name === name);
                      return (
                        <div key={name} className="flex items-center gap-3 px-4 py-3">
                          <div
                            className="flex h-7 w-7 flex-none items-center justify-center rounded-lg"
                            style={{ backgroundColor: agent ? `${agent.color}15` : "#F4F4F5" }}
                          >
                            <Bot size={11} style={{ color: agent?.color ?? "#A1A1AA" }} />
                          </div>
                          <p className="text-[12px] font-medium text-[#0A0A0A]">{name}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="overflow-hidden rounded-xl border border-[#E5E5E2] bg-white" style={{ boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)" }}>
                  <div className="flex items-center gap-2 border-b border-[#F0F0EE] px-4 py-3">
                    <CheckCircle2 size={12} className="text-[#0D9488]" />
                    <p className="text-[12px] font-semibold text-[#0A0A0A]">Task Breakdown</p>
                  </div>
                  <div className="divide-y divide-[#F5F5F3]">
                    {MOCK_OUTPUT.tasks.map((t) => (
                      <div key={t.seq} className="flex items-start gap-3 px-4 py-3">
                        <span className="mono-num mt-0.5 text-[10px] font-bold text-[#D0D0CC]">{t.seq}</span>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#A1A1AA]">{t.agent}</p>
                          <p className="text-[12px] text-[#0A0A0A]">{t.task}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Risks */}
              <div className="overflow-hidden rounded-xl border border-[#FEF08A] bg-[#FEFCE8]" style={{ boxShadow: "0 1px 2px 0 rgba(0,0,0,0.03)" }}>
                <div className="flex items-center gap-2 border-b border-[#FEF9C3] px-5 py-3">
                  <AlertTriangle size={12} className="text-[#CA8A04]" />
                  <p className="text-[12px] font-semibold text-[#92400E]">Risk Flags</p>
                  <span className="ml-auto text-[10px] text-[#A1A1AA]">{MOCK_OUTPUT.risks.length} identified</span>
                </div>
                <div className="divide-y divide-[#FEF9C3]">
                  {MOCK_OUTPUT.risks.map((risk, i) => (
                    <div key={i} className="flex items-start gap-3 px-5 py-3.5">
                      <span
                        className="mt-0.5 flex-none rounded-[4px] px-[5px] py-[1px] text-[9px] font-bold uppercase"
                        style={{
                          backgroundColor: risk.level === "high" ? "#FEE2E2" : "#FEF3C7",
                          color: risk.level === "high" ? "#991B1B" : "#92400E",
                        }}
                      >
                        {risk.level}
                      </span>
                      <p className="text-[12px] leading-relaxed text-[#78350F]">{risk.text}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Approve CTA */}
              {!isApproved ? (
                <button
                  onClick={handleApprove}
                  className="w-full rounded-xl bg-[#0A0A0A] py-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#1A1A1A]"
                >
                  Approve Plan &amp; Create Project →
                </button>
              ) : (
                <div className="flex items-center justify-center gap-2 rounded-xl border border-[#E5E5E2] bg-[#FAFAF9] py-3.5 text-[13px] font-medium text-[#A1A1AA]">
                  <Check size={14} className="text-[#16A34A]" strokeWidth={2.5} />
                  Plan approved — project is live
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
