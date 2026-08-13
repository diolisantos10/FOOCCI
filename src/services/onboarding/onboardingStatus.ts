/**
 * Guia de configuração do restaurante — o estado REAL, calculado do banco.
 *
 * POR QUE ISTO É UM SERVIÇO, E NÃO CÓDIGO DENTRO DA ROTA (13/08/2026)
 * A tela `/onboarding` existia, lia o banco de verdade e estava **órfã**: nenhum
 * link, botão ou redirecionamento em `src/` apontava para ela. Só chegava quem
 * digitava a URL. Para ligá-la, três lugares precisam da MESMA resposta para a
 * pergunta "ainda falta etapa?":
 *
 *   1. o menu lateral    — mostra "Começar aqui" enquanto faltar etapa;
 *   2. o `/dashboard`    — manda quem ainda não tem cardápio para o guia;
 *   3. o vazio do painel — vira convite para o guia em vez de "tudo concluído ✓".
 *
 * Três cópias da regra viram três verdades diferentes na primeira mudança. Aqui
 * ela é uma função só, e a rota da API passou a ser um invólucro fino.
 */

import { prisma } from "@/lib/prisma";

// ── Tipos ──────────────────────────────────────────────────────────────────────

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

/**
 * O resumo que o shell do painel carrega — só o que o menu e o vazio do painel
 * precisam saber. Nunca é inventado: sai sempre do mesmo `computeOnboardingStatus`.
 */
export interface ResumoDoGuia {
  /** Etapas que ainda não estão concluídas, das 7 que a tela do guia mostra. */
  pendentes:  number;
  /** Chegou na linha de chegada: tudo o que bloqueia OK **e** teste final marcado. */
  concluido:  boolean;
  /** Nenhum produto ativo — o restaurante ainda não tem o que vender. */
  cardapioVazio: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function stepComplete(message: string): StepResult { return { status: "COMPLETE", message }; }
function stepPending(message: string):  StepResult { return { status: "PENDING",  message }; }
function stepWarning(message: string):  StepResult { return { status: "WARNING",  message }; }
function stepBlocked(message: string):  StepResult { return { status: "BLOCKED",  message }; }

// ── Cálculo do status ──────────────────────────────────────────────────────────

export async function computeOnboardingStatus(restaurantId: string): Promise<OnboardingStatusData> {
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

  // ── Etapa: Loja ──────────────────────────────────────────────────────────────
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

  // ── Etapa: Funcionamento ─────────────────────────────────────────────────────
  const openDays = businessHours.filter((h) => h.isOpen).length;
  const funcionamentoStep: StepResult = openDays > 0
    ? stepComplete(`${openDays} dia${openDays !== 1 ? "s" : ""} de funcionamento configurado${openDays !== 1 ? "s" : ""}`)
    : stepPending("Nenhum dia de funcionamento ativo — configure os horários");

  // ── Etapa: Entrega ───────────────────────────────────────────────────────────
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

  // ── Etapa: Pagamentos ────────────────────────────────────────────────────────
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

  // ── Etapa: Cardápio ──────────────────────────────────────────────────────────
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

  // ── Etapa: Canais ────────────────────────────────────────────────────────────
  // Só "CONNECTED" prova conexão. PENDING/ERROR/DISCONNECTED e ausência de linha
  // NÃO viram "configurado" — o lojista não pode ver ✓ num canal que não envia.
  const hasWhatsApp = metaConfig?.connectionStatus === "CONNECTED";
  const canaisStep: StepResult = hasWhatsApp
    ? stepComplete("Links públicos e WhatsApp configurados")
    : stepWarning("Links públicos OK — WhatsApp da Meta ainda não conectado");

  // ── Etapa: Teste final ───────────────────────────────────────────────────────
  const testeStep: StepResult = onboardingStatus?.finalTestCompletedAt
    ? stepComplete("Teste piloto marcado como concluído")
    : stepPending("Realize o teste manual e marque como concluído");

  // ── Prontidão ────────────────────────────────────────────────────────────────
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

// ── As regras puras (é aqui que o teste bate) ──────────────────────────────────

/** Quantas das 7 etapas exibidas no guia ainda não estão concluídas. */
export function contarEtapasPendentes(steps: OnboardingStatusData["steps"]): number {
  return Object.values(steps).filter((s) => s.status !== "COMPLETE").length;
}

/**
 * A linha de chegada do guia — e ela é **alcançável de propósito**.
 *
 * Não é "as 7 etapas verdes": a etapa *Canais* só fica verde com o WhatsApp
 * oficial da Meta conectado, coisa que a maioria dos restaurantes não faz nunca.
 * Um menu que nunca some vira decoração que o lojista aprende a ignorar. Aqui a
 * régua é a mesma da prontidão para o piloto: tudo que bloqueia resolvido **e**
 * o teste final marcado.
 */
export function guiaConcluido(status: Pick<OnboardingStatusData, "readiness">): boolean {
  return status.readiness === "PRONTO_PARA_PILOTO";
}

export function resumoDoGuia(status: OnboardingStatusData): ResumoDoGuia {
  return {
    pendentes:     contarEtapasPendentes(status.steps),
    concluido:     guiaConcluido(status),
    cardapioVazio: status.counts.activeProducts === 0,
  };
}

/**
 * O painel deve dar lugar ao guia?
 *
 * Só quando não há **nada para vender**: gráfico zerado é o que o dono novo vê
 * hoje, e ele não tem o que fazer ali. Cardápio vazio implica etapa bloqueada,
 * então este caso nunca colide com um guia já concluído.
 *
 * `pediuPainel` é a saída: o guia leva de volta ao painel com `?painel=1`, senão
 * o dono ficaria preso num vaivém entre as duas telas.
 */
export function deveAbrirOGuia(input: { cardapioVazio: boolean; pediuPainel: boolean }): boolean {
  return input.cardapioVazio && !input.pediuPainel;
}

// ── Carregadores para o shell do painel ────────────────────────────────────────

/**
 * O resumo do guia para o shell. Nunca lança: se o banco falhar, devolve `null`
 * e o menu simplesmente não mostra o item — o painel não pode cair por causa de
 * um enfeite de navegação.
 */
export async function carregarResumoDoGuia(restaurantId: string): Promise<ResumoDoGuia | null> {
  try {
    return resumoDoGuia(await computeOnboardingStatus(restaurantId));
  } catch {
    return null;
  }
}

/**
 * A pergunta mais barata do conjunto — uma contagem — porque roda em toda visita
 * ao `/dashboard`. `null` (erro de banco) nunca redireciona: na dúvida, o painel.
 */
export async function cardapioEstaVazio(restaurantId: string): Promise<boolean> {
  try {
    const ativos = await prisma.menuItem.count({ where: { category: { restaurantId }, isActive: true } });
    return ativos === 0;
  } catch {
    return false;
  }
}
