/**
 * A TELA DE QUALIFICAÇÃO — o termômetro, e a conta por trás dele.
 *
 * ── POR QUE ESTA LEITURA EXISTE SEPARADA DO `score.ts` ──────────────────────
 *
 * `score.ts` pontua UM lead. Esta leitura responde outra pergunta, que é a da
 * tela: *"como está a base inteira, e o que está movendo esses números?"*
 *
 * ── A REGRA QUE ATRAVESSA O ARQUIVO ─────────────────────────────────────────
 *
 * **Nada aqui é constante escrita à mão.** As faixas de temperatura são LIDAS
 * de `temperaturaDe`, varrendo a régua ponto a ponto; os pesos são lidos da
 * tabela `LeadScoreFator`, que é o que de fato foi somado; as lacunas são
 * contadas na `LeadQualificacao`, que é onde a resposta do lead mora.
 *
 * Uma tabela de faixas digitada na tela seria a mesma informação em dois
 * lugares — e no dia em que alguém mexesse em `temperaturaDe`, a tela seguiria
 * mostrando a régua velha sem nenhum sinal de que divergiu.
 *
 * ── E O QUE ELA SE RECUSA A FAZER ───────────────────────────────────────────
 *
 * Lead sem score entra em `naoClassificados`, e **nunca** em FRIO. Zero diria
 * "avaliado e não presta"; ausência diz "ninguém perguntou ainda" — que é a
 * verdade, e é a única das duas que vira fila de trabalho.
 */

import type { Prisma, PrismaClient, LeadTemperatura } from "@prisma/client";
import { temperaturaDe, VERSAO_DA_REGUA } from "../score";

type Cliente = PrismaClient | Prisma.TransactionClient;

/** As etapas que já saíram do jogo. Contá-las no termômetro inflaria a base. */
export const ETAPAS_ENCERRADAS = ["GANHO", "PERDIDO", "NUTRICAO"] as const;

// ─────────────────────────────────────────────────────────────────────────────
// A RÉGUA, LIDA DO CÓDIGO
// ─────────────────────────────────────────────────────────────────────────────

export interface FaixaDaRegua {
  temperatura: LeadTemperatura;
  /** Menor pontuação que cai nesta leitura. */
  de: number;
  /** Maior pontuação que cai nesta leitura. */
  ate: number;
}

/**
 * As faixas de temperatura, **derivadas** de `temperaturaDe`.
 *
 * Varre 0 a 100 e agrupa os pontos consecutivos que dão a mesma leitura. É mais
 * caro que digitar quatro linhas, e é o ponto: no dia em que alguém mudar o
 * corte de QUENTE de 60 para 65, a tela muda junto, sozinha. Uma constante
 * duplicada aqui mentiria em silêncio a partir desse dia.
 */
export function faixasDaRegua(): FaixaDaRegua[] {
  const faixas: FaixaDaRegua[] = [];

  for (let ponto = 0; ponto <= 100; ponto += 1) {
    const t = temperaturaDe(ponto);
    const ultima = faixas[faixas.length - 1];
    if (ultima && ultima.temperatura === t) ultima.ate = ponto;
    else faixas.push({ temperatura: t, de: ponto, ate: ponto });
  }

  // Da mais quente para a mais fria: é a ordem em que a fila é trabalhada.
  return faixas.reverse();
}

/**
 * O nome do desenho do CEO ↔ o nome que existe no banco.
 *
 * O desenho pede `FRIO → MORNO → QUENTE → PRONTO PARA COMPRAR`. O enum
 * `LeadTemperatura` chama o topo de `PRIORIDADE_MAXIMA`, e tem dois valores a
 * mais que o desenho não previu. Renomear o enum para casar com a imagem
 * quebraria dado gravado; esconder os dois extras faria a soma da tela não
 * bater com a base. Então a tela mostra os dois nomes, lado a lado.
 */
export const COMO_O_DESENHO_CHAMA: Readonly<Partial<Record<LeadTemperatura, string>>> = {
  PRIORIDADE_MAXIMA: "PRONTO PARA COMPRAR",
  QUENTE: "QUENTE",
  MORNO: "MORNO",
  FRIO: "FRIO",
};

// ─────────────────────────────────────────────────────────────────────────────
// O PANORAMA
// ─────────────────────────────────────────────────────────────────────────────

export interface DegrauDoTermometro {
  temperatura: LeadTemperatura;
  /** Como o desenho do CEO chama este degrau. `null` quando ele não o previu. */
  nomeNoDesenho: string | null;
  faixa: FaixaDaRegua | null;
  total: number;
}

export interface FatorMedido {
  fator: string;
  /** Em quantos leads este fator apareceu. */
  leads: number;
  /** Soma dos pontos que ele já deu. */
  pontos: number;
  /** Pontos por lead em que apareceu, arredondado. */
  mediaPorLead: number;
  /** Uma observação de exemplo, como foi gravada. `null` se não houver. */
  exemplo: string | null;
}

export interface LacunaMedida {
  /** A mesma chave que `calcularScore` devolve em `lacunas`. */
  lacuna: string;
  pergunta: string;
  /** Quantos leads em aberto ainda não têm este dado. */
  leads: number;
}

export interface PanoramaDaQualificacao {
  versaoDaRegua: number;
  /** Leads em aberto no escopo de quem perguntou. */
  emAberto: number;
  /**
   * Leads em aberto sem score. **Não é zero, e não é FRIO**: é a fila de quem
   * ninguém qualificou ainda.
   */
  naoClassificados: number;
  termometro: DegrauDoTermometro[];
  faixas: FaixaDaRegua[];
  /** `null` quando nenhum fator foi gravado — e aí a tela diz por quê. */
  fatores: FatorMedido[];
  lacunas: LacunaMedida[];
  /** Por que um número pode vir vazio. A tela repete isto, nunca inventa zero. */
  naoMedido: string[];
}

/** O rótulo da pergunta que fecha cada lacuna. Igual ao texto de `score.ts`. */
const PERGUNTA_DA_LACUNA: Record<string, string> = {
  "quantas unidades": "Quantas casas o restaurante tem?",
  "volume de pedidos": "Quantos pedidos por mês?",
  "canais que usa hoje": "Por onde vende hoje?",
  "que sistema usa": "Que sistema usa hoje?",
  "qual a dor principal": "Qual é a dor principal?",
  "para quando": "Para quando você precisa disso?",
  "quem decide": "Quem decide a contratação?",
};

/**
 * ⭐ O panorama da qualificação, inteiro, no escopo de quem pergunta.
 *
 * O `escopo` é o mesmo `where` das filas: o SDR vê o termômetro DELE. Um
 * termômetro da operação inteira numa tela de SDR entregaria o tamanho da
 * carteira alheia sem que ninguém tivesse pedido.
 */
export async function panoramaDaQualificacao(
  db: Cliente,
  params: { escopo: Prisma.SiteLeadWhereInput },
): Promise<PanoramaDaQualificacao> {
  const emAbertoWhere: Prisma.SiteLeadWhereInput = {
    AND: [params.escopo, { stage: { notIn: [...ETAPAS_ENCERRADAS] } }],
  };

  const [emAberto, porTemperatura, naoClassificados, fatoresBrutos] = await Promise.all([
    db.siteLead.count({ where: emAbertoWhere }),
    db.siteLead.groupBy({
      by: ["temperatura"],
      where: emAbertoWhere,
      _count: { _all: true },
    }),
    db.siteLead.count({ where: { AND: [emAbertoWhere, { score: null }] } }),
    db.leadScoreFator.groupBy({
      by: ["fator"],
      where: { lead: emAbertoWhere, reguaVersao: VERSAO_DA_REGUA },
      _count: { _all: true },
      _sum: { pontos: true },
      orderBy: { _sum: { pontos: "desc" } },
    }),
  ]);

  const contagem = new Map<string, number>();
  for (const linha of porTemperatura) {
    // `temperatura: null` NÃO vira um degrau do termômetro. Ele já é contado em
    // `naoClassificados`, e somá-lo a FRIO é o erro que esta tela existe para
    // não cometer.
    if (linha.temperatura) contagem.set(linha.temperatura, linha._count._all);
  }

  const faixas = faixasDaRegua();
  const faixaDe = new Map(faixas.map((f) => [f.temperatura, f]));

  // Os degraus da régua, mais qualquer temperatura gravada que a régua não
  // produz hoje (DESQUALIFICADO, NUTRICAO). Esconder os extras faria a soma da
  // tela ficar menor que a base, sem explicação.
  const degrausConhecidos = faixas.map((f) => f.temperatura);
  const extras = [...contagem.keys()].filter(
    (t) => !degrausConhecidos.includes(t as LeadTemperatura),
  ) as LeadTemperatura[];

  const termometro: DegrauDoTermometro[] = [...degrausConhecidos, ...extras].map((t) => ({
    temperatura: t,
    nomeNoDesenho: COMO_O_DESENHO_CHAMA[t] ?? null,
    faixa: faixaDe.get(t) ?? null,
    total: contagem.get(t) ?? 0,
  }));

  const fatores: FatorMedido[] = await Promise.all(
    fatoresBrutos.map(async (f) => {
      const leads = f._count._all;
      const pontos = f._sum.pontos ?? 0;
      const amostra = await db.leadScoreFator.findFirst({
        where: { fator: f.fator, lead: emAbertoWhere, reguaVersao: VERSAO_DA_REGUA },
        orderBy: { createdAt: "desc" },
        select: { observado: true },
      });
      return {
        fator: f.fator,
        leads,
        pontos,
        mediaPorLead: leads ? Math.round(pontos / leads) : 0,
        exemplo: amostra?.observado ?? null,
      };
    }),
  );

  const lacunas = await contarLacunas(db, emAbertoWhere);

  const naoMedido: string[] = [];
  if (!fatores.length) {
    naoMedido.push(
      "Nenhum fator de score gravado na régua v" +
        VERSAO_DA_REGUA +
        " para os leads deste escopo — ou ninguém foi pontuado ainda, ou os pontos existentes são de uma régua anterior.",
    );
  }
  if (emAberto === 0) {
    naoMedido.push("Não há lead em aberto no seu escopo — o termômetro fica vazio, e isso não é zero de temperatura.");
  }

  return {
    versaoDaRegua: VERSAO_DA_REGUA,
    emAberto,
    naoClassificados,
    termometro,
    faixas,
    fatores,
    lacunas,
    naoMedido,
  };
}

/**
 * O que ainda falta perguntar, contado na base.
 *
 * ⚠️ A lacuna é "o lead NÃO tem ficha de qualificação **ou** tem e o campo está
 * vazio". Contar só o campo vazio deixaria de fora justamente quem nunca foi
 * sondado — que é a maioria da fila e o motivo desta lista existir.
 *
 * `faixaDeOrcamento` fica fora de propósito: `score.ts` não o põe em `lacunas`,
 * porque perguntar faixa cedo demais queima a conversa.
 */
async function contarLacunas(
  db: Cliente,
  emAbertoWhere: Prisma.SiteLeadWhereInput,
): Promise<LacunaMedida[]> {
  const campos: Array<{ lacuna: string; vazio: Prisma.LeadQualificacaoWhereInput }> = [
    { lacuna: "quantas unidades", vazio: { unidades: null } },
    { lacuna: "volume de pedidos", vazio: { volumeMensal: null } },
    { lacuna: "canais que usa hoje", vazio: { canaisAtuais: { isEmpty: true } } },
    { lacuna: "que sistema usa", vazio: { sistemaAtual: null } },
    { lacuna: "qual a dor principal", vazio: { dorPrincipal: null } },
    { lacuna: "para quando", vazio: { urgencia: null } },
    { lacuna: "quem decide", vazio: { poderDeDecisao: null } },
  ];

  const contagens = await Promise.all(
    campos.map((c) =>
      db.siteLead.count({
        where: {
          AND: [
            emAbertoWhere,
            { OR: [{ qualificacao: { is: null } }, { qualificacao: { is: c.vazio } }] },
          ],
        },
      }),
    ),
  );

  return campos
    .map((c, i) => ({
      lacuna: c.lacuna,
      pergunta: PERGUNTA_DA_LACUNA[c.lacuna] ?? c.lacuna,
      leads: contagens[i] ?? 0,
    }))
    .sort((a, b) => b.leads - a.leads);
}

// ═════════════════════════════════════════════════════════════════════════════
// A MESA DE TRABALHO — a tabela de leads do desenho 06
//
// ── POR QUE ELA PASSOU A EXISTIR ────────────────────────────────────────────
//
// Auditado em 19/09/2026: *"o desenho é uma mesa de trabalho e nós entregamos
// um relatório"*. O painel agregado acima responde "como está a base"; esta
// tabela responde a pergunta de quem trabalha: **qual lead eu pego agora, e o
// que eu já sei dele.**
//
// ── DE ONDE VEM CADA COLUNA DO DESENHO ──────────────────────────────────────
//
//   Nome / Empresa    → SiteLead.nome + SiteLead.restaurante
//   Origem            → SiteLead.fonte (e utmSource quando a fonte é campanha)
//   Produto           → LeadQualificacao.planoDeInteresse
//   Necessidade       → LeadQualificacao.dorPrincipal
//   Urgência          → LeadQualificacao.urgencia
//   Orçamento         → LeadQualificacao.faixaDeOrcamento
//   Objeções          → LeadQualificacao.objecoes (e as da Oportunidade)
//   Valor Potencial   → Oportunidade.valorPotencialCents  ⚠️ só existe se houver
//   Prob. de Compra   → Oportunidade.probabilidade        ⚠️ oportunidade aberta
//   Score / pílula    → SiteLead.score + SiteLead.temperatura
//   Stage             → SiteLead.stage (o seletor da linha move de verdade)
//
// ⛔ **Nenhuma destas colunas ganha valor por dedução.** Ausente é `null`, a
// tela escreve o motivo, e nada aqui vira zero, "—" mudo ou média da base.
// ═════════════════════════════════════════════════════════════════════════════

/** Uma linha da mesa de trabalho. Todo campo que pode faltar é `null`. */
export interface LinhaDaMesa {
  id: string;
  nome: string;
  /** A casa da pessoa. `null` = ninguém registrou o restaurante. */
  empresa: string | null;
  /** Porta de entrada (`fonte`). Sempre existe: é enum com padrão. */
  origem: string;
  /** A peça de campanha, quando a origem veio de anúncio. */
  origemDetalhe: string | null;
  produto: string | null;
  necessidade: string | null;
  urgencia: string | null;
  faixaDeOrcamento: string | null;
  objecoes: string[];
  /** Em centavos. `null` = não há oportunidade, ou ninguém estimou. */
  valorPotencialCents: number | null;
  /** 0 a 100. `null` = não há oportunidade, ou ninguém estimou. */
  probabilidade: number | null;
  /** Por que valor e probabilidade estão vazios, quando estão. */
  porqueSemOportunidade: string | null;
  score: number | null;
  temperatura: string | null;
  /** Como o desenho chama a temperatura. `null` quando ele não a previu. */
  temperaturaNoDesenho: string | null;
  stage: string;
  stageDesde: string;
  criadoEm: string;
}

export interface FiltrosDaMesa {
  busca?: string | null;
  origem?: string | null;
  produto?: string | null;
  temperatura?: string | null;
  stage?: string | null;
  pagina?: number;
  porPagina?: number;
}

/** O que os quatro seletores do desenho oferecem — lido da base, não digitado. */
export interface OpcoesDosFiltros {
  origens: string[];
  produtos: string[];
  temperaturas: string[];
  stages: string[];
}

export interface MesaDeTrabalho {
  linhas: LinhaDaMesa[];
  total: number;
  pagina: number;
  porPagina: number;
  paginas: number;
  opcoes: OpcoesDosFiltros;
  /** Por que uma coluna inteira pode estar vazia. A tela repete, não inventa. */
  naoMedido: string[];
}

const POR_PAGINA_PADRAO = 10;
const POR_PAGINA_TETO = 100;

/** A busca do desenho: nome, empresa, produto. Nada de varredura em texto livre. */
function recorteDaBusca(termo: string): Prisma.SiteLeadWhereInput {
  const t = termo.trim();
  return {
    OR: [
      { nome: { contains: t, mode: "insensitive" } },
      { restaurante: { contains: t, mode: "insensitive" } },
      { qualificacao: { is: { planoDeInteresse: { contains: t, mode: "insensitive" } } } },
    ],
  };
}

/**
 * ⭐ A MESA DE TRABALHO, paginada, no escopo de quem pergunta.
 *
 * ⚠️ O escopo é o MESMO das filas e do termômetro. Uma tabela de leads que
 * ignorasse o escopo entregaria a carteira alheia a qualquer SDR autenticado —
 * e é exatamente por uma tabela que isso vazaria primeiro, porque ela mostra
 * nome, telefone da casa e valor do negócio numa linha só.
 */
export async function mesaDaQualificacao(
  db: Cliente,
  params: { escopo: Prisma.SiteLeadWhereInput; filtro?: FiltrosDaMesa },
): Promise<MesaDeTrabalho> {
  const f = params.filtro ?? {};
  const porPagina = Math.min(Math.max(f.porPagina ?? POR_PAGINA_PADRAO, 1), POR_PAGINA_TETO);
  const pagina = Math.max(f.pagina ?? 1, 1);

  const where: Prisma.SiteLeadWhereInput = {
    AND: [
      params.escopo,
      { stage: { notIn: [...ETAPAS_ENCERRADAS] } },
      f.busca?.trim() ? recorteDaBusca(f.busca) : {},
      f.origem ? { fonte: f.origem as never } : {},
      f.temperatura ? { temperatura: f.temperatura as never } : {},
      f.stage ? { stage: f.stage as never } : {},
      f.produto ? { qualificacao: { is: { planoDeInteresse: f.produto } } } : {},
    ],
  };

  const total = await db.siteLead.count({ where });
  const paginas = Math.max(Math.ceil(total / porPagina), 1);
  // Filtro apertado depois da página 3 não pode devolver tela em branco sem
  // explicação: a página é presa ao último intervalo que ainda tem linha.
  const paginaReal = Math.min(pagina, paginas);

  const leads = await db.siteLead.findMany({
    where,
    // A ordem da mesa é a ordem do trabalho: o mais quente primeiro, e quem
    // ninguém pontuou vai para o fim — ele é fila de qualificação, não de venda.
    orderBy: [{ score: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    skip: (paginaReal - 1) * porPagina,
    take: porPagina,
    select: {
      id: true, nome: true, restaurante: true, fonte: true, utmCampaign: true,
      utmSource: true, score: true, temperatura: true, stage: true,
      stageChangedAt: true, createdAt: true,
      qualificacao: {
        select: {
          planoDeInteresse: true, dorPrincipal: true, urgencia: true,
          faixaDeOrcamento: true, objecoes: true,
        },
      },
    },
  });

  const oportunidadePor = new Map<
    string,
    { valorPotencialCents: number | null; probabilidade: number | null; objecoes: string[] }
  >();

  if (leads.length > 0) {
    // Uma consulta para todas as linhas, e não uma por linha: dez linhas na
    // tela não podem custar onze idas ao banco.
    const oportunidades = await db.oportunidade.findMany({
      where: { leadId: { in: leads.map((l) => l.id) }, estagio: { notIn: ["GANHA", "PERDIDA"] } },
      orderBy: { criadoEm: "desc" },
      select: {
        leadId: true, valorPotencialCents: true, probabilidade: true, objecoes: true,
      },
    });
    for (const o of oportunidades) {
      if (!o.leadId || oportunidadePor.has(o.leadId)) continue;
      oportunidadePor.set(o.leadId, {
        valorPotencialCents: o.valorPotencialCents,
        probabilidade: o.probabilidade,
        objecoes: o.objecoes ?? [],
      });
    }
  }

  const linhas: LinhaDaMesa[] = leads.map((l) => {
    const q = l.qualificacao;
    const op = oportunidadePor.get(l.id) ?? null;
    const objecoes = [...new Set([...(q?.objecoes ?? []), ...(op?.objecoes ?? [])])];

    return {
      id: l.id,
      nome: l.nome,
      empresa: l.restaurante,
      origem: String(l.fonte),
      origemDetalhe: l.utmCampaign ?? l.utmSource ?? null,
      produto: q?.planoDeInteresse ?? null,
      necessidade: q?.dorPrincipal ?? null,
      urgencia: q?.urgencia ?? null,
      faixaDeOrcamento: q?.faixaDeOrcamento ?? null,
      objecoes,
      valorPotencialCents: op?.valorPotencialCents ?? null,
      probabilidade: op?.probabilidade ?? null,
      porqueSemOportunidade: op
        ? null
        : "nenhuma oportunidade aberta — valor e probabilidade moram nela, e ninguém abriu o negócio ainda",
      score: l.score,
      temperatura: l.temperatura,
      temperaturaNoDesenho: l.temperatura
        ? (COMO_O_DESENHO_CHAMA[l.temperatura] ?? null)
        : null,
      stage: String(l.stage),
      stageDesde: l.stageChangedAt.toISOString(),
      criadoEm: l.createdAt.toISOString(),
    };
  });

  const opcoes = await opcoesDosFiltros(db, params.escopo);

  const naoMedido: string[] = [];
  if (linhas.length > 0 && linhas.every((l) => l.valorPotencialCents === null)) {
    naoMedido.push(
      "Nenhuma linha desta página tem Valor Potencial: ele mora na Oportunidade da jornada comercial, e nenhum destes leads tem negócio aberto. A coluna fica, vazia e com o motivo — número inventado aqui viraria previsão de receita falsa.",
    );
  }
  if (linhas.length > 0 && linhas.every((l) => l.objecoes.length === 0)) {
    naoMedido.push(
      "Nenhuma objeção registrada nesta página. Objeção é o que o lead disse, e ninguém gravou — não é ausência de objeção.",
    );
  }

  return { linhas, total, pagina: paginaReal, porPagina, paginas, opcoes, naoMedido };
}

/**
 * O que cada seletor oferece, **lido da base dentro do escopo**.
 *
 * Uma lista digitada aqui ofereceria filtro para valor que não existe em lead
 * nenhum — e filtro que sempre devolve vazio ensina a operação a achar que a
 * base secou.
 */
export async function opcoesDosFiltros(
  db: Cliente,
  escopo: Prisma.SiteLeadWhereInput,
): Promise<OpcoesDosFiltros> {
  const emAberto: Prisma.SiteLeadWhereInput = {
    AND: [escopo, { stage: { notIn: [...ETAPAS_ENCERRADAS] } }],
  };

  const [origens, temperaturas, stages, produtos] = await Promise.all([
    db.siteLead.groupBy({ by: ["fonte"], where: emAberto }),
    db.siteLead.groupBy({ by: ["temperatura"], where: emAberto }),
    db.siteLead.groupBy({ by: ["stage"], where: emAberto }),
    db.leadQualificacao.groupBy({
      by: ["planoDeInteresse"],
      where: { lead: emAberto, planoDeInteresse: { not: null } },
    }),
  ]);

  return {
    origens: origens.map((o) => String(o.fonte)).sort(),
    temperaturas: temperaturas
      .map((t) => t.temperatura)
      .filter((t): t is NonNullable<typeof t> => Boolean(t))
      .map(String)
      .sort(),
    stages: stages.map((s) => String(s.stage)).sort(),
    produtos: produtos
      .map((p) => p.planoDeInteresse)
      .filter((p): p is string => Boolean(p))
      .sort(),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// A CONVERSÃO POR SCORE — o gráfico de barras do rodapé do desenho
// ═════════════════════════════════════════════════════════════════════════════

export interface ConversaoPorTemperatura {
  temperatura: string;
  nomeNoDesenho: string | null;
  /** Leads que JÁ tiveram desfecho nesta temperatura (ganhos + perdidos). */
  decididos: number;
  ganhos: number;
  /** `null` quando ninguém decidiu ainda nesta faixa — e isso NÃO é 0%. */
  taxa: number | null;
  /** Por que a taxa é nula, quando é. */
  porque: string | null;
}

/**
 * A taxa de conversão de cada degrau — medida, não estimada.
 *
 * ⚠️ O denominador é **quem já teve desfecho**, não a base inteira. Dividir os
 * ganhos pelo total incluiria no denominador todo lead que ainda está em
 * negociação — e uma base crescendo faria a conversão *cair* sem que ninguém
 * tivesse vendido menos. É o erro que faz painel de vendas perder a confiança.
 *
 * Faixa sem nenhum desfecho devolve `taxa: null` com o motivo. Zero por cento
 * diria "tentamos e não vendemos"; nulo diz "ainda não deu tempo".
 */
export async function conversaoPorScore(
  db: Cliente,
  params: { escopo: Prisma.SiteLeadWhereInput },
): Promise<ConversaoPorTemperatura[]> {
  const decidido: Prisma.SiteLeadWhereInput = {
    AND: [params.escopo, { stage: { in: ["GANHO", "PERDIDO"] } }],
  };

  const [decididos, ganhos] = await Promise.all([
    db.siteLead.groupBy({ by: ["temperatura"], where: decidido, _count: { _all: true } }),
    db.siteLead.groupBy({
      by: ["temperatura"],
      where: { AND: [params.escopo, { stage: "GANHO" }] },
      _count: { _all: true },
    }),
  ]);

  const totalPor = new Map<string, number>();
  for (const d of decididos) if (d.temperatura) totalPor.set(d.temperatura, d._count._all);
  const ganhoPor = new Map<string, number>();
  for (const g of ganhos) if (g.temperatura) ganhoPor.set(g.temperatura, g._count._all);

  return faixasDaRegua().map((faixa) => {
    const t = faixa.temperatura;
    const dec = totalPor.get(t) ?? 0;
    const gan = ganhoPor.get(t) ?? 0;
    return {
      temperatura: String(t),
      nomeNoDesenho: COMO_O_DESENHO_CHAMA[t] ?? null,
      decididos: dec,
      ganhos: gan,
      taxa: dec === 0 ? null : Math.round((gan / dec) * 100),
      porque:
        dec === 0
          ? "nenhum lead desta faixa chegou a GANHO ou PERDIDO ainda — sem desfecho não há taxa, e 0% diria que tentamos e não vendemos"
          : null,
    };
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// A TELA INTEIRA — o painel, a mesa e a conversão, numa leitura só
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Tudo o que a peça 06 do desenho mostra.
 *
 * Existe como tipo próprio, e não como campos novos em `PanoramaDaQualificacao`,
 * porque o panorama responde "como está a base" e é lido por quem não desenha
 * tabela nenhuma. Juntar os dois obrigaria toda leitura do termômetro a pagar a
 * paginação da mesa.
 */
export interface TelaDaQualificacao extends PanoramaDaQualificacao {
  mesa: MesaDeTrabalho;
  conversao: ConversaoPorTemperatura[];
}

export async function telaDaQualificacao(
  db: Cliente,
  params: { escopo: Prisma.SiteLeadWhereInput; filtro?: FiltrosDaMesa },
): Promise<TelaDaQualificacao> {
  const [panorama, mesa, conversao] = await Promise.all([
    panoramaDaQualificacao(db, { escopo: params.escopo }),
    mesaDaQualificacao(db, { escopo: params.escopo, filtro: params.filtro }),
    conversaoPorScore(db, { escopo: params.escopo }),
  ]);

  return { ...panorama, mesa, conversao };
}
