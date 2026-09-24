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

// ─────────────────────────────────────────────────────────────────────────────
// A TELA ÚNICA — uma tabela só, uma fonte de verdade só.
//
// Medido em 24/09/2026, na captura do dono: a tela tinha DOIS blocos que se
// contradiziam. Em cima, "Campanhas ativas" com 11 linhas, montada a partir das
// linhas de campanha do banco. Embaixo, o catálogo com um liga/desliga, montado
// a partir do estado do catálogo. "Cliente morno" aparecia `Ligada` embaixo e
// NÃO aparecia em cima.
//
// ⛔ Dois números discordando na mesma tela é o pior defeito possível: o leitor
// deixa de confiar nos dois. Por isso a tela passa a ter UMA lista, montada
// aqui, e a contagem do topo é a contagem DESTA lista — não pode divergir do que
// está desenhado, porque é o mesmo array.
//
// A regra, em uma frase: CAMPANHA LIGADA APARECE NA TABELA, COM OS DADOS.
// E a que resolvia o bloco de baixo não se perde: a DESLIGADA também aparece,
// marcada como desligada e com o caminho de ligar.
//
// ⛔ MOSTRAR NÃO É LIGAR. Este módulo é puro: não ativa, não agenda, não envia.
// ─────────────────────────────────────────────────────────────────────────────

/** Status de linha de campanha que significam LIGADA. Definição única da tela. */
export const STATUS_LIGADA = ["ACTIVE", "SCHEDULED", "SENDING"] as const;

/** Status que mantêm uma campanha personalizada na tela (ligada ou pausada). */
export const STATUS_NA_TELA = ["ACTIVE", "SCHEDULED", "SENDING", "PAUSED"] as const;

/** Verdadeiro quando este status significa "está rodando". */
export function estaLigada(status: string | null | undefined): boolean {
  return !!status && (STATUS_LIGADA as readonly string[]).includes(status);
}

/** Estado de uma campanha na tabela única. */
export type EstadoNaTela = "ATIVA" | "PAUSADA" | "DESLIGADA";

export const ROTULO_NA_TELA: Record<EstadoNaTela, string> = {
  ATIVA:     "Ativa",
  PAUSADA:   "Pausada",
  DESLIGADA: "Desligada",
};

/** O estado do catálogo para este restaurante (vem de /api/crm/ready-made). */
export interface EstadoDoCatalogo {
  id:          string;
  active?:     boolean | null;
  campaignId?: string | null;
  status?:     string | null;
}

/** O mínimo de uma linha de campanha do banco. */
export interface CampanhaDoBanco {
  id:          string;
  name?:       string | null;
  templateId?: string | null;
  status:      string;
}

/**
 * ⛔ Quando não há dado, a tela diz o que é verdade — não mostra zero.
 * Zero é uma afirmação sobre o mundo ("enviou 0 mensagens"); ausência de dado
 * não é zero. Estes são os textos honestos.
 */
export const SEM_DADOS = {
  NUNCA_RODOU:  "ainda não rodou",
  SEM_REGISTRO: "sem registro no período",
  POR_NATUREZA: "dispara no abandono — sem números por campanha",
} as const;

/** Uma linha da tabela única. */
export interface CampanhaNaTela {
  /** Chave estável de render. */
  chave:         string;
  /** Id no catálogo quando é campanha pronta; null quando é personalizada. */
  catalogoId:    string | null;
  /** Id da linha de campanha no banco, quando já existe. */
  campaignId:    string | null;
  emoji:         string;
  nome:          string;
  tagline:       string;
  /** Fixa = do catálogo. Personalizada = criada pelo dono. */
  fixa:          boolean;
  estado:        EstadoNaTela;
  rotulo:        string;
  ligada:        boolean;
  /** Por que esta campanha está pausada de propósito (null = sem trava). */
  motivoDaPausa: string | null;
  /** Há linha de campanha carregada com os números desta campanha? */
  temDados:      boolean;
  /** O que a tela escreve no lugar dos números quando não há dado. */
  avisoSemDados: string | null;
}

const PESO_DO_ESTADO: Record<EstadoNaTela, number> = { ATIVA: 0, PAUSADA: 1, DESLIGADA: 2 };

/**
 * Monta a tabela única: TODAS as campanhas do catálogo (as 16), mais toda
 * campanha personalizada que esteja na tela — ligadas primeiro, com os dados;
 * desligadas depois, marcadas como desligadas.
 *
 * ⛔ Nenhuma campanha ligada pode ficar de fora, e nenhuma desligada pode sumir.
 */
export function montarCampanhasDaTela(
  catalogo:  readonly EstadoDoCatalogo[] = [],
  campanhas: readonly CampanhaDoBanco[]  = [],
): CampanhaNaTela[] {
  const estadoPorId = new Map<string, EstadoDoCatalogo>();
  for (const e of catalogo) if (e?.id) estadoPorId.set(e.id, e);

  const linhaPorId = new Map<string, CampanhaDoBanco>();
  for (const c of campanhas) if (c?.id) linhaPorId.set(c.id, c);

  // Linha do banco por template do catálogo — a primeira serve (a lista já vem
  // da mais recente para a mais antiga).
  const linhaPorTemplate = new Map<string, CampanhaDoBanco>();
  for (const c of campanhas) {
    if (c?.templateId && !linhaPorTemplate.has(c.templateId)) linhaPorTemplate.set(c.templateId, c);
  }

  const usadas = new Set<string>();

  const doCatalogo: CampanhaNaTela[] = READY_MADE_CAMPAIGNS.map((rm) => {
    const estado = estadoPorId.get(rm.id);
    const linha  = linhaPorTemplate.get(rm.id)
      ?? (estado?.campaignId ? linhaPorId.get(estado.campaignId) : undefined)
      ?? null;
    if (linha) usadas.add(linha.id);

    const campaignId = linha?.id ?? estado?.campaignId ?? null;
    // Havendo linha do banco, ELA é a verdade; sem linha, vale o catálogo.
    const ligada = linha ? estaLigada(linha.status) : estado?.active === true;
    const naTela: EstadoNaTela = ligada ? "ATIVA" : campaignId ? "PAUSADA" : "DESLIGADA";

    const avisoSemDados = linha
      ? null
      : rm.engine === "CART_RECOVERY"
      ? SEM_DADOS.POR_NATUREZA
      : campaignId
      ? SEM_DADOS.SEM_REGISTRO
      : SEM_DADOS.NUNCA_RODOU;

    return {
      chave:         `catalogo:${rm.id}`,
      catalogoId:    rm.id,
      campaignId,
      emoji:         rm.emoji,
      nome:          rm.name,
      tagline:       rm.tagline,
      fixa:          true,
      estado:        naTela,
      rotulo:        ROTULO_NA_TELA[naTela],
      ligada,
      motivoDaPausa: ligada ? null : motivoDePausaDeliberada(rm.id),
      temDados:      !!linha,
      avisoSemDados,
    };
  });

  const doCatalogoIds = new Set(READY_MADE_CAMPAIGNS.map((c) => c.id));

  const personalizadas: CampanhaNaTela[] = campanhas
    .filter((c) => c && !usadas.has(c.id))
    .filter((c) => !c.templateId || !doCatalogoIds.has(c.templateId))
    .filter((c) => (STATUS_NA_TELA as readonly string[]).includes(c.status))
    .map((c) => {
      const ligada = estaLigada(c.status);
      const naTela: EstadoNaTela = ligada ? "ATIVA" : "PAUSADA";
      return {
        chave:         `banco:${c.id}`,
        catalogoId:    null,
        campaignId:    c.id,
        emoji:         "",
        nome:          c.name?.trim() || "Campanha sem nome",
        tagline:       "",
        fixa:          false,
        estado:        naTela,
        rotulo:        ROTULO_NA_TELA[naTela],
        ligada,
        motivoDaPausa: null,
        temDados:      true,
        avisoSemDados: null,
      };
    });

  // Ligadas primeiro, pausadas depois, desligadas por último — estável dentro de
  // cada grupo (ordem do catálogo, e as personalizadas na ordem que vieram).
  return [...doCatalogo, ...personalizadas]
    .map((l, i) => ({ l, i }))
    .sort((a, b) => PESO_DO_ESTADO[a.l.estado] - PESO_DO_ESTADO[b.l.estado] || a.i - b.i)
    .map(({ l }) => l);
}

/** Quantas campanhas a tela mostra como LIGADAS. Mesma lista que está desenhada. */
export function contarLigadas(linhas: readonly CampanhaNaTela[]): number {
  return linhas.filter((l) => l.ligada).length;
}

/** Quantas estão desligadas (nunca ligadas) ou pausadas — o resto da tela. */
export function contarDesligadas(linhas: readonly CampanhaNaTela[]): number {
  return linhas.filter((l) => !l.ligada).length;
}
