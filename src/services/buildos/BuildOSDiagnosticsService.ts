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
  getBuildOsChannel,
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
import { describeBuildOsMetaChannel, isBuildOsMetaChannelEnabled } from "./BuildOsMetaChannel";

// Last-resort fallback ONLY when there is no active operator in the DB. The real
// default is resolved at runtime from the active BuildAuthorizedSender so the
// diagnostic always tests the CURRENT operator, never a hardcoded/stale number.
const FALLBACK_PHONE = "+5511940595223";
const DEFAULT_MESSAGE = "/build Faz um RAIO-X do checkout Pix. Não implemente nada ainda.";

/** Resolve the phone the diagnostic should test by default: the active DB operator. */
async function resolveDefaultDiagnosticPhone(): Promise<string> {
  try {
    const active = await prisma.buildAuthorizedSender.findFirst({
      where: { isActive: true },
      orderBy: [{ lastUsedAt: "desc" }, { updatedAt: "desc" }],
      select: { phone: true },
    });
    if (active?.phone) return active.phone;
  } catch {
    /* fall through to constant */
  }
  return FALLBACK_PHONE;
}

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

/** Mask a long id, keeping only a short tail for correlation (no PII). */
function maskTail(id: string): string {
  if (!id || id.length <= 6) return "***";
  return `***${id.slice(-6)}`;
}

export async function runBuildOsDiagnostics(opts?: {
  phone?: string;
  message?: string;
}): Promise<Record<string, unknown>> {
  const inputPhone = opts?.phone?.trim() || (await resolveDefaultDiagnosticPhone());
  const testMessage = opts?.message?.trim() || DEFAULT_MESSAGE;
  const normalizedPhone = normalizeSenderPhone(inputPhone);
  const variants = Array.from(phoneVariants(normalizedPhone));
  // Single reference clock for all freshness/age computations in this report.
  const generatedAt = new Date();

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
    webhookRoute: "POST /api/webhooks/meta/whatsapp",
    handlerEntry: "InboundAgentDispatch.interceptBuildOsCommand",
    buildOsBranchBeforeCustomerFlow: true, // roda antes de criar Customer/Conversation/Message
    shortCircuitsOnHandled: true,          // devolve { intercepted: true } e o webhook segue para a próxima mensagem
    outboundSendService: "BuildNotifier.sendBuildConfirmation → BuildOsMetaChannel (número Master) ou WhatsAppMessagingService",
    note: "Somente TEXTO. O canal Master é o phone_number_id em BUILDOS_META_PHONE_NUMBER_ID.",
  };

  // ── channelCheck: o canal Master do Build OS está pronto para receber comando?
  //
  // ⚠️ MUDOU EM 04/08/2026. Antes daqui saía `evolutionInstanceCheck`, que lia o
  // log bruto de eventos do webhook da Evolution (`EvolutionWebhookEventLog`) e
  // respondia "chegou ALGUM evento?". A Evolution foi eliminada e a Meta **não
  // grava log bruto de evento** — não existe tabela equivalente.
  //
  // Guardrail 1 aplicado aqui: a ausência dessa fonte NÃO vira "nada chegou".
  // O campo diz explicitamente que a evidência de tráfego bruto não existe mais,
  // e aponta para a que existe (`recentWebhookTraces`, escrita pelo próprio
  // caminho do Build OS). Quem ler isso não pode concluir uma negação do silêncio.
  const channelCheck: Record<string, unknown> = {
    available: isBuildOsMetaChannelEnabled(),
    ...describeBuildOsMetaChannel(),
    rawEventLogAvailable: false,
    rawEventLogNote:
      "A Meta não grava log bruto de evento; a evidência de chegada é o rastro do Build OS " +
      "(recentWebhookTraces). Rastro vazio significa 'nenhum comando chegou ao handler' — " +
      "NÃO prova que a Meta parou de entregar mensagens.",
  };

  // ── recentMessages: os últimos comandos que CHEGARAM ao handler do Build OS.
  //
  // ⚠️ Antes isto correlacionava o log bruto de eventos da Evolution com o rastro
  // do Build OS por proximidade de horário. O log bruto não existe mais (ver
  // `channelCheck`), então a fonte passa a ser SÓ o rastro — que é escrito pelo
  // próprio caminho e continua mascarado: sem telefone completo, sem texto da
  // mensagem, sem token.
  let recentMessages: Array<Record<string, unknown>> = [];
  try {
    const traces = await prisma.buildWebhookTrace.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
      select: {
        maskedPhone: true, prefixDetected: true, authorized: true, fromMe: true,
        commandCreated: true, shortCircuited: true, failureReason: true,
        instanceName: true, createdAt: true,
      },
    });
    recentMessages = traces.map((t) => ({
      createdAt: t.createdAt.toISOString(),
      // Coluna com nome legado: hoje guarda o phone_number_id da Meta.
      channelId: t.instanceName,
      fromMe: t.fromMe,
      // Quando o comando sai do próprio número conectado, o telefone do rastro é o
      // OPERADOR — nunca o destinatário. Explicitado para ninguém ler ao contrário.
      fromMeNote: t.fromMe
        ? "Enviada pelo próprio número do canal (fromMe=true) — o telefone abaixo é o operador."
        : null,
      senderMasked: t.maskedPhone,
      prefixDetected: t.prefixDetected,          // "/build" | "/cmd" | "/prompt" | null
      buildCommandCandidate: !!t.prefixDetected,
      authorized: t.authorized,
      commandCreated: t.commandCreated,
      shortCircuited: t.shortCircuited,
      failureReason: t.failureReason,
      hasBuildTrace: true,
    }));
  } catch {
    recentMessages = [];
  }

  // ── buildTextSearch: "Busca por /build nos eventos e mensagens".
  //    The webhook EVENT LOG does not store text, so the literal "/build" string,
  //    if it reached the normal customer flow, lives in Message.content. We search
  //    there (any prefix) + the Build OS traces, to prove WHERE the command landed.
  //    Everything masked: phone partial, message text shown only as the detected
  //    prefix + a short masked snippet (no full body, no PII beyond a masked tail).
  const BUILD_PREFIXES = ["/build", "/cmd", "/prompt"];
  let buildTextSearch: Record<string, unknown> = { searched: false };
  try {
    const messages = await prisma.message.findMany({
      where: {
        OR: BUILD_PREFIXES.map((p) => ({ content: { startsWith: p, mode: "insensitive" as const } })),
      },
      orderBy: { sentAt: "desc" },
      take: 10,
      select: {
        content: true, direction: true, senderType: true, externalStatus: true,
        sentAt: true,
        conversation: {
          select: {
            channel: true, restaurantId: true, customerPhone: true,
            customer: { select: { phone: true, name: true } },
          },
        },
      },
    });

    const tracesWithPrefix = await prisma.buildWebhookTrace.findMany({
      where: { prefixDetected: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { maskedPhone: true, prefixDetected: true, authorized: true, fromMe: true, failureReason: true, createdAt: true },
    });

    buildTextSearch = {
      searched: true,
      // /build literally found in normal customer Conversation/Message records:
      foundInMessages: messages.length > 0,
      messages: messages.map((m) => {
        const phone = m.conversation?.customer?.phone ?? m.conversation?.customerPhone ?? null;
        const prefix = BUILD_PREFIXES.find((p) => m.content.toLowerCase().startsWith(p)) ?? null;
        return {
          createdAt: m.sentAt.toISOString(),
          prefixDetected: prefix,
          direction: m.direction,               // INBOUND | OUTBOUND
          senderType: m.senderType,             // CUSTOMER | AI | HUMAN | SYSTEM
          channel: m.conversation?.channel ?? null,
          restaurantId: m.conversation?.restaurantId ? maskTail(m.conversation.restaurantId) : null,
          phoneMasked: phone ? maskPhone(phone) : null,
          // masked snippet: prefix + length only, never the full text
          snippet: `${prefix ?? "?"} … (${m.content.length} chars)`,
        };
      }),
      // /build found in Build OS traces:
      foundInTraces: tracesWithPrefix.length > 0,
      traces: tracesWithPrefix.map((t) => ({
        createdAt: t.createdAt.toISOString(),
        prefixDetected: t.prefixDetected,
        phoneMasked: t.maskedPhone,
        authorized: t.authorized,
        fromMe: t.fromMe,
        failureReason: t.failureReason,
      })),
      authorizedOperatorMasked: maskPhone(normalizedPhone),
      authorizedVariantsMasked: variants.map(maskPhone),
      verdict: messages.length === 0 && tracesWithPrefix.length === 0
        ? "O texto /build NÃO foi encontrado em nenhuma mensagem nem trace — provavelmente não chegou como INBOUND a este app/instância (verifique número/instância conectada)."
        : messages.length > 0 && tracesWithPrefix.length === 0
        ? "O /build CHEGOU e foi salvo como mensagem normal, mas NÃO gerou trace Build OS — compare o telefone associado (phoneMasked) com o operador autorizado; provável divergência de número/instância."
        : "Há trace Build OS para /build — veja failureReason para o motivo de não virar comando.",
    };
  } catch {
    buildTextSearch = { searched: false };
  }

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

  // ── eventFreshness + buildArrivalCheck ──────────────────────────────────────
  //  Responde ao caso "reenviei /build e não aparece nada" SEM mandar reenviar de
  //  novo.
  //
  //  ⚠️ MUDOU EM 04/08/2026. Antes a resposta vinha do log bruto de eventos da
  //  Evolution ("chegou ALGUM evento depois da hora X?"). Esse log não existe mais:
  //  a Meta não grava evento bruto. O que sobrou é o rastro do próprio Build OS.
  //
  //  Guardrail 1, e este é o ponto que mais engana: rastro vazio prova que
  //  **nenhum comando chegou ao handler**, e NÃO prova que a Meta parou de
  //  entregar. As duas causas ficam listadas, sem escolher uma pelo silêncio.
  const STALE_MINUTES = 5;
  const nowMs = generatedAt.getTime();
  const ageMin = (d: Date | null | undefined) =>
    d ? Math.max(0, Math.round((nowMs - d.getTime()) / 60000)) : null;

  const masterChannel = await getBuildOsChannel();

  let eventFreshness: Record<string, unknown> = { available: false };
  let buildArrivalCheck: Record<string, unknown> = { available: false };
  try {
    const [lastAnyTrace, lastBuildTrace, lastBuildMessage] = await Promise.all([
      prisma.buildWebhookTrace.findFirst({
        orderBy: { createdAt: "desc" },
        select: { createdAt: true, instanceName: true, prefixDetected: true },
      }),
      prisma.buildWebhookTrace.findFirst({
        where: { prefixDetected: { in: BUILD_PREFIXES } },
        orderBy: { createdAt: "desc" },
        select: {
          createdAt: true, prefixDetected: true, maskedPhone: true, instanceName: true,
          authorized: true, failureReason: true, rawPhone: true, fromMe: true,
        },
      }),
      prisma.message.findFirst({
        where: { OR: BUILD_PREFIXES.map((p) => ({ content: { startsWith: p } })) },
        orderBy: { sentAt: "desc" },
        select: { sentAt: true },
      }),
    ]);

    const lastTraceAt = lastAnyTrace?.createdAt ?? null;
    const lastTraceAgeMinutes = ageMin(lastTraceAt);
    const stale = lastTraceAgeMinutes === null || lastTraceAgeMinutes > STALE_MINUTES;
    const expectedChannelId = masterChannel.channelId;

    eventFreshness = {
      available: true,
      generatedAt: generatedAt.toISOString(),
      // Fonte declarada — para ninguém achar que ainda existe log bruto de evento.
      source: "BuildWebhookTrace (a Meta não grava log bruto de evento)",
      rawEventLogAvailable: false,
      lastTraceAt: lastTraceAt?.toISOString() ?? null,
      lastTraceAgeMinutes: lastTraceAgeMinutes,
      lastTraceChannelId: lastAnyTrace?.instanceName ?? null,
      staleThresholdMinutes: STALE_MINUTES,
      stale,
      expectedChannelId,                       // phone_number_id do Master (ou null)
      masterChannelConfigured: masterChannel.configured,
      orientation: !masterChannel.configured
        ? "Canal Master do Build OS não configurado. Defina BUILDOS_META_PHONE_NUMBER_ID e BUILDOS_META_ACCESS_TOKEN (número dedicado da Meta). Número de restaurante NÃO deve ser usado como canal interno."
        : stale
          ? `Nenhum comando chegou ao handler nos últimos ${lastTraceAgeMinutes ?? "?"} min (último: ${lastTraceAt?.toISOString() ?? "nunca"}). Duas causas possíveis, e este diagnóstico NÃO distingue entre elas: (1) a mensagem não foi entregue ao app — confira a inscrição do webhook na Meta e se você mandou para o número Master (${expectedChannelId}); (2) a mensagem chegou mas não tinha prefixo de comando. Nenhuma das duas se conclui do silêncio da outra.`
          : "Comandos estão chegando ao handler normalmente.",
    };

    const lastBuildTraceAt = lastBuildTrace?.createdAt ?? null;
    const lastBuildMessageAt = lastBuildMessage?.sentAt ?? null;
    const buildDates = [lastBuildTraceAt, lastBuildMessageAt].filter(Boolean) as Date[];
    const lastBuildAnyAt = buildDates.length ? new Date(Math.max(...buildDates.map((d) => d.getTime()))) : null;
    const lastBuildAgeMinutes = ageMin(lastBuildAnyAt);

    buildArrivalCheck = {
      available: true,
      lastBuildTraceAt: lastBuildTraceAt?.toISOString() ?? null,
      lastBuildTracePrefix: lastBuildTrace?.prefixDetected ?? null,
      lastBuildTraceMaskedPhone: lastBuildTrace?.maskedPhone ?? null,
      lastBuildTraceAuthorized: lastBuildTrace?.authorized ?? null,
      lastBuildTraceFailureReason: lastBuildTrace?.failureReason ?? null,
      lastBuildTraceFromMe: lastBuildTrace?.fromMe ?? null,
      lastBuildTraceChannelId: lastBuildTrace?.instanceName ?? null,
      lastBuildTraceFromMasterChannel:
        !!lastBuildTrace?.instanceName && !!masterChannel.channelId && lastBuildTrace.instanceName === masterChannel.channelId,
      lastBuildTraceCanAuthorize: !!lastBuildTrace?.rawPhone,
      lastBuildMessageAt: lastBuildMessageAt?.toISOString() ?? null,
      lastBuildAnyAt: lastBuildAnyAt?.toISOString() ?? null,
      lastBuildAgeMinutes,
      newBuildSinceLastTrace:
        !!lastTraceAt && !!lastBuildAnyAt && lastBuildAnyAt.getTime() >= lastTraceAt.getTime() - 1000,
      note: !lastBuildAnyAt
        ? "Nenhum /build encontrado (nem rastro, nem mensagem). Este app nunca registrou um /build."
        : lastBuildAgeMinutes !== null && lastBuildAgeMinutes > STALE_MINUTES
          ? `O /build mais recente registrado foi há ${lastBuildAgeMinutes} min. Um /build enviado depois disso não foi registrado por este app.`
          : "Há um /build recente registrado.",
    };
  } catch {
    eventFreshness = { available: false };
    buildArrivalCheck = { available: false };
  }

  // ── buildOsChannel: the dedicated Build OS WhatsApp Master/Admin channel status.
  //    Restaurant instances are NEVER the Build OS channel unless explicit legacy
  //    fallback is on. When not configured, the UI must say "não configurado".
  const buildOsChannel = {
    configured: masterChannel.configured,
    // `phone_number_id` da Meta. O nome `instanceName` (instância Evolution) morreu
    // com a Evolution; a tela lê `channelId`.
    channelId: masterChannel.channelId,
    enabled: masterChannel.enabled,
    legacyFallbackEnabled: masterChannel.legacyFallbackEnabled,
  };

  // ── deployInfo: lets the admin confirm production runs the trace-capable build.
  //    `buildMarker` is bumped whenever the Build OS webhook path changes, so an
  //    old deploy is obvious without reading commit SHAs.
  const deployInfo = {
    commitSha: process.env.RAILWAY_GIT_COMMIT_SHA ?? "unknown",
    branch: process.env.RAILWAY_GIT_BRANCH ?? "unknown",
    appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? "dev",
    nodeEnv: process.env.NODE_ENV ?? "unknown",
    // Bump this when the Build OS webhook trace/interception path changes.
    buildMarker: "buildos-meta-channel-v1",
    webhookRouteExpected: "POST /api/webhooks/meta/whatsapp",
    healthEndpoint: "/api/health",
  };

  return {
    generatedAt: generatedAt.toISOString(),
    deployInfo,
    buildOsChannel,
    eventFreshness,
    buildArrivalCheck,
    buildOsConfig,
    authorizedSenderCheck,
    projectCheck,
    detectorCheck,
    classificationCheck,
    promptDraftCheck,
    webhookIntegrationCheck,
    channelCheck,
    recentMessages,
    buildTextSearch,
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
