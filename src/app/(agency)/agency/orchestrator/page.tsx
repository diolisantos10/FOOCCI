"use client";

import { useState } from "react";
import { Cpu, Zap, Bot, GitBranch, AlertTriangle, ChevronRight, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/agency/ui/PageHeader";
import { MOCK_AGENTS } from "@/lib/agency/mock-data";

const MOCK_OUTPUT = {
  pipeline: [
    { stage: "Briefing", status: "complete", note: "Brief received and analyzed." },
    { stage: "Diagnosis", status: "complete", note: "Market and business context assessed." },
    { stage: "Planning", status: "current", note: "Pipeline and agents defined. Ready to execute." },
    { stage: "Production", status: "upcoming", note: "Agents will execute tasks in sequence." },
    { stage: "Review", status: "upcoming", note: "Internal quality check before delivery." },
    { stage: "Delivery", status: "upcoming", note: "Final output delivered to client." },
  ],
  agents: ["Marketing Strategist", "Copy Agent", "Design Agent", "Traffic Agent"],
  tasks: [
    { agent: "Marketing Strategist", task: "Define positioning and audience personas" },
    { agent: "Copy Agent", task: "Write campaign copy — 3 angle variants" },
    { agent: "Design Agent", task: "Produce 6 ad creatives (feed + stories)" },
    { agent: "Traffic Agent", task: "Set up Meta Ads campaign structure" },
  ],
  risks: [
    "Missing client photography — Design Agent cannot start final creatives.",
    "Deadline is tight (14 days). Recommend parallel execution of Copy and Design.",
  ],
};

export default function OrchestratorPage() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showOutput, setShowOutput] = useState(false);
  const [formData, setFormData] = useState({
    goal: "",
    type: "",
    client: "",
    deadline: "",
    budget: "",
    notes: "",
  });

  function handleAnalyze() {
    setIsAnalyzing(true);
    setShowOutput(false);
    setTimeout(() => {
      setIsAnalyzing(false);
      setShowOutput(true);
    }, 1800);
  }

  const formFilled = formData.goal && formData.type && formData.client;

  return (
    <div className="min-h-full" style={{ backgroundColor: "#F8F8F7" }}>
      <div className="px-8 py-7">
        <PageHeader
          title="Orchestrator"
          subtitle="Submit a project goal and receive a complete execution plan"
          icon={Cpu}
          iconColor="#5B5BD6"
        />

        <div className="grid grid-cols-5 gap-6">
          {/* LEFT: Input form */}
          <div className="col-span-2">
            <div className="rounded-xl border border-[#E8E8E5] bg-white shadow-card">
              <div className="border-b border-[#E8E8E5] px-5 py-4">
                <h2 className="text-[13px] font-semibold text-[#0A0A0A]">Project Briefing Input</h2>
                <p className="mt-0.5 text-[11px] text-[#A1A1AA]">Fill in the key details. The Orchestrator will do the rest.</p>
              </div>
              <div className="px-5 py-5 space-y-4">
                {/* Client */}
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[#71717A]">
                    Client
                  </label>
                  <select
                    value={formData.client}
                    onChange={(e) => setFormData({ ...formData, client: e.target.value })}
                    className="w-full rounded-lg border border-[#E8E8E5] bg-[#FAFAF9] px-3 py-2.5 text-[13px] text-[#0A0A0A] outline-none focus:border-[#5B5BD6] transition-colors"
                  >
                    <option value="">Select client...</option>
                    <option>Santioh</option>
                    <option>Sushikasa</option>
                    <option>Dioli Studio</option>
                  </select>
                </div>

                {/* Project type */}
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[#71717A]">
                    Project Type
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="w-full rounded-lg border border-[#E8E8E5] bg-[#FAFAF9] px-3 py-2.5 text-[13px] text-[#0A0A0A] outline-none focus:border-[#5B5BD6] transition-colors"
                  >
                    <option value="">Select type...</option>
                    <option>Paid Media Campaign</option>
                    <option>Brand Identity / Rebranding</option>
                    <option>SEO & Content</option>
                    <option>Social Media</option>
                    <option>Landing Page</option>
                    <option>Full Marketing Strategy</option>
                    <option>Performance Analysis</option>
                  </select>
                </div>

                {/* Goal */}
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[#71717A]">
                    Business Goal
                  </label>
                  <textarea
                    rows={3}
                    value={formData.goal}
                    onChange={(e) => setFormData({ ...formData, goal: e.target.value })}
                    placeholder="What does this project need to achieve? Be specific."
                    className="w-full rounded-lg border border-[#E8E8E5] bg-[#FAFAF9] px-3 py-2.5 text-[13px] text-[#0A0A0A] placeholder-[#C4C4C4] outline-none focus:border-[#5B5BD6] transition-colors resize-none"
                  />
                </div>

                {/* Deadline */}
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[#71717A]">
                    Deadline
                  </label>
                  <input
                    type="date"
                    value={formData.deadline}
                    onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                    className="w-full rounded-lg border border-[#E8E8E5] bg-[#FAFAF9] px-3 py-2.5 text-[13px] text-[#0A0A0A] outline-none focus:border-[#5B5BD6] transition-colors"
                  />
                </div>

                {/* Budget */}
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[#71717A]">
                    Budget (optional)
                  </label>
                  <input
                    type="text"
                    value={formData.budget}
                    onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
                    placeholder="e.g. R$ 15,000"
                    className="w-full rounded-lg border border-[#E8E8E5] bg-[#FAFAF9] px-3 py-2.5 text-[13px] text-[#0A0A0A] placeholder-[#C4C4C4] outline-none focus:border-[#5B5BD6] transition-colors"
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[#71717A]">
                    Additional Notes
                  </label>
                  <textarea
                    rows={2}
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Context, constraints, references..."
                    className="w-full rounded-lg border border-[#E8E8E5] bg-[#FAFAF9] px-3 py-2.5 text-[13px] text-[#0A0A0A] placeholder-[#C4C4C4] outline-none focus:border-[#5B5BD6] transition-colors resize-none"
                  />
                </div>

                {/* CTA */}
                <button
                  onClick={handleAnalyze}
                  disabled={!formFilled || isAnalyzing}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#5B5BD6] py-3 text-[13px] font-semibold text-white transition-colors hover:bg-[#4C4CB8] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Zap size={14} />
                      Run Orchestrator
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT: Output panel */}
          <div className="col-span-3">
            {!showOutput && !isAnalyzing && (
              <div className="flex h-full items-center justify-center rounded-xl border-2 border-dashed border-[#E8E8E5]">
                <div className="text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-[#EEF2FF]">
                    <Cpu size={24} className="text-[#5B5BD6]" />
                  </div>
                  <p className="text-[14px] font-semibold text-[#0A0A0A]">Orchestrator Ready</p>
                  <p className="mt-1 max-w-xs text-[12px] text-[#71717A]">
                    Fill in the project details and run the analysis to receive your execution plan.
                  </p>
                </div>
              </div>
            )}

            {isAnalyzing && (
              <div className="flex h-full items-center justify-center rounded-xl border border-[#E8E8E5] bg-white">
                <div className="text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-[#EEF2FF]">
                    <Loader2 size={24} className="text-[#5B5BD6] animate-spin" />
                  </div>
                  <p className="text-[14px] font-semibold text-[#0A0A0A]">Analyzing project...</p>
                  <p className="mt-1 text-[12px] text-[#71717A]">Defining pipeline, selecting agents, mapping tasks.</p>
                </div>
              </div>
            )}

            {showOutput && (
              <div className="space-y-4">
                {/* Header */}
                <div className="rounded-xl border border-[#5B5BD620] bg-[#EEF2FF] px-5 py-4">
                  <div className="flex items-center gap-2">
                    <Zap size={14} className="text-[#5B5BD6]" />
                    <p className="text-[13px] font-semibold text-[#5B5BD6]">
                      Orchestrator output ready
                    </p>
                  </div>
                  <p className="mt-1 text-[12px] text-[#71717A]">
                    Review the plan below. Approve to create the project and activate agents.
                  </p>
                </div>

                {/* Suggested pipeline */}
                <div className="rounded-xl border border-[#E8E8E5] bg-white shadow-card">
                  <div className="flex items-center gap-2 border-b border-[#E8E8E5] px-5 py-4">
                    <GitBranch size={14} className="text-[#2563EB]" />
                    <h3 className="text-[13px] font-semibold text-[#0A0A0A]">Suggested Pipeline</h3>
                  </div>
                  <div className="px-5 py-4 space-y-2">
                    {MOCK_OUTPUT.pipeline.map((step, i) => (
                      <div key={step.stage} className="flex items-start gap-3">
                        <div
                          className="flex h-6 w-6 flex-none items-center justify-center rounded-full text-[10px] font-bold text-white mt-0.5"
                          style={{
                            backgroundColor:
                              step.status === "complete"
                                ? "#16A34A"
                                : step.status === "current"
                                ? "#5B5BD6"
                                : "#E8E8E5",
                            color: step.status === "upcoming" ? "#A1A1AA" : "white",
                          }}
                        >
                          {step.status === "complete" ? "✓" : i + 1}
                        </div>
                        <div>
                          <p
                            className="text-[12px] font-semibold"
                            style={{
                              color:
                                step.status === "complete"
                                  ? "#16A34A"
                                  : step.status === "current"
                                  ? "#5B5BD6"
                                  : "#A1A1AA",
                            }}
                          >
                            {step.stage}
                          </p>
                          <p className="text-[11px] text-[#71717A]">{step.note}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Agents + Tasks */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Agents */}
                  <div className="rounded-xl border border-[#E8E8E5] bg-white shadow-card">
                    <div className="flex items-center gap-2 border-b border-[#E8E8E5] px-5 py-4">
                      <Bot size={14} className="text-[#7C3AED]" />
                      <h3 className="text-[13px] font-semibold text-[#0A0A0A]">Agents Selected</h3>
                    </div>
                    <div className="px-5 py-4 space-y-2">
                      {MOCK_OUTPUT.agents.map((agentName) => {
                        const agent = MOCK_AGENTS.find((a) => a.name === agentName);
                        return (
                          <div key={agentName} className="flex items-center gap-2.5">
                            <div
                              className="h-6 w-6 rounded-md flex items-center justify-center flex-none"
                              style={{ backgroundColor: agent ? `${agent.color}20` : "#F4F4F5" }}
                            >
                              <Bot size={11} style={{ color: agent?.color ?? "#71717A" }} />
                            </div>
                            <span className="text-[12px] font-medium text-[#0A0A0A]">{agentName}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Tasks */}
                  <div className="rounded-xl border border-[#E8E8E5] bg-white shadow-card">
                    <div className="flex items-center gap-2 border-b border-[#E8E8E5] px-5 py-4">
                      <ChevronRight size={14} className="text-[#0D9488]" />
                      <h3 className="text-[13px] font-semibold text-[#0A0A0A]">Task Breakdown</h3>
                    </div>
                    <div className="px-5 py-4 space-y-2.5">
                      {MOCK_OUTPUT.tasks.map((t, i) => (
                        <div key={i}>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#A1A1AA]">{t.agent}</p>
                          <p className="text-[12px] text-[#0A0A0A]">{t.task}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Risks */}
                {MOCK_OUTPUT.risks.length > 0 && (
                  <div className="rounded-xl border border-[#FEF9C3] bg-[#FEFCE8] p-5">
                    <div className="mb-3 flex items-center gap-2">
                      <AlertTriangle size={14} className="text-[#CA8A04]" />
                      <h3 className="text-[13px] font-semibold text-[#92400E]">Risks & Flags</h3>
                    </div>
                    <ul className="space-y-1.5">
                      {MOCK_OUTPUT.risks.map((risk, i) => (
                        <li key={i} className="flex items-start gap-2 text-[12px] text-[#78350F]">
                          <span className="mt-1.5 h-1 w-1 rounded-full bg-[#CA8A04] flex-none" />
                          {risk}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Approve button */}
                <button className="w-full rounded-lg bg-[#0A0A0A] py-3 text-[13px] font-semibold text-white hover:bg-[#1A1A1A] transition-colors">
                  Approve Plan & Create Project →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
