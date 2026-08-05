/**
 * GET  /api/onboarding/status  — compute pilot-readiness for the tenant restaurant
 * POST /api/onboarding/status  — mark final test as complete
 *
 * Tenant-scoped: owner/manager can access their own restaurant.
 * All step statuses are computed dynamically from existing data;
 * only finalTestCompletedAt is persisted.
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant";
import { ok, unauthorized, serverError } from "@/lib/api-response";

// ── Types ──────────────────────────────────────────────────────────────────────

export type StepStatus = "COMPLETE" | "PENDING" | "WARNING" | "BLOCKED";

export interface StepResult {
  status:  StepStatus;
  message: string;
}

export type OnboardingReadiness =
  | "NAO_INICIADO"
  | "EM_CONFIGURACAO"
  | "PRONTO_PARA_TESTE"
  | "PRONTO_PARA_PILOTO"
  | "BLOQUEADO";

export interface OnboardingStatusData {
  restaurantId:   string;
  restaurantName: string;
  slug:           string;
  readiness:      OnboardingReadiness;
  steps: {
    loja:          StepResult;
    funcionamento: StepResult;
    entrega:       StepResult;
    pagamentos:    StepResult;
    cardapio:      StepResult;
    canais:        StepResult;
    teste:         StepResult;
  };
  counts: {
    categories:           number;
    activeProducts:       number;
    totalProducts:        number;
    productsWithImage:    number;
  };
  links: {
    delivery: string;
    qr:       string;
  };
  payment: {
    acceptCash:        boolean;
    acceptPix:         boolean;
    acceptCard:        boolean;
    hasOnlineProvider: boolean;
  };
  whatsapp: {
    hasPhone:      boolean;
    /** WhatsApp oficial da Meta conectado (o único canal desde 04/08/2026). */
    hasWhatsApp:   boolean;
    agentMode:     string;
  };
  finalTestCompletedAt: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function stepComplete(message: string): StepResult { return { status: "COMPLETE", message }; }
function stepPending(message: string):  StepResult { return { status: "PENDING",  message }; }
function stepWarning(message: string):  StepResult { return { status: "WARNING",  message }; }
function stepBlocked(message: string):  StepResult { return { status: "BLOCKED",  message }; }

// ── Status computation ─────────────────────────────────────────────────────────

async function computeStatus(restaurantId: string): Promise<OnboardingStatusData> {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");

  const [
    restaurant,
    storeProfile,
    businessHours,
    deliveryConfig,
    paymentSettings,
    categoryCount,
    activeProductCount,
    totalProductCount,
    productsWithImageCount,
    metaConfig,
    agentConfig,
    onboardingStatus,
  ] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, name: true, slug: true, phone: true },
    }),
    prisma.storeProfile.findUnique({
      where: { restaurantId },
      select: { mainPhone: true, whatsappPhone: true, cep: true, street: true, city: true, state: true },
    }),
    prisma.businessHours.findMany({
      where: { restaurantId },
      select: { dayOfWeek: true, isOpen: true },
    }),
    prisma.deliveryConfig.findUnique({
      where: { restaurantId },
      select: { enabled: true, pickupEnabled: true },
    }),
    prisma.paymentSettings.findUnique({
      where: { restaurantId },
      select: { acceptCash: true, acceptPix: true, acceptCard: true, acceptLink: true },
    }),
    prisma.menuCategory.count({ where: { restaurantId, isActive: true } }),
    prisma.menuItem.count({ where: { category: { restaurantId }, isActive: true } }),
    prisma.menuItem.count({ where: { category: { restaurantId } } }),
    prisma.menuItem.count({ where: { category: { restaurantId }, isActive: true, imageUrl: { not: null } } }),
    prisma.metaWhatsAppConfig.findUnique({
      where: { restaurantId },
      select: { connectionStatus: true },
    }),
    prisma.whatsAppAgentConfig.findUnique({
      where: { restaurantId },
      select: { agentMode: true },
    }),
    prisma.restaurantOnboardingStatus.findUnique({
      where: { restaurantId },
      select: { finalTestCompletedAt: true },
    }),
  ]);

  if (!restaurant) throw new Error("Restaurant not found");

  // ── Step: Loja ───────────────────────────────────────────────────────────────
  const hasPhone   = !!(storeProfile?.mainPhone || storeProfile?.whatsappPhone || restaurant.phone);
  const hasAddress = !!(storeProfile?.cep && storeProfile?.street && storeProfile?.city);

  let lojaStep: StepResult;
  if (hasPhone && hasAddress) {
    lojaStep = stepComplete("Dados da loja configurados");
  } else if (!hasPhone && !hasAddress) {
    lojaStep = stepBlocked("Telefone e endereço não preenchidos");
  } else if (!hasAddress) {
    lojaStep = stepPending("Endereço incompleto — preencha CEP, rua e cidade");
  } else {
    lojaStep = stepPending("Telefone/WhatsApp principal não configurado");
  }

  // ── Step: Funcionamento ──────────────────────────────────────────────────────
  const openDays = businessHours.filter((h) => h.isOpen).length;
  const funcionamentoStep: StepResult = openDays > 0
    ? stepComplete(`${openDays} dia${openDays !== 1 ? "s" : ""} de funcionamento configurado${openDays !== 1 ? "s" : ""}`)
    : stepPending("Nenhum dia de funcionamento ativo — configure os horários");

  // ── Step: Entrega ────────────────────────────────────────────────────────────
  let entregaStep: StepResult;
  if (!deliveryConfig) {
    entregaStep = stepPending("Configurações de entrega não encontradas");
  } else if (deliveryConfig.enabled && deliveryConfig.pickupEnabled) {
    entregaStep = stepComplete("Delivery e retirada habilitados");
  } else if (deliveryConfig.enabled) {
    entregaStep = stepComplete("Delivery habilitado");
  } else if (deliveryConfig.pickupEnabled) {
    entregaStep = stepComplete("Retirada habilitada");
  } else {
    entregaStep = stepWarning("Delivery e retirada desabilitados — clientes não conseguirão fazer pedidos");
  }

  // ── Step: Pagamentos ─────────────────────────────────────────────────────────
  const hasOnlineProvider = !!(
    process.env.MERCADOPAGO_ACCESS_TOKEN ||
    (process.env.STONE_CLIENT_ID && process.env.STONE_CLIENT_SECRET)
  );

  let pagamentosStep: StepResult;
  if (!paymentSettings) {
    pagamentosStep = stepPending("Configurações de pagamento não encontradas");
  } else if (paymentSettings.acceptCash || paymentSettings.acceptPix || paymentSettings.acceptCard) {
    pagamentosStep = stepComplete(
      `Métodos aceitos: ${[
        paymentSettings.acceptCash && "Dinheiro",
        paymentSettings.acceptPix  && "Pix",
        paymentSettings.acceptCard && "Cartão",
      ].filter(Boolean).join(", ")}`
    );
  } else {
    pagamentosStep = stepWarning("Nenhum método de pagamento habilitado");
  }

  // ── Step: Cardápio ───────────────────────────────────────────────────────────
  let cardapioStep: StepResult;
  if (categoryCount === 0) {
    cardapioStep = stepBlocked("Nenhuma categoria ativa — adicione categorias e produtos ao cardápio");
  } else if (activeProductCount === 0) {
    cardapioStep = stepBlocked(`${categoryCount} categoria${categoryCount !== 1 ? "s" : ""} criada${categoryCount !== 1 ? "s" : ""}, mas nenhum produto ativo`);
  } else {
    cardapioStep = stepComplete(
      `${activeProductCount} produto${activeProductCount !== 1 ? "s" : ""} ativo${activeProductCount !== 1 ? "s" : ""} em ${categoryCount} categoria${categoryCount !== 1 ? "s" : ""}`
    );
  }

  // ── Step: Canais ─────────────────────────────────────────────────────────────
  // Só "CONNECTED" prova conexão. PENDING/ERROR/DISCONNECTED e ausência de linha
  // NÃO viram "configurado" — o lojista não pode ver ✓ num canal que não envia.
  const hasWhatsApp = metaConfig?.connectionStatus === "CONNECTED";
  const canaisStep: StepResult = hasWhatsApp
    ? stepComplete("Links públicos e WhatsApp configurados")
    : stepWarning("Links públicos OK — WhatsApp da Meta ainda não conectado");

  // ── Step: Teste final ────────────────────────────────────────────────────────
  const testeStep: StepResult = onboardingStatus?.finalTestCompletedAt
    ? stepComplete("Teste piloto marcado como concluído")
    : stepPending("Realize o teste manual e marque como concluído");

  // ── Readiness score ──────────────────────────────────────────────────────────
  const steps = { loja: lojaStep, funcionamento: funcionamentoStep, entrega: entregaStep, pagamentos: pagamentosStep, cardapio: cardapioStep, canais: canaisStep, teste: testeStep };
  const requiredSteps: StepResult[] = [lojaStep, funcionamentoStep, entregaStep, pagamentosStep, cardapioStep];

  let readiness: OnboardingReadiness;
  const hasBlocked  = requiredSteps.some((s) => s.status === "BLOCKED");
  const hasPending  = requiredSteps.some((s) => s.status === "PENDING" || s.status === "WARNING");
  const allReady    = !hasBlocked && !hasPending;
  const testDone    = testeStep.status === "COMPLETE";

  if (hasBlocked) {
    readiness = "BLOQUEADO";
  } else if (hasPending) {
    // Check if any step has been touched at all
    const anyProgress = openDays > 0 || hasPhone || hasAddress || activeProductCount > 0;
    readiness = anyProgress ? "EM_CONFIGURACAO" : "NAO_INICIADO";
  } else if (allReady && testDone) {
    readiness = "PRONTO_PARA_PILOTO";
  } else {
    readiness = "PRONTO_PARA_TESTE";
  }

  return {
    restaurantId:   restaurant.id,
    restaurantName: restaurant.name,
    slug:           restaurant.slug,
    readiness,
    steps,
    counts: {
      categories:        categoryCount,
      activeProducts:    activeProductCount,
      totalProducts:     totalProductCount,
      productsWithImage: productsWithImageCount,
    },
    links: {
      delivery: restaurant.slug ? `${appUrl}/pedido/${restaurant.slug}` : "",
      qr:       restaurant.slug ? `${appUrl}/qr/${restaurant.slug}` : "",
    },
    payment: {
      acceptCash:        paymentSettings?.acceptCash  ?? false,
      acceptPix:         paymentSettings?.acceptPix   ?? false,
      acceptCard:        paymentSettings?.acceptCard  ?? false,
      hasOnlineProvider,
    },
    whatsapp: {
      hasPhone:    hasPhone,
      hasWhatsApp: hasWhatsApp,
      agentMode:   agentConfig?.agentMode ?? "RECEPTIONIST_ONLY",
    },
    finalTestCompletedAt: onboardingStatus?.finalTestCompletedAt?.toISOString() ?? null,
  };
}

// ── GET handler ────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  try {
    const data = await computeStatus(ctx.restaurantId);
    return ok(data);
  } catch (err) {
    console.error("[GET /api/onboarding/status]", err);
    return serverError();
  }
}

// ── POST handler — mark final test complete ────────────────────────────────────

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return unauthorized();

  try {
    await prisma.restaurantOnboardingStatus.upsert({
      where:  { restaurantId: ctx.restaurantId },
      create: { restaurantId: ctx.restaurantId, finalTestCompletedAt: new Date() },
      update: { finalTestCompletedAt: new Date() },
    });

    const data = await computeStatus(ctx.restaurantId);
    return ok(data);
  } catch (err) {
    console.error("[POST /api/onboarding/status]", err);
    return serverError();
  }
}

