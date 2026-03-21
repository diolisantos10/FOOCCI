import { Bot, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/agency/ui/PageHeader";
import { MOCK_AGENTS } from "@/lib/agency/mock-data";

export const metadata = { title: "Agents" };

export default function AgentsPage() {
  const orchestrator = MOCK_AGENTS.find((a) => a.type === "orchestrator")!;
  const specialists  = MOCK_AGENTS.filter((a) => a.type !== "orchestrator");

  return (
    <div className="min-h-full" style={{ backgroundColor: "#F5F5F3" }}>
      <div className="px-8 py-7">
        <PageHeader
          title="Agent Registry"
          subtitle={`${MOCK_AGENTS.length} agents available — activated on demand per project`}
          icon={Bot}
          iconColor="#8B5CF6"
        />

        {/* ── Orchestrator — featured ────────────────────────────── */}
        <div
          className="mb-8 rounded-xl border p-6"
          style={{
            borderColor: "#DDDDFB",
            backgroundColor: "#FAFAFE",
            boxShadow: "0 1px 2px 0 rgba(91,91,214,0.06)",
          }}
        >
          <div className="flex items-start gap-5">
            <div className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-[#EEEEFD]">
              <Bot size={22} strokeWidth={1.75} className="text-[#5B5BD6]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="mb-1 flex items-center gap-2.5">
                <h2 className="text-[16px] font-bold text-[#0A0A0A]">{orchestrator.name}</h2>
                <span className="rounded-[5px] bg-[#EEEEFD] px-[7px] py-[2px] text-[10px] font-bold uppercase tracking-[0.07em] text-[#5B5BD6]">
                  Core
                </span>
              </div>
              <p className="mb-2 text-[12px] font-semibold text-[#5B5BD6]">{orchestrator.role}</p>
              <p className="text-[13px] text-[#52525B] leading-relaxed max-w-2xl">
                {orchestrator.description}
              </p>
            </div>
            <div className="flex flex-none gap-6 text-right">
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-[#A1A1AA]">Inputs</p>
                <div className="space-y-1">
                  {orchestrator.inputs.map((inp) => (
                    <p key={inp} className="text-[11px] text-[#71717A]">{inp}</p>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-[#A1A1AA]">Outputs</p>
                <div className="space-y-1">
                  {orchestrator.outputs.map((out) => (
                    <p key={out} className="text-[11px] text-[#71717A]">{out}</p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Specialists label ─────────────────────────────────── */}
        <p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#A1A1AA]">
          Specialist Agents
        </p>

        {/* ── Agent grid ───────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-4">
          {specialists.map((agent) => (
            <div
              key={agent.id}
              className="group rounded-xl border border-[#E5E5E2] bg-white p-5 transition-all hover:border-[#D0D0CC]"
              style={{ boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)" }}
            >
              {/* Header */}
              <div className="mb-4 flex items-start gap-3">
                <div
                  className="flex h-9 w-9 flex-none items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${agent.color}12` }}
                >
                  <Bot size={16} strokeWidth={1.75} style={{ color: agent.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-[#0A0A0A]">{agent.name}</p>
                  <p className="text-[11px] font-medium" style={{ color: agent.color }}>
                    {agent.role}
                  </p>
                </div>
              </div>

              {/* Description */}
              <p className="mb-4 text-[12px] text-[#71717A] leading-relaxed">{agent.description}</p>

              {/* When to use */}
              <div
                className="mb-4 rounded-lg p-3"
                style={{
                  backgroundColor: `${agent.color}08`,
                  borderLeft: `2px solid ${agent.color}40`,
                }}
              >
                <p
                  className="mb-1 text-[9px] font-bold uppercase tracking-[0.08em]"
                  style={{ color: agent.color }}
                >
                  When to activate
                </p>
                <p className="text-[11px] text-[#52525B] leading-relaxed">{agent.whenToUse}</p>
              </div>

              {/* Outputs */}
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-[#A1A1AA]">
                  Outputs
                </p>
                <div className="flex flex-wrap gap-1">
                  {agent.outputs.slice(0, 3).map((output) => (
                    <span
                      key={output}
                      className="inline-flex items-center gap-1 rounded-[5px] bg-[#F4F4F5] px-2 py-0.5 text-[10px] font-medium text-[#52525B]"
                    >
                      <ChevronRight size={8} style={{ color: agent.color }} />
                      {output}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
