import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  Client, Project, Task, Deliverable, Briefing,
  MOCK_CLIENTS, MOCK_PROJECTS, MOCK_TASKS, MOCK_DELIVERABLES, MOCK_BRIEFINGS, MOCK_ACTIVITY,
  MOCK_AGENTS,
  PipelineStage, TaskStatus, DeliverableStatus, Priority, ClientStatus, ProjectStatus,
} from "./mock-data";

// ─── Activity Events ────────────────────────────────────────────────────────

export type ActivityEventType =
  | "task_completed"
  | "task_started"
  | "task_unblocked"
  | "deliverable_uploaded"
  | "deliverable_approved"
  | "deliverable_delivered"
  | "project_advanced"
  | "project_created"
  | "project_updated"
  | "briefing_submitted"
  | "agent_assigned"
  | "client_added";

export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  description: string;
  project?: string;
  client?: string;
  timestamp: string;
}

// ─── Payloads ───────────────────────────────────────────────────────────────

export interface CreateProjectPayload {
  clientId: string;
  clientName: string;
  type: string;
  goal: string;
  deadline: string;
  budget?: string;
  agentNames: string[];
  plannedTasks: Array<{ seq: string; agent: string; task: string }>;
}

export interface CreateClientPayload {
  name: string;
  industry: string;
  status: ClientStatus;
  website?: string;
  description: string;
}

// ─── Utilities ──────────────────────────────────────────────────────────────

function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
}

// Seed activity from mock data
const seedActivity: ActivityEvent[] = MOCK_ACTIVITY.map((a) => ({
  id: a.id,
  type: a.type as ActivityEventType,
  description: a.description,
  project: a.project,
  client: a.client,
  timestamp: a.timestamp,
}));

// Seed factory — fresh arrays on every call (used for reset)
const SEED = {
  clients:     (): Client[]      => MOCK_CLIENTS.map((c) => ({ ...c })),
  projects:    (): Project[]     => MOCK_PROJECTS.map((p) => ({ ...p })),
  tasks:       (): Task[]        => MOCK_TASKS.map((t) => ({ ...t })),
  deliverables:(): Deliverable[] => MOCK_DELIVERABLES.map((d) => ({ ...d })),
  briefings:   (): Briefing[]    => MOCK_BRIEFINGS.map((b) => ({ ...b })),
  activity:    (): ActivityEvent[]=> [...seedActivity],
};

// ─── Store Interface ─────────────────────────────────────────────────────────

interface AgencyStore {
  clients:      Client[];
  projects:     Project[];
  tasks:        Task[];
  deliverables: Deliverable[];
  briefings:    Briefing[];
  activity:     ActivityEvent[];

  // Client CRUD
  createClient: (payload: CreateClientPayload) => string;
  updateClient: (
    clientId: string,
    updates: Partial<Pick<Client, "name" | "industry" | "status" | "website" | "description">>,
  ) => void;

  // Project actions
  moveProjectStage: (projectId: string, newStage: PipelineStage) => void;
  updateProject: (
    projectId: string,
    updates: Partial<Pick<Project, "name" | "goal" | "deadline" | "priority" | "stage" | "status">>,
  ) => void;

  // Task actions
  updateTaskStatus: (taskId: string, newStatus: TaskStatus) => void;

  // Deliverable actions
  updateDeliverableStatus: (deliverableId: string, newStatus: DeliverableStatus) => void;

  // Briefing actions
  createBriefing: (payload: Omit<Briefing, "id" | "submittedAt">) => string;

  // Orchestrator — create full project from approved plan
  createProject: (payload: CreateProjectPayload) => string;

  // System
  logActivity: (event: Omit<ActivityEvent, "id" | "timestamp">) => void;
  resetStore: () => void;
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useAgencyStore = create<AgencyStore>()(
  persist(
    (set, get) => ({
      clients:      SEED.clients(),
      projects:     SEED.projects(),
      tasks:        SEED.tasks(),
      deliverables: SEED.deliverables(),
      briefings:    SEED.briefings(),
      activity:     SEED.activity(),

      // ── Create client ──────────────────────────────────────────────────────
      createClient: (payload) => {
        const id = genId("c");
        const newClient: Client = {
          id,
          name:           payload.name,
          industry:       payload.industry,
          status:         payload.status,
          website:        payload.website || undefined,
          description:    payload.description,
          activeProjects: 0,
          totalProjects:  0,
          createdAt:      new Date().toISOString().slice(0, 10),
        };
        set((state) => ({ clients: [...state.clients, newClient] }));
        get().logActivity({
          type:        "client_added",
          description: `"${payload.name}" added as a client`,
          client:      payload.name,
        });
        return id;
      },

      // ── Update client ─────────────────────────────────────────────────────
      updateClient: (clientId, updates) => {
        set((state) => ({
          clients: state.clients.map((c) =>
            c.id === clientId ? { ...c, ...updates } : c,
          ),
        }));
      },

      // ── Move project stage ────────────────────────────────────────────────
      moveProjectStage: (projectId, newStage) => {
        const project = get().projects.find((p) => p.id === projectId);
        if (!project) return;

        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId ? { ...p, stage: newStage } : p,
          ),
        }));

        get().logActivity({
          type:        "project_advanced",
          description: `${project.name} advanced to ${newStage}`,
          project:     project.name,
          client:      project.clientName,
        });
      },

      // ── Update project ────────────────────────────────────────────────────
      updateProject: (projectId, updates) => {
        const project = get().projects.find((p) => p.id === projectId);
        if (!project) return;

        const newName = updates.name ?? project.name;

        // Cascade name change to related records
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId ? { ...p, ...updates } : p,
          ),
          tasks: updates.name
            ? state.tasks.map((t) =>
                t.projectId === projectId ? { ...t, projectName: newName } : t,
              )
            : state.tasks,
          deliverables: updates.name
            ? state.deliverables.map((d) =>
                d.projectId === projectId ? { ...d, projectName: newName } : d,
              )
            : state.deliverables,
          briefings: updates.name
            ? state.briefings.map((b) =>
                b.projectId === projectId ? { ...b, projectName: newName } : b,
              )
            : state.briefings,
        }));

        if (updates.stage && updates.stage !== project.stage) {
          get().logActivity({
            type:        "project_advanced",
            description: `${newName} advanced to ${updates.stage}`,
            project:     newName,
            client:      project.clientName,
          });
        } else {
          get().logActivity({
            type:        "project_updated",
            description: `"${newName}" updated`,
            project:     newName,
            client:      project.clientName,
          });
        }
      },

      // ── Update task status ────────────────────────────────────────────────
      updateTaskStatus: (taskId, newStatus) => {
        const task = get().tasks.find((t) => t.id === taskId);
        if (!task) return;

        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === taskId ? { ...t, status: newStatus } : t,
          ),
        }));

        const wasBlocked = task.status === "blocked";
        if (newStatus === "done") {
          get().logActivity({
            type:        "task_completed",
            description: `"${task.title}" marked as done`,
            project:     task.projectName,
            client:      task.clientName,
          });
        } else if (wasBlocked && newStatus === "pending") {
          get().logActivity({
            type:        "task_unblocked",
            description: `"${task.title}" unblocked`,
            project:     task.projectName,
            client:      task.clientName,
          });
        }
      },

      // ── Update deliverable status ─────────────────────────────────────────
      updateDeliverableStatus: (deliverableId, newStatus) => {
        const d = get().deliverables.find((x) => x.id === deliverableId);
        if (!d) return;

        set((state) => ({
          deliverables: state.deliverables.map((x) =>
            x.id === deliverableId ? { ...x, status: newStatus } : x,
          ),
        }));

        if (newStatus === "approved") {
          get().logActivity({
            type:        "deliverable_approved",
            description: `"${d.name}" approved`,
            project:     d.projectName,
            client:      d.clientName,
          });
        } else if (newStatus === "delivered") {
          get().logActivity({
            type:        "deliverable_delivered",
            description: `"${d.name}" delivered to client`,
            project:     d.projectName,
            client:      d.clientName,
          });
        } else if (newStatus === "in_review") {
          get().logActivity({
            type:        "deliverable_uploaded",
            description: `"${d.name}" submitted for review`,
            project:     d.projectName,
            client:      d.clientName,
          });
        }
      },

      // ── Create briefing ───────────────────────────────────────────────────
      createBriefing: (payload) => {
        const id = genId("b");
        const newBriefing: Briefing = {
          ...payload,
          id,
          submittedAt: new Date().toISOString().slice(0, 10),
        };
        set((state) => ({ briefings: [...state.briefings, newBriefing] }));
        get().logActivity({
          type:        "briefing_submitted",
          description: `Briefing submitted for "${payload.projectName}"`,
          project:     payload.projectName,
          client:      payload.clientName,
        });
        return id;
      },

      // ── Create project from Orchestrator plan ─────────────────────────────
      createProject: (payload) => {
        const { clientId, clientName, type, goal, deadline, agentNames, plannedTasks } = payload;

        const projectId   = genId("p");
        const projectName = `${clientName} — ${type}`;

        const agentIds = [
          "a0",
          ...agentNames
            .map((name) => MOCK_AGENTS.find((a) => a.name === name)?.id)
            .filter((id): id is string => !!id && id !== "a0"),
        ];

        const fallbackDeadline = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);

        const newProject: Project = {
          id:             projectId,
          name:           projectName,
          clientId,
          clientName,
          stage:          "planning",
          priority:       "high" as Priority,
          status:         "active" as ProjectStatus,
          deadline:       deadline || fallbackDeadline,
          description:    goal,
          goal,
          assignedAgents: agentIds,
          createdAt:      new Date().toISOString().slice(0, 10),
        };

        const base = deadline ? new Date(deadline).getTime() : Date.now() + 60 * 24 * 60 * 60 * 1000;
        const gap  = Math.floor((base - Date.now()) / (plannedTasks.length + 1));

        const newTasks: Task[] = plannedTasks.map((t, i) => {
          const agent = MOCK_AGENTS.find((a) => a.name === t.agent);
          const dueMs = Date.now() + gap * (i + 1);
          return {
            id:          genId("t"),
            title:       t.task,
            projectId,
            projectName,
            clientName,
            agentId:     agent?.id ?? "a0",
            agentName:   t.agent,
            status:      "pending" as TaskStatus,
            priority:    i === 0 ? ("high" as Priority) : ("medium" as Priority),
            dueDate:     new Date(dueMs).toISOString().slice(0, 10),
            description: `Orchestrator-assigned task for ${type}.`,
          };
        });

        // Auto-create a briefing from the Orchestrator form data
        const newBriefing: Briefing = {
          id:              genId("b"),
          projectId,
          projectName,
          clientName,
          goal,
          targetAudience:  "To be defined in the diagnosis stage.",
          keyMessage:      "To be defined in the planning stage.",
          deliverables:    plannedTasks.map((t) => t.task),
          deadline:        deadline || fallbackDeadline,
          budget:          payload.budget,
          successCriteria: "To be defined with the client.",
          submittedAt:     new Date().toISOString().slice(0, 10),
          status:          "pending_analysis",
        };

        set((state) => ({
          projects:    [...state.projects, newProject],
          tasks:       [...state.tasks, ...newTasks],
          briefings:   [...state.briefings, newBriefing],
        }));

        get().logActivity({
          type:        "project_created",
          description: `Project created: ${projectName}`,
          project:     projectName,
          client:      clientName,
        });

        return projectId;
      },

      // ── Log activity event ────────────────────────────────────────────────
      logActivity: (event) => {
        const newEvent: ActivityEvent = {
          ...event,
          id:        genId("act"),
          timestamp: new Date().toISOString(),
        };
        set((state) => ({
          activity: [newEvent, ...state.activity].slice(0, 25),
        }));
      },

      // ── Reset to mock data ────────────────────────────────────────────────
      resetStore: () => {
        set({
          clients:      SEED.clients(),
          projects:     SEED.projects(),
          tasks:        SEED.tasks(),
          deliverables: SEED.deliverables(),
          briefings:    SEED.briefings(),
          activity:     SEED.activity(),
        });
      },
    }),
    {
      name: "agency-os-v1",
      // Only persist data, not action functions
      partialize: (state) => ({
        clients:      state.clients,
        projects:     state.projects,
        tasks:        state.tasks,
        deliverables: state.deliverables,
        briefings:    state.briefings,
        activity:     state.activity,
      }),
    },
  ),
);
