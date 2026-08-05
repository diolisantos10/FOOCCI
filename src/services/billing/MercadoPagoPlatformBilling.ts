/**
 * Cobrança recorrente da PLATAFORMA no Mercado Pago (Assinaturas / preapproval).
 *
 * ATENÇÃO À FRONTEIRA: o Mercado Pago que já existia no sistema é o dos
 * RESTAURANTES (cada lojista recebe os pedidos dele na conta dele). Este módulo
 * usa a conta DA FOOCCI, com credencial própria (MP_PLATFORM_ACCESS_TOKEN) —
 * misturar as duas contas mandaria a mensalidade dos planos para o caixa de um
 * restaurante.
 *
 * Sem o token configurado o fluxo NÃO trava: o serviço devolve null e a
 * assinatura segue no modo manual (o CEO combina o pagamento e marca ativa no
 * admin). Gateway é acelerador, não pré-requisito — a V1 vende hoje.
 */

import type { PlanSubscription } from "@prisma/client";
import { CYCLE_MONTHS } from "@/lib/billing/pricing";

const MP_API = "https://api.mercadopago.com";

function platformToken(): string | null {
  return process.env.MP_PLATFORM_ACCESS_TOKEN || null;
}

export function isPlatformBillingConfigured(): boolean {
  return !!platformToken();
}

export interface PreapprovalResult {
  id: string;
  initPoint: string;
}

export const MercadoPagoPlatformBilling = {
  /**
   * Cria a assinatura recorrente no MP e devolve o link de pagamento hospedado.
   * Exige e-mail do cliente (obrigatório na API do MP para preapproval).
   *
   * VALOR: nasce com `firstChargeCents` quando ele existe (a regra dos 50% do
   * primeiro mês) e só depois é elevado a `priceCents` por
   * `updatePreapprovalAmount`, chamado quando a primeira cobrança é confirmada.
   * O preapproval do MP tem UM valor recorrente — não há campo de "primeira
   * parcela diferente" —, então o degrau em duas etapas é o caminho suportado.
   *
   * NÃO chame direto para gerar o link do cliente: use
   * `PlanSubscriptionService.ensurePreapproval`, que é quem impede a segunda
   * recorrência num duplo clique.
   */
  async createPreapproval(sub: PlanSubscription): Promise<PreapprovalResult | null> {
    const token = platformToken();
    if (!token) return null;
    if (!sub.customerEmail) {
      throw new Error("MP exige e-mail do cliente para criar a assinatura — preencha o e-mail no admin.");
    }

    const months = CYCLE_MONTHS[sub.cycle];
    const amountCents = sub.firstChargeCents ?? sub.priceCents;
    const res = await fetch(`${MP_API}/preapproval`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: `Foocci — plano ${sub.plan} (${sub.cycle.toLowerCase()})`,
        external_reference: sub.id,
        payer_email: sub.customerEmail,
        back_url: `https://foocci.com.br/contratar/obrigado?s=${encodeURIComponent(sub.acceptToken)}`,
        auto_recurring: {
          frequency: months,
          frequency_type: "months",
          transaction_amount: amountCents / 100,
          currency_id: "BRL",
        },
      }),
    });

    const body = (await res.json().catch(() => null)) as { id?: string; init_point?: string; message?: string } | null;
    if (!res.ok || !body?.id || !body?.init_point) {
      throw new Error(`MP recusou a criação da assinatura (${res.status}): ${body?.message ?? "sem detalhe"}`);
    }
    return { id: body.id, initPoint: body.init_point };
  },

  /**
   * Eleva o valor recorrente do preapproval para o valor CHEIO do ciclo, depois
   * que a primeira cobrança (com os 50%) já foi confirmada.
   *
   * Se isto falhar, o cliente continua pagando metade para sempre — perda de
   * receita silenciosa. Por isso a falha volta com motivo e o chamador PERSISTE
   * o alerta; nunca há catch mudo aqui.
   */
  async updatePreapprovalAmount(
    preapprovalId: string,
    amountCents: number,
    cycle: PlanSubscription["cycle"],
  ): Promise<{ ok: true } | { ok: false; reason: "gateway_nao_configurado" | "mp_recusou"; detail?: string }> {
    const token = platformToken();
    if (!token) return { ok: false, reason: "gateway_nao_configurado" };
    if (!preapprovalId) return { ok: false, reason: "mp_recusou", detail: "preapprovalId vazio" };

    const res = await fetch(`${MP_API}/preapproval/${encodeURIComponent(preapprovalId)}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        auto_recurring: {
          frequency: CYCLE_MONTHS[cycle],
          frequency_type: "months",
          transaction_amount: amountCents / 100,
          currency_id: "BRL",
        },
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      return { ok: false, reason: "mp_recusou", detail: `${res.status}: ${body?.message ?? "sem detalhe"}` };
    }
    return { ok: true };
  },

  /**
   * Cancela o preapproval (a assinatura recorrente) no Mercado Pago. É ISTO que
   * faz o dinheiro PARAR de sair do cartão do cliente — marcar CANCELADA só no
   * nosso banco não impede o MP de cobrar o próximo ciclo (CR A1).
   *
   * Idempotente no MP: cancelar um preapproval já cancelado devolve 200/"cancelled".
   *
   * Sem o token de plataforma NÃO cancela e devolve `gateway_nao_configurado` —
   * o chamador PRECISA saber que o MP não foi tocado (a cobrança pode continuar),
   * porque a trava anti-reativação do nosso lado não estanca o dinheiro no MP.
   */
  async cancelPreapproval(
    preapprovalId: string,
  ): Promise<
    | { ok: true; status: string }
    | { ok: false; reason: "gateway_nao_configurado" | "mp_recusou"; detail?: string }
  > {
    const token = platformToken();
    if (!token) return { ok: false, reason: "gateway_nao_configurado" };
    if (!preapprovalId) return { ok: false, reason: "mp_recusou", detail: "preapprovalId vazio" };

    const res = await fetch(`${MP_API}/preapproval/${encodeURIComponent(preapprovalId)}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });
    const body = (await res.json().catch(() => null)) as { status?: string; message?: string } | null;
    if (!res.ok) {
      return { ok: false, reason: "mp_recusou", detail: `${res.status}: ${body?.message ?? "sem detalhe"}` };
    }
    return { ok: true, status: body?.status ?? "cancelled" };
  },

  /**
   * Busca o estado real de um preapproval direto na API — o webhook do MP só
   * carrega o ID, e confiar no corpo do webhook seria confiar em quem POSTou.
   * O refetch com o NOSSO token é a verificação (mesmo padrão do webhook de
   * pedidos).
   */
  async fetchPreapproval(id: string): Promise<{ status: string; externalReference: string | null } | null> {
    const token = platformToken();
    if (!token) return null;
    const res = await fetch(`${MP_API}/preapproval/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as { status?: string; external_reference?: string } | null;
    if (!body?.status) return null;
    return { status: body.status, externalReference: body.external_reference ?? null };
  },

  /** Busca um pagamento (cobrança individual da assinatura) para confirmar e faturar. */
  async fetchPayment(id: string): Promise<{
    status: string;
    amountCents: number;
    preapprovalId: string | null;
    externalReference: string | null;
    approvedAt: string | null;
  } | null> {
    const token = platformToken();
    if (!token) return null;
    const res = await fetch(`${MP_API}/v1/payments/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as {
      status?: string;
      transaction_amount?: number;
      external_reference?: string;
      date_approved?: string;
      point_of_interaction?: { transaction_data?: { subscription_id?: string } };
      metadata?: { preapproval_id?: string };
    } | null;
    if (!body?.status) return null;
    return {
      status: body.status,
      amountCents: Math.round((body.transaction_amount ?? 0) * 100),
      preapprovalId:
        body.point_of_interaction?.transaction_data?.subscription_id ?? body.metadata?.preapproval_id ?? null,
      externalReference: body.external_reference ?? null,
      approvedAt: body.date_approved ?? null,
    };
  },

  /**
   * A chave de cobrança está VIVA? — pergunta ao Mercado Pago sem criar nada.
   *
   * POR QUE ISTO EXISTE. `isPlatformBillingConfigured()` responde outra pergunta:
   * "a variável está definida". Uma variável presente com token errado, vencido
   * ou rotacionado dá exatamente o mesmo `true` — e o primeiro a descobrir a
   * diferença seria um cliente real, no meio da contratação, recebendo uma tela
   * sem link de pagamento. Falha em silêncio, do lado do dinheiro.
   *
   * `GET /users/me` é o jeito mais barato de perguntar: é leitura pura, não cria
   * preapproval, não gera cobrança, não deixa rastro na conta. **A alternativa
   * seria fazer uma contratação de mentira em produção** — o que suja a carteira
   * com contrato falso e cria um objeto de recorrência de verdade no gateway.
   *
   * Nunca devolve o token, nem pedaço dele. Devolve o veredito e, quando falha,
   * a razão que o MP deu — guardrail 6: o alerta carrega a própria evidência.
   */
  async checkCredential(): Promise<
    | { ok: true; accountId: number | null; nickname: string | null; siteId: string | null }
    | { ok: false; reason: string }
  > {
    const token = platformToken();
    if (!token) return { ok: false, reason: "MP_PLATFORM_ACCESS_TOKEN ausente no ambiente." };

    let res: Response;
    try {
      res = await fetch(`${MP_API}/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
        // Diagnóstico não pode pendurar a tela do admin esperando o gateway.
        signal: AbortSignal.timeout(8_000),
      });
    } catch (e) {
      return { ok: false, reason: `não deu para falar com o Mercado Pago: ${e instanceof Error ? e.message : String(e)}` };
    }

    const body = (await res.json().catch(() => null)) as
      | { id?: number; nickname?: string; site_id?: string; message?: string; error?: string }
      | null;

    if (!res.ok) {
      // 401 é o caso que interessa: token errado, vencido ou rotacionado.
      const detalhe = body?.message ?? body?.error ?? "sem detalhe";
      return { ok: false, reason: `Mercado Pago recusou a chave (HTTP ${res.status}): ${detalhe}` };
    }

    // Tudo que vem do gateway passa por aqui antes de virar tela. Ver `semSegredo`.
    return {
      ok: true,
      accountId: body?.id ?? null,
      nickname: semSegredo(body?.nickname ?? null, token),
      siteId: semSegredo(body?.site_id ?? null, token),
    };
  },
};

/**
 * Corta qualquer texto vindo do gateway que contenha o token.
 *
 * Parece paranoia até lembrar do que este arquivo faz: pega uma resposta de fora,
 * escolhe alguns campos e manda para uma tela. No dia em que um desses campos
 * ecoar a credencial — porque a API mudou, porque alguém acrescentou um campo,
 * porque o provedor decidiu devolver o que recebeu —, o segredo aparece no admin
 * e ninguém percebe. É barato demais para não travar: guardrail 4, código é trava
 * e não combinado. O teste que provou a necessidade está no arquivo vizinho.
 */
function semSegredo(valor: string | null, token: string): string | null {
  if (valor === null) return null;
  return valor.includes(token) ? "[oculto]" : valor;
}
