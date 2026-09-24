/**
 * Menu "Novidades" — a vitrine automática dos últimos lançamentos do cardápio.
 *
 * POR QUE AUTOMÁTICA (e não uma categoria que alguém arrasta produto pra dentro)
 * O lançamento de amanhã precisa entrar sozinho e o produto velho precisa sair
 * sozinho. Categoria manual envelhece no dia em que alguém esquece de mexer — e
 * uma vitrine que mente é pior que vitrine nenhuma.
 *
 * QUAL DATA
 * O produto (MenuItem) tem UM campo de data de nascimento: `createdAt`. Não existe
 * `launchedAt`/`publishedAt` no schema. E `createdAt` é uma ARMADILHA conhecida:
 * a importação de cardápio (`/api/menu/import/confirm`, `scripts/import-*.ts`)
 * cria o cardápio INTEIRO de uma vez, então um restaurante que entrou ontem tem
 * 200 produtos "criados ontem". Sem trava, a seção nasceria com o cardápio todo
 * dentro — exatamente o oposto de novidade.
 *
 * A trava é a `guarda de carga inicial` abaixo: se os candidatos forem a maior
 * parte do cardápio, isso não é lançamento, é cadastro/migração — e a seção
 * simplesmente não aparece. É determinística e não depende de ninguém lembrar.
 *
 * REGRAS (valem para TODOS os cardápios — tela do cliente e agente de WhatsApp):
 *   1. janela em dias: configurável pelo dono (StoreProfile.novidadesDias);
 *      sem configuração vale o padrão. Valor inválido NUNCA passa: cai no padrão.
 *   2. teto de itens: a vitrine não cresce sem limite.
 *   3. produto indisponível não entra (vitrine não oferece o que não se vende).
 *   4. sem candidato → NÃO existe categoria. Seção vazia na melhor posição da
 *      tela parece defeito.
 *   5. o produto continua no cardápio normal, na categoria dele — esta seção é
 *      vitrine, não é onde o produto mora.
 */

/** Id sintético da categoria virtual (não existe no banco). */
export const NOVIDADES_CATEGORY_ID = "__novidades__";
/** Nome exibido. É a PRIMEIRA categoria do cardápio — é vitrine. */
export const NOVIDADES_CATEGORY_NAME = "🆕 Novidades";

/** Janela padrão, para quem nunca configurou nada. */
export const NOVIDADES_DIAS_PADRAO = 14;
/** Limites de sanidade da janela configurável (trava no código, não no aviso da tela). */
export const NOVIDADES_DIAS_MIN = 1;
export const NOVIDADES_DIAS_MAX = 90;
/** Teto de produtos na vitrine. */
export const NOVIDADES_TETO_ITENS = 8;
/**
 * Guarda de carga inicial: se mais que esta fração do cardápio visível for
 * "recente", é cadastro/migração — não lançamento. Seção escondida.
 */
export const NOVIDADES_FRACAO_MAXIMA = 0.5;
/** A guarda só vale a partir deste tamanho de cardápio (cardápio minúsculo não é migração). */
export const NOVIDADES_MIN_ITENS_PARA_GUARDA = 6;

const DIA_MS = 86_400_000;

/**
 * Janela em dias válida? Só inteiro dentro dos limites de sanidade.
 * Zero e negativo fariam a seção sumir sem explicação; um número grande demais
 * transformaria "novidades" no cardápio inteiro.
 */
export function janelaNovidadesValida(raw: unknown): boolean {
  return (
    typeof raw === "number" &&
    Number.isInteger(raw) &&
    raw >= NOVIDADES_DIAS_MIN &&
    raw <= NOVIDADES_DIAS_MAX
  );
}

/**
 * A janela efetiva. Qualquer coisa que não seja um inteiro válido — null,
 * undefined, 0, negativo, 9999, "30", NaN — cai no padrão. Nunca trava o
 * cardápio de quem não pediu nada.
 */
export function resolverJanelaNovidades(raw: unknown): number {
  return janelaNovidadesValida(raw) ? (raw as number) : NOVIDADES_DIAS_PADRAO;
}

/** O mínimo que um item precisa ter para a vitrine decidir sobre ele. */
export interface ItemNovidadeLike {
  id: string;
  createdAt?: Date | string | null;
  /** Ausente = tratado como disponível (a consulta já filtrou indisponíveis). */
  isAvailable?: boolean | null;
}

function paraMillis(v: Date | string | null | undefined): number | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  const t = d.getTime();
  return Number.isFinite(t) ? t : null;
}

export interface OpcoesNovidades {
  /** Janela crua vinda da configuração do dono; resolvida aqui. */
  dias?: unknown;
  agora?: Date;
  /** Total de itens visíveis do cardápio, quando `itens` já é um recorte. */
  totalDoCardapio?: number;
  teto?: number;
}

/**
 * Seleciona os lançamentos recentes. Pura, sem banco: o MESMO cálculo serve a
 * tela do cliente e ao cardápio que o agente de WhatsApp lê — é assim que se
 * evita o dia em que a tela e o atendente discordam sobre o que é novidade.
 */
export function selecionarNovidades<T extends ItemNovidadeLike>(
  itens: readonly T[],
  opcoes: OpcoesNovidades = {},
): T[] {
  const janela = resolverJanelaNovidades(opcoes.dias);
  const agora = (opcoes.agora ?? new Date()).getTime();
  const corte = agora - janela * DIA_MS;
  const teto = Number.isInteger(opcoes.teto) && (opcoes.teto as number) > 0
    ? (opcoes.teto as number)
    : NOVIDADES_TETO_ITENS;

  const vistos = new Set<string>();
  const candidatos: Array<{ item: T; at: number }> = [];

  for (const item of itens) {
    if (!item || typeof item.id !== "string" || vistos.has(item.id)) continue;
    // Indisponível nunca entra na vitrine.
    if (item.isAvailable === false) continue;
    const at = paraMillis(item.createdAt);
    if (at == null) continue;            // sem data não há como afirmar novidade
    if (at < corte || at > agora) continue; // fora da janela (e nada do futuro)
    vistos.add(item.id);
    candidatos.push({ item, at });
  }

  // Guarda de carga inicial — ver cabeçalho. Cardápio inteiro recém-cadastrado
  // não é lançamento.
  const total = opcoes.totalDoCardapio ?? itens.length;
  if (
    total >= NOVIDADES_MIN_ITENS_PARA_GUARDA &&
    candidatos.length > total * NOVIDADES_FRACAO_MAXIMA
  ) {
    return [];
  }

  return candidatos
    .sort((a, b) => b.at - a.at || a.item.id.localeCompare(b.item.id))
    .slice(0, teto)
    .map((c) => c.item);
}

/**
 * Monta a categoria virtual pronta para ser colocada na FRENTE do cardápio.
 * Devolve `null` quando não há novidade — a seção vazia simplesmente não existe.
 */
export function montarCategoriaNovidades<T extends ItemNovidadeLike>(
  itens: readonly T[],
  opcoes: OpcoesNovidades = {},
): { id: string; name: string; description: null; imageUrl: null; items: T[] } | null {
  const escolhidos = selecionarNovidades(itens, opcoes);
  if (escolhidos.length === 0) return null;
  return {
    id: NOVIDADES_CATEGORY_ID,
    name: NOVIDADES_CATEGORY_NAME,
    description: null,
    imageUrl: null,
    items: escolhidos,
  };
}
