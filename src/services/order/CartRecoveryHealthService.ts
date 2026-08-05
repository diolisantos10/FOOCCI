/**
 * CartRecoveryHealthService — a saúde da recuperação de carrinho, com evidência.
 *
 * POR QUE ESTA PEÇA EXISTE
 * A tela de Campanhas mostrava a linha "🛒 Carrinho abandonado" com o selo
 * **Ativa** e um botão **Pausar** ao lado. Ativa é uma promessa: o lojista lê
 * "o Foocci está recuperando carrinho pra mim". Entre 19/05 e 05/08/2026 a
 * produção enviou 4 mensagens de recuperação no total — 3 no dia da estreia
 * (28/05) e 1 em 12/07 — enquanto a tela dizia "Ativa" o tempo inteiro.
 *
 * O problema não é a conversão baixa; é a máquina não ter como avisar que está
 * calada. Guardrail 2 desta casa: verificação que não registrou resultado
 * bloqueia por construção — esquecer o portão nunca pode significar "aprovado".
 * Aplicado ao CRM: campanha que não registrou envio nenhum não pode se
 * apresentar como saudável.
 *
 * A REGRA QUE MAIS IMPORTA AQUI
 * Silêncio tem DUAS causas e elas se parecem:
 *   1. não havia carrinho para cobrar  → ociosa, e está tudo certo;
 *   2. havia carrinho e nada saiu      → silenciosa, e isso é defeito.
 * Guardrail 1 — ausência de informação não é informação — proíbe tratar as duas
 * como uma. Por isso o veredito só acusa SILENCIOSA quando existe a prova de
 * que houve o que cobrar: carrinho que venceu sem nenhuma tentativa.
 *
 * E guardrail 6 — o alerta carrega a própria evidência: `evidencia` traz desde
 * quando, quantos carrinhos elegíveis passaram e quando foi a última tentativa.
 * Alerta que diz "algo falhou" sem o caso concreto é ruído que ninguém abre.
 *
 * SOMENTE LEITURA. Nada aqui envia, marca ou apaga.
 */

import { prisma } from "@/lib/prisma";
import { parseReadyMadeConfig } from "@/services/crm/ReadyMadeCampaignService";

/** Prazo de validade do carrinho — espelha MAX_AGE_HOURS do serviço de envio. */
const VALIDADE_HORAS = 6;
/** Piso de inatividade para um carrinho virar candidato — espelha o cron. */
const INATIVIDADE_MINUTOS = 2;
/** A partir de quantos dias sem enviar nada uma campanha ativa vira suspeita. */
const DIAS_PARA_ALARME = 7;
/** Janela em que se procuram oportunidades perdidas. */
const JANELA_DIAS = 30;

export type VereditoCarrinho =
  /** O lojista desligou. Não é alarme — é escolha dele. */
  | "DESLIGADA"
  /** Enviou recentemente. A máquina está de pé. */
  | "SAUDAVEL"
  /** Ativa, calada, e NÃO passou carrinho nenhum: não havia o que fazer. */
  | "OCIOSA"
  /** Ativa, calada, e passaram carrinhos que venceram sem uma tentativa. */
  | "SILENCIOSA";

export interface CartRecoveryHealth {
  restaurantId: string;
  /** O que a tela promete ao lojista neste instante. */
  ativa: boolean;
  veredito: VereditoCarrinho;
  /** Frase pronta, com números — é ela que vai para o alerta e para a tela. */
  evidencia: string;

  /** Quando a última recuperação REALMENTE saiu (carimbo no rascunho). */
  ultimoEnvioEm: string | null;
  /** Dias desde o último envio. `null` = nunca enviou nada, nunca. */
  diasEmSilencio: number | null;
  /** Recuperações já enviadas por esta loja, desde sempre. */
  enviadasTotal: number;
  /** Recuperações enviadas nos últimos 30 dias. */
  enviadasNaJanela: number;

  /** Carrinhos que AGORA estão dentro da janela cobrável (2 min … 6 h). */
  elegiveisAgora: number;
  /** Carrinhos parados além da validade que nunca receberam uma tentativa. */
  vencidosSemTentativa: number;
  /** Desses, quantos venceram dentro dos últimos 30 dias — a perda recente. */
  vencidosNaJanela: number;

  janelaDias: number;
  validadeHoras: number;
  apuradoEm: string;
}

function dias(ms: number): number {
  return Math.floor(ms / 86_400_000);
}

/**
 * Monta a frase do alerta. Nunca diz "algo falhou": diz o que passou, o que
 * saiu e desde quando — para quem lê decidir sem abrir o banco.
 */
function montarEvidencia(h: Omit<CartRecoveryHealth, "evidencia">): string {
  const desde =
    h.diasEmSilencio === null
      ? "nunca enviou uma recuperação"
      : `sem enviar há ${h.diasEmSilencio} dia(s) (último em ${h.ultimoEnvioEm})`;

  switch (h.veredito) {
    case "DESLIGADA":
      return `Recuperação de carrinho DESLIGADA pelo lojista. Nada é cobrado — ${desde}.`;
    case "SAUDAVEL":
      return (
        `Recuperação de carrinho funcionando: ${h.enviadasNaJanela} mensagem(ns) ` +
        `nos últimos ${h.janelaDias} dias, ${desde}. ` +
        `${h.elegiveisAgora} carrinho(s) na janela cobrável agora.`
      );
    case "OCIOSA":
      return (
        `Recuperação de carrinho ativa e sem envios, mas NÃO houve o que cobrar: ` +
        `nenhum carrinho venceu nos últimos ${h.janelaDias} dias. ` +
        `Está ${desde}. Silêncio por falta de carrinho não é defeito.`
      );
    case "SILENCIOSA":
      return (
        `A campanha "Carrinho abandonado" aparece como ATIVA e ${desde}, ` +
        `enquanto ${h.vencidosNaJanela} carrinho(s) venceram nos últimos ${h.janelaDias} dias ` +
        `sem uma única tentativa (${h.vencidosSemTentativa} no total, prazo de ${h.validadeHoras}h). ` +
        `Agora mesmo há ${h.elegiveisAgora} na janela cobrável. ` +
        `Enquanto isso não fechar, "Ativa" está prometendo o que não acontece.`
      );
  }
}

export class CartRecoveryHealthService {
  /**
   * Saúde da recuperação de carrinho de UM restaurante.
   *
   * @param ativa  o que a tela promete (vem do ReadyMadeCampaignService — o
   *               estado real do interruptor, não um palpite deste serviço).
   */
  static async get(restaurantId: string, ativa: boolean): Promise<CartRecoveryHealth> {
    const agora        = Date.now();
    const inicioJanela = new Date(agora - JANELA_DIAS * 86_400_000);
    const pisoJanela   = new Date(agora - INATIVIDADE_MINUTOS * 60_000);
    const vencimento   = new Date(agora - VALIDADE_HORAS * 3_600_000);

    const doRestaurante = { restaurantId } as const;
    /** Rascunho que UM DIA foi cobrável: aberto, com item. */
    const comItem = { items: { some: {} } } as const;

    const [ultimo, enviadasTotal, enviadasNaJanela, elegiveisAgora, vencidosSemTentativa, vencidosNaJanela] =
      await Promise.all([
        // O carimbo é a única prova de que a mensagem saiu de verdade.
        prisma.orderDraft.findFirst({
          where:   { ...doRestaurante, lastRecoveryAt: { not: null } },
          orderBy: { lastRecoveryAt: "desc" },
          select:  { lastRecoveryAt: true },
        }),
        prisma.orderDraft.count({ where: { ...doRestaurante, recoveryAttempts: { gt: 0 } } }),
        prisma.orderDraft.count({
          where: { ...doRestaurante, lastRecoveryAt: { gte: inicioJanela } },
        }),
        prisma.orderDraft.count({
          where: {
            ...doRestaurante, ...comItem,
            status: "OPEN", recoveryAttempts: 0,
            updatedAt: { lt: pisoJanela, gte: vencimento },
          },
        }),
        prisma.orderDraft.count({
          where: {
            ...doRestaurante, ...comItem,
            status: "OPEN", recoveryAttempts: 0,
            updatedAt: { lt: vencimento },
          },
        }),
        prisma.orderDraft.count({
          where: {
            ...doRestaurante, ...comItem,
            status: "OPEN", recoveryAttempts: 0,
            updatedAt: { lt: vencimento, gte: inicioJanela },
          },
        }),
      ]);

    const ultimoEnvioEm  = ultimo?.lastRecoveryAt?.toISOString() ?? null;
    const diasEmSilencio = ultimo?.lastRecoveryAt
      ? dias(agora - ultimo.lastRecoveryAt.getTime())
      : null;

    // O veredito, na ordem em que as perguntas devem ser feitas.
    //
    // 1. Desligada não é defeito: o lojista escolheu, e a tela mostra "Pausada".
    // 2. Enviou dentro da janela de alarme → está de pé.
    // 3. Calada COM carrinho vencido sem tentativa → é aí que se grita. A prova
    //    da oportunidade tem que existir; senão isto vira alarme que ninguém
    //    investiga, que é o mesmo que não ter alarme.
    // 4. Calada SEM carrinho nenhum → ociosa. Não se infere defeito do silêncio.
    let veredito: VereditoCarrinho;
    if (!ativa) {
      veredito = "DESLIGADA";
    } else if (diasEmSilencio !== null && diasEmSilencio < DIAS_PARA_ALARME) {
      veredito = "SAUDAVEL";
    } else if (vencidosNaJanela > 0) {
      veredito = "SILENCIOSA";
    } else {
      veredito = "OCIOSA";
    }

    const base = {
      restaurantId, ativa, veredito,
      ultimoEnvioEm, diasEmSilencio, enviadasTotal, enviadasNaJanela,
      elegiveisAgora, vencidosSemTentativa, vencidosNaJanela,
      janelaDias: JANELA_DIAS,
      validadeHoras: VALIDADE_HORAS,
      apuradoEm: new Date(agora).toISOString(),
    };

    return { ...base, evidencia: montarEvidencia(base) };
  }

  /** `true` quando o resultado merece aparecer como aviso, não como número. */
  static precisaGritar(h: CartRecoveryHealth): boolean {
    return h.veredito === "SILENCIOSA";
  }

  /**
   * O interruptor REAL do carrinho, com a mesma regra do motor de envio
   * (`OrderDraftRecoverySendService`): a linha de Campanha manda quando existe;
   * na falta dela vale a bandeira antiga, que é ligada por omissão.
   *
   * Duplicar a regra seria pior: duas leituras do mesmo interruptor divergem na
   * primeira refatoração distraída, e aí o alarme julga um estado que o motor
   * não tem.
   */
  static async estaAtiva(restaurantId: string): Promise<boolean> {
    const [row, perfil] = await Promise.all([
      prisma.campaign.findFirst({
        where:   { restaurantId, templateId: "carrinho-abandonado" },
        orderBy: { createdAt: "desc" },
        select:  { status: true },
      }),
      prisma.restaurantCRMProfile.findUnique({
        where:  { restaurantId },
        select: { readyMadeConfig: true },
      }),
    ]);
    if (row) return ["ACTIVE", "SCHEDULED"].includes(row.status);
    return parseReadyMadeConfig(perfil?.readyMadeConfig).cartRecoveryEnabled;
  }

  /**
   * Varredura: as lojas onde carrinho venceu sem tentativa nos últimos 30 dias.
   *
   * É a lista para a qual o alarme existe — quem TEVE o que cobrar. Loja sem
   * carrinho nenhum nunca entra aqui, porque silêncio por falta de carrinho não
   * é defeito e alarme que dispara à toa deixa de ser lido.
   */
  static async varredura(limite = 25): Promise<CartRecoveryHealth[]> {
    const vencimento   = new Date(Date.now() - VALIDADE_HORAS * 3_600_000);
    const inicioJanela = new Date(Date.now() - JANELA_DIAS * 86_400_000);

    const grupos = await prisma.orderDraft.groupBy({
      by:    ["restaurantId"],
      where: {
        status: "OPEN", recoveryAttempts: 0, items: { some: {} },
        updatedAt: { lt: vencimento, gte: inicioJanela },
      },
      _count: { _all: true },
    });

    const ids = grupos
      .sort((a, b) => b._count._all - a._count._all)
      .slice(0, limite)
      .map((g) => g.restaurantId);

    return Promise.all(
      ids.map(async (id) => this.get(id, await this.estaAtiva(id))),
    );
  }
}
