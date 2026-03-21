import { CheckSquare, Plus } from "lucide-react";
import { PageHeader } from "@/components/agency/ui/PageHeader";
import { Badge } from "@/components/agency/ui/Badge";
import { MOCK_TASKS } from "@/lib/agency/mock-data";
import Link from "next/link";

export const metadata = { title: "Tasks" };

const GROUPS = [
  { key: "blocked",     label: "Blocked",     color: "#DC2626" },
  { key: "in_progress", label: "In Progress",  color: "#5B5BD6" },
  { key: "pending",     label: "Pending",      color: "#A1A1AA" },
  { key: "done",        label: "Done",         color: "#16A34A" },
];

export default function TasksPage() {
  const open = MOCK_TASKS.filter((t) => t.status !== "done").length;
  const done = MOCK_TASKS.filter((t) => t.status === "done").length;

  return (
    <div className="min-h-full" style={{ backgroundColor: "#F5F5F3" }}>
      <div className="px-8 py-7">
        <PageHeader
          title="Tasks"
          subtitle={`${open} open · ${done} completed`}
          icon={CheckSquare}
          iconColor="#0D9488"
        >
          <button className="flex items-center gap-1.5 rounded-lg bg-[#5B5BD6] px-3.5 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#4848C2]">
            <Plus size={13} />
            Add Task
          </button>
        </PageHeader>

        <div className="space-y-6">
          {GROUPS.map((group) => {
            const tasks = MOCK_TASKS.filter((t) => t.status === group.key);
            return (
              <div key={group.key}>
                {/* Group label */}
                <div className="mb-2.5 flex items-center gap-2.5">
                  <span className="h-[6px] w-[6px] rounded-full" style={{ backgroundColor: group.color }} />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: group.color }}>
                    {group.label}
                  </span>
                  <span className="rounded-full bg-[#F4F4F5] px-2 py-0.5 text-[10px] font-semibold text-[#A1A1AA]">
                    {tasks.length}
                  </span>
                </div>

                {tasks.length > 0 ? (
                  <div
                    className="overflow-hidden rounded-xl border border-[#E5E5E2] bg-white"
                    style={{ boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)" }}
                  >
                    {tasks.map((task, i) => (
                      <div
                        key={task.id}
                        className="flex items-start gap-4 px-5 py-4 transition-colors hover:bg-[#FAFAF9]"
                        style={{ borderBottom: i < tasks.length - 1 ? "1px solid #F5F5F3" : "none" }}
                      >
                        {/* Checkbox */}
                        <div
                          className="mt-0.5 h-[14px] w-[14px] flex-none rounded-[3px] border-[1.5px]"
                          style={{
                            borderColor: group.color,
                            backgroundColor: task.status === "done" ? `${group.color}20` : "transparent",
                          }}
                        />
                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-[13px] font-medium text-[#0A0A0A]"
                            style={{ opacity: task.status === "done" ? 0.4 : 1 }}
                          >
                            {task.title}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] text-[#A1A1AA]">
                            {task.description}
                          </p>
                          <div className="mt-1.5 flex items-center gap-2">
                            <Link
                              href={`/agency/projects/${task.projectId}`}
                              className="text-[11px] font-medium text-[#5B5BD6] hover:underline"
                            >
                              {task.clientName}
                            </Link>
                            <span className="text-[#E0E0E0]">·</span>
                            <span className="text-[11px] text-[#A1A1AA]">{task.agentName}</span>
                          </div>
                        </div>
                        {/* Meta */}
                        <div className="flex flex-none items-center gap-2">
                          <Badge variant={task.priority} />
                          <span className="text-[11px] text-[#A1A1AA] mono-num">{task.dueDate.slice(5)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border-2 border-dashed border-[#EAEAE8] py-5 text-center">
                    <p className="text-[12px] text-[#D0D0CC]">No tasks in this group.</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
