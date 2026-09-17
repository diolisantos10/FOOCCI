/**
 * O PAINEL DO VENDEDOR — o que ele recebe quando assume a conversa.
 *
 * ── A EXIGÊNCIA, PALAVRA POR PALAVRA ────────────────────────────────────────
 *
 * O documento do CEO diz que, quando o humano assume, ele **não recebe conversa
 * zerada**. Recebe: resumo da IA, origem, campanha, produto, necessidade,
 * objeções, lead score, histórico, interações anteriores, o que o Hunter achou,
 * o que o SDR descobriu, decisor, estágio e próxima ação. Catorze itens.
 *
 * A auditoria mediu o que existia: o dossiê do handoff carregava **sete campos**
 * (`handoff.ts` — `Dossie`). Faltavam origem, campanha, produto de interesse,
 * histórico e tudo que a jornada comercial passou a saber (empresa, decisor,
 * oportunidade). Este arquivo junta os catorze num lugar só.
 *
 * ── ⛔ CAMPO SEM DADO É AUSENTE, E ISSO É O CONTRATO ────────────────────────
 *
 * Todo item devolve `null` quando ninguém apurou — e `ausentes` lista quais.
 * Nada aqui escreve "não informado", "—", "0" ou um palpite.
 *
 * A razão é a mesma que faz `SiteLead.score` ser anulável nesta casa: **score
 * zero e score não medido são coisas diferentes**, e escrever zero por omissão
 * esconde a fila inteira de quem ninguém olhou. Um painel que preenche lacuna
 * para "ficar bonito" faz o vendedor parar de perguntar o que ninguém sabe — e
 * ele descobre no meio da ligação, na frente do cliente.
 *
 * A lista `ausentes` existe por isso: ela transforma a falta em INFORMAÇÃO
 * acionável ("ninguém sabe quem decide") em vez de um espaço em branco que se
 * confunde com "não tem".
 *
 * ── ESTE ARQUIVO SÓ LÊ ──────────────────────────────────────────────────────
 *
 * Nenhuma escrita, nenhuma chamada de IA, nenhum efeito. É montagem de leitura
 * — e por ser só leitura pode rodar a cada abertura de conversa sem custo de
 * modelo e sem risco de mexer no lead por engano.
 */

import type { PrismaClient } from "@prisma/client";

type Cliente = PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/** Os catorze itens, na ordem em que o documento os pede. */
export const ITENS_DO_PAINEL = [
  "resumoDaIA",
  "origem",
  "campanha",
  "produto",
  "necessidade",
  "objecoes",
  "leadScore",
  "historico",
  "interacoesAnteriores",
  "oQueOHunterAchou",
  "oQueOSdrDescobriu",
  "decisor",
  "estagio",
  "proximaAcao",
] as const;
export type ItemDoPainel = (typeof ITENS_DO_PAINEL)[number];

export interface DecisorNoPainel {
  nome: string;
  cargo: string | null;
  canal: string | null;
  /** Como se chegou nele. Sem isto, "decisor" é afirmação sem prova. */
  comoFoiDescoberto: string | null;
  confianca: string;
}

export interface FichaDoHunter {
  empresa: string;
  categoria: string | null;
  cidade: string | null;
  estado: string | null;
  unidades: number | null;
  marketplaces: string[];
  /** `null` = ninguém apurou; `false` = apurado e não tem. Ver o schema. */
  deliveryProprio: boolean | null;
  cardapioProprio: boolean | null;
  sistemaIdentificado: string | null;
  scoreIcp: number | null;
  fonteDaDescoberta: string;
  estagio: string;
}

export interface FichaDoSdr {
  segmento: string | null;
  unidades: number | null;
  volumeMensal: number | null;
  canaisAtuais: string[];
  sistemaAtual: string | null;
  urgencia: string | null;
  poderDeDecisao: string | null;
  faixaDeOrcamento: string | null;
}

export interface EventoNoPainel {
  quando: Date;
  titulo: string;
  autor: string;
}

export interface OportunidadeNoPainel {
  id: string;
  estagio: string;
  valorPotencialCents: number | null;
  produtoDeInteresse: string | null;
  probabilidade: number | null;
  previsaoDeFechamento: Date | null;
}

export interface PainelDoVendedor {
  leadId: string;
  nome: string;
  /** O resumo escrito pela IA no último handoff. `null` = nunca houve handoff. */
  resumoDaIA: string | null;
  origem: string | null;
  campanha: string | null;
  produto: string | null;
  necessidade: string | null;
  /** Sempre lista; vazia quer dizer "nenhuma registrada", não "nenhuma existe". */
  objecoes: string[];
  leadScore: { valor: number; temperatura: string | null } | null;
  /** Os movimentos do lead, mais recente primeiro. */
  historico: EventoNoPainel[];
  /** Quantas vezes já se falou com esta pessoa, e quando foi a última. */
  interacoesAnteriores: { total: number; ultimaEm: Date | null } | null;
  oQueOHunterAchou: FichaDoHunter | null;
  oQueOSdrDescobriu: FichaDoSdr | null;
  decisor: DecisorNoPainel | null;
  estagio: string;
  proximaAcao: { quando: Date | null; nota: string | null } | null;
  oportunidade: OportunidadeNoPainel | null;
  /**
   * Quais dos catorze itens ninguém preencheu. É o que transforma o branco da
   * tela em pergunta a fazer.
   */
  ausentes: ItemDoPainel[];
}

/** Quantos eventos de histórico entram. A tela mostra os últimos, não a vida toda. */
export const LIMITE_DO_HISTORICO = 12;

export type ResultadoDoPainel =
  | { ok: true; painel: PainelDoVendedor }
  | { ok: false; causa: "leadNaoExiste" };

/**
 * Monta o painel de uma conversa.
 *
 * As leituras da jornada (`empresa`, `contato`, `oportunidade`) são
 * CONDICIONAIS: um lead que entrou pelo formulário do site não tem empresa
 * descoberta, e isso é normal — não é falha. Ver o comentário do schema em
 * `SiteLead.empresaId`.
 */
export async function montarPainelDoVendedor(
  db: Cliente,
  params: { leadId: string },
): Promise<ResultadoDoPainel> {
  const lead = await db.siteLead.findUnique({
    where: { id: params.leadId },
    select: {
      id: true,
      nome: true,
      stage: true,
      score: true,
      temperatura: true,
      origem: true,
      utmSource: true,
      utmCampaign: true,
      proximaAcaoEm: true,
      proximaAcaoNota: true,
      empresaId: true,
      contatoId: true,
      qualificacao: {
        select: {
          segmento: true,
          unidades: true,
          volumeMensal: true,
          canaisAtuais: true,
          sistemaAtual: true,
          dorPrincipal: true,
          planoDeInteresse: true,
          urgencia: true,
          poderDeDecisao: true,
          faixaDeOrcamento: true,
        },
      },
      empresa: {
        select: {
          nome: true,
          categoria: true,
          cidade: true,
          estado: true,
          numeroDeUnidades: true,
          marketplaces: true,
          deliveryProprio: true,
          cardapioProprio: true,
          sistemaIdentificado: true,
          scoreIcp: true,
          fonteDaDescoberta: true,
          estagio: true,
        },
      },
      contato: {
        select: {
          nome: true,
          cargo: true,
          canal: true,
          ehDecisor: true,
          comoFoiDescoberto: true,
          confianca: true,
        },
      },
    },
  });

  if (!lead) return { ok: false, causa: "leadNaoExiste" };

  // ── O resumo da IA: o do ÚLTIMO handoff que foi PARA gente ─────────────────
  //
  // "Para gente" e não "qualquer um": a devolução para a IA também grava linha,
  // e o objetivo escrito ali é instrução para o robô, não resumo para o
  // vendedor. Pegar o mais recente sem filtrar mostraria a ordem dada ao bot
  // como se fosse o retrato da conversa.
  const ultimoHandoff = await db.leadHandoff.findFirst({
    where: { leadId: lead.id, para: { in: ["HUMANO", "AGUARDANDO_HUMANO"] } },
    orderBy: { createdAt: "desc" },
    select: { resumo: true, dorIdentificada: true, objecoes: true, proximaAcao: true },
  });

  const [interacoes, ultimaInteracao, historicoBruto, oportunidade] = await Promise.all([
    db.siteLeadInteraction.count({ where: { leadId: lead.id } }),
    db.siteLeadInteraction.findFirst({
      where: { leadId: lead.id },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    db.siteLeadInteraction.findMany({
      where: { leadId: lead.id },
      orderBy: { createdAt: "desc" },
      take: LIMITE_DO_HISTORICO,
      select: { createdAt: true, tipo: true, actor: true, nota: true, interna: true },
    }),
    db.oportunidade.findFirst({
      where: { leadId: lead.id },
      orderBy: { criadoEm: "desc" },
      select: {
        id: true,
        estagio: true,
        valorPotencialCents: true,
        produtoDeInteresse: true,
        probabilidade: true,
        previsaoDeFechamento: true,
        objecoes: true,
        dorIdentificada: true,
      },
    }),
  ]);

  const q = lead.qualificacao;

  // ── As objeções, de duas fontes que não se sobrepõem ──────────────────────
  //
  // A oportunidade guarda objeção estruturada (lista); o handoff guarda o texto
  // que a IA escreveu ao passar o bastão. Juntar as duas sem repetir é o que
  // impede o vendedor de ler a mesma objeção duas vezes e achar que são duas.
  const objecoes = semRepetir([
    ...(oportunidade?.objecoes ?? []),
    ...(ultimoHandoff?.objecoes ? [ultimoHandoff.objecoes] : []),
  ]);

  const necessidade =
    q?.dorPrincipal?.trim() ||
    oportunidade?.dorIdentificada?.trim() ||
    ultimoHandoff?.dorIdentificada?.trim() ||
    null;

  const produto =
    q?.planoDeInteresse?.trim() || oportunidade?.produtoDeInteresse?.trim() || null;

  // ⚠️ `utmSource` vem antes de `origem` porque é o dado de MÁQUINA (veio no
  // link) e `origem` é a página, que qualquer redirecionamento embaralha.
  const origem = limpo(lead.utmSource) ?? limpo(lead.origem);

  const painel: PainelDoVendedor = {
    leadId: lead.id,
    nome: lead.nome,
    resumoDaIA: limpo(ultimoHandoff?.resumo),
    origem,
    campanha: limpo(lead.utmCampaign),
    produto,
    necessidade,
    objecoes,
    // Score `null` é "ninguém pontuou". Ver o cabeçalho: não vira zero aqui.
    leadScore: lead.score === null ? null : { valor: lead.score, temperatura: lead.temperatura },
    historico: historicoBruto.map((i) => ({
      quando: i.createdAt,
      titulo: i.nota?.trim() || i.tipo,
      autor: i.actor,
    })),
    interacoesAnteriores: interacoes === 0 ? null : { total: interacoes, ultimaEm: ultimaInteracao?.createdAt ?? null },
    oQueOHunterAchou: lead.empresa
      ? {
          empresa: lead.empresa.nome,
          categoria: lead.empresa.categoria,
          cidade: lead.empresa.cidade,
          estado: lead.empresa.estado,
          unidades: lead.empresa.numeroDeUnidades,
          marketplaces: lead.empresa.marketplaces,
          deliveryProprio: lead.empresa.deliveryProprio,
          cardapioProprio: lead.empresa.cardapioProprio,
          sistemaIdentificado: lead.empresa.sistemaIdentificado,
          scoreIcp: lead.empresa.scoreIcp,
          fonteDaDescoberta: lead.empresa.fonteDaDescoberta,
          estagio: lead.empresa.estagio,
        }
      : null,
    // A ficha do SDR só conta como existente se ALGUM campo foi preenchido —
    // uma linha vazia em `LeadQualificacao` não é descoberta nenhuma, e contá-la
    // faria o item sair da lista de ausentes sem ninguém ter apurado nada.
    oQueOSdrDescobriu: fichaDoSdr(q),
    // ⚠️ Só é decisor quem foi MARCADO decisor. Um contato qualquer da empresa
    // apresentado como "quem decide" manda o vendedor negociar com quem não
    // assina — e isso queima a conta, não só a ligação.
    decisor:
      lead.contato && lead.contato.ehDecisor
        ? {
            nome: lead.contato.nome,
            cargo: lead.contato.cargo,
            canal: lead.contato.canal,
            comoFoiDescoberto: lead.contato.comoFoiDescoberto,
            confianca: lead.contato.confianca,
          }
        : null,
    estagio: lead.stage,
    proximaAcao:
      lead.proximaAcaoEm || lead.proximaAcaoNota
        ? { quando: lead.proximaAcaoEm, nota: limpo(lead.proximaAcaoNota) }
        : limpo(ultimoHandoff?.proximaAcao)
          ? { quando: null, nota: limpo(ultimoHandoff?.proximaAcao) }
          : null,
    oportunidade: oportunidade
      ? {
          id: oportunidade.id,
          estagio: oportunidade.estagio,
          valorPotencialCents: oportunidade.valorPotencialCents,
          produtoDeInteresse: oportunidade.produtoDeInteresse,
          probabilidade: oportunidade.probabilidade,
          previsaoDeFechamento: oportunidade.previsaoDeFechamento,
        }
      : null,
    ausentes: [],
  };

  painel.ausentes = oQueFalta(painel);
  return { ok: true, painel };
}

/**
 * Quais dos catorze itens ninguém preencheu.
 *
 * `estagio` nunca falta (o lead sempre tem etapa) e por isso nunca aparece aqui
 * — declarar ausente o que é obrigatório encheria a lista de ruído e ensinaria
 * a ignorá-la.
 */
export function oQueFalta(p: PainelDoVendedor): ItemDoPainel[] {
  const falta: ItemDoPainel[] = [];
  if (!p.resumoDaIA) falta.push("resumoDaIA");
  if (!p.origem) falta.push("origem");
  if (!p.campanha) falta.push("campanha");
  if (!p.produto) falta.push("produto");
  if (!p.necessidade) falta.push("necessidade");
  if (p.objecoes.length === 0) falta.push("objecoes");
  if (!p.leadScore) falta.push("leadScore");
  if (p.historico.length === 0) falta.push("historico");
  if (!p.interacoesAnteriores) falta.push("interacoesAnteriores");
  if (!p.oQueOHunterAchou) falta.push("oQueOHunterAchou");
  if (!p.oQueOSdrDescobriu) falta.push("oQueOSdrDescobriu");
  if (!p.decisor) falta.push("decisor");
  if (!p.proximaAcao) falta.push("proximaAcao");
  return falta;
}

/** O rótulo que a tela imprime quando um item falta. */
export const ROTULO_DO_ITEM: Record<ItemDoPainel, string> = {
  resumoDaIA: "resumo da IA",
  origem: "origem",
  campanha: "campanha",
  produto: "produto de interesse",
  necessidade: "necessidade",
  objecoes: "objeções",
  leadScore: "lead score",
  historico: "histórico",
  interacoesAnteriores: "interações anteriores",
  oQueOHunterAchou: "ficha da empresa (Hunter)",
  oQueOSdrDescobriu: "qualificação (SDR)",
  decisor: "decisor",
  estagio: "estágio",
  proximaAcao: "próxima ação",
};

function fichaDoSdr(q: {
  segmento: string | null;
  unidades: number | null;
  volumeMensal: number | null;
  canaisAtuais: string[];
  sistemaAtual: string | null;
  urgencia: string | null;
  poderDeDecisao: string | null;
  faixaDeOrcamento: string | null;
} | null | undefined): FichaDoSdr | null {
  if (!q) return null;

  const temAlgo =
    Boolean(limpo(q.segmento)) ||
    q.unidades !== null ||
    q.volumeMensal !== null ||
    q.canaisAtuais.length > 0 ||
    Boolean(limpo(q.sistemaAtual)) ||
    Boolean(limpo(q.urgencia)) ||
    Boolean(limpo(q.poderDeDecisao)) ||
    Boolean(limpo(q.faixaDeOrcamento));

  if (!temAlgo) return null;

  return {
    segmento: limpo(q.segmento),
    unidades: q.unidades,
    volumeMensal: q.volumeMensal,
    canaisAtuais: q.canaisAtuais,
    sistemaAtual: limpo(q.sistemaAtual),
    urgencia: limpo(q.urgencia),
    poderDeDecisao: limpo(q.poderDeDecisao),
    faixaDeOrcamento: limpo(q.faixaDeOrcamento),
  };
}

function limpo(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

function semRepetir(lista: string[]): string[] {
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const bruto of lista) {
    const t = bruto.trim();
    if (!t) continue;
    const chave = t.toLowerCase();
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push(t);
  }
  return saida;
}

/**
 * A conversa em turnos, do jeito que o copiloto lê.
 *
 * ── POR QUE ISTO NÃO MORA NA TELA ───────────────────────────────────────────
 *
 * "O que conta como turno" é regra, e regra tem de ficar perto do teste.
 *
 * ── ⚠️ A NOTA INTERNA NÃO PASSA POR AQUI, E ISSO É SORTE DO DESENHO ────────
 *
 * Nesta casa a nota interna NÃO é uma `LeadMensagem`: ela vira
 * `SiteLeadInteraction` com `interna = true` (ver a rota da conversa). Ou seja,
 * `lead_mensagens` só guarda o que o cliente viu ou veria — e por isso a
 * transcrição que vai ao modelo não pode vazar observação da equipe para dentro
 * de uma sugestão de mensagem.
 *
 * A linha fica escrita porque a garantia é do DESENHO e não deste arquivo: no
 * dia em que alguém acrescentar `interna` a `LeadMensagem`, esta função passa a
 * precisar do filtro, e quem mexer precisa ler isto antes.
 */
export async function lerTurnosParaOCopiloto(
  db: Cliente,
  params: { leadId: string; limite?: number },
): Promise<Array<{ deQuem: "cliente" | "foocci"; texto: string }>> {
  const mensagens = await db.leadMensagem.findMany({
    where: { leadId: params.leadId },
    orderBy: { ocorreuEm: "asc" },
    take: params.limite ?? 60,
    select: { direcao: true, texto: true, legenda: true },
  });

  return mensagens
    .map((m) => ({
      deQuem: (m.direcao === "ENTRADA" ? "cliente" : "foocci") as "cliente" | "foocci",
      texto: (m.texto ?? m.legenda ?? "").trim(),
    }))
    .filter((t) => t.texto.length > 0);
}
