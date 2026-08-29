/**
 * O GASTO QUE NENHUMA API ENTREGA — a segunda metade da conta.
 *
 * ── POR QUE ESTA TABELA PRECISA EXISTIR ─────────────────────────────────────
 *
 * O gasto de IA está medido: cada chamada deixa modelo e tokens em
 * `AIInteractionLog`, e `gastoDiario.ts` faz a conta a partir disso. Mas a
 * empresa gasta muito mais do que IA, e o resto **não tem endpoint**:
 *
 *   · a hospedagem da Railway, que chega por fatura mensal;
 *   · o WhatsApp da Meta, cobrado por conversa iniciada;
 *   · o domínio, cobrado por ano;
 *   · cada ferramenta assinada, cada imposto.
 *
 * Enquanto isso ficar de fora, "quanto a empresa gastou ontem" tem uma resposta
 * que parece completa e está errada por baixo — que é pior que não ter resposta.
 *
 * ── ⚠️ UM DIA SEM LANÇAMENTO NÃO É UM DIA SEM GASTO ─────────────────────────
 *
 * Esta é a armadilha central do arquivo, e ela é diferente da do gasto de IA.
 * Lá, um dia sem linha significa mesmo que nenhuma chamada foi feita. Aqui não:
 * a Railway cobra por mês e o domínio por ano, então a imensa maioria dos dias
 * não tem lançamento nenhum — e nenhum deles é um dia de gasto zero.
 *
 * Por isso o estado de um dia sem linha é `SEM_LANCAMENTO`, e nunca um total de
 * zero centavos. A tela é obrigada a escrever "nenhum lançamento neste dia".
 *
 * ── ⚠️ MOEDAS NÃO SE SOMAM ──────────────────────────────────────────────────
 *
 * A IA é cobrada em dólar; a hospedagem, em real. Converter exigiria uma cotação
 * que este repositório não tem, e fixar uma taxa no código produziria um total
 * que não bate com fatura nenhuma. Então a soma é SEMPRE por moeda, e o tipo
 * `SomaDeGastoManual` não tem campo para um total único — a proibição está na
 * forma do dado, não num recado.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { diaEmSaoPaulo, diasDaFaixa, ehDiaValido, meiaNoiteUtc } from "./dia";
import { valorEscrito } from "./valor";

type Cliente = PrismaClient | Prisma.TransactionClient;

// ─────────────────────────────────────────────────────────────────────────────
// A LISTA FECHADA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * As categorias que um gasto pode ter.
 *
 * ⚠️ Esta lista é repetida como CHECK em
 * `prisma/migrations/20260829120000_gasto_manual/migration.sql`, e um teste lê
 * os dois arquivos e reprova se divergirem. Acrescentar categoria aqui sem
 * acrescentar lá faz a tela oferecer uma opção que o banco recusa — e o erro
 * chega ao CEO como "não consegui lançar", sem dizer por quê.
 *
 * Curta de propósito. Uma lista longa vira um seletor que ninguém lê, e todo
 * mundo escolhe o primeiro item.
 */
export const CATEGORIAS_DE_GASTO = [
  { valor: "hospedagem", rotulo: "Hospedagem e infraestrutura (Railway, banco)" },
  { valor: "ia", rotulo: "Crédito de inteligência artificial (recarga, fatura)" },
  { valor: "mensageria", rotulo: "Mensageria (Meta/WhatsApp, SMS)" },
  { valor: "dominio", rotulo: "Domínio e certificado" },
  { valor: "ferramenta", rotulo: "Ferramenta ou assinatura" },
  { valor: "imposto", rotulo: "Imposto, taxa ou tarifa bancária" },
  { valor: "outro", rotulo: "Outro — descreva com precisão" },
] as const;

export type CategoriaDeGasto = (typeof CATEGORIAS_DE_GASTO)[number]["valor"];

const VALORES_DE_CATEGORIA: ReadonlySet<string> = new Set(
  CATEGORIAS_DE_GASTO.map((c) => c.valor),
);

export function ehCategoriaValida(v: unknown): v is CategoriaDeGasto {
  return typeof v === "string" && VALORES_DE_CATEGORIA.has(v);
}

/**
 * As moedas em que a empresa é cobrada hoje.
 *
 * Fechada porque cada moeda precisa de uma decisão de apresentação. Uma terceira
 * entrando sozinha viraria um número sem legenda na tela — e número sem legenda
 * é lido como real.
 */
export const MOEDAS_DE_GASTO = [
  { valor: "BRL", rotulo: "Real (R$)" },
  { valor: "USD", rotulo: "Dólar (US$)" },
] as const;

export type MoedaDeGasto = (typeof MOEDAS_DE_GASTO)[number]["valor"];

const VALORES_DE_MOEDA: ReadonlySet<string> = new Set(MOEDAS_DE_GASTO.map((m) => m.valor));

export function ehMoedaValida(v: unknown): v is MoedaDeGasto {
  return typeof v === "string" && VALORES_DE_MOEDA.has(v);
}

// ─────────────────────────────────────────────────────────────────────────────
// O PEDIDO E SUAS RECUSAS
// ─────────────────────────────────────────────────────────────────────────────

export interface PedidoDeGastoManual {
  descricao?: unknown;
  categoria?: unknown;
  fornecedor?: unknown;
  /** Centavos INTEIROS. Nunca reais, nunca float. */
  valorCent?: unknown;
  moeda?: unknown;
  /** `YYYY-MM-DD` — o dia a que o gasto pertence. */
  competencia?: unknown;
  /** `YYYY-MM-DD` ou nulo. Nulo = ainda não pagou. */
  pagoEm?: unknown;
  recorrente?: unknown;
  /** Quem lançou. Vem da SESSÃO, nunca do corpo do pedido. */
  criadoPor?: unknown;
}

export type RecusaDoGasto =
  | "semDescricao"
  | "categoriaInvalida"
  | "outroSemDescricaoEspecifica"
  | "moedaInvalida"
  | "valorNaoEhNumero"
  | "valorFracionado"
  | "valorNegativo"
  | "semCompetencia"
  | "competenciaNoFuturo"
  | "pagamentoNoFuturo"
  | "semAutor";

/** Descrição de um caractere não é descrição — é o mesmo que campo em branco. */
const MINIMO_DA_DESCRICAO = 3;

/**
 * ── ⚠️ POR QUE "OUTRO" EXIGE MAIS QUE UMA DESCRIÇÃO PREENCHIDA ──────────────
 *
 * Toda categoria já exige descrição. Se "outro" exigisse só isso, ele não
 * exigiria nada a mais que as outras — e "outro" é justamente a escolha de quem
 * tem pressa. Uma linha `categoria: outro, descrição: "outros"` entra na conta,
 * aparece no total e não responde a nenhuma pergunta seis meses depois.
 *
 * Então, em "outro", a descrição precisa **nomear a coisa**: um punhado de
 * caracteres e nenhuma das palavras que só repetem "não classifiquei".
 *
 * O piso de caracteres é uma escolha, não uma verdade — duas ou três palavras
 * é o que faz "Multa de trânsito" passar e "gasto" não.
 */
const MINIMO_DA_DESCRICAO_DE_OUTRO = 12;

/**
 * As palavras que dizem apenas "não classifiquei".
 *
 * Comparadas sem acento e em minúsculas: quem escreve "Diversos" e quem escreve
 * "diversos" está fazendo a mesma coisa.
 */
const PALAVRAS_QUE_NAO_DESCREVEM: ReadonlySet<string> = new Set([
  "outro", "outros", "outra", "outras",
  "diverso", "diversos", "varios", "variados",
  "gasto", "gastos", "despesa", "despesas", "custo", "custos",
  "geral", "nao sei", "sem descricao", "na", "n/a", "-", "--", "...",
]);

function normalizar(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Confere o pedido ANTES de encostar no banco.
 *
 * Pura de propósito: é a metade que se testa sem banco nenhum, e é a que a rota
 * chama para recusar cedo com uma frase em português.
 *
 * @param hojeEmSaoPaulo o dia de hoje, `YYYY-MM-DD`. Entra como parâmetro para
 *   que o teste possa fixar o "hoje" — uma validação que lê o relógio por conta
 *   própria é uma validação que muda de resposta à meia-noite.
 */
export function problemaNoGastoManual(
  p: PedidoDeGastoManual,
  hojeEmSaoPaulo: string,
): RecusaDoGasto | null {
  const descricao = typeof p.descricao === "string" ? p.descricao.trim() : "";
  if (descricao.length < MINIMO_DA_DESCRICAO) return "semDescricao";

  if (!ehCategoriaValida(p.categoria)) return "categoriaInvalida";

  if (p.categoria === "outro") {
    const limpa = normalizar(descricao);
    if (
      descricao.length < MINIMO_DA_DESCRICAO_DE_OUTRO ||
      PALAVRAS_QUE_NAO_DESCREVEM.has(limpa)
    ) {
      return "outroSemDescricaoEspecifica";
    }
  }

  if (!ehMoedaValida(p.moeda)) return "moedaInvalida";

  // ⚠️ AS TRÊS TRAVAS DO VALOR, NESTA ORDEM.
  //
  // `typeof x === "number"` sozinho aceita `NaN` e `Infinity`, e os dois
  // atravessariam a comparação `>= 0` sem reclamar — `NaN >= 0` é falso, mas
  // `Infinity >= 0` é verdadeiro, e um gasto infinito gravado estoura a coluna
  // INTEGER com um erro de banco que ninguém traduz.
  if (typeof p.valorCent !== "number" || !Number.isFinite(p.valorCent)) {
    return "valorNaoEhNumero";
  }
  // Fracionado é o caso que mais entra por descuido: quem digita "49,90" e um
  // código intermediário faz `Number("49.90") * 100` recebe 4989.999999999999.
  // Gravar isso truncaria meio centavo por linha, e a conta pararia de fechar
  // com a fatura por um motivo que ninguém encontra.
  if (!Number.isInteger(p.valorCent)) return "valorFracionado";
  if (p.valorCent < 0) return "valorNegativo";

  if (!ehDiaValido(p.competencia)) return "semCompetencia";
  // Gasto do futuro não é gasto: é previsão. Deixar entrar faria a conta de
  // "quanto gastamos" incluir o que ainda não aconteceu — e o CEO tomaria
  // decisão sobre um número que mistura fato com plano.
  if (p.competencia > hojeEmSaoPaulo) return "competenciaNoFuturo";

  if (p.pagoEm !== undefined && p.pagoEm !== null && p.pagoEm !== "") {
    if (!ehDiaValido(p.pagoEm)) return "pagamentoNoFuturo";
    // Pagamento com data futura é pagamento agendado, e agendado não saiu da
    // conta ainda. `pagoEm` responde "o dinheiro já saiu?", e a resposta só pode
    // ser sim depois que saiu.
    if (p.pagoEm > hojeEmSaoPaulo) return "pagamentoNoFuturo";
  }

  // O autor vem da sessão. Sem ele, o lançamento não tem responsável — e um
  // gasto sem responsável é um gasto que ninguém explica na reunião.
  if (typeof p.criadoPor !== "string" || p.criadoPor.trim() === "") return "semAutor";

  return null;
}

/**
 * A recusa vira frase para quem está lançando.
 *
 * Devolver `"outroSemDescricaoEspecifica"` na tela obrigaria o CEO a adivinhar o
 * que consertar. Cada frase diz O QUE FAZER — mesma doutrina de
 * `explicarRecusaDaLinha`, no cadastro frio.
 */
export function explicarRecusaDoGasto(r: RecusaDoGasto): string {
  switch (r) {
    case "semDescricao":
      return "Escreva o que foi pago. Um valor sem descrição não se explica depois.";
    case "categoriaInvalida":
      return "Escolha uma categoria da lista — é por ela que o gasto aparece na quebra da tela.";
    case "outroSemDescricaoEspecifica":
      return (
        "Você escolheu “Outro”. Escreva com precisão o que foi pago — “outros” ou " +
        "“diversos” fazem o gasto sumir dentro do próprio total."
      );
    case "moedaInvalida":
      return "Diga a moeda: real ou dólar. Sem ela o valor fica sem legenda.";
    case "valorNaoEhNumero":
      return "O valor precisa ser um número em centavos.";
    case "valorFracionado":
      return "O valor é em centavos inteiros — R$ 49,90 são 4990, não 4990,5.";
    case "valorNegativo":
      return (
        "Valor negativo não entra. Estorno é um lançamento próprio, com descrição " +
        "e responsável — um negativo solto abate a conta em silêncio."
      );
    case "semCompetencia":
      return "Informe o dia a que este gasto pertence, no formato dia/mês/ano.";
    case "competenciaNoFuturo":
      return "A competência não pode ser no futuro — isso seria previsão, não gasto.";
    case "pagamentoNoFuturo":
      return "A data de pagamento não pode ser no futuro. Deixe em branco enquanto não pagou.";
    case "semAutor":
      return "Não foi possível identificar quem está lançando. Entre de novo.";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// A GRAVAÇÃO
// ─────────────────────────────────────────────────────────────────────────────

export interface GastoLancado {
  id: string;
  descricao: string;
  categoria: CategoriaDeGasto;
  fornecedor: string | null;
  valorCent: number;
  moeda: MoedaDeGasto;
  competencia: string;
  pagoEm: string | null;
  recorrente: boolean;
  criadoPor: string;
}

export type ResultadoDoLancamento =
  | { ok: true; gasto: GastoLancado }
  | { ok: false; recusa: RecusaDoGasto };

/**
 * Grava um gasto lançado à mão.
 *
 * ⚠️ Ele valida DE NOVO, mesmo que a rota já tenha validado. Não é desconfiança
 * da rota: é que amanhã existe um script de importação, e ele vai chamar esta
 * função e não aquela. A regra precisa estar onde a escrita acontece.
 */
export async function lancarGastoManual(
  db: Cliente,
  p: PedidoDeGastoManual,
  agora: Date = new Date(),
): Promise<ResultadoDoLancamento> {
  const recusa = problemaNoGastoManual(p, diaEmSaoPaulo(agora));
  if (recusa) return { ok: false, recusa };

  const competencia = p.competencia as string;
  const pagoEm = typeof p.pagoEm === "string" && p.pagoEm !== "" ? p.pagoEm : null;
  const fornecedor =
    typeof p.fornecedor === "string" && p.fornecedor.trim() !== ""
      ? p.fornecedor.trim()
      // Vazio vira nulo, e não `""`. String vazia na ficha vira um travessão que
      // se lê como "alguém apagou", e não como "ninguém preencheu".
      : null;

  const criado = await db.gastoManual.create({
    data: {
      descricao: (p.descricao as string).trim(),
      categoria: p.categoria as string,
      fornecedor,
      valorCent: p.valorCent as number,
      moeda: p.moeda as string,
      // ⚠️ A coluna é DATE. `meiaNoiteUtc` fixa o dia em UTC de propósito: um
      // DATE não tem fuso, e escrever a meia-noite de São Paulo (03:00 UTC)
      // faria a leitura de volta cair no dia anterior em metade dos ambientes.
      competencia: meiaNoiteUtc(competencia),
      pagoEm: pagoEm ? meiaNoiteUtc(pagoEm) : null,
      recorrente: p.recorrente === true,
      criadoPor: (p.criadoPor as string).trim(),
    },
  });

  return { ok: true, gasto: paraLeitura(criado) };
}

interface LinhaDoBanco {
  id: string;
  descricao: string;
  categoria: string;
  fornecedor: string | null;
  valorCent: number;
  moeda: string;
  competencia: Date;
  pagoEm: Date | null;
  recorrente: boolean;
  criadoPor: string;
}

/**
 * A linha do banco vira a linha da tela.
 *
 * ⚠️ O dia é lido em **UTC**, e não em São Paulo. A coluna é DATE e foi gravada
 * como meia-noite UTC; passar por `diaEmSaoPaulo` a empurraria três horas para
 * trás e devolveria o dia anterior. É o oposto do que se faz com `createdAt` do
 * log de IA — ali há hora de verdade, aqui não há.
 */
function paraLeitura(l: LinhaDoBanco): GastoLancado {
  return {
    id: l.id,
    descricao: l.descricao,
    categoria: l.categoria as CategoriaDeGasto,
    fornecedor: l.fornecedor,
    valorCent: l.valorCent,
    moeda: l.moeda as MoedaDeGasto,
    competencia: diaDeUmaColunaDate(l.competencia),
    pagoEm: l.pagoEm ? diaDeUmaColunaDate(l.pagoEm) : null,
    recorrente: l.recorrente,
    criadoPor: l.criadoPor,
  };
}

export function diaDeUmaColunaDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// A CONTA
// ─────────────────────────────────────────────────────────────────────────────

export interface ValorPorMoeda {
  readonly moeda: MoedaDeGasto;
  readonly centavos: number;
  readonly lancamentos: number;
}

/**
 * A soma de um balde — um dia, ou uma categoria.
 *
 * ⚠️ Repare no que NÃO existe aqui: um campo `total`. Somar real com dólar
 * exigiria uma cotação que este repositório não tem, e o jeito de impedir isso
 * é não oferecer o campo. Proibição na forma do dado vale mais que proibição
 * escrita num comentário.
 */
export interface SomaDeGastoManual {
  readonly chave: string;
  readonly rotulo: string;
  readonly lancamentos: number;
  readonly porMoeda: readonly ValorPorMoeda[];
  /** `SEM_LANCAMENTO` NÃO quer dizer gasto zero. Ver o cabeçalho do arquivo. */
  readonly estado: "SEM_LANCAMENTO" | "LANCADO";
}

export interface GastoManualNaFaixa {
  readonly de: string;
  readonly ate: string;
  /** Um item por dia da faixa, os sem lançamento INCLUSIVE. */
  readonly dias: readonly SomaDeGastoManual[];
  /** Só as categorias que tiveram lançamento no período. */
  readonly categorias: readonly SomaDeGastoManual[];
  readonly total: SomaDeGastoManual;
  /** Os lançamentos do período, do mais recente ao mais antigo. */
  readonly lancamentos: readonly GastoLancado[];
}

/** Quantos lançamentos a tela recebe de uma vez. */
export const MAXIMO_DE_LANCAMENTOS_NA_TELA = 100;

function somar(chave: string, rotulo: string, linhas: GastoLancado[]): SomaDeGastoManual {
  const porMoeda = new Map<MoedaDeGasto, { centavos: number; lancamentos: number }>();
  for (const l of linhas) {
    const atual = porMoeda.get(l.moeda) ?? { centavos: 0, lancamentos: 0 };
    // Inteiro somado com inteiro. Nenhum ponto flutuante entra nesta linha.
    atual.centavos += l.valorCent;
    atual.lancamentos += 1;
    porMoeda.set(l.moeda, atual);
  }

  return {
    chave,
    rotulo,
    lancamentos: linhas.length,
    porMoeda: [...porMoeda.entries()]
      .map(([moeda, v]) => ({ moeda, centavos: v.centavos, lancamentos: v.lancamentos }))
      .sort((a, b) => a.moeda.localeCompare(b.moeda)),
    estado: linhas.length === 0 ? "SEM_LANCAMENTO" : "LANCADO",
  };
}

function agrupar(mapa: Map<string, GastoLancado[]>, chave: string, l: GastoLancado): void {
  const balde = mapa.get(chave);
  if (balde) balde.push(l);
  else mapa.set(chave, [l]);
}

/**
 * O gasto lançado à mão na faixa, por dia e por categoria.
 *
 * ⚠️ Como no gasto de IA, a lista de dias vem do CALENDÁRIO e não do banco — e
 * aqui isso pesa ainda mais, porque a maioria dos dias legitimamente não tem
 * lançamento. Sem o dia na lista, a tela ficaria com buracos que se leem como
 * "não gastou".
 */
export async function somarGastosManuais(
  db: Cliente,
  faixa: { de: string; ate: string },
): Promise<GastoManualNaFaixa> {
  const dias = diasDaFaixa(faixa.de, faixa.ate);

  const linhas = ((await db.gastoManual.findMany({
    where: {
      competencia: { gte: meiaNoiteUtc(faixa.de), lte: meiaNoiteUtc(faixa.ate) },
    },
    orderBy: [{ competencia: "desc" }, { criadoEm: "desc" }],
    take: MAXIMO_DE_LANCAMENTOS_NA_TELA,
  })) as LinhaDoBanco[]).map(paraLeitura);

  const porDia = new Map<string, GastoLancado[]>();
  const porCategoria = new Map<string, GastoLancado[]>();
  for (const l of linhas) {
    agrupar(porDia, l.competencia, l);
    agrupar(porCategoria, l.categoria, l);
  }

  return {
    de: faixa.de,
    ate: faixa.ate,
    dias: dias.map((d) => somar(d, d, porDia.get(d) ?? [])),
    categorias: CATEGORIAS_DE_GASTO.filter((c) => porCategoria.has(c.valor)).map((c) =>
      somar(c.valor, c.rotulo, porCategoria.get(c.valor)!),
    ),
    total: somar("__total__", "Total do período", linhas),
    lancamentos: linhas,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// O QUE A TELA ESCREVE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A prestação de contas de um balde manual, em uma frase.
 *
 * ⚠️ `SEM_LANCAMENTO` **não** vira "R$ 0,00". A frase diz o que de fato se sabe:
 * ninguém lançou nada — o que é diferente de não ter havido gasto, porque
 * hospedagem e domínio são cobrados por mês e por ano.
 */
export function fraseDoGastoManual(s: SomaDeGastoManual): string {
  if (s.estado === "SEM_LANCAMENTO") {
    return (
      "Nenhum lançamento manual neste período — o que não quer dizer gasto zero: " +
      "hospedagem e domínio são cobrados por mês e por ano."
    );
  }
  return s.porMoeda.map((v) => valorEscrito(v.centavos, v.moeda)).join(" + ");
}
