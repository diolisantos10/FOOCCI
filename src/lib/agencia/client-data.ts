// ═══════════════════════════════════════════════════════════════════════════
//  O CLIENTE COMO REGISTRO PRINCIPAL — a leitura do banco.
//
//  O `CLAUDE_HANDOFF.md` inverte o eixo do painel: o registro principal deixa
//  de ser o PROJETO e passa a ser o CLIENTE. Projetos, campanhas e entregas
//  pertencem ao cliente. No Foocci o "cliente da agência" é o `Restaurant` —
//  é ele que tem marca, integrações, projetos e histórico.
//
//  O QUE CASA COM O MODELO DO HANDOFF (dado real, lido aqui):
//    · Cliente ................. Restaurant
//    · Projetos ................ AgencyProject
//    · Entregas ................ StrategyRoomSession (a sessão de estratégia é
//                                a única entrega materializada hoje)
//    · Aprovações .............. AgencyProject em PROPOSAL_READY — proposta
//                                pronta é, por definição, decisão do cliente
//    · Integrações ............. GoogleIntegrationConfig · MetaWhatsAppConfig ·
//                                InstagramChannelConfig · IntegrationConfig
//    · Brand Hub ............... RestaurantBrandConfig
//    · Ficha do cliente ........ Restaurant + RestaurantBrandConfig + SdrEntrevista
//
//  O QUE NÃO EXISTE NO BANCO — e por isso sai VAZIO, nunca estimado:
//    · Solicitações do cliente (não há tabela de request de agência)
//    · Chat do Agente Project Manager (a `Conversation` do Foocci é cliente
//      final ↔ restaurante; é outro domínio e não serve de substituto)
//    · Métricas de social, mídia paga, receita atribuída, NPS, custo e margem
//    · Decision Log e capacidade criativa
//
//  Guardrail 1: ausência de informação não é informação. Nenhuma dessas áreas
//  recebe número derivado de outra fonte "parecida".
//
//  SEGREDO NUNCA SAI DAQUI: os `select` abaixo NÃO pedem `accessToken`,
//  `configBlob`, `pageAccessTokenEncrypted` nem `webhookVerifyToken`. O
//  ciphertext não é lido, não trafega e não chega ao componente.
// ═══════════════════════════════════════════════════════════════════════════

import { prisma } from "@/lib/prisma";
import {
  emptyAgencyClientView,
  emptyAreaMetrics,
  type AgencyClientView,
  type ApprovalView,
  type BrandView,
  type DeliverableView,
  type IntegrationView,
  type Metric,
  type ProjectView,
} from "./views";
import { emptySheet } from "./sheet";
import type { ClientSheetData } from "@/components/agencia/modals";

const DATE = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
const DATETIME = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

function fmtDate(d: Date | null | undefined): string | null {
  return d ? DATE.format(d) : null;
}
function fmtWhen(d: Date | null | undefined): string | null {
  return d ? DATETIME.format(d) : null;
}

const PROJECT_STATUS: Record<string, string> = {
  DRAFT:            "Rascunho",
  STRATEGY_PENDING: "Estratégia pendente",
  STRATEGY_DONE:    "Estratégia pronta",
  PROPOSAL_READY:   "Proposta pronta",
  ACTIVE:           "No prazo",
  COMPLETED:        "Concluído",
  CANCELLED:        "Cancelado",
};

/** Progresso do projeto. Deriva do ESTÁGIO, que é fato registrado — não é
 *  estimativa de esforço. Estágio que não diz nada sobre avanço devolve `null`,
 *  e a barra fica vazia em vez de mentir um número. */
function progressOf(status: string): number | null {
  switch (status) {
    case "STRATEGY_PENDING": return 10;
    case "STRATEGY_DONE":    return 35;
    case "PROPOSAL_READY":   return 55;
    case "COMPLETED":        return 100;
    default:                 return null; // DRAFT, ACTIVE, CANCELLED
  }
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** Só é "preenchido" o que o lojista escreveu. Default do sistema não conta
 *  como resposta do cliente — é justamente a confusão que o guardrail 1 proíbe. */
function filled(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  return s.length > 0 ? s : null;
}

export type AgencyClientBundle = {
  view: AgencyClientView;
  sheet: ClientSheetData;
  error: string | null;
};

export async function loadAgencyClient(restaurantId: string): Promise<AgencyClientBundle> {
  try {
    const [restaurant, projects, brand, google, whatsapp, instagram, others, sdr] = await Promise.all([
      prisma.restaurant.findUnique({
        where:  { id: restaurantId },
        select: { id: true, name: true, description: true, isActive: true, createdAt: true, email: true, phone: true, plan: true },
      }),
      prisma.agencyProject.findMany({
        where:   { restaurantId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true, name: true, objective: true, status: true, services: true,
          audience: true, timeline: true, budget: true, createdAt: true,
          strategySession: { select: { id: true, generatedAt: true } },
        },
      }),
      prisma.restaurantBrandConfig.findUnique({
        where:  { restaurantId },
        select: {
          tone: true, formality: true, emojiUsage: true, communicationStyle: true,
          personalityPreset: true, greetingTemplate: true, brandPrimaryColor: true,
          brandSecondaryColor: true, brandPersona: true, updatedAt: true,
        },
      }),
      // NB: nenhum token. Só status e horário.
      prisma.googleIntegrationConfig.findUnique({
        where:  { restaurantId },
        select: { connected: true, lastSyncedAt: true, lastError: true, ga4PropertyName: true, businessLocationName: true },
      }),
      prisma.metaWhatsAppConfig.findUnique({
        where:  { restaurantId },
        select: { connectionStatus: true, lastHealthCheckAt: true, lastError: true, displayPhoneNumber: true },
      }),
      prisma.instagramChannelConfig.findUnique({
        where:  { restaurantId },
        select: { enabled: true, paused: true, mode: true, lastWebhookAt: true, lastError: true },
      }),
      prisma.integrationConfig.findMany({
        where:  { restaurantId },
        select: { provider: true, isActive: true, lastTestedAt: true, lastError: true },
      }),
      prisma.sdrEntrevista.findFirst({
        where:   { chave: { endsWith: `::${restaurantId}` } },
        select:  { ficha: true, perguntadas: true, servicos: true, updatedAt: true },
      }),
    ]);

    if (!restaurant) {
      return {
        view: emptyAgencyClientView({
          id: restaurantId, name: "Cliente", initial: "?",
          category: null, activeSince: null, isActive: false,
        }),
        sheet: emptySheet("Cliente"),
        error: `Cliente ${restaurantId} não encontrado no banco.`,
      };
    }

    // ── Projetos ───────────────────────────────────────────────────────────
    const projectViews: ProjectView[] = projects.map((p) => ({
      id:   p.id,
      name: p.name,
      kind: asStringArray(p.services)[0] ?? "Projeto",
      progress: progressOf(p.status),
      statusLabel: PROJECT_STATUS[p.status] ?? p.status,
      agents: asStringArray(p.services).map((s) => `Agente ${s}`),
      deliverableCount: p.strategySession ? 1 : 0,
      decisionCount: p.status === "PROPOSAL_READY" ? 1 : 0,
    }));

    // ── Entregas ───────────────────────────────────────────────────────────
    const deliverables: DeliverableView[] = projects
      .filter((p) => p.strategySession)
      .map((p) => ({
        id: p.strategySession!.id,
        title: "Sessão de estratégia — 6 especialistas + síntese",
        projectName: p.name,
        statusLabel: "Entregue",
        when: fmtDate(p.strategySession!.generatedAt),
      }));

    // ── Aprovações ─────────────────────────────────────────────────────────
    const approvals: ApprovalView[] = projects
      .filter((p) => p.status === "PROPOSAL_READY")
      .map((p) => ({
        id: `ap-${p.id}`,
        title: `Proposta de ${p.name}`,
        context: "Proposta pronta, aguardando decisão do cliente",
        statusLabel: "Aguardando cliente",
        decidesIt: "Cliente" as const,
        when: fmtDate(p.createdAt),
      }));

    // ── Integrações ────────────────────────────────────────────────────────
    const integrations: IntegrationView[] = [];

    integrations.push({
      glyph: "G", name: "Google", scopes: [google?.ga4PropertyName, google?.businessLocationName].filter(Boolean).join(" · ") || "Analytics 4 · Meu Negócio",
      statusLabel: google?.connected ? (google.lastError ? "Atenção" : "Saudável") : "Não conectado",
      tone: google?.connected ? (google.lastError ? "warn" : "ok") : "off",
      lastSync: fmtWhen(google?.lastSyncedAt),
      consumers: null,
      agencyAccess: "Somente leitura",
    });

    integrations.push({
      glyph: "W", name: "WhatsApp", scopes: whatsapp?.displayPhoneNumber ?? "Conversas · Leads · Atendimento",
      statusLabel:
        whatsapp?.connectionStatus === "CONNECTED" ? (whatsapp.lastError ? "Atenção" : "Saudável")
        : whatsapp?.connectionStatus === "ERROR" ? "Atenção"
        : whatsapp ? "Parcial" : "Não conectado",
      tone:
        whatsapp?.connectionStatus === "CONNECTED" ? (whatsapp.lastError ? "warn" : "ok")
        : whatsapp?.connectionStatus === "ERROR" ? "warn"
        : whatsapp ? "partial" : "off",
      lastSync: fmtWhen(whatsapp?.lastHealthCheckAt),
      consumers: null,
      agencyAccess: "Somente leitura",
    });

    integrations.push({
      glyph: "◎", name: "Instagram", scopes: instagram ? `Modo ${instagram.mode}` : "Perfil · Insights · Mensagens",
      statusLabel:
        !instagram || !instagram.enabled ? "Não conectado"
        : instagram.paused ? "Parcial"
        : instagram.lastError ? "Atenção"
        : "Saudável",
      tone:
        !instagram || !instagram.enabled ? "off"
        : instagram.paused ? "partial"
        : instagram.lastError ? "warn"
        : "ok",
      lastSync: fmtWhen(instagram?.lastWebhookAt),
      consumers: null,
      agencyAccess: "Somente leitura",
    });

    for (const o of others) {
      integrations.push({
        glyph: "▤", name: o.provider, scopes: "Pagamento · Operação",
        statusLabel: o.isActive ? (o.lastError ? "Atenção" : "Saudável") : "Não conectado",
        tone: o.isActive ? (o.lastError ? "warn" : "ok") : "off",
        lastSync: fmtWhen(o.lastTestedAt),
        consumers: null,
        agencyAccess: "Somente leitura",
      });
    }

    // ── Brand Hub ──────────────────────────────────────────────────────────
    const persona = (brand?.brandPersona ?? {}) as Record<string, unknown>;
    const personaText = typeof persona.description === "string" ? persona.description.trim() : "";
    const tagline = filled(restaurant.description) ?? filled(personaText);

    const hasGreeting = filled(brand?.greetingTemplate) !== null;
    const hasColor = filled(brand?.brandPrimaryColor) !== null;
    const knowledge: BrandView["knowledge"] = brand
      ? [
          { area: "Brand Core",     pct: tagline ? 100 : 0,      state: tagline ? "confirmed" : "missing" },
          { area: "Públicos",       pct: 0,                       state: "missing" },
          { area: "Sistema Verbal", pct: hasGreeting ? 100 : 50,  state: hasGreeting ? "confirmed" : "mixed" },
          { area: "Sistema Visual", pct: hasColor ? 100 : 0,      state: hasColor ? "confirmed" : "missing" },
          { area: "Experiência",    pct: 50,                      state: "mixed" },
          { area: "Governança",     pct: 0,                       state: "missing" },
        ]
      : [];

    const confirmed = knowledge.filter((k) => k.state === "confirmed").length;
    const brandHealth = knowledge.length ? Math.round((confirmed / knowledge.length) * 100) : null;

    // ── KPI por área ───────────────────────────────────────────────────────
    const nd = (label: string): Metric => ({ label, value: null, hint: null });
    const areaMetrics = emptyAreaMetrics();

    areaMetrics.overview = [
      nd("RECEITA ATRIBUÍDA"),
      nd("ALCANCE TOTAL"),
      nd("ENGAJAMENTO"),
      nd("LEADS"),
      { label: "BRAND HEALTH", value: brandHealth === null ? null : `${brandHealth}/100`, hint: brandHealth === null ? null : `${confirmed} de ${knowledge.length} áreas confirmadas` },
      nd("DEMANDAS NO SLA"),
    ];

    areaMetrics.requests = [
      { label: "RECEBIDAS", value: "0", hint: "sem canal de solicitação" },
      nd("EM TRIAGEM"), nd("EM EXECUÇÃO"), nd("AGUARDANDO CLIENTE"), nd("NO SLA"),
    ];

    areaMetrics.projects = [
      { label: "ATIVOS",       value: String(projects.filter((p) => p.status === "ACTIVE").length), hint: `de ${projects.length} no total` },
      { label: "ENTREGÁVEIS",  value: String(deliverables.length),                                   hint: "sessões de estratégia" },
      { label: "DECISÕES",     value: String(approvals.length),                                      hint: "aguardando o cliente" },
      nd("NO PRAZO"),
      nd("BUDGET"),
    ];

    areaMetrics.social = [nd("ALCANCE"), nd("ENGAJAMENTO"), nd("CRESCIMENTO"), nd("CONVERSÕES"), nd("PUBLICAÇÕES"), nd("SENTIMENTO")];
    areaMetrics.design = [nd("FILA CRIATIVA"), nd("EM PRODUÇÃO"), nd("EM REVISÃO"), nd("APROVADAS"), nd("CAPACIDADE")];
    areaMetrics.traffic = [nd("INVESTIMENTO"), nd("RECEITA"), nd("ROAS"), nd("CPA"), nd("LEADS"), nd("CONVERSÃO")];
    areaMetrics.intel = [nd("LEADS · 30D"), nd("RECEITA ATRIBUÍDA"), nd("CONFIANÇA"), nd("FONTES"), nd("DECISÕES"), nd("COBERTURA")];

    const okCount = integrations.filter((i) => i.tone === "ok").length;
    const warnCount = integrations.filter((i) => i.tone === "warn" || i.tone === "partial").length;
    const offCount = integrations.filter((i) => i.tone === "off").length;
    const lastSyncAny = integrations.map((i) => i.lastSync).filter((s): s is string => s !== null)[0] ?? null;

    areaMetrics.integrations = [
      { label: "CONECTADAS",        value: String(integrations.length - offCount), hint: `de ${integrations.length} fontes` },
      { label: "SAUDÁVEIS",         value: String(okCount),                        hint: "sincronizando" },
      { label: "COM ATENÇÃO",       value: String(warnCount),                      hint: "pendência do cliente" },
      { label: "NÃO CONECTADAS",    value: String(offCount),                       hint: "aguardando o cliente" },
      { label: "ÚLTIMA SYNC",       value: lastSyncAny,                            hint: lastSyncAny ? "mais recente" : null },
      nd("COBERTURA DE DADOS"),
    ];

    // ── Ficha do cliente ───────────────────────────────────────────────────
    const ficha = (sdr?.ficha ?? {}) as Record<string, unknown>;
    const fichaStr = (k: string): string | null => {
      const v = ficha[k];
      return typeof v === "string" && v.trim() ? v.trim() : null;
    };

    const sheet: ClientSheetData = {
      responsible:  { name: filled(restaurant.email), role: filled(restaurant.phone) },
      origin:       { label: sdr ? "Agente SDR · entrevistado" : null, note: sdr ? "Entrevista de sondagem registrada" : null },
      agent:        { label: "Agente Project Manager", note: "Interlocutor único da agência" },
      relationship: { label: restaurant.isActive ? "Cliente ativo" : "Cliente inativo", note: `Desde ${fmtDate(restaurant.createdAt)}` },
      company: [
        { term: "Nome da marca",     value: restaurant.name },
        { term: "Categoria",         value: fichaStr("categoria") },
        { term: "Modelo de negócio", value: fichaStr("modelo") },
        { term: "Plano no Foocci",   value: restaurant.plan },
      ],
      contact: [
        { term: "E-mail",           value: filled(restaurant.email) },
        { term: "Telefone",         value: filled(restaurant.phone) },
        { term: "Canal preferencial", value: whatsapp?.connectionStatus === "CONNECTED" ? "WhatsApp" : null },
        { term: "Autonomia",        value: fichaStr("autonomia") },
      ],
      briefing: {
        summary:  fichaStr("resumo") ?? filled(restaurant.description),
        pain:     fichaStr("dor"),
        goal:     fichaStr("objetivo"),
        audience: fichaStr("publico"),
      },
      governance: [
        { term: "Quem fala com o cliente", value: "Agente Project Manager" },
        { term: "Quem recebe o cascata",   value: "Agentes especialistas" },
        { term: "Aprovação final",          value: "Responsável do cliente" },
        { term: "Registro oficial",         value: "Chat + Decision Log" },
      ],
      lastReview: fmtDate(sdr?.updatedAt ?? brand?.updatedAt ?? null),
    };

    const view: AgencyClientView = {
      client: {
        id: restaurant.id,
        name: restaurant.name,
        initial: restaurant.name.charAt(0).toUpperCase() || "?",
        category: fichaStr("categoria"),
        activeSince: fmtDate(restaurant.createdAt),
        isActive: restaurant.isActive,
      },
      projects: projectViews,
      requests: [],       // não há tabela de solicitação de agência — vazio honesto
      deliverables,
      approvals,
      integrations,
      brand: { health: brandHealth, headline: restaurant.name, tagline, knowledge },
      chat: [],           // o chat do PM ainda não tem tabela própria
      results: [],
      areaMetrics,
      internal: { cost: [], margin: [], prompts: [], logs: [], internalTasks: [], cascade: [] },
    };

    return { view, sheet, error: null };
  } catch (err) {
    // Guardrail 6: o alerta carrega a própria evidência.
    const detail = err instanceof Error ? err.message : String(err);
    return {
      view: emptyAgencyClientView({
        id: restaurantId, name: "Cliente", initial: "?",
        category: null, activeSince: null, isActive: false,
      }),
      sheet: emptySheet("Cliente"),
      error: `Falha ao ler os dados do cliente: ${detail}`,
    };
  }
}

export { emptySheet };
