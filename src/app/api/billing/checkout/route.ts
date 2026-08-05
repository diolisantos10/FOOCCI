/**
 * POST /api/billing/checkout — a contratação self-service, sem humano no meio.
 *
 * Equivalente público do `POST /api/admin/billing/subscriptions` (que é
 * admin-only). Como aqui quem chama é a internet, três coisas são obrigatórias e
 * nenhuma é opcional:
 *
 *  1. RATE LIMIT por IP. Cada chamada bem-sucedida cria uma cobrança recorrente
 *     no Mercado Pago; sem teto, isto é uma máquina de lixo no gateway.
 *  2. VALIDAÇÃO Zod, com o preço vindo SEMPRE da fonte única do servidor. O
 *     corpo do request não carrega valor nenhum em centavos — o cliente escolhe
 *     plano e ciclo, o servidor decide o preço. (Mesma lei do finalize de pedido:
 *     preço do payload nunca é confiado.)
 *  3. IDEMPOTÊNCIA por `idempotencyKey`. Duplo clique, F5 no meio do POST ou
 *     retry de rede reaproveitam a MESMA assinatura e o MESMO link de pagamento.
 *     Sem isso, o cliente sai daqui com duas recorrências no cartão.
 *
 * O ACEITE DO CONTRATO acontece AQUI, antes de qualquer link de pagamento
 * existir: o checkbox do formulário vira `recordAcceptance` com nome, IP, data e
 * versão do Termo. Não há caminho neste fluxo em que alguém pague sem contrato —
 * e, se houvesse, `activate()` recusaria (G4).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { PlanSubscriptionService } from "@/services/billing/PlanSubscriptionService";
import { isPlatformBillingConfigured } from "@/services/billing/MercadoPagoPlatformBilling";
import {
  normalizePlanCode,
  normalizeCycleCode,
  recurringChargeCents,
  firstChargeCents,
} from "@/lib/billing/pricing";
import { RESERVED_SLUGS, SLUG_REGEX } from "@/lib/billing/checkout-slug";

const bodySchema = z.object({
  plano: z.string().min(2).max(30),
  ciclo: z.string().min(2).max(20),
  nome: z.string().trim().min(3, "Informe seu nome completo").max(160),
  email: z.string().trim().toLowerCase().email("E-mail inválido").max(160),
  whatsapp: z.string().trim().min(10, "WhatsApp com DDD").max(30),
  cnpj: z.string().trim().max(20).optional().or(z.literal("")),
  restaurante: z.string().trim().min(2, "Informe o nome do restaurante").max(100),
  slug: z.string().trim().toLowerCase().min(3).max(60),
  senha: z.string().min(8, "A senha precisa de ao menos 8 caracteres").max(72),
  aceiteTermos: z.literal(true, {
    errorMap: () => ({ message: "É preciso aceitar o Termo de Contratação para continuar." }),
  }),
  idempotencyKey: z.string().trim().min(8).max(64),
});

function bad(error: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  // 6 contratações por IP a cada 15 min. Generoso para um lojista errando o
  // formulário, apertado para um script criando recorrências no MP.
  const rl = rateLimit({ key: `billing-checkout:${ip}`, limit: 6, windowMs: 15 * 60_000 });
  if (rl.limited) return rateLimitResponse(rl.retryAfter) as NextResponse;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Dados inválidos");
  const data = parsed.data;

  const plan = normalizePlanCode(data.plano);
  const cycle = normalizeCycleCode(data.ciclo);
  if (!plan || !cycle) return bad("Plano ou ciclo desconhecido.");

  // ── Idempotência: mesma chave, mesma assinatura ──────────────────────────
  const existing = await PlanSubscriptionService.findByIdempotencyKey(data.idempotencyKey);
  if (existing) return await finish(existing.id, ip, data.nome);

  // ── Endereço da loja ──────────────────────────────────────────────────────
  if (!SLUG_REGEX.test(data.slug)) {
    return bad("O endereço da loja aceita só letras minúsculas, números e hífen.");
  }
  if (RESERVED_SLUGS.has(data.slug)) return bad("Esse endereço é reservado. Escolha outro.", 409);
  const slugTaken = await prisma.restaurant.findUnique({ where: { slug: data.slug }, select: { id: true } });
  if (slugTaken) return bad(`O endereço "${data.slug}" já está em uso. Escolha outro.`, 409);

  // ── E-mail ────────────────────────────────────────────────────────────────
  // O login procura a conta pelo e-mail sozinho (`/api/auth/lookup`). Dois donos
  // com o mesmo e-mail em restaurantes diferentes é permitido pelo schema, mas o
  // segundo NUNCA conseguiria entrar. Barrar aqui é o que impede vender uma conta
  // inacessível — falha fechada, com o caminho certo na mensagem.
  const emailTaken = await prisma.user.findFirst({
    where: { email: data.email, isActive: true },
    select: { id: true },
  });
  if (emailTaken) {
    return bad("Já existe uma conta Foocci com esse e-mail. Entre em /login ou use outro e-mail.", 409);
  }

  // ── Preço: decidido pelo servidor, nunca pelo cliente ────────────────────
  const priceCents = recurringChargeCents(plan, cycle);
  const firstCents = firstChargeCents(plan, cycle);

  const passwordHash = await hash(data.senha, 12);

  let sub;
  try {
    sub = await PlanSubscriptionService.create({
      customerName: data.nome,
      customerWhatsapp: data.whatsapp,
      customerCnpj: data.cnpj || null,
      customerEmail: data.email,
      plan,
      cycle,
      priceCents,
      firstChargeCents: firstCents,
      notes: "Contratação self-service pelo site.",
      signupRestaurantName: data.restaurante,
      signupSlug: data.slug,
      signupOwnerPasswordHash: passwordHash,
      signupIdempotencyKey: data.idempotencyKey,
    });
  } catch (err) {
    // Corrida com o próprio duplo clique: dois POSTs simultâneos, mesma chave. O
    // UNIQUE do banco derruba um; ele reaproveita o que o outro criou.
    if (typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002") {
      const twin = await PlanSubscriptionService.findByIdempotencyKey(data.idempotencyKey);
      if (twin) return await finish(twin.id, ip, data.nome);
    }
    console.error("[billing/checkout] falha ao criar a assinatura:", err);
    return bad("Não foi possível iniciar a contratação. Tente de novo em instantes.", 500);
  }

  return await finish(sub.id, ip, data.nome);
}

/**
 * O trecho que TODO caminho (novo ou reaproveitado) atravessa: aceite primeiro,
 * link de pagamento depois. Nesta ordem, e nunca a inversa.
 */
async function finish(subscriptionId: string, ip: string, nome: string) {
  // 1. Aceite do Termo — idempotente: reenvio preserva a trilha original.
  const accepted = await prisma.planSubscription.findUnique({ where: { id: subscriptionId } });
  if (!accepted) return bad("Contratação não encontrada.", 404);
  if (!accepted.termsAcceptedAt) {
    await PlanSubscriptionService.recordAcceptance(accepted.acceptToken, nome, ip);
  }

  const thankYouUrl = `/contratar/obrigado?s=${encodeURIComponent(accepted.acceptToken)}`;

  // 2. Link de pagamento. `ensurePreapproval` é o que impede a segunda
  //    recorrência quando o cliente reenvia (G2).
  if (!isPlatformBillingConfigured()) {
    // Sem gateway a contratação NÃO se perde: fica registrada, com aceite, e o
    // cliente é levado à tela pós-contratação que explica o que vem agora.
    console.warn(
      `[billing/checkout] assinatura ${subscriptionId} criada e aceita SEM gateway ` +
        `(MP_PLATFORM_ACCESS_TOKEN ausente) — cobrança precisa ser combinada à mão.`,
    );
    return NextResponse.json({ ok: true, acceptToken: accepted.acceptToken, paymentUrl: null, thankYouUrl });
  }

  try {
    const pre = await PlanSubscriptionService.ensurePreapproval(subscriptionId);
    if (!pre.ok) {
      console.error(`[billing/checkout] sem link de pagamento para ${subscriptionId}: ${pre.reason}`);
      return NextResponse.json({ ok: true, acceptToken: accepted.acceptToken, paymentUrl: null, thankYouUrl });
    }
    return NextResponse.json({
      ok: true,
      acceptToken: accepted.acceptToken,
      paymentUrl: pre.initPoint,
      reusedPayment: pre.reused,
      thankYouUrl,
    });
  } catch (err) {
    console.error(`[billing/checkout] Mercado Pago recusou o link de ${subscriptionId}:`, err);
    return NextResponse.json({ ok: true, acceptToken: accepted.acceptToken, paymentUrl: null, thankYouUrl });
  }
}
