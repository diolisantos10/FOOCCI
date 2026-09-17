/**
 * DA PROPOSTA AO PAGAMENTO — o pedaço que faltava entre "mandei o preço" e
 * "virou cliente".
 *
 * ── O QUE ESTE ARQUIVO LIGA, E POR QUE NADA DISTO É NOVO ────────────────────
 *
 * O documento do CEO fecha o atendimento assim: *"produto → oferta → checkout /
 * link de pagamento → pagamento → pedido. Depois: CRM = GANHO ou CRM = PERDIDO +
 * motivo."* Cada peça dessa frase JÁ EXISTIA nesta casa, e nenhuma se falava
 * com a outra:
 *
 *  - **produto/oferta** → `propostas.ts` + `@/lib/billing/pricing` (o catálogo
 *    de planos, que é o que a Foocci vende — não eletrônicos);
 *  - **checkout / link** → `PlanSubscriptionService.ensurePreapproval`, que já
 *    cria a assinatura recorrente no Mercado Pago da conta DA PLATAFORMA;
 *  - **envio** → `registrarSaida` + `entregarMensagem`, o único funil de fala
 *    livre da empresa, com Supervisora, opt-out e as duas chaves do dono;
 *  - **ganho** → `jornadaComercial.ganharOportunidade`, que faz nascer o Cliente.
 *
 * Este arquivo é a costura. Ele **não** abre caminho novo de envio, **não** cria
 * integração de pagamento e **não** escreve estado da jornada com a própria mão.
 *
 * ── ⛔ AS TRAVAS CONTINUAM INTEIRAS, E É O PONTO ────────────────────────────
 *
 * `enviarPropostaNoWhatsApp` chama `entregarMensagem`, exatamente como a tela de
 * atendimento. Com `FOOCCI_SDR_SEND_ENABLED` desligada, teto do dia estourado,
 * fora da janela, opt-out ou Supervisora retendo, a entrega **não acontece** — e
 * a proposta **fica em RASCUNHO**, com o motivo devolvido a quem chamou. Não há
 * `catch` mudo e não há "marcar como enviada mesmo assim": uma proposta dizendo
 * ENVIADA que ninguém recebeu é pior que uma pendente, porque ninguém vai atrás.
 *
 * ── IDEMPOTÊNCIA DO PAGAMENTO, garantida pelo BANCO ─────────────────────────
 *
 * `PlanSubscription.signupIdempotencyKey` é UNIQUE. A assinatura de uma proposta
 * nasce com `proposta:<id>` ali, então:
 *
 *  - gerar o link duas vezes devolve a MESMA assinatura (e `ensurePreapproval`
 *    já protege contra criar duas recorrências no cartão);
 *  - o webhook do Mercado Pago, que reentrega o mesmo evento várias vezes, acha
 *    a proposta pela assinatura e chama `ganharOportunidade` — que é idempotente
 *    por `Cliente.oportunidadeId` ser único. O mesmo pagamento duas vezes NÃO
 *    ganha duas vezes e NÃO cria dois clientes.
 *
 * A chave é reaproveitada, e não desviada: `PlanProvisioningService` só cria
 * conta quando há `signupSlug`/`signupRestaurantName`/senha — que uma proposta
 * comercial não preenche. A assinatura da proposta é cobrança, não auto-cadastro.
 */

import type { PrismaClient, Prisma } from "@prisma/client";
import { normalizePlanCode, normalizeCycleCode, formatBRL } from "@/lib/billing/pricing";
import { PlanSubscriptionService } from "@/services/billing/PlanSubscriptionService";
import { registrarSaida } from "./conversa";
import { entregarMensagem } from "./entrega";
import {
  itemDoCatalogo,
  moverProposta,
  oportunidadeDaProposta,
  type ItemDoCatalogo,
} from "./propostas";
import {
  ganharOportunidade,
  moverOportunidade,
  registrarNaTrilha,
  type Autoria,
} from "./jornadaComercial";

type Cliente = PrismaClient | Prisma.TransactionClient;

/** A chave que amarra assinatura ↔ proposta. UNIQUE no banco. */
export function chaveDaAssinaturaDaProposta(propostaId: string): string {
  return `proposta:${propostaId}`;
}

/** O caminho de volta: dada a chave, qual proposta. `null` se não for nossa. */
export function propostaDaChave(chave: string | null | undefined): string | null {
  if (!chave) return null;
  const m = /^proposta:(.+)$/.exec(chave);
  return m?.[1] ?? null;
}

/** `"GROWTH/ANUAL"` → o item do catálogo. `null` quando o texto não bate. */
export function itemDaProposta(plano: string | null | undefined): ItemDoCatalogo | null {
  const [cru, cicloCru] = (plano ?? "").split("/");
  const codigo = normalizePlanCode(cru);
  const ciclo = normalizeCycleCode(cicloCru);
  if (!codigo || !ciclo) return null;
  return itemDoCatalogo(codigo, ciclo);
}

// ─────────────────────────────────────────────────────────────────────────────
// O LINK DE PAGAMENTO
// ─────────────────────────────────────────────────────────────────────────────

export type ResultadoDoLink =
  | { ok: true; assinaturaId: string; link: string; reaproveitado: boolean }
  | { ok: false; causa: "propostaNaoExiste" }
  | { ok: false; causa: "propostaFechada"; situacao: string }
  /** O plano gravado na proposta não existe mais no catálogo publicado. */
  | { ok: false; causa: "planoDesconhecido"; plano: string | null }
  /** O Mercado Pago exige e-mail para criar assinatura recorrente. */
  | { ok: false; causa: "semEmail" }
  | { ok: false; causa: "semWhatsapp" }
  /** `MP_PLATFORM_ACCESS_TOKEN` ausente. A proposta segue de pé, sem link. */
  | { ok: false; causa: "gatewayNaoConfigurado"; assinaturaId: string }
  | { ok: false; causa: "recusadoPeloGateway"; assinaturaId: string; detalhe: string };

/**
 * Gera (ou reaproveita) o link de pagamento da proposta.
 *
 * Nunca cria uma segunda cobrança para a mesma proposta: a primeira trava é a
 * chave única da assinatura; a segunda é `ensurePreapproval`, que já resolve a
 * corrida de dois cliques simultâneos cancelando o preapproval órfão no MP.
 *
 * ⚠️ Sem gateway configurado, a assinatura EXISTE e o link não. É o modo manual
 * que `PlanSubscriptionService` descreve — o CEO combina o pagamento e ativa no
 * admin — e a resposta diz isso, em vez de fingir que o link saiu.
 */
export async function gerarLinkDePagamento(
  db: Cliente,
  params: { propostaId: string; autoria: Autoria; agora?: Date },
): Promise<ResultadoDoLink> {
  const proposta = await db.leadProposta.findUnique({
    where: { id: params.propostaId },
    select: {
      id: true,
      situacao: true,
      plano: true,
      lead: { select: { id: true, nome: true, email: true, whatsapp: true, restaurante: true } },
    },
  });
  if (!proposta) return { ok: false, causa: "propostaNaoExiste" };
  if (proposta.situacao === "ACEITA" || proposta.situacao === "RECUSADA" || proposta.situacao === "EXPIRADA") {
    return { ok: false, causa: "propostaFechada", situacao: proposta.situacao };
  }

  const item = itemDaProposta(proposta.plano);
  if (!item) return { ok: false, causa: "planoDesconhecido", plano: proposta.plano };

  const chave = chaveDaAssinaturaDaProposta(proposta.id);
  let assinatura = await PlanSubscriptionService.findByIdempotencyKey(chave);
  let reaproveitado = assinatura !== null;

  if (!assinatura) {
    if (!proposta.lead.email?.trim()) return { ok: false, causa: "semEmail" };
    if (!proposta.lead.whatsapp?.trim()) return { ok: false, causa: "semWhatsapp" };

    try {
      assinatura = await PlanSubscriptionService.create({
        customerName: proposta.lead.restaurante?.trim() || proposta.lead.nome || "Cliente",
        customerWhatsapp: proposta.lead.whatsapp,
        customerEmail: proposta.lead.email,
        plan: item.plano,
        cycle: item.ciclo,
        // Sem preço digitado: a tabela é a fonte única, e o serviço deriva o
        // valor cheio e a primeira cobrança dela. Passar número aqui reabriria
        // a porta do desconto que `propostas.ts` fecha.
        notes: `Proposta comercial ${proposta.id} — lead ${proposta.lead.id}.`,
        signupIdempotencyKey: chave,
      });
    } catch {
      // Corrida: outro clique criou primeiro e a chave única recusou o segundo.
      assinatura = await PlanSubscriptionService.findByIdempotencyKey(chave);
      if (!assinatura) throw new Error("a assinatura da proposta não gravou e não foi encontrada");
      reaproveitado = true;
    }

    const oportunidadeId = await oportunidadeDaProposta(db, proposta.id);
    await registrarNaTrilha(db, {
      entidade: "OPORTUNIDADE",
      entidadeId: oportunidadeId ?? proposta.id,
      oportunidadeId,
      leadId: proposta.lead.id,
      tipo: "VINCULO",
      autoria: params.autoria,
      nota: `Checkout da proposta ${proposta.id}: assinatura ${assinatura.id} (${item.nome} ${item.nomeDoCiclo}).`,
      fonte: "checkout",
      chaveDeIdempotencia: `proposta:${proposta.id}:assinatura`,
    });
  }

  const pre = await PlanSubscriptionService.ensurePreapproval(assinatura.id).catch((err) => ({
    ok: false as const,
    reason: "recusado" as const,
    detalhe: String(err),
  }));

  if (!pre.ok) {
    if ("reason" in pre && pre.reason === "gateway_nao_configurado") {
      return { ok: false, causa: "gatewayNaoConfigurado", assinaturaId: assinatura.id };
    }
    return {
      ok: false,
      causa: "recusadoPeloGateway",
      assinaturaId: assinatura.id,
      detalhe: "reason" in pre ? String(pre.reason) : "sem detalhe",
    };
  }

  return { ok: true, assinaturaId: assinatura.id, link: pre.initPoint, reaproveitado: pre.reused || reaproveitado };
}

// ─────────────────────────────────────────────────────────────────────────────
// O ENVIO — pelo motor que já existe, com as travas que já existem
// ─────────────────────────────────────────────────────────────────────────────

/** O texto da proposta, montado do catálogo. Sem link quando não há link. */
export function textoDaProposta(params: {
  primeiroNome: string | null;
  item: ItemDoCatalogo;
  link: string | null;
  validaAte: Date | null;
}): string {
  const saudacao = params.primeiroNome ? `${params.primeiroNome}, ` : "";
  const linhas = [
    `${saudacao}segue a proposta do Foocci:`,
    "",
    `• Plano ${params.item.nome} — cobrança ${params.item.nomeDoCiclo.toLowerCase()}`,
    `• Primeira cobrança: ${params.item.emReais.primeiraCobranca} (metade do primeiro mês já abatida)`,
    `• Depois: ${params.item.emReais.doCiclo} por ciclo, equivalente a ${params.item.emReais.equivalenteAoMes}/mês`,
  ];
  if (params.validaAte) {
    linhas.push(`• Vale até ${params.validaAte.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`);
  }
  if (params.link) {
    linhas.push("", `Para contratar, é por aqui: ${params.link}`);
  }
  return linhas.join("\n");
}

export type ResultadoDoEnvio =
  | { ok: true; propostaId: string; mensagemId: string; link: string | null }
  | { ok: false; causa: "propostaNaoExiste" }
  | { ok: false; causa: "propostaFechada"; situacao: string }
  | { ok: false; causa: "planoDesconhecido"; plano: string | null }
  | { ok: false; causa: "naoGravou"; detalhe: string }
  /**
   * ⛔ A trava recusou. A proposta CONTINUA onde estava e a mensagem fica
   * PENDENTE na conversa — visível na tela, contável no painel, nunca perdida.
   */
  | {
      ok: false;
      causa: "naoEntregue";
      propostaId: string;
      mensagemId: string;
      motivo: string;
      detalhe: string;
      situacaoDaProposta: string;
    };

/**
 * Manda a proposta pelo WhatsApp.
 *
 * `quemMandou` não tem valor padrão, de propósito — é a mesma razão de
 * `entregarMensagem`: um padrão faria toda chamada nova herdar "pessoa" e a
 * segunda chave (`FOOCCI_SDR_IA_RESPONDE_SOZINHA`) voltaria a depender de quem
 * escreve o código lembrar dela.
 *
 * O link é buscado antes, mas a falta dele NÃO impede o envio: uma proposta com
 * preço e sem link ainda é uma proposta, e o gateway pode simplesmente não estar
 * configurado neste ambiente.
 */
export async function enviarPropostaNoWhatsApp(
  db: Cliente,
  params: {
    propostaId: string;
    autoria: Autoria;
    quemMandou: "pessoa" | "maquina";
    agora?: Date;
  },
): Promise<ResultadoDoEnvio> {
  const agora = params.agora ?? new Date();

  const proposta = await db.leadProposta.findUnique({
    where: { id: params.propostaId },
    select: {
      id: true,
      situacao: true,
      plano: true,
      validaAte: true,
      lead: { select: { id: true, nome: true } },
    },
  });
  if (!proposta) return { ok: false, causa: "propostaNaoExiste" };
  if (proposta.situacao === "ACEITA" || proposta.situacao === "RECUSADA" || proposta.situacao === "EXPIRADA") {
    return { ok: false, causa: "propostaFechada", situacao: proposta.situacao };
  }

  const item = itemDaProposta(proposta.plano);
  if (!item) return { ok: false, causa: "planoDesconhecido", plano: proposta.plano };

  const link = await gerarLinkDePagamento(db, {
    propostaId: proposta.id,
    autoria: params.autoria,
    agora,
  });

  const texto = textoDaProposta({
    primeiroNome: (proposta.lead.nome ?? "").trim().split(/\s+/)[0] || null,
    item,
    link: link.ok ? link.link : null,
    validaAte: proposta.validaAte,
  });

  const gravou = await registrarSaida(db, {
    leadId: proposta.lead.id,
    texto,
    autor: params.autoria.autor === "HUMANO" ? "HUMANO" : "IA",
    autorUserId: params.autoria.userId ?? null,
    papelDoAgente: "closer",
    origemDaFala: "proposta",
    agora,
  });
  if (!gravou.ok) {
    return { ok: false, causa: "naoGravou", detalhe: gravou.causa };
  }

  const entrega = await entregarMensagem(db, gravou.mensagemId, params.quemMandou);

  if (!entrega.entregue) {
    // ⛔ Nada de marcar ENVIADA. A proposta fica onde estava, e o motivo sobe.
    return {
      ok: false,
      causa: "naoEntregue",
      propostaId: proposta.id,
      mensagemId: gravou.mensagemId,
      motivo: entrega.motivo,
      detalhe: entrega.detalhe,
      situacaoDaProposta: proposta.situacao,
    };
  }

  if (proposta.situacao === "RASCUNHO") {
    await moverProposta(db, {
      propostaId: proposta.id,
      de: "RASCUNHO",
      para: "ENVIADA",
      autoria: params.autoria,
      motivo: "proposta entregue no WhatsApp",
      enviadaEm: agora,
      agora,
    });
  }

  return {
    ok: true,
    propostaId: proposta.id,
    mensagemId: gravou.mensagemId,
    link: link.ok ? link.link : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// O PAGAMENTO FECHA O CICLO
// ─────────────────────────────────────────────────────────────────────────────

export type ResultadoDoGanhoPeloPagamento =
  /** Não era uma assinatura de proposta comercial. Não é erro. */
  | { ok: true; aplicou: false; motivo: "naoEhDeProposta" | "semVinculo" | "oportunidadeJaFechada" }
  | { ok: true; aplicou: true; propostaId: string; oportunidadeId: string; clienteId: string; jaEraCliente: boolean }
  | { ok: false; causa: "propostaNaoExiste" }
  | { ok: false; causa: "naoGanhou"; detalhe: string };

/**
 * ⭐ PAGOU → A OPORTUNIDADE É GANHA, E O CLIENTE NASCE.
 *
 * Chamado pelo webhook do Mercado Pago da plataforma, depois que ele confirmou o
 * pagamento **rebuscando o estado na API do MP** — este serviço não confia em
 * corpo de POST e não fala com o gateway: recebe o id da assinatura que o
 * webhook já validou.
 *
 * ── A IDEMPOTÊNCIA, e onde ela mora ─────────────────────────────────────────
 *
 * O MP reentrega o mesmo evento. Três travas, todas do banco e nenhuma da ordem
 * das chamadas:
 *   1. a proposta só vai de ENVIADA/EM_NEGOCIACAO/RASCUNHO para ACEITA uma vez
 *      (`updateMany` condicionado à situação);
 *   2. `ganharOportunidade` condiciona o `updateMany` ao estágio de origem;
 *   3. `Cliente.oportunidadeId` é UNIQUE — o segundo ganho devolve o MESMO
 *      cliente, com `jaEraCliente: true`.
 *
 * **Nunca lança.** Uma exceção aqui derrubaria o webhook de um pagamento que já
 * entrou, e o dinheiro não volta atrás para ser reprocessado.
 */
export async function ganharPeloPagamento(
  db: Cliente,
  params: {
    assinaturaId: string;
    chaveDeIdempotencia: string | null | undefined;
    receitaCents?: number | null;
    restaurantId?: string | null;
    autoria: Autoria;
    agora?: Date;
  },
): Promise<ResultadoDoGanhoPeloPagamento> {
  const propostaId = propostaDaChave(params.chaveDeIdempotencia);
  if (!propostaId) return { ok: true, aplicou: false, motivo: "naoEhDeProposta" };

  const agora = params.agora ?? new Date();

  const proposta = await db.leadProposta.findUnique({
    where: { id: propostaId },
    select: { id: true, situacao: true },
  });
  if (!proposta) return { ok: false, causa: "propostaNaoExiste" };

  const oportunidadeId = await oportunidadeDaProposta(db, proposta.id);
  if (!oportunidadeId) return { ok: true, aplicou: false, motivo: "semVinculo" };

  // A proposta vira ACEITA antes do ganho: se o ganho falhar, fica registrado
  // que o cliente aceitou — o inverso perderia o fato mais importante.
  if (proposta.situacao !== "ACEITA") {
    await moverProposta(db, {
      propostaId: proposta.id,
      de: proposta.situacao,
      para: "ACEITA",
      autoria: params.autoria,
      motivo: `pagamento confirmado na assinatura ${params.assinaturaId}`,
      respondidaEm: agora,
      agora,
    });
  }

  const oportunidade = await db.oportunidade.findUnique({
    where: { id: oportunidadeId },
    select: { estagio: true },
  });
  if (!oportunidade) return { ok: true, aplicou: false, motivo: "semVinculo" };
  if (oportunidade.estagio === "PERDIDA") {
    // Pagou depois de perdida. Não se ganha por baixo dos panos: fica a nota,
    // e um humano decide. Reabrir é ato de gente, com motivo.
    await registrarNaTrilha(db, {
      entidade: "OPORTUNIDADE",
      entidadeId: oportunidadeId,
      oportunidadeId,
      tipo: "NOTA",
      autoria: params.autoria,
      motivo: "pagamento confirmado em oportunidade PERDIDA",
      nota:
        `A assinatura ${params.assinaturaId} foi paga, mas esta oportunidade está PERDIDA. ` +
        "Não foi ganha automaticamente — confira se a perda foi registrada por engano.",
      fonte: "checkout",
      chaveDeIdempotencia: `proposta:${proposta.id}:pagamento-em-perdida`,
    });
    return { ok: true, aplicou: false, motivo: "oportunidadeJaFechada" };
  }

  // ⭐ O REENVIO DO MESMO WEBHOOK cai aqui: a oportunidade já está GANHA e o
  // cliente já existe. Devolve o MESMO cliente, sem tentar mover nada — mover a
  // partir de um estágio terminal seria recusado, e a recusa viraria um "erro"
  // no log de um caminho que é o normal do Mercado Pago.
  if (oportunidade.estagio === "GANHA") {
    const cliente = await db.cliente.findUnique({
      where: { oportunidadeId },
      select: { id: true },
    });
    if (!cliente) return { ok: false, causa: "naoGanhou", detalhe: "oportunidade GANHA sem cliente" };
    return {
      ok: true,
      aplicou: true,
      propostaId: proposta.id,
      oportunidadeId,
      clienteId: cliente.id,
      jaEraCliente: true,
    };
  }

  // GANHA só entra a partir de PROPOSTA ou NEGOCIACAO. Quando o cliente paga sem
  // o funil ter acompanhado, o degrau que falta é dado aqui, com trilha — e não
  // pulado com um update solto.
  let estagio = oportunidade.estagio;
  if (estagio === "DESCOBERTA") {
    await moverOportunidade(db, {
      oportunidadeId, de: "DESCOBERTA", para: "QUALIFICACAO",
      autoria: params.autoria, motivo: "pagamento confirmado — o funil não tinha acompanhado", agora,
    });
    estagio = "QUALIFICACAO";
  }
  if (estagio === "QUALIFICACAO") {
    await moverOportunidade(db, {
      oportunidadeId, de: "QUALIFICACAO", para: "PROPOSTA",
      autoria: params.autoria, motivo: "pagamento confirmado — o funil não tinha acompanhado", agora,
    });
    estagio = "PROPOSTA";
  }

  const ganho = await ganharOportunidade(db, {
    oportunidadeId,
    de: estagio,
    autoria: params.autoria,
    restaurantId: params.restaurantId ?? null,
    receitaInicialCents: params.receitaCents ?? null,
    motivo: `Pagamento confirmado — assinatura ${params.assinaturaId}${
      params.receitaCents ? ` (${formatBRL(params.receitaCents)})` : ""
    }.`,
    agora,
  });

  if (!ganho.ok) {
    return { ok: false, causa: "naoGanhou", detalhe: ganho.causa };
  }

  return {
    ok: true,
    aplicou: true,
    propostaId: proposta.id,
    oportunidadeId,
    clienteId: ganho.clienteId,
    jaEraCliente: ganho.jaEraCliente,
  };
}
