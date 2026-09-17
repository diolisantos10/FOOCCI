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
