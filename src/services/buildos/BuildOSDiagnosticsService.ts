/**
 * BuildOSDiagnosticsService — one-shot, admin-only health report for the Build OS
 * WhatsApp command path (no manual console/fetch needed).
 *
 * Read-only by default. Aggregates the real services so the report reflects EXACT
 * runtime behavior: config gate, sender authorization (with phone variants),
 * project resolution, detector, classifier, prompt-draft generation, the webhook
 * integration facts, the latest commands for the sender, and a best-effort
 * root-cause classification.
 *
 * NO Claude/GitHub/LLM, NO execution. Never logs/returns secrets.
 */

import { prisma } from "@/lib/prisma";
import {
  isBuildOsHardDisabled,
  resolveBuildOsEnabled,
  getBuildOSConfigRow,
  authorizeSender,
  countActiveDbSenders,
} from "./BuildOSConfigService";
import {
  detectBuildCommand,
  normalizeSenderPhone,
  phoneVariants,
  isBuildOsEnabled as isEnvBuildOsEnabled,
} from "./BuildCommandRouter";
import { classifyBuildCommandText } from "./BuildCommandClassifier";
import { generateTechnicalPromptDraft, buildPromptPreview, type PromptSourceCommand } from "./BuildPromptDraftService";
import { resolveBuildProjectFromMessage } from "./BuildProjectService";
import { getRecentWebhookTraces } from "./BuildWebhookTrace";

const DEFAULT_PHONE = "+5511989400692";
const DEFAULT_MESSAGE = "/build Faz um RAIO-X do checkout Pix. Não implemente nada ainda.";

export type RootCause =
  | "CONFIG_DISABLED"
  | "AUTHORIZATION_FAILED"
  | "PHONE_NORMALIZATION_MISMATCH"
  | "DETECTOR_NOT_CALLED"
  | "WEBHOOK_NOT_RECEIVED"
  | "COMMAND_CREATED_BUT_NO_RESPONSE"
  | "RESPONSE_SEND_FAILED"
  | "DID_NOT_SHORT_CIRCUIT_NORMAL_FLOW"
  | "NORMAL_AGENT_ECHO"
  | "HEALTHY"
  | "UNKNOWN";

function maskPhone(phone: string): string {
  if (!phone || phone.length <= 6) return "***";
  return `${phone.slice(0, 3)}***${phone.slice(-4)}`;
}

export async function runBuildOsDiagnostics(opts?: {
  phone?: string;
  message?: string;
}): Promise<Record<string, unknown>> {
  const inputPhone = opts?.phone?.trim() || DEFAULT_PHONE;
  const testMessage = opts?.message?.trim() || DEFAULT_MESSAGE;
  const normalizedPhone = normalizeSenderPhone(inputPhone);
  const variants = Array.from(phoneVariants(normalizedPhone));

  // ── buildOsConfig ──
  const hardDisabled = isBuildOsHardDisabled();
  const configRow = await getBuildOSConfigRow();
  const enabledResolution = await resolveBuildOsEnabled();
  const buildOsConfig = {
    exists: !!configRow,
    enabled: enabledResolution.enabled,
    source: enabledResolution.source,
    hardDisabled,
    mode: configRow?.mode ?? "INTERNAL_ONLY",
    envEnabledFallback: isEnvBuildOsEnabled(),
    allowEnvAuthorizedPhonesFallback: configRow?.allowEnvAuthorizedPhonesFallback ?? true,
  };

  // ── authorizedSenderCheck ──
  let dbSenderFound = false;
  let dbSenderActive = false;
  let role: string | null = null;
  let lastUsedAt: string | null = null;
  let dbSenderRawPhone: string | null = null;
  try {
    const sender = await prisma.buildAuthorizedSender.findFirst({
      where: { phone: { in: variants } },
    });
    if (sender) {
      dbSenderFound = true;
      dbSenderActive = sender.isActive;
      role = sender.role;
      lastUsedAt = sender.lastUsedAt?.toISOString() ?? null;
      dbSenderRawPhone = sender.rawPhone ?? null;
    }
  } catch {
    /* tolerate */
  }
  const authResult = await authorizeSender(inputPhone);
  const authorizedSenderCheck = {
    inputPhone: maskPhone(inputPhone),
    normalizedPhone: maskPhone(normalizedPhone),
    variants: variants.map(maskPhone),
    dbSenderFound,
    dbSenderActive,
    dbSenderRawPhone: dbSenderRawPhone ? maskPhone(dbSenderRawPhone) : null,
    role,
    lastUsedAt,
    authorized: authResult.authorized,
    authorizationSource: authResult.source,
    activeDbSenderCount: await countActiveDbSenders(),
  };

  // ── projectCheck ──
  let defaultProjectFound = false;
  let defaultProjectSlug: string | null = null;
  let activeProjectsCount = 0;
  try {
    const def = await prisma.buildProject.findFirst({ where: { isDefault: true, isActive: true } });
    defaultProjectFound = !!def;
    defaultProjectSlug = def?.slug ?? null;
    activeProjectsCount = await prisma.buildProject.count({ where: { isActive: true } });
  } catch {
    /* tolerate */
  }
  const resolution = await resolveBuildProjectFromMessage(testMessage).catch(() => null);
  const projectCheck = {
    defaultProjectFound,
    defaultProjectSlug,
    activeProjectsCount,
    resolvedFromMessage: resolution?.slug ?? null,
    resolutionMethod: resolution?.method ?? "UNRESOLVED",
  };

  // ── detectorCheck (pure) ──
  const detected = detectBuildCommand(testMessage);
  const detectorCheck = {
    testMessage,
    prefixDetected: detected?.prefix ?? null,
    commandText: detected?.commandText ?? null,
  };

  // ── classificationCheck (pure) ──
  const classification = classifyBuildCommandText(testMessage);
  const classificationCheck = {
    taskType: classification.taskType,
    executionIntent: classification.executionIntent,
    targetArea: classification.targetArea,
    riskLevel: classification.riskLevel,
    requiresHumanConfirmation: classification.requiresHumanConfirmation,
  };

  // ── promptDraftCheck (pure) ──
  let promptDraftCheck: Record<string, unknown> = { canGeneratePromptDraft: false, noClaudeRelay: true };
  try {
    const simulated: PromptSourceCommand = {
      id: "diag",
      rawMessage: testMessage,
      commandText: detected?.commandText ?? testMessage,
      taskType: classification.taskType,
      riskLevel: classification.riskLevel,
      executionIntent: classification.executionIntent,
      targetArea: classification.targetArea,
      requiresHumanConfirmation: classification.requiresHumanConfirmation,
      classificationSummary: classification.classificationSummary,
      projectId: defaultProjectFound ? "default" : null,
      projectSlug: defaultProjectSlug,
      projectName: defaultProjectSlug,
    };
    const draft = generateTechnicalPromptDraft(simulated);
    promptDraftCheck = {
      canGeneratePromptDraft: draft.length > 0,
      preview: buildPromptPreview(draft, 300),
      noClaudeRelay: !/(send to claude|create a github issue)/i.test(draft),
    };
  } catch {
    promptDraftCheck = { canGeneratePromptDraft: false, noClaudeRelay: true };
  }

  // ── webhookIntegrationCheck (static facts about the wired path) ──
  const webhookIntegrationCheck = {
    webhookRoute: "POST /api/webhooks/evolution",
    handlerEntry: "WebhookProcessorService.handleInboundMessage",
    buildOsBranchBeforeCustomerFlow: true, // lines ~84-106, before customer/conversation/message creation
    shortCircuitsOnHandled: true,          // returns { handled:true, action:"buildos_command" }
    outboundSendService: "BuildNotifier.sendBuildConfirmation → EvolutionClient.sendTextMessage",
    note: "TEXT messages only; fromMe messages route to external_outbound and are NOT command-checked.",
  };

  // ── lastCommands (for the sender) ──
  let lastCommands: Array<Record<string, unknown>> = [];
  try {
    const rows = await prisma.buildCommand.findMany({
      where: { senderPhone: { in: variants } },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        project: { select: { slug: true } },
        _count: { select: { events: true, promptVersions: true } },
      },
    });
    lastCommands = rows.map((r) => ({
      id: r.id.slice(-6).toUpperCase(),
      status: r.status,
      project: r.project?.slug ?? null,
      taskType: r.taskType,
      riskLevel: r.riskLevel,
      createdAt: r.createdAt.toISOString(),
      promptVersions: r._count.promptVersions,
      events: r._count.events,
    }));
  } catch {
    /* tolerate */
  }

  // ── likelyRootCause ──
  const likelyRootCause = classifyRootCause({
    enabled: buildOsConfig.enabled,
    hardDisabled,
    authorized: authResult.authorized,
    dbSenderFound,
    dbSenderActive,
    prefixDetected: !!detected,
    hasRecentCommand: lastCommands.length > 0,
  });

  // ── recentWebhookTraces (did the REAL webhook reach the Build OS branch?) ──
  const recentWebhookTraces = await getRecentWebhookTraces(10);
  const lastWebhookAt = recentWebhookTraces[0]?.createdAt ?? null;

  // ── deployInfo: lets the admin confirm production runs the trace-capable build.
  //    `buildMarker` is bumped whenever the Build OS webhook path changes, so an
  //    old deploy is obvious without reading commit SHAs.
  const deployInfo = {
    commitSha: process.env.RAILWAY_GIT_COMMIT_SHA ?? "unknown",
    branch: process.env.RAILWAY_GIT_BRANCH ?? "unknown",
    appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? "dev",
    nodeEnv: process.env.NODE_ENV ?? "unknown",
    // Bump this when the Build OS webhook trace/interception path changes.
    buildMarker: "buildos-webhook-trace-v1",
    webhookRouteExpected: "POST /api/webhooks/evolution",
    healthEndpoint: "/api/health",
  };

  return {
    generatedAt: new Date().toISOString(),
    deployInfo,
    buildOsConfig,
    authorizedSenderCheck,
    projectCheck,
    detectorCheck,
    classificationCheck,
    promptDraftCheck,
    webhookIntegrationCheck,
    webhookReceivedRealBuild: recentWebhookTraces.length > 0,
    lastWebhookAt,
    recentWebhookTraces,
    lastCommands,
    likelyRootCause,
  };
}

function classifyRootCause(s: {
  enabled: boolean;
  hardDisabled: boolean;
  authorized: boolean;
  dbSenderFound: boolean;
  dbSenderActive: boolean;
  prefixDetected: boolean;
  hasRecentCommand: boolean;
}): { code: RootCause; explanation: string; recommendedFix: string } {
  if (!s.prefixDetected) {
    return {
      code: "DETECTOR_NOT_CALLED",
      explanation: "A mensagem de teste não começa com /build, /cmd ou /prompt.",
      recommendedFix: "Use um prefixo válido no início da mensagem.",
    };
  }
  if (s.hardDisabled) {
    return {
      code: "CONFIG_DISABLED",
      explanation: "BUILDOS_HARD_DISABLED está ativo no ambiente — o Build OS é desligado antes de tudo.",
      recommendedFix: "Remova/zere a variável BUILDOS_HARD_DISABLED no ambiente do serviço e faça redeploy.",
    };
  }
  if (!s.enabled) {
    return {
      code: "CONFIG_DISABLED",
      explanation:
        "O gate de ativação retornou desligado no runtime que processa o webhook (config do banco não carregada como ativa, ou serviço/banco diferente do bootstrap).",
      recommendedFix:
        "Confirme que o serviço que recebe o webhook é o mesmo deployment do admin e aponta para o mesmo banco; reative em Configuração se necessário.",
    };
  }
  if (!s.dbSenderFound) {
    return {
      code: "AUTHORIZATION_FAILED",
      explanation: "Nenhum operador no banco casou com as variantes do telefone.",
      recommendedFix: "Cadastre/ative o operador na aba Configuração (ou rode o bootstrap).",
    };
  }
  if (s.dbSenderFound && !s.dbSenderActive) {
    return {
      code: "AUTHORIZATION_FAILED",
      explanation: "O operador existe no banco mas está inativo.",
      recommendedFix: "Ative o operador na aba Configuração.",
    };
  }
  if (!s.authorized) {
    return {
      code: "PHONE_NORMALIZATION_MISMATCH",
      explanation: "Operador ativo existe, mas a autorização falhou — provável divergência de formato de telefone.",
      recommendedFix: "Confira o telefone cadastrado vs. o que o WhatsApp entrega (variantes com/sem 9).",
    };
  }
  // enabled + authorized + detected
  return {
    code: "HEALTHY",
    explanation:
      "Config ativa, operador autorizado e comando detectável. O caminho deveria funcionar. Se o WhatsApp real falhou, verifique se o serviço do webhook roda o build atual e veja os logs [BUILD_OS_WHATSAPP].",
    recommendedFix:
      "Rode a 'Simulação interna' para criar um comando de verdade e confirme no painel; se a simulação funciona mas o WhatsApp não, o problema é deploy/instância do webhook.",
  };
}
