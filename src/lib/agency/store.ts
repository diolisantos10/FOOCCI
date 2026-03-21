import { create } from "zustand";
import {
  Client, Project, Task, Deliverable,
  MOCK_CLIENTS, MOCK_PROJECTS, MOCK_TASKS, MOCK_DELIVERABLES, MOCK_ACTIVITY,
  MOCK_AGENTS,
  PipelineStage, TaskStatus, DeliverableStatus, Priority,
} from "./mock-data";

// ─── Activity Events ───────────────────────────────────────────────────────

export type ActivityEventType =
  | "task_completed"
  | "task_started"
  | "task_unblocked"
  | "deliverable_uploaded"
  | "deliverable_approved"
  | "deliverable_delivered"
  | "project_advanced"
  | "project_created"
  | "briefing_submitted"
  | "agent_assigned";

export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  description: string;
  project?: string;
  client?: string;
  timestamp: string;
}

// ─── Orchestrator Payload ─────────────────────────────────────────────────

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

// ─── Utilities ─────────────────────────────────────────────────────────────

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

// ─── Store Interface ────────────────────────────────────────────────────────

interface AgencyStore {
  clients: Client[];
  projects: Project[];
  tasks: Task[];
  deliverables: Deliverable[];
  activity: ActivityEvent[];

  // Project actions
  moveProjectStage: (projectId: string, newStage: PipelineStage) => void;

  // Task actions
  updateTaskStatus: (taskId: string, newStatus: TaskStatus) => void;

  // Deliverable actions
  updateDeliverableStatus: (deliverableId: string, newStatus: DeliverableStatus) => void;

  // Orchestrator — create full project from approved plan
  createProject: (payload: CreateProjectPayload) => string;

  // Activity log
  logActivity: (event: Omit<ActivityEvent, "id" | "timestamp">) => void;
}

// ─── Store ─────────────────────────────────────────────────────────────────

export const useAgencyStore = create<AgencyStore>((set, get) => ({
  clients:     [...MOCK_CLIENTS],
  projects:    [...MOCK_PROJECTS],
  tasks:       [...MOCK_TASKS],
  deliverables:[...MOCK_DELIVERABLES],
  activity:    seedActivity,

  // ── Move project stage ──────────────────────────────────────────────────
  moveProjectStage: (projectId, newStage) => {
    const project = get().projects.find((p) => p.id === projectId);
    if (!project) return;

    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId ? { ...p, stage: newStage } : p,
      ),
    }));

    get().logActivity({
      type: "project_advanced",
      description: `${project.name} advanced to ${newStage}`,
      project: project.name,
      client: project.clientName,
    });
  },

  // ── Update task status ──────────────────────────────────────────────────
  updateTaskStatus: (taskId, newStatus) => {
    const task = get().tasks.find((t) => t.id === taskId);
    if (!task) return;

    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId ? { ...t, status: newStatus } : t,
      ),
    }));

    // Only log meaningful transitions
    const wasBlocked = task.status === "blocked";
    if (newStatus === "done") {
      get().logActivity({
        type: "task_completed",
        description: `"${task.title}" marked as done`,
        project: task.projectName,
        client: task.clientName,
      });
    } else if (wasBlocked && newStatus === "pending") {
      get().logActivity({
        type: "task_unblocked",
        description: `"${task.title}" unblocked`,
        project: task.projectName,
        client: task.clientName,
      });
    }
  },

  // ── Update deliverable status ───────────────────────────────────────────
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
        type: "deliverable_approved",
        description: `"${d.name}" approved`,
        project: d.projectName,
        client: d.clientName,
      });
    } else if (newStatus === "delivered") {
      get().logActivity({
        type: "deliverable_delivered",
        description: `"${d.name}" delivered to client`,
        project: d.projectName,
        client: d.clientName,
      });
    } else if (newStatus === "in_review") {
      get().logActivity({
        type: "deliverable_uploaded",
        description: `"${d.name}" submitted for review`,
        project: d.projectName,
        client: d.clientName,
      });
    }
  },

  // ── Create project from Orchestrator plan ───────────────────────────────
  createProject: (payload) => {
    const { clientId, clientName, type, goal, deadline, agentNames, plannedTasks } = payload;

    const projectId   = genId("p");
    const projectName = `${clientName} — ${type}`;

    // Resolve agent IDs
    const agentIds = [
      "a0", // Orchestrator always included
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
      status:         "active",
      deadline:       deadline || fallbackDeadline,
      description:    goal,
      goal,
      assignedAgents: agentIds,
      createdAt:      new Date().toISOString().slice(0, 10),
    };

    // Build tasks — spread due dates backward from deadline
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

    set((state) => ({
      projects: [...state.projects, newProject],
      tasks:    [...state.tasks, ...newTasks],
    }));

    get().logActivity({
      type:        "project_created",
      description: `Project created: ${projectName}`,
      project:     projectName,
      client:      clientName,
    });

    return projectId;
  },

  // ── Log activity event ──────────────────────────────────────────────────
  logActivity: (event) => {
    const newEvent: ActivityEvent = {
      ...event,
      id:        genId("act"),
      timestamp: new Date().toISOString(),
    };
    set((state) => ({
      // Cap at 25 events, newest first
      activity: [newEvent, ...state.activity].slice(0, 25),
    }));
  },
}));
