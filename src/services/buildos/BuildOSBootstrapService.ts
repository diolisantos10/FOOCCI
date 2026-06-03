/**
 * BuildOSBootstrapService — prompt/CLI-driven setup + verification (no manual UI).
 *
 * Lets a developer configure and verify Build OS WITHOUT Railway or repetitive
 * UI steps. Pure orchestration over the existing buildos services — it adds NO
 * new capability and STILL has NO Claude/GitHub/LLM relay and NO execution.
 *
 * Safety:
 *   • Idempotent (upserts; never deletes existing data).
 *   • Dry-run support (plan only; no writes).
 *   • Phone normalized with the SAME runtime logic (normalizeSenderPhone).
 *   • Never prints secrets.
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { normalizeSenderPhone, phoneVariants } from "./BuildCommandRouter";
import { seedDefaultBuildProjects } from "./defaultBuildProjects";
import { classifyBuildCommandText } from "./BuildCommandClassifier";
import { generateTechnicalPromptDraft, type PromptSourceCommand } from "./BuildPromptDraftService";

export interface BootstrapInput {
  phone: string;
  name?: string;
  role?: string;
  dryRun?: boolean;
}

export interface BootstrapPlan {
  normalizedPhone: string;
  rawPhone: string;
  /** Equivalent E.164 forms recognized on authorization (Brazilian 9th-digit). */
  phoneVariants: string[];
  name: string;
  role: string;
  actions: string[];
}

export interface BootstrapResult {
  dryRun: boolean;
  plan: BootstrapPlan;
  applied: boolean;
  configEnabled?: boolean;
  projectSeed?: { created: number; updated: number };
  senderAction?: "created" | "updated";
}

/** Validate + normalize the phone the same way runtime does. Throws on invalid. */
export function prepareBootstrapPlan(input: BootstrapInput): BootstrapPlan {
  const rawPhone = (input.phone ?? "").trim();
  const normalizedPhone = normalizeSenderPhone(rawPhone);
  if (!normalizedPhone || normalizedPhone.replace(/\D/g, "").length < 10) {
    throw new Error(
      'Telefone inválido ou ausente. Use o formato E.164, ex.: "+5511999999999" ' +
        "(com DDI 55, DDD e, idealmente, o 9). Defina BUILD_OS_BOOTSTRAP_PHONE.",
    );
  }
  const name = (input.name ?? "Diego").trim() || "Diego";
  const role = (input.role ?? "OWNER").trim() || "OWNER";

  return {
    normalizedPhone,
    rawPhone,
    phoneVariants: Array.from(phoneVariants(normalizedPhone)),
    name,
    role,
    actions: [
      "Garantir BuildOSConfig com isEnabled=true (cria se não existir; preserva o resto).",
      "Semear/atualizar o projeto Foocci (ativo + default) — idempotente.",
      `Criar/atualizar operador autorizado "${name}" (${normalizedPhone}), ativo.`,
    ],
  };
}

/**
 * Run the bootstrap. With dryRun=true, returns the plan and writes nothing.
 * Idempotent and additive: never deletes existing data.
 */
export async function runBootstrap(input: BootstrapInput): Promise<BootstrapResult> {
  const plan = prepareBootstrapPlan(input);
  const dryRun = !!input.dryRun;

  if (dryRun) {
    return { dryRun: true, plan, applied: false };
  }

  // 1. Enable Build OS via DB config (create-or-update; preserve other fields).
  const existingConfig = await prisma.buildOSConfig.findFirst({ orderBy: { updatedAt: "desc" } });
  if (existingConfig) {
    await prisma.buildOSConfig.update({ where: { id: existingConfig.id }, data: { isEnabled: true } });
  } else {
    await prisma.buildOSConfig.create({ data: { isEnabled: true } });
  }

  // 2. Ensure Foocci project exists (active + default). Idempotent.
  const projectSeed = await seedDefaultBuildProjects();

  // 3. Upsert the authorized operator by canonical phone.
  const existingSender = await prisma.buildAuthorizedSender.findUnique({
    where: { phone: plan.normalizedPhone },
    select: { id: true },
  });
  let senderAction: "created" | "updated";
  if (existingSender) {
    await prisma.buildAuthorizedSender.update({
      where: { id: existingSender.id },
      data: { name: plan.name, role: plan.role, rawPhone: plan.rawPhone, isActive: true },
    });
    senderAction = "updated";
  } else {
    await prisma.buildAuthorizedSender.create({
      data: {
        phone: plan.normalizedPhone,
        rawPhone: plan.rawPhone,
        name: plan.name,
        role: plan.role,
        isActive: true,
        allowedProjectIds: [] as Prisma.InputJsonValue,
      },
    });
    senderAction = "created";
  }

  return {
    dryRun: false,
    plan,
    applied: true,
    configEnabled: true,
    projectSeed,
    senderAction,
  };
}

// ── Verification ─────────────────────────────────────────────────────────────────

export interface VerifyCheck {
  name: string;
  pass: boolean;
  detail: string;
}

export interface VerifyReport {
  checks: VerifyCheck[];
  allPass: boolean;
}

const SAMPLE_COMMAND = "Faz um RAIO-X do checkout Pix. Não implemente nada ainda.";

/**
 * Verify the Build OS setup end-to-end (no relay, no execution):
 *   • DB config exists + enabled
 *   • ≥1 active authorized sender
 *   • Foocci project exists + active + default
 *   • classifier works on the sample command
 *   • prompt draft generation works on the simulated command
 */
export async function runVerification(): Promise<VerifyReport> {
  const checks: VerifyCheck[] = [];

  // 1. Config.
  let configEnabled = false;
  try {
    const cfg = await prisma.buildOSConfig.findFirst({ orderBy: { updatedAt: "desc" } });
    configEnabled = !!cfg?.isEnabled;
    checks.push({
      name: "BuildOSConfig existe e está habilitado",
      pass: configEnabled,
      detail: cfg ? `isEnabled=${cfg.isEnabled}, mode=${cfg.mode}` : "nenhuma linha de config no banco",
    });
  } catch (e) {
    checks.push({ name: "BuildOSConfig existe e está habilitado", pass: false, detail: dbErr(e) });
  }

  // 2. Active authorized sender.
  try {
    const count = await prisma.buildAuthorizedSender.count({ where: { isActive: true } });
    checks.push({
      name: "Pelo menos um operador autorizado ativo",
      pass: count > 0,
      detail: `${count} operador(es) ativo(s)`,
    });
  } catch (e) {
    checks.push({ name: "Pelo menos um operador autorizado ativo", pass: false, detail: dbErr(e) });
  }

  // 3. Foocci project.
  try {
    const foocci = await prisma.buildProject.findUnique({ where: { slug: "foocci" } });
    const ok = !!foocci?.isActive && !!foocci?.isDefault;
    checks.push({
      name: "Projeto Foocci existe, ativo e default",
      pass: ok,
      detail: foocci ? `isActive=${foocci.isActive}, isDefault=${foocci.isDefault}` : "projeto foocci não encontrado",
    });
  } catch (e) {
    checks.push({ name: "Projeto Foocci existe, ativo e default", pass: false, detail: dbErr(e) });
  }

  // 4. Classifier (pure — no DB).
  const classification = classifyBuildCommandText(SAMPLE_COMMAND);
  const classOk =
    classification.taskType === "AUDIT" &&
    classification.executionIntent === "AUDIT_ONLY" &&
    classification.targetArea === "payment" &&
    classification.riskLevel === "HIGH";
  checks.push({
    name: "Classificador funciona no comando de exemplo (Pix/RAIO-X)",
    pass: classOk,
    detail: `task=${classification.taskType}, intent=${classification.executionIntent}, area=${classification.targetArea}, risk=${classification.riskLevel}`,
  });

  // 5. Prompt draft (pure — no DB, no relay).
  const simulated: PromptSourceCommand = {
    id: "verify_simulated",
    rawMessage: `/build ${SAMPLE_COMMAND}`,
    commandText: SAMPLE_COMMAND,
    taskType: classification.taskType,
    riskLevel: classification.riskLevel,
    executionIntent: classification.executionIntent,
    targetArea: classification.targetArea,
    requiresHumanConfirmation: classification.requiresHumanConfirmation,
    classificationSummary: classification.classificationSummary,
    projectId: "proj_foocci",
    projectSlug: "foocci",
    projectName: "Foocci",
  };
  const prompt = generateTechnicalPromptDraft(simulated);
  const promptOk =
    prompt.includes("## Guardrails") &&
    prompt.includes("Do NOT modify") && // audit-only guardrail
    !/(send to claude|create a github issue)/i.test(prompt); // no relay wording
  checks.push({
    name: "Geração de rascunho de prompt funciona (e não chama relay)",
    pass: promptOk,
    detail: `prompt com ${prompt.length} chars; guardrail de auditoria presente; sem relay`,
  });

  return { checks, allPass: checks.every((c) => c.pass) };
}

function dbErr(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  // never leak connection strings / secrets
  return `falha de banco: ${(msg.split("\n")[0] ?? msg).slice(0, 120)}`;
}

// ── Simulated intake (no real WhatsApp, no send, no relay) ───────────────────────

export interface SimulatedIntakeInput {
  phone: string;
  message: string;
  /** When true (default), never attempts a WhatsApp send. */
  noSend?: boolean;
}

export interface SimulatedIntakeResult {
  ok: boolean;
  error?: string;
  commandId?: string;
  shortId?: string;
  projectSlug?: string | null;
  classification?: ReturnType<typeof classifyBuildCommandText>;
  promptVersion?: number;
  status?: string;
}

/**
 * Simulate an authorized WhatsApp command end-to-end WITHOUT a real message and
 * WITHOUT sending anything (no-send by default). Exercises the real services:
 * create → resolve project → classify → draft prompt → AWAITING_CONFIRMATION.
 * NEVER relays to Claude/GitHub and NEVER executes code.
 */
export async function runSimulatedIntake(
  input: SimulatedIntakeInput,
): Promise<SimulatedIntakeResult> {
  // Lazy imports keep this module's top-level deps minimal and avoid cycles.
  const { detectBuildCommand } = await import("./BuildCommandRouter");
  const { authorizeSender } = await import("./BuildOSConfigService");
  const {
    createBuildCommandFromWhatsApp,
    setBuildCommandStatus,
    logBuildCommandEvent,
    shortId,
    BUILD_EVENT,
  } = await import("./BuildCommandService");
  const { createPromptDraftForCommand } = await import("./BuildPromptDraftService");

  const detected = detectBuildCommand(input.message);
  if (!detected) {
    return { ok: false, error: "A mensagem não é um comando Build OS (use /build, /cmd ou /prompt)." };
  }

  const auth = await authorizeSender(input.phone);
  if (!auth.authorized) {
    return { ok: false, error: "Remetente não autorizado — rode o bootstrap primeiro ou ative o operador." };
  }

  const created = await createBuildCommandFromWhatsApp({
    senderPhone: normalizeSenderPhone(input.phone),
    senderName: null,
    rawMessage: input.message,
    prefix: detected.prefix,
    commandText: detected.commandText,
  });
  if (!created) return { ok: false, error: "Falha ao criar o BuildCommand." };

  const version = await createPromptDraftForCommand(created.id);
  if (version) {
    await setBuildCommandStatus(created.id, "DRAFTED");
    await logBuildCommandEvent(
      created.id,
      BUILD_EVENT.PROMPT_DRAFTED,
      `Rascunho gerado (simulado, versão ${version.versionNumber}).`,
      { versionNumber: version.versionNumber, simulated: true },
    );
  }
  await setBuildCommandStatus(created.id, "AWAITING_CONFIRMATION");
  await logBuildCommandEvent(
    created.id,
    BUILD_EVENT.AWAITING_CONFIRMATION,
    "Intake simulado — aguardando confirmação (no-send: nenhum WhatsApp enviado).",
    { simulated: true, noSend: input.noSend !== false },
  );

  const classification = classifyBuildCommandText(input.message);
  return {
    ok: true,
    commandId: created.id,
    shortId: shortId(created.id),
    projectSlug: created.projectId ? "(resolvido)" : null,
    classification,
    promptVersion: version?.versionNumber,
    status: "AWAITING_CONFIRMATION",
  };
}
