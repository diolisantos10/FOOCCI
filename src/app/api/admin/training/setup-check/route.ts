/**
 * GET /api/admin/training/setup-check
 *
 * Returns a checklist of the training automation setup status:
 * - CRON_SECRET env var configured (present/absent, never revealed)
 * - OPENAI_KEY configured
 * - Database connectivity
 * - Training config: continuousEnabled, autoEvaluate, autoPropose
 * - Proposal queue health
 * - Each cron endpoint URL for one-click copy
 *
 * POST /api/admin/training/setup-check — test a specific cron endpoint
 * Body: { endpoint: "small-batch" | "nightly" | "mine" }
 * Calls the cron endpoint with the CRON_SECRET and returns the result.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

const CRON_BASE = "/api/cron/agent-training";

const CRON_ENDPOINTS = {
  "small-batch": `${CRON_BASE}/run-small-batch`,
  nightly:       `${CRON_BASE}/run-nightly`,
  mine:          `${CRON_BASE}/mine-real-conversations`,
} as const;

type CronKey = keyof typeof CRON_ENDPOINTS;

export async function GET(req: NextRequest) {
  if (!checkAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cronSecret     = !!process.env.CRON_SECRET;
  const openaiKey      = !!process.env.OPENAI_API_KEY;

  // DB check — lightweight ping
  let dbOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch { /* db unreachable */ }

  // Training config
  const config = await prisma.agentTrainingConfig.findUnique({
    where:  { agentType: "WHATSAPP_ORDERING" },
    select: {
      enableContinuousTraining: true,
      autoDiagnoseOnFailure:    true,
      autoCreateProposals:      true,
      autoApplyProduction:      true,
      nightlyBatchEnabled:      true,
      smallBatchEveryHours:     true,
      useRealConversationMining: true,
    },
  });

  // Proposal queue
  const pendingProposals = await prisma.agentImprovementProposal.count({
    where: { status: "PENDING_APPROVAL" },
  });

  // Recent run health
  const lastRun = await prisma.agentTrainingRun.findFirst({
    where:   { status: "COMPLETED" },
    orderBy: { completedAt: "desc" },
    select:  { completedAt: true, score: true },
  });

  const items = [
    {
      key:         "cron_secret",
      label:       "CRON_SECRET configurado",
      status:      cronSecret ? "ok" : "error",
      detail:      cronSecret
        ? "Variável de ambiente presente"
        : "CRON_SECRET não definido — cron externo não conseguirá autenticar",
      fix:         cronSecret ? null : "Adicione CRON_SECRET nas variáveis de ambiente do Railway/servidor",
    },
    {
      key:         "openai_key",
      label:       "OpenAI API Key configurada",
      status:      openaiKey ? "ok" : "error",
      detail:      openaiKey
        ? "Chave presente"
        : "OPENAI_API_KEY não definida — avaliação e propostas não funcionarão",
      fix:         openaiKey ? null : "Adicione OPENAI_API_KEY nas variáveis de ambiente",
    },
    {
      key:         "database",
      label:       "Banco de dados conectado",
      status:      dbOk ? "ok" : "error",
      detail:      dbOk ? "Conexão ok" : "Banco de dados inacessível",
      fix:         dbOk ? null : "Verifique DATABASE_URL nas variáveis de ambiente",
    },
    {
      key:         "continuous_training",
      label:       "Treinamento contínuo ativado",
      status:      config?.enableContinuousTraining ? "ok" : "warn",
      detail:      config?.enableContinuousTraining
        ? "Treinamento contínuo ativo"
        : "Desativado — cron vai rodar mas pular o batch",
      fix:         config?.enableContinuousTraining
        ? null
        : "Ative em Configurações → Treinamento contínuo ativo",
    },
    {
      key:         "auto_diagnose",
      label:       "Diagnóstico automático de WARN/FAIL",
      status:      config?.autoDiagnoseOnFailure ? "ok" : "warn",
      detail:      config?.autoDiagnoseOnFailure
        ? "GPT-4o avalia WARN/FAIL automaticamente"
        : "Diagnóstico manual necessário para cada falha",
      fix:         config?.autoDiagnoseOnFailure
        ? null
        : "Ative em Configurações → Gerar diagnóstico automático para WARN/FAIL",
    },
    {
      key:         "auto_propose",
      label:       "Propostas automáticas para falhas",
      status:      config?.autoCreateProposals ? "ok" : "warn",
      detail:      config?.autoCreateProposals
        ? "Propostas geradas e enviadas para Melhorias para Aprovar"
        : "Criação de propostas manual",
      fix:         config?.autoCreateProposals
        ? null
        : "Ative em Configurações → Criar proposta automática para falhas recorrentes",
    },
    {
      key:         "safety_production_lock",
      label:       "Produção bloqueada (sem auto-apply)",
      status:      !config?.autoApplyProduction ? "ok" : "error",
      detail:      !config?.autoApplyProduction
        ? "autoApplyProduction=false — nenhuma mudança automática em produção"
        : "ATENÇÃO: autoApplyProduction está ligado!",
      fix:         null,
    },
    {
      key:         "proposal_queue",
      label:       `Fila de melhorias (${pendingProposals} pendentes)`,
      status:      pendingProposals === 0 ? "ok" : pendingProposals < 5 ? "warn" : "warn",
      detail:      pendingProposals === 0
        ? "Nenhuma melhoria aguardando aprovação"
        : `${pendingProposals} melhoria(s) aguardando revisão em Melhorias para Aprovar`,
      fix:         pendingProposals > 0
        ? "Revise e aprove ou rejeite as melhorias pendentes"
        : null,
    },
  ];

  const hasError = items.some((i) => i.status === "error");
  const hasWarn  = items.some((i) => i.status === "warn");
  const overallStatus = hasError ? "error" : hasWarn ? "warn" : "ok";

  return NextResponse.json({
    overallStatus,
    items,
    cronEndpoints:    CRON_ENDPOINTS,
    lastRun:          lastRun
      ? { completedAt: lastRun.completedAt?.toISOString() ?? null, score: lastRun.score }
      : null,
    pendingProposals,
  });
}

export async function POST(req: NextRequest) {
  if (!checkAdminRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const endpoint = (body.endpoint ?? "") as CronKey;

  if (!CRON_ENDPOINTS[endpoint]) {
    return NextResponse.json(
      { error: `Endpoint inválido. Use: ${Object.keys(CRON_ENDPOINTS).join(", ")}` },
      { status: 400 },
    );
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, reachable: false, error: "CRON_SECRET não configurado" },
      { status: 200 },
    );
  }

  // Build full URL from request host
  const { origin } = new URL(req.url);
  const url = `${origin}${CRON_ENDPOINTS[endpoint]}`;

  try {
    const result = await fetch(url, {
      method:  "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      signal:  AbortSignal.timeout(10_000),
    });
    const responseBody = await result.json().catch(() => ({}));
    return NextResponse.json({
      ok:         result.ok,
      reachable:  true,
      status:     result.status,
      response:   responseBody,
    });
  } catch (err) {
    return NextResponse.json({
      ok:        false,
      reachable: false,
      error:     err instanceof Error ? err.message : String(err),
    });
  }
}
