"use client";

import { useState } from "react";
import { FileText, Plus, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/agency/ui/PageHeader";
import { Badge } from "@/components/agency/ui/Badge";
import { Modal, FIELD_LABEL, INPUT_CLS, SELECT_CLS } from "@/components/agency/ui/Modal";
import { useAgencyStore } from "@/lib/agency/store";
import Link from "next/link";

const STATUS_META: Record<string, { label: string; bg: string; text: string }> = {
  pending_analysis: { label: "Pending",  bg: "#FFF7ED", text: "#C2410C" },
  analyzed:         { label: "Analyzed", bg: "#EEEEFD", text: "#5B5BD6" },
  approved:         { label: "Approved", bg: "#F0FDF4", text: "#15803D" },
};

export default function BriefingsPage() {
  const { briefings, projects, clients, createBriefing } = useAgencyStore();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    projectId:       "",
    goal:            "",
    targetAudience:  "",
    keyMessage:      "",
    deliverablesRaw: "",
    deadline:        "",
    budget:          "",
    successCriteria: "",
  });

  const selectedProject = projects.find((p) => p.id === form.projectId);

  function handleCreate() {
    if (!form.projectId || !form.goal.trim()) return;
    createBriefing({
      projectId:       form.projectId,
      projectName:     selectedProject?.name ?? "",
      clientName:      selectedProject?.clientName ?? "",
      goal:            form.goal.trim(),
      targetAudience:  form.targetAudience.trim() || "TBD",
      keyMessage:      form.keyMessage.trim()     || "TBD",
      deliverables:    form.deliverablesRaw.split(",").map((s) => s.trim()).filter(Boolean),
      deadline:        form.deadline || (selectedProject?.deadline ?? ""),
      budget:          form.budget.trim() || undefined,
      successCriteria: form.successCriteria.trim() || "TBD",
      status:          "pending_analysis",
    });
    setForm({ projectId: "", goal: "", targetAudience: "", keyMessage: "", deliverablesRaw: "", deadline: "", budget: "", successCriteria: "" });
    setShowCreate(false);
  }

  return (
    <div className="min-h-full" style={{ backgroundColor: "#F5F5F3" }}>
      <div className="px-8 py-7">
        <PageHeader
          title="Briefings"
          subtitle={`${briefings.length} brief${briefings.length !== 1 ? "s" : ""} on record`}
          icon={FileText}
          iconColor="#D97706"
        >
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 rounded-lg bg-[#5B5BD6] px-3.5 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#4848C2]"
          >
            <Plus size={13} />
            New Briefing
          </button>
        </PageHeader>

        {briefings.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#E5E5E2] py-20">
            <FileText size={24} className="mb-3 text-[#E5E5E2]" />
            <p className="text-[13px] font-medium text-[#52525B]">No briefings yet</p>
            <p className="mt-1 text-[11px] text-[#A1A1AA]">Create a project via the Orchestrator or add a briefing manually.</p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-5 flex items-center gap-1.5 rounded-lg bg-[#5B5BD6] px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#4848C2]"
            >
              <Plus size={12} /> New Briefing
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {briefings.map((briefing) => {
              const stMeta = (STATUS_META[briefing.status] ?? STATUS_META["pending_analysis"])!;
              return (
                <div
                  key={briefing.id}
                  className="rounded-xl border border-[#E5E5E2] bg-white"
                  style={{ boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)" }}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between border-b border-[#F0F0EE] px-6 py-4">
                    <div>
                      <div className="mb-1 flex items-center gap-2.5">
                        <h3 className="text-[14px] font-semibold text-[#0A0A0A]">{briefing.projectName}</h3>
                        <span
                          className="rounded-[5px] px-[7px] py-[2px] text-[10px] font-semibold"
                          style={{ backgroundColor: stMeta.bg, color: stMeta.text }}
                        >
                          {stMeta.label}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#A1A1AA]">
                        {briefing.clientName}
                        {" · "}Submitted {briefing.submittedAt}
                        {briefing.deadline && ` · Due ${briefing.deadline}`}
                      </p>
                    </div>
                    <Link
                      href={`/agency/projects/${briefing.projectId}`}
                      className="flex items-center gap-1 text-[11px] font-medium text-[#5B5BD6] hover:underline"
                    >
                      View Project <ArrowRight size={11} />
                    </Link>
                  </div>

                  {/* Content grid */}
                  <div className="grid grid-cols-3 gap-0 border-b border-[#F0F0EE]">
                    {[
                      { label: "Business Goal",   content: briefing.goal },
                      { label: "Target Audience", content: briefing.targetAudience },
                      { label: "Key Message",     content: `"${briefing.keyMessage}"`, italic: true },
                    ].map((field, i) => (
                      <div
                        key={field.label}
                        className="px-6 py-4"
                        style={{ borderLeft: i > 0 ? "1px solid #F0F0EE" : "none" }}
                      >
                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-[#A1A1AA]">
                          {field.label}
                        </p>
                        <p
                          className="text-[12px] leading-relaxed text-[#52525B]"
                          style={{ fontStyle: field.italic ? "italic" : "normal" }}
                        >
                          {field.content}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Footer */}
                  <div className="flex items-start divide-x divide-[#F0F0EE]">
                    <div className="flex-1 px-6 py-4">
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.07em] text-[#A1A1AA]">
                        Deliverables Requested
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {briefing.deliverables.length === 0 ? (
                          <span className="text-[11px] text-[#C0C0BC]">None specified</span>
                        ) : briefing.deliverables.map((d) => (
                          <span
                            key={d}
                            className="inline-flex rounded-[5px] bg-[#F4F4F5] px-[7px] py-[2px] text-[11px] font-medium text-[#52525B]"
                          >
                            {d}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="w-[280px] flex-none px-6 py-4">
                      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-[#A1A1AA]">
                        Success Criteria
                      </p>
                      <p className="text-[12px] leading-relaxed text-[#52525B]">{briefing.successCriteria}</p>
                      {briefing.budget && (
                        <p className="mt-2 text-[11px] text-[#A1A1AA]">
                          Budget: <span className="font-semibold text-[#52525B]">{briefing.budget}</span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Create Briefing Modal ──────────────────────────────────── */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="New Briefing"
        subtitle="Attach a briefing document to an existing project"
        maxWidth="580px"
      >
        <div className="space-y-4 px-6 py-5">
          <div>
            <label className={FIELD_LABEL}>Project *</label>
            <select
              className={SELECT_CLS}
              value={form.projectId}
              onChange={(e) => setForm({ ...form, projectId: e.target.value })}
            >
              <option value="">Select project...</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={FIELD_LABEL}>Business Goal *</label>
            <textarea
              rows={2}
              className={`${INPUT_CLS} resize-none`}
              placeholder="What does this project need to achieve?"
              value={form.goal}
              onChange={(e) => setForm({ ...form, goal: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={FIELD_LABEL}>Target Audience</label>
              <input
                className={INPUT_CLS}
                placeholder="Who is this for?"
                value={form.targetAudience}
                onChange={(e) => setForm({ ...form, targetAudience: e.target.value })}
              />
            </div>
            <div>
              <label className={FIELD_LABEL}>Key Message</label>
              <input
                className={INPUT_CLS}
                placeholder="Core message to communicate"
                value={form.keyMessage}
                onChange={(e) => setForm({ ...form, keyMessage: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <label className={FIELD_LABEL}>Deliverables Requested</label>
              <input
                className={INPUT_CLS}
                placeholder="Comma-separated: Brand guide, Ad creatives, Landing page"
                value={form.deliverablesRaw}
                onChange={(e) => setForm({ ...form, deliverablesRaw: e.target.value })}
              />
            </div>
            <div>
              <label className={FIELD_LABEL}>Deadline</label>
              <input
                type="date"
                className={INPUT_CLS}
                value={form.deadline}
                onChange={(e) => setForm({ ...form, deadline: e.target.value })}
              />
            </div>
            <div>
              <label className={FIELD_LABEL}>Budget</label>
              <input
                className={INPUT_CLS}
                placeholder="e.g. R$ 15,000"
                value={form.budget}
                onChange={(e) => setForm({ ...form, budget: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <label className={FIELD_LABEL}>Success Criteria</label>
              <textarea
                rows={2}
                className={`${INPUT_CLS} resize-none`}
                placeholder="How will success be measured?"
                value={form.successCriteria}
                onChange={(e) => setForm({ ...form, successCriteria: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 border-t border-[#F0F0EE] px-6 py-4">
          <button
            onClick={() => setShowCreate(false)}
            className="rounded-lg border border-[#E5E5E2] px-4 py-2 text-[12px] font-medium text-[#52525B] transition-colors hover:border-[#D0D0CC]"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!form.projectId || !form.goal.trim()}
            className="rounded-lg px-4 py-2 text-[12px] font-semibold text-white transition-colors disabled:cursor-not-allowed"
            style={{
              backgroundColor: form.projectId && form.goal.trim() ? "#5B5BD6" : "#D0D0CC",
            }}
          >
            Submit Briefing
          </button>
        </div>
      </Modal>
    </div>
  );
}
