import { CheckSquare, Plus, Filter } from "lucide-react";
import { PageHeader } from "@/components/agency/ui/PageHeader";
import { Badge } from "@/components/agency/ui/Badge";
import { MOCK_TASKS } from "@/lib/agency/mock-data";
import Link from "next/link";

export const metadata = { title: "Tasks" };

const STATUS_GROUPS = [
  { key: "in_progress", label: "In Progress", color: "#2563EB" },
  { key: "pending",     label: "Pending",     color: "#A1A1AA" },
  { key: "blocked",     label: "Blocked",     color: "#DC2626" },
  { key: "done",        label: "Done",        color: "#16A34A" },
];

export default function TasksPage() {
  const totalOpen = MOCK_TASKS.filter((t) => t.status !== "done").length;

  return (
    <div className="min-h-full" style={{ backgroundColor: "#F8F8F7" }}>
      <div className="px-8 py-7">
        <PageHeader
          title="Tasks"
          subtitle={`${totalOpen} open · ${MOCK_TASKS.filter((t) => t.status === "done").length} completed`}
          icon={CheckSquare}
          iconColor="#0D9488"
        >
          <button className="flex items-center gap-1.5 rounded-lg border border-[#E8E8E5] bg-white px-3.5 py-2 text-[13px] font-medium text-[#0A0A0A] hover:border-[#D4D4D0] transition-colors">
            <Filter size={13} />
            Filter
          </button>
          <button className="flex items-center gap-1.5 rounded-lg bg-[#5B5BD6] px-3.5 py-2 text-[13px] font-medium text-white hover:bg-[#4C4CB8] transition-colors">
            <Plus size={14} />
            Add Task
          </button>
        </PageHeader>

        <div className="space-y-6">
          {STATUS_GROUPS.map((group) => {
            const tasks = MOCK_TASKS.filter((t) => t.status === group.key);
            return (
              <div key={group.key}>
                {/* Group header */}
                <div className="mb-2.5 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: group.color }} />
                  <span className="text-[12px] font-semibold" style={{ color: group.color }}>
                    {group.label}
                  </span>
                  <span className="rounded-full bg-[#F4F4F5] px-2 py-0.5 text-[10px] font-medium text-[#71717A]">
                    {tasks.length}
                  </span>
                </div>

                {/* Tasks */}
                {tasks.length > 0 ? (
                  <div className="rounded-xl border border-[#E8E8E5] bg-white shadow-card overflow-hidden">
                    <div className="divide-y divide-[#F4F4F4]">
                      {tasks.map((task) => (
                        <div key={task.id} className="flex items-start gap-4 px-5 py-4 hover:bg-[#FAFAF9] transition-colors">
                          <div
                            className="mt-0.5 h-4 w-4 flex-none rounded border-2"
                            style={{
                              borderColor: group.color,
                              backgroundColor: task.status === "done" ? `${group.color}20` : "transparent",
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <p
                              className="text-[13px] font-medium text-[#0A0A0A]"
                              style={{ textDecoration: task.status === "done" ? "line-through" : "none", opacity: task.status === "done" ? 0.5 : 1 }}
                            >
                              {task.title}
                            </p>
                            <p className="mt-0.5 text-[11px] text-[#A1A1AA]">{task.description}</p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <Link
                                href={`/agency/projects/${task.projectId}`}
                                className="text-[11px] text-[#5B5BD6] hover:underline"
                              >
                                {task.projectName}
                              </Link>
                              <span className="text-[#E8E8E5]">·</span>
                              <span className="text-[11px] text-[#A1A1AA]">{task.agentName}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={task.priority} />
                            <span className="text-[11px] text-[#A1A1AA]">{task.dueDate}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-[#E8E8E5] py-5 text-center">
                    <p className="text-[12px] text-[#C4C4C4]">No tasks in this stage.</p>
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
