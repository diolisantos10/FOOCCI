import { Bot, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/agency/ui/PageHeader";
import { MOCK_AGENTS } from "@/lib/agency/mock-data";

export const metadata = { title: "Agents" };

export default function AgentsPage() {
  const orchestrator = MOCK_AGENTS.find((a) => a.type === "orchestrator")!;
  const specialists = MOCK_AGENTS.filter((a) => a.type !== "orchestrator");

  return (
    <div className="min-h-full" style={{ backgroundColor: "#F8F8F7" }}>
      <div className="px-8 py-7">
        <PageHeader
          title="Agent Registry"
          subtitle={`${MOCK_AGENTS.length} agents available — activated on demand per project`}
          icon={Bot}
          iconColor="#7C3AED"
        />

        {/* Orchestrator — featured */}
        <div
          className="mb-8 rounded-xl border p-6"
          style={{ borderColor: `${orchestrator.color}30`, backgroundColor: `${orchestrator.color}08` }}
        >
          <div className="flex items-start gap-5">
            <div
              className="flex h-14 w-14 flex-none items-center justify-center rounded-xl"
              style={{ backgroundColor: `${orchestrator.color}20` }}
            >
              <Bot size={24} style={{ color: orchestrator.color }} strokeWidth={1.75} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2.5 mb-1">
                <h2 className="text-[17px] font-bold text-[#0A0A0A]">{orchestrator.name}</h2>
                <span
                  className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white"
                  style={{ backgroundColor: orchestrator.color }}
                >
                  Core
                </span>
              </div>
              <p className="text-[13px] font-medium text-[#52525B] mb-2">{orchestrator.role}</p>
              <p className="text-[13px] text-[#71717A] leading-relaxed max-w-2xl">{orchestrator.description}</p>
            </div>
            <div className="flex-none grid grid-cols-2 gap-4 text-right">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#A1A1AA]">Inputs</p>
                <div className="mt-1 space-y-0.5">
                  {orchestrator.inputs.map((i) => (
                    <p key={i} className="text-[11px] text-[#52525B]">{i}</p>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#A1A1AA]">Outputs</p>
                <div className="mt-1 space-y-0.5">
                  {orchestrator.outputs.map((o) => (
                    <p key={o} className="text-[11px] text-[#52525B]">{o}</p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section label */}
        <p className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-[#A1A1AA]">
          Specialist Agents
        </p>

        {/* Agent cards grid */}
        <div className="grid grid-cols-3 gap-4">
          {specialists.map((agent) => (
            <div
              key={agent.id}
              className="rounded-xl border border-[#E8E8E5] bg-white p-5 shadow-card hover:shadow-card-hover transition-shadow group"
            >
              {/* Header */}
              <div className="flex items-start gap-3 mb-4">
                <div
                  className="flex h-10 w-10 flex-none items-center justify-center rounded-xl"
                  style={{ backgroundColor: `${agent.color}15` }}
                >
                  <Bot size={18} style={{ color: agent.color }} strokeWidth={1.75} />
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-[#0A0A0A]">{agent.name}</p>
                  <p className="text-[11px]" style={{ color: agent.color }}>{agent.role}</p>
                </div>
              </div>

              {/* Description */}
              <p className="text-[12px] text-[#71717A] leading-relaxed mb-4">{agent.description}</p>

              {/* When to use */}
              <div
                className="rounded-lg p-3 mb-4"
                style={{ backgroundColor: `${agent.color}08`, borderLeft: `2px solid ${agent.color}` }}
              >
                <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: agent.color }}>
                  When to use
                </p>
                <p className="text-[11px] text-[#52525B]">{agent.whenToUse}</p>
              </div>

              {/* Inputs & Outputs */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#A1A1AA] mb-1.5">Inputs</p>
                  <div className="space-y-1">
                    {agent.inputs.map((input) => (
                      <div key={input} className="flex items-center gap-1.5">
                        <ArrowRight size={8} className="text-[#A1A1AA] flex-none" />
                        <span className="text-[10px] text-[#71717A]">{input}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#A1A1AA] mb-1.5">Outputs</p>
                  <div className="space-y-1">
                    {agent.outputs.slice(0, 3).map((output) => (
                      <div key={output} className="flex items-center gap-1.5">
                        <ArrowRight size={8} style={{ color: agent.color }} className="flex-none" />
                        <span className="text-[10px] text-[#71717A]">{output}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
