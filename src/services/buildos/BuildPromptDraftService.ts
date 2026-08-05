/**
 * BuildPromptDraftService — deterministic, template-based prompt drafts (Pri 1.4).
 *
 * Generates a structured ENGLISH technical prompt from a BuildCommand's stored
 * metadata. STRICTLY TEMPLATE-BASED — there is NO LLM here, NO network call, and
 * absolutely NO relay to Claude or GitHub. The draft is stored as a
 * BuildPromptVersion and is only ever shown inside the internal admin area.
 *
 * Security: the prompt is built ONLY from the command's own fields (raw message,
 * classification, project metadata that is itself non-secret). It NEVER reads or
 * embeds env vars, tokens, DATABASE_URL, or any credential.
 */

import { prisma } from "@/lib/prisma";
import { getBuildProjectBySlug, type BuildProjectView } from "./BuildProjectService";

// Shape we need from a command to build a prompt (a subset of the Prisma row).
export interface PromptSourceCommand {
  id: string;
  rawMessage: string;
  commandText: string;
  taskType: string;
  riskLevel: string;
  executionIntent: string;
  targetArea: string | null;
  requiresHumanConfirmation: boolean;
  classificationSummary: string | null;
  projectId: string | null;
  projectSlug: string | null;
  projectName: string | null;
}

// ── area → files/areas to inspect (deterministic hints, not secrets) ────────────

const AREA_INSPECTION_HINTS: Record<string, string[]> = {
  payment: [
    "Payment integration code (Stone / Mercado Pago) and webhook signature verification",
    "Checkout/payment status transitions and order finalization",
  ],
  checkout: [
    "Checkout flow and order draft finalization",
    "Cart/order total computation",
  ],
  auth: [
    "Authentication / session / permission logic",
    "Admin auth and token handling (metadata only — never read secret values)",
  ],
  database: [
    "Prisma schema and migrations (additive-only unless explicitly authorized)",
    "Affected models and their relations/indexes",
  ],
  waiter: [
    "The Waiter AI runtime (read-only for an audit) and the /pedido ordering flow",
    "Prompt assembly and product/menu reading logic",
  ],
  whatsapp: [
    "Recebimento e processamento do webhook da Meta (WhatsApp)",
    "Message sending service and instance config (metadata only)",
  ],
  crm: ["CRM campaign/automation services and segments"],
  menu: ["Menu category/item services and admin menu screens"],
  delivery: ["Delivery zone/fee resolver and address handling"],
  analytics: ["Analytics/reporting services and dashboards"],
  integrations: ["Third-party integration services and their config"],
  buildos: ["Build OS services under src/services/buildos and the /admin/build-os area"],
  admin: ["The relevant admin screens under src/app/admin and their API routes"],
  ui: ["The relevant UI components and their styling"],
  unknown: ["To be determined during inspection — start broad, then narrow"],
};

const SENSITIVE_AREAS = new Set(["payment", "checkout", "auth", "database", "whatsapp", "waiter"]);

// ── guardrails ──────────────────────────────────────────────────────────────────

function buildGuardrails(cmd: PromptSourceCommand): string[] {
  const rules: string[] = [];
  const auditOnly = cmd.executionIntent === "AUDIT_ONLY";
  const area = cmd.targetArea ?? "unknown";
  const risk = cmd.riskLevel;

  if (auditOnly) {
    rules.push(
      "AUDIT-ONLY: Do NOT modify, create, or delete any file. Do NOT implement anything. Only inspect the codebase and produce a written report.",
    );
  }

  if (risk === "HIGH" || risk === "CRITICAL") {
    rules.push(
      `This task is classified ${risk} risk. Proceed with maximum caution. Make the smallest possible, fully reversible change, and stop to ask if anything is ambiguous.`,
    );
  }
  if (risk === "CRITICAL") {
    rules.push(
      "CRITICAL: Never run destructive operations (no data deletion, no table drops, no production resets, no migrations that drop/alter columns) under any circumstance in this task.",
    );
  }

  if (SENSITIVE_AREAS.has(area)) {
    rules.push(
      `The target area is "${area}". Do NOT change runtime behavior of this area unless explicitly authorized in the request. Treat customer-facing and money/auth flows as protected.`,
    );
  }

  // Always-on Build OS safety floor.
  rules.push("Do NOT expose or print secrets, tokens, DATABASE_URL, or any credential.");
  rules.push("Keep all changes additive and safe-by-default; never break existing customer-facing behavior.");

  if (cmd.taskType === "UNKNOWN") {
    rules.push(
      "Task type is UNKNOWN: do NOT implement. Perform a clarification/audit pass and report what you would do plus open questions.",
    );
  }

  return rules;
}

// ── required task wording ─────────────────────────────────────────────────────

function buildRequiredTask(cmd: PromptSourceCommand): string {
  if (cmd.executionIntent === "AUDIT_ONLY" || cmd.taskType === "AUDIT" || cmd.taskType === "UNKNOWN") {
    return "Perform a read-only investigation (X-ray) of the relevant code and produce a clear written report. Do not implement changes.";
  }
  switch (cmd.executionIntent) {
    case "FIX":
      return "Diagnose the described problem and propose (and, if authorized by the request, implement) the smallest safe fix. Explain the root cause.";
    case "IMPLEMENT":
      return "Implement the requested change in an additive, safe manner, with tests/verification where applicable.";
    case "REVIEW":
      return "Review the relevant code/change and provide structured feedback. Do not implement unless explicitly asked.";
    case "EXPLAIN":
      return "Explain how the relevant part works in clear terms. Do not modify code.";
    default:
      return "Clarify the request and propose a safe plan before implementing anything.";
  }
}

// ── acceptance criteria ─────────────────────────────────────────────────────────

function buildAcceptanceCriteria(cmd: PromptSourceCommand): string[] {
  const auditOnly = cmd.executionIntent === "AUDIT_ONLY" || cmd.taskType === "AUDIT" || cmd.taskType === "UNKNOWN";
  if (auditOnly) {
    return [
      "A written report is produced covering findings, risks, and recommended next steps.",
      "No files were modified.",
      "Sensitive areas (payment/auth/database/runtime) are flagged but not changed.",
    ];
  }
  const criteria = [
    "The change is additive and does not break existing customer-facing behavior.",
    "TypeScript type-check passes (npx tsc --noEmit).",
    "Relevant tests pass; new behavior is covered where practical.",
  ];
  if (SENSITIVE_AREAS.has(cmd.targetArea ?? "")) {
    criteria.push("Runtime behavior of the sensitive target area is unchanged unless explicitly authorized.");
  }
  return criteria;
}

// ── prompt assembly ──────────────────────────────────────────────────────────────

/**
 * Generate the full structured English technical prompt draft (deterministic).
 * Sections: Context · Goal · Current Request · Project · Classified Metadata ·
 * Required Task · Guardrails · Files/Areas to Inspect · Acceptance Criteria ·
 * Verification · Final Report Format.
 */
export function generateTechnicalPromptDraft(
  cmd: PromptSourceCommand,
  opts?: { revisionInstruction?: string | null; versionNumber?: number },
): string {
  const area = cmd.targetArea ?? "unknown";
  const inspection: string[] =
    AREA_INSPECTION_HINTS[area] ??
    AREA_INSPECTION_HINTS.unknown ?? ["To be determined during inspection."];
  const guardrails = buildGuardrails(cmd);
  const acceptance = buildAcceptanceCriteria(cmd);
  const projectLine = cmd.projectSlug
    ? `${cmd.projectName ?? cmd.projectSlug} (slug: ${cmd.projectSlug})`
    : "Project unresolved — do not approve for relay until a project is resolved (unless a default project applies).";

  const list = (items: string[]) => items.map((i) => `- ${i}`).join("\n");

  const sections: string[] = [
    "# Technical Task Prompt (Build OS — TEMPLATE draft, no LLM)",
    "",
    "## Context",
    "This prompt was generated deterministically by the Build OS Prompt Relay from an authorized operator's WhatsApp command. It has NOT been sent to any executor. Treat it as a proposed task specification pending human approval.",
    "",
    "## Goal",
    "Turn the operator's intent below into a safe, well-scoped engineering task, respecting all guardrails.",
    "",
    "## Current Request",
    cmd.commandText.trim() || cmd.rawMessage.trim() || "(no command text)",
    "",
    "## Project",
    projectLine,
    "",
    "## Classified Metadata",
    list([
      `Task type: ${cmd.taskType}`,
      `Execution intent: ${cmd.executionIntent}`,
      `Target area: ${area}`,
      `Risk level: ${cmd.riskLevel}`,
      `Requires human confirmation: ${cmd.requiresHumanConfirmation ? "yes" : "no"}`,
      ...(cmd.classificationSummary ? [`Summary: ${cmd.classificationSummary}`] : []),
    ]),
    "",
    "## Required Task",
    buildRequiredTask(cmd),
    "",
    "## Guardrails",
    list(guardrails),
    "",
    "## Files/Areas to Inspect",
    list(inspection),
    "",
    "## Acceptance Criteria",
    list(acceptance),
    "",
    "## Verification",
    list([
      "Run npx tsc --noEmit.",
      "Run the relevant unit tests.",
      "Confirm no customer-facing/runtime behavior changed unless explicitly authorized.",
    ]),
    "",
    "## Final Report Format",
    list([
      "What was inspected/done.",
      "What was intentionally NOT done (and why).",
      "Risks/edge cases.",
      "Files changed (if any).",
      "Verification results.",
    ]),
  ];

  if (opts?.revisionInstruction && opts.revisionInstruction.trim()) {
    sections.push(
      "",
      "## Operator Revision Instruction",
      `(Applied to this version) ${opts.revisionInstruction.trim()}`,
    );
  }

  return sections.join("\n");
}

/** Build a compact WhatsApp-friendly preview (kept short for chat). */
export function buildPromptPreview(promptText: string, maxChars = 600): string {
  const trimmed = promptText.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars).trimEnd()}\n… (prompt completo no painel admin)`;
}

// ── persistence ──────────────────────────────────────────────────────────────────

/** Load the prompt source fields for a command (with resolved project metadata). */
async function loadPromptSource(commandId: string): Promise<PromptSourceCommand | null> {
  const c = await prisma.buildCommand.findUnique({
    where: { id: commandId },
    include: { project: { select: { slug: true, name: true } } },
  });
  if (!c) return null;
  return {
    id: c.id,
    rawMessage: c.rawMessage,
    commandText: c.commandText,
    taskType: c.taskType,
    riskLevel: c.riskLevel,
    executionIntent: c.executionIntent,
    targetArea: c.targetArea,
    requiresHumanConfirmation: c.requiresHumanConfirmation,
    classificationSummary: c.classificationSummary,
    projectId: c.projectId,
    projectSlug: c.project?.slug ?? null,
    projectName: c.project?.name ?? null,
  };
}

export interface PromptVersionResult {
  id: string;
  versionNumber: number;
  promptText: string;
}

/**
 * Create version 1 of the prompt draft for a command. Returns null on failure.
 * Idempotent-ish: if a version already exists this still appends the next number
 * (callers create it exactly once on intake).
 */
export async function createPromptDraftForCommand(
  commandId: string,
): Promise<PromptVersionResult | null> {
  try {
    const source = await loadPromptSource(commandId);
    if (!source) return null;

    const versionNumber = (await nextVersionNumber(commandId));
    const promptText = generateTechnicalPromptDraft(source, { versionNumber });

    const created = await prisma.buildPromptVersion.create({
      data: {
        commandId,
        versionNumber,
        promptText,
        promptKind: "TECHNICAL_DRAFT",
        generatedBy: "TEMPLATE",
      },
      select: { id: true, versionNumber: true, promptText: true },
    });
    return created;
  } catch {
    return null;
  }
}

/** Create the next prompt version applying an operator revision instruction. */
export async function revisePromptDraft(
  commandId: string,
  revisionInstruction: string,
): Promise<PromptVersionResult | null> {
  try {
    const source = await loadPromptSource(commandId);
    if (!source) return null;

    const versionNumber = await nextVersionNumber(commandId);
    const promptText = generateTechnicalPromptDraft(source, {
      revisionInstruction,
      versionNumber,
    });

    const created = await prisma.buildPromptVersion.create({
      data: {
        commandId,
        versionNumber,
        promptText,
        promptKind: "TECHNICAL_DRAFT",
        generatedBy: "TEMPLATE",
        revisionInstruction,
      },
      select: { id: true, versionNumber: true, promptText: true },
    });
    return created;
  } catch {
    return null;
  }
}

/** Latest stored prompt version for a command, or null. */
export async function getLatestPromptVersion(
  commandId: string,
): Promise<PromptVersionResult | null> {
  try {
    const v = await prisma.buildPromptVersion.findFirst({
      where: { commandId },
      orderBy: { versionNumber: "desc" },
      select: { id: true, versionNumber: true, promptText: true },
    });
    return v;
  } catch {
    return null;
  }
}

async function nextVersionNumber(commandId: string): Promise<number> {
  const last = await prisma.buildPromptVersion.findFirst({
    where: { commandId },
    orderBy: { versionNumber: "desc" },
    select: { versionNumber: true },
  });
  return (last?.versionNumber ?? 0) + 1;
}

// Re-export for callers that want project metadata alongside drafting.
export type { BuildProjectView };
export { getBuildProjectBySlug };
