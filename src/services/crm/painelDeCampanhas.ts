/**
 * painelDeCampanhas — o que o painel do restaurante MOSTRA sobre cada campanha.
 *
 * Por que este módulo existe (medido em 24/09/2026): o catálogo tem 16 campanhas
 * prontas, mas o painel só listava as que já tinham virado registro no banco
 * (campanha "instanciada"). Campanha do catálogo que ninguém nunca ligou não
 * existia como linha — e por isso simplesmente não aparecia. O dono do
 * restaurante abria a tela e não via "Cliente frio" em lugar nenhum.
 *
 * A regra que este módulo impõe:
 *
 *   1. TODA campanha do catálogo aparece no painel. Sempre. Sem exceção.
 *   2. Campanha que nunca foi ligada aparece como DISPONÍVEL — não ativada.
 *      ⛔ Não é "ativa", ⛔ não entra na contagem de ativas. São estados
 *      diferentes e não se somam.
 *   3. Campanha que nasce PAUSADA de propósito diz POR QUÊ na própria tela.
 *
 * MOSTRAR ≠ LIGAR. Nada aqui ativa, agenda ou envia coisa alguma: é um módulo
 * puro (sem banco, sem rede), seguro no cliente. Quem liga é o dono, pela tela.
 */

import {
  READY_MADE_CAMPAIGNS,
  getReadyMadeMessageVariants,
  getReadyMadeTiming,
} from "./readyMadeCampaigns";

/** Estado de uma campanha aos olhos do dono do restaurante. */
export type EstadoNoPainel = "ATIVA" | "PAUSADA" | "DISPONIVEL";

/** Rótulo mostrado na tela para cada estado. */
export const ROTULO_DO_ESTADO: Record<EstadoNoPainel, string> = {
  ATIVA:      "Ativa",
  PAUSADA:    "Pausada",
  DISPONIVEL: "Disponível — não ativada",
};

/**
 * Campanhas cuja PAUSA é deliberada — trava de produto, não descuido. O texto é
 * o que a tela mostra ao dono, e existe para que ninguém (humano ou agente)
 * "conserte" a pausa achando que é bug.
 *
 * Fonte da trava do frio: `CRMColdCampaignRestartService` — a campanha de frio
 * nasce PAUSED e nunca envia até um humano ativar explicitamente.
 */
export const PAUSA_DELIBERADA: Record<string, string> = {
  "recuperar-frios":
    "Nasce pausada de propósito. Quem sumiu há muito tempo recebe mensagem errada com facilidade — " +
    "e isso queima a base e vira denúncia no WhatsApp. Confira a mensagem e o cupom antes de ligar. " +
    "Quem liga é você.",
};

/** Motivo da pausa deliberada desta campanha, ou null quando não há trava. */
export function motivoDePausaDeliberada(id: string): string | null {
  return PAUSA_DELIBERADA[id] ?? null;
}

/** Verdadeiro quando a pausa desta campanha é política de produto. */
export function temPausaDeliberada(id: string): boolean {
  return motivoDePausaDeliberada(id) !== null;
}

/** O mínimo que o painel precisa saber sobre a instância de uma campanha. */
export interface InstanciaDeCampanha {
  id:          string;
  active?:     boolean | null;
  campaignId?: string | null;
  status?:     string | null;
}

/** Uma linha do painel — uma por campanha do catálogo, sempre as 16. */
export interface LinhaDoPainel {
  id:          string;
  emoji:       string;
  nome:        string;
  tagline:     string;
  estado:      EstadoNoPainel;
  rotulo:      string;
  /** Id da campanha real no banco, quando já foi instanciada. */
  campaignId:  string | null;
  /** Por que esta campanha está pausada de propósito (null = sem trava). */
  motivoDaPausa: string | null;
  /** Só ATIVA conta no número de "campanhas ativas" do topo. */
  contaComoAtiva: boolean;
}

/**
 * Monta o painel inteiro: uma linha para CADA campanha do catálogo, na ordem do
 * catálogo, com o estado real de cada uma. Campanha sem instância vira
 * DISPONÍVEL — nunca some.
 */
export function montarPainelDeCampanhas(
  instancias: readonly InstanciaDeCampanha[] = [],
): LinhaDoPainel[] {
  const porId = new Map<string, InstanciaDeCampanha>();
  for (const i of instancias) if (i?.id) porId.set(i.id, i);

  return READY_MADE_CAMPAIGNS.map((rm) => {
    const inst = porId.get(rm.id);
    // Sem instância → DISPONÍVEL. Com instância: ligada → ATIVA, senão PAUSADA.
    const estado: EstadoNoPainel = !inst || (!inst.campaignId && !inst.active)
      ? "DISPONIVEL"
      : inst.active
      ? "ATIVA"
      : "PAUSADA";

    return {
      id:             rm.id,
      emoji:          rm.emoji,
      nome:           rm.name,
      tagline:        rm.tagline,
      estado,
      rotulo:         ROTULO_DO_ESTADO[estado],
      campaignId:     inst?.campaignId ?? null,
      motivoDaPausa:  estado === "ATIVA" ? null : motivoDePausaDeliberada(rm.id),
      contaComoAtiva: estado === "ATIVA",
    };
  });
}

/** Quantas campanhas estão de fato rodando. ⛔ Disponíveis NÃO entram. */
export function contarAtivas(painel: readonly LinhaDoPainel[]): number {
  return painel.filter((l) => l.contaComoAtiva).length;
}

/** As campanhas que existem no catálogo e ainda não foram ativadas. */
export function disponiveisNaoAtivadas(painel: readonly LinhaDoPainel[]): LinhaDoPainel[] {
  return painel.filter((l) => l.estado === "DISPONIVEL");
}

/** As campanhas instanciadas porém paradas — aparecem, mas não contam como ativas. */
export function pausadas(painel: readonly LinhaDoPainel[]): LinhaDoPainel[] {
  return painel.filter((l) => l.estado === "PAUSADA");
}

/**
 * O catálogo inteiro no estado DESLIGADO, sem consultar o banco.
 *
 * Rede de segurança da tela: a lista das campanhas prontas dependia de UMA
 * chamada de API. Se ela falhasse, a seção ficava com o título e NENHUM card, e
 * o dono concluía que a campanha não existe. Catálogo é dado estático — ele não
 * pode sumir por causa de uma consulta.
 *
 * ⛔ Tudo sai `active: false` e `campaignId: null`: sem prova de que está ligada,
 * ela NÃO está ligada. Mostrar não é ligar.
 */
export function catalogoComoEstadosDesligados() {
  return READY_MADE_CAMPAIGNS.map((rm) => ({
    id: rm.id, emoji: rm.emoji, name: rm.name, tagline: rm.tagline,
    description: rm.description, objective: rm.objective, engine: rm.engine,
    editable: rm.editable,
    messageVariants: getReadyMadeMessageVariants(rm.id),
    timing: getReadyMadeTiming(rm.id),
    triggerDays: rm.triggerDays,
    triggerDaysLabel: rm.triggerDaysLabel,
    active: false as const,
    status: null,
    campaignId: null,
    message: rm.defaultMessage,
    coupon: rm.defaultCoupon ?? null,
    weekdays: rm.schedule.weekdays,
    timeWindow: rm.schedule.timeWindow,
    dailyLimit: rm.schedule.dailyLimit,
    metaTemplate: null,
  }));
}
