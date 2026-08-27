/**
 * O SCORE DO LEAD — e por que cada ponto tem endereço.
 *
 * ── A EXIGÊNCIA QUE MOLDOU ESTE ARQUIVO ─────────────────────────────────────
 *
 * Item 10 do comando: *"Mostrar os fatores que formaram o score. Não utilizar
 * uma pontuação opaca sem explicação."*
 *
 * Isso muda o desenho inteiro. Um score opaco é uma função que devolve `number`.
 * Este devolve a CONTA: cada fator, o que foi observado, quantos pontos deu, e
 * com que versão da régua. A tela mostra a conta; o gerente discorda de uma
 * linha, não do número.
 *
 * A diferença não é estética. Um número que ninguém consegue contestar é um
 * número que o time aprende a ignorar — e aí o campo existe, aparece na tela, e
 * não muda decisão nenhuma.
 *
 * ── E A REGRA QUE ATRAVESSA A CASA ──────────────────────────────────────────
 *
 * **Ausência de informação não vale ponto — nem para cima, nem para baixo.**
 * Um lead sobre quem não se sabe nada tem score `null`, e não zero. Zero diria
 * "avaliado e não presta"; `null` diz "ninguém perguntou ainda", que é a
 * verdade e é acionável: essa é a fila de quem falta qualificar.
 */

import type { Prisma, PrismaClient, LeadTemperatura } from "@prisma/client";

type Cliente = PrismaClient | Prisma.TransactionClient;

/**
 * A versão da régua.
 *
 * Sobe SEMPRE que um peso mudar. Sem isso, mexer nos pesos reescreveria
 * retroativamente a explicação de scores antigos — a tela mostraria a conta de
 * hoje ao lado de um número calculado ontem, e as duas não fechariam.
 */
export const VERSAO_DA_REGUA = 1;

/** O que se sabe sobre o lead na hora de pontuar. Tudo opcional: a ficha se preenche aos poucos. */
export interface SinaisDoLead {
  /** Quantas casas o restaurante tem. */
  unidades?: number | null;
  /** Pedidos por mês, como a pessoa informou. */
  volumeMensal?: number | null;
  /** Canais que ele usa hoje (whatsapp, ifood, instagram, salao…). */
  canaisAtuais?: string[] | null;
  sistemaAtual?: string | null;
  dorPrincipal?: string | null;
  urgencia?: string | null;
  poderDeDecisao?: string | null;
  faixaDeOrcamento?: string | null;
  /** Quantas mensagens o lead mandou. Engajamento observado, não declarado. */
  mensagensDoLead?: number | null;
  /**
   * Vende comida ou bebida para consumo? `false` desqualifica.
   *
   * ⚠️ **O nome do campo é mais estreito que a regra, e isso já quase custou
   * cliente.** Em 27/08/2026 o CEO corrigiu: *"o Foocci só atende restaurantes,
   * bares e afins"*. Lendo só o nome, um extrator marcaria um **bar** como
   * `false` — e bar é cliente. O universo é: restaurante, bar, boteco, pub,
   * lanchonete, pizzaria, hamburgueria, cafeteria, padaria, açaí, food truck,
   * marmitaria, delivery de comida. Fora: loja, salão, farmácia, oficina.
   *
   * O nome ficou porque é a coluna que já existe no banco e em telas; a
   * definição que vale é esta, e é ela que está escrita na instrução da
   * sondagem. Na dúvida sobre o ramo: `null`, nunca `false`.
   */
  ehRestaurante?: boolean | null;
}

export interface FatorDoScore {
  fator: string;
  observado: string;
  pontos: number;
}

export interface ResultadoDoScore {
  /** `null` quando não há sinal nenhum. Nunca zero por omissão. */
  total: number | null;
  temperatura: LeadTemperatura | null;
  fatores: FatorDoScore[];
  /** O que ainda falta perguntar. É isto que vira a próxima pergunta do TA. */
  lacunas: string[];
  versao: number;
}

const MARKETPLACES = ["ifood", "rappi", "99food", "uber", "aiqfome"];

function temAlgum(lista: string[] | null | undefined, alvos: string[]): boolean {
  if (!lista?.length) return false;
  const normal = lista.map((c) => c.toLowerCase().trim());
  return alvos.some((a) => normal.some((c) => c.includes(a)));
}

function preenchido(v: string | null | undefined): boolean {
  return Boolean(v && v.trim());
}

/**
 * Calcula o score. Função PURA: nada de banco, nada de relógio.
 *
 * Pura porque a mesma régua serve à tela (que precisa mostrar a conta antes de
 * salvar), à rota e ao TA — e porque uma regra de negócio que só é testável com
 * banco em pé acaba não sendo testada.
 */
export function calcularScore(sinais: SinaisDoLead): ResultadoDoScore {
  const fatores: FatorDoScore[] = [];
  const lacunas: string[] = [];

  // ── Desqualificação: não vende comida ───────────────────────────────────────
  // Vem antes de tudo, e é a única regra que encerra a conta. Somar pontos de
  // urgência a quem não é do público seria produzir um lead "quente" que nenhum
  // vendedor deveria tocar.
  //
  // ⚠️ Ver a definição do campo: bar, boteco e padaria são público. Só cai aqui
  // quem NÃO vende comida ou bebida — e a dúvida vale `null`, não `false`.
  if (sinais.ehRestaurante === false) {
    return {
      total: 0,
      temperatura: "DESQUALIFICADO",
      fatores: [{ fator: "publico", observado: "não vende comida nem bebida", pontos: 0 }],
      lacunas: [],
      versao: VERSAO_DA_REGUA,
    };
  }

  // ── Porte ───────────────────────────────────────────────────────────────────
  if (typeof sinais.unidades === "number") {
    const u = sinais.unidades;
    const pontos = u >= 5 ? 20 : u >= 2 ? 14 : 8;
    fatores.push({
      fator: "unidades",
      observado: u === 1 ? "1 unidade" : `${u} unidades`,
      pontos,
    });
  } else {
    lacunas.push("quantas unidades");
  }

  // ── Volume ──────────────────────────────────────────────────────────────────
  if (typeof sinais.volumeMensal === "number") {
    const v = sinais.volumeMensal;
    const pontos = v >= 3000 ? 20 : v >= 1000 ? 15 : v >= 300 ? 9 : 4;
    fatores.push({ fator: "volume", observado: `~${v} pedidos/mês`, pontos });
  } else {
    lacunas.push("volume de pedidos");
  }

  // ── Dependência de marketplace ──────────────────────────────────────────────
  // O maior sinal de compra do produto: quem paga comissão alta sente a dor que
  // a Foocci resolve. Por isso vale mais que porte.
  if (sinais.canaisAtuais?.length) {
    const dependeDeMarketplace = temAlgum(sinais.canaisAtuais, MARKETPLACES);
    const usaWhatsApp = temAlgum(sinais.canaisAtuais, ["whatsapp", "zap"]);

    if (dependeDeMarketplace) {
      // 22, e acima do teto de `unidades` (20), de propósito — este é o único
      // fator que precisa vencer o porte. Um restaurante de uma casa sangrando
      // comissão sente a dor que o produto resolve mais do que uma rede de cinco
      // que não depende de ninguém.
      //
      // O peso já esteve em 18, abaixo de `unidades`, contradizendo este mesmo
      // comentário. Quem pegou foi o teste "vale mais que porte" — a asserção é
      // sobre a RELAÇÃO entre os dois pesos, e não sobre o número, justamente
      // para a régua não poder se contradizer em silêncio de novo.
      fatores.push({
        fator: "marketplace",
        observado: "depende de marketplace",
        pontos: 22,
      });
    }
    if (usaWhatsApp) {
      fatores.push({
        fator: "whatsapp",
        observado: "já vende pelo WhatsApp",
        pontos: 12,
      });
    }
    if (!dependeDeMarketplace && !usaWhatsApp) {
      fatores.push({
        fator: "canais",
        observado: `usa ${sinais.canaisAtuais.join(", ")}`,
        pontos: 4,
      });
    }
  } else {
    lacunas.push("canais que usa hoje");
  }

  // ── Sistema atual ───────────────────────────────────────────────────────────
  if (preenchido(sinais.sistemaAtual)) {
    fatores.push({
      fator: "sistema",
      observado: sinais.sistemaAtual!.trim(),
      pontos: 6,
    });
  } else {
    lacunas.push("que sistema usa");
  }

  // ── Dor declarada ───────────────────────────────────────────────────────────
  if (preenchido(sinais.dorPrincipal)) {
    fatores.push({ fator: "dor", observado: "dor identificada", pontos: 15 });
  } else {
    lacunas.push("qual a dor principal");
  }

  // ── Urgência ────────────────────────────────────────────────────────────────
  if (preenchido(sinais.urgencia)) {
    const u = sinais.urgencia!.toLowerCase();
    const agora = /agora|urgente|imediat|essa semana|este mês|ontem/.test(u);
    fatores.push({
      fator: "urgencia",
      observado: sinais.urgencia!.trim(),
      pontos: agora ? 15 : 6,
    });
  } else {
    lacunas.push("para quando");
  }

  // ── Poder de decisão ────────────────────────────────────────────────────────
  if (preenchido(sinais.poderDeDecisao)) {
    const p = sinais.poderDeDecisao!.toLowerCase();
    const decide = /sou o dono|dono|decido|sócio|proprietár/.test(p);
    fatores.push({
      fator: "decisao",
      observado: sinais.poderDeDecisao!.trim(),
      pontos: decide ? 12 : 5,
    });
  } else {
    lacunas.push("quem decide");
  }

  // ── Orçamento ───────────────────────────────────────────────────────────────
  if (preenchido(sinais.faixaDeOrcamento)) {
    fatores.push({
      fator: "orcamento",
      observado: sinais.faixaDeOrcamento!.trim(),
      pontos: 8,
    });
  }
  // Orçamento NÃO entra em lacunas: perguntar faixa cedo demais queima a
  // conversa, e o comando pede que ele conte "quando informado".

  // ── Engajamento observado ───────────────────────────────────────────────────
  // Não é declarado por ninguém: é contado. Quem escreve várias vezes está
  // interessado, e isso vale mais que qualquer adjetivo na ficha.
  if (typeof sinais.mensagensDoLead === "number" && sinais.mensagensDoLead > 0) {
    const m = sinais.mensagensDoLead;
    const pontos = m >= 10 ? 12 : m >= 4 ? 8 : 3;
    fatores.push({
      fator: "engajamento",
      observado: `${m} mensagem${m > 1 ? "s" : ""} do lead`,
      pontos,
    });
  }

  // ── Fechamento ──────────────────────────────────────────────────────────────
  if (fatores.length === 0) {
    // Nenhum sinal. NÃO é zero: é "ninguém perguntou nada ainda".
    return {
      total: null,
      temperatura: null,
      fatores: [],
      lacunas,
      versao: VERSAO_DA_REGUA,
    };
  }

  const bruto = fatores.reduce((s, f) => s + f.pontos, 0);
  const total = Math.max(0, Math.min(100, bruto));

  return {
    total,
    temperatura: temperaturaDe(total),
    fatores,
    lacunas,
    versao: VERSAO_DA_REGUA,
  };
}

/**
 * A leitura do número.
 *
 * Existe separada porque o gerente conversa em temperatura e a régua conversa em
 * ponto. Trocar a faixa aqui muda a leitura sem mexer no cálculo — e é a mudança
 * que mais se pede depois do primeiro mês de operação.
 */
export function temperaturaDe(total: number): LeadTemperatura {
  if (total >= 80) return "PRIORIDADE_MAXIMA";
  if (total >= 60) return "QUENTE";
  if (total >= 35) return "MORNO";
  return "FRIO";
}

/**
 * Calcula e grava, substituindo a explicação anterior.
 *
 * Apaga os fatores antigos antes de escrever os novos, dentro da mesma
 * transação: manter as duas gerações faria a tela somar 160 pontos numa régua
 * que vai até 100. O histórico do score vive na linha do tempo do lead, não na
 * tabela de fatores.
 */
export async function pontuar(
  db: PrismaClient,
  params: { leadId: string; sinais: SinaisDoLead; agora?: Date },
): Promise<ResultadoDoScore> {
  return db.$transaction((tx) => escreverOScore(tx, params));
}

/**
 * As três escritas do score, SEM abrir transação.
 *
 * ── POR QUE ELA EXISTE SEPARADA ─────────────────────────────────────────────
 *
 * O TA qualifica o lead **dentro** da transação que o webhook já abriu para
 * declarar a identidade ao RLS. Chamar `pontuar` de lá tentaria abrir uma
 * transação dentro de outra, e o Prisma não aninha: quebraria em produção, no
 * meio de um atendimento, e o rastro seria um erro obscuro de driver.
 *
 * A atomicidade não se perde — ela muda de dono. `pontuar` abre a sua; o TA usa
 * a que já está aberta. As três escritas continuam indivisíveis nos dois
 * caminhos.
 */
export async function escreverOScore(
  tx: Cliente,
  params: { leadId: string; sinais: SinaisDoLead; agora?: Date },
): Promise<ResultadoDoScore> {
  const r = calcularScore(params.sinais);
  const agora = params.agora ?? new Date();

  await tx.leadScoreFator.deleteMany({ where: { leadId: params.leadId } });

  if (r.fatores.length) {
    await tx.leadScoreFator.createMany({
      data: r.fatores.map((f) => ({
        leadId: params.leadId,
        fator: f.fator,
        observado: f.observado,
        pontos: f.pontos,
        reguaVersao: r.versao,
      })),
    });
  }

  await tx.siteLead.update({
    where: { id: params.leadId },
    data: {
      score: r.total,
      scoreAt: r.total === null ? null : agora,
      temperatura: r.temperatura,
    },
  });

  return r;
}

/** Lê a explicação gravada, para a tela mostrar a conta. */
export async function explicacaoDoScore(
  db: Cliente,
  leadId: string,
): Promise<FatorDoScore[]> {
  const linhas = await db.leadScoreFator.findMany({
    where: { leadId },
    orderBy: { pontos: "desc" },
    select: { fator: true, observado: true, pontos: true },
  });
  return linhas;
}
