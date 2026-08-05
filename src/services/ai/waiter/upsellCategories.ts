/**
 * upsellCategories — quais categorias do cardápio o Garçom oferece no fechamento,
 * e em que ordem.
 *
 * ── O problema que este módulo resolve ────────────────────────────────────────
 * A sequência de fechamento era CONSTANTE NO CÓDIGO ("bebida" → "sobremesa"),
 * reconhecida por regex sobre o nome da categoria. Uma padaria não tem
 * "sobremesa" — tem "Confeitaria". Um japonês tem "Sobremesas Orientais". Quando
 * a taxonomia do restaurante não batia com a regex, o passo simplesmente não
 * acontecia: o Garçom deixava de fazer o upsell e ninguém era avisado.
 *
 * Agora a lista é CONFIGURAÇÃO DO RESTAURANTE — nomes reais de categorias
 * daquele cardápio, na ordem escolhida pelo lojista.
 *
 * ── Três regras de projeto, e o porquê ────────────────────────────────────────
 *
 * 1. SEM CONFIGURAÇÃO = COMPORTAMENTO DE HOJE, BIT A BIT.
 *    `resolveUpsellSequence(catalog, null)` devolve exatamente os dois passos
 *    legados (bebida, depois sobremesa) com os MESMOS classificadores usados por
 *    `analyzeMenuItem` — inclusive a precedência bebida > sobremesa (uma
 *    categoria "Milk-shake" casa com as duas regex e continua sendo bebida).
 *    Ninguém acorda amanhã com o upsell desligado.
 *
 * 2. CASAMENTO EXATO, NUNCA DIFUSO.
 *    Categoria configurada casa com a do cardápio por nome normalizado
 *    (minúsculas, sem acento, espaços colapsados) — e só. Matcher difuso já
 *    casou "lasanha" com "yakisoba" neste projeto. Aqui ele custaria a oferta
 *    errada no fechamento, na frente do cliente.
 *
 * 3. CATEGORIA QUE NÃO EXISTE MAIS NÃO VIRA PASSO.
 *    O lojista configura "Confeitaria" e depois apaga a categoria. O passo é
 *    descartado na resolução — não sobra oferta fantasma, não quebra o
 *    fechamento, e os passos seguintes continuam valendo.
 */

import { isDessertCategory } from "../ConversationGuardrails";

/** Categoria de bebida — mesma regex que `analyzeMenuItem` usa para a tag "drink". */
export function isDrinkCategory(name: string): boolean {
  return /bebida|suco|drink|refri|água|cerveja|vinho|refrigerante|soda|shake/i.test(name);
}

/**
 * Chave estável de comparação de nome de categoria.
 * Minúsculas · sem acento · pontuação virando espaço · espaços colapsados.
 * "Café & Bebidas" e "cafe e bebidas" NÃO são a mesma coisa — normalização não é
 * sinônimo. O "&" vira espaço, não vira "e".
 */
export function normalizeCategoryKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Um passo da sequência de upsell de fechamento. */
export interface UpsellStep {
  /** Chave estável usada na memória da sessão (anti-loop). */
  key: string;
  /** Nome da categoria como o restaurante escreve — é o que aparece na fala. */
  label: string;
  /** Origem: configuração do lojista ou o padrão legado derivado do cardápio. */
  source: "configured" | "legacy";
  /** Casa um item do cardápio com este passo. */
  matches: (categoryName: string) => boolean;
  /**
   * Chaves de recusa que silenciam este passo.
   * Inclui a própria chave e os apelidos legados ("drink_upsell"/"dessert_upsell")
   * quando o passo é semanticamente bebida ou sobremesa — assim um "não quero
   * bebida" digitado pelo cliente continua calando a categoria "Café & Bebidas".
   */
  declineKeys: string[];
  /** Estágio legado equivalente (compatibilidade com a memória já persistida). */
  legacyStage: "drink_shown" | "dessert_shown";
}

/** Forma mínima que o resolvedor precisa de um item de cardápio. */
export interface CategorizedItem {
  categoryName: string;
}

const LEGACY_DRINK_LABEL   = "bebidas";
const LEGACY_DESSERT_LABEL = "sobremesas";

/**
 * Passo legado "bebida": tudo que a regex de bebida reconhece.
 * Espelha `analyzeMenuItem` — a tag "drink" vem de `isDrinkCategory` e ganha da
 * tag "dessert" quando as duas casam.
 */
const LEGACY_DRINK_STEP: UpsellStep = {
  key:         "drink",
  label:       LEGACY_DRINK_LABEL,
  source:      "legacy",
  matches:     (c) => isDrinkCategory(c),
  declineKeys: ["drink_upsell"],
  legacyStage: "drink_shown",
};

/** Passo legado "sobremesa": espelha o `else if` de `analyzeMenuItem`. */
const LEGACY_DESSERT_STEP: UpsellStep = {
  key:         "dessert",
  label:       LEGACY_DESSERT_LABEL,
  source:      "legacy",
  matches:     (c) => !isDrinkCategory(c) && isDessertCategory(c),
  declineKeys: ["dessert_upsell"],
  legacyStage: "dessert_shown",
};

/** A sequência legada, na ordem histórica. */
export const LEGACY_UPSELL_SEQUENCE: readonly UpsellStep[] = [
  LEGACY_DRINK_STEP,
  LEGACY_DESSERT_STEP,
];

/**
 * Resolve a sequência de upsell de fechamento para um cardápio.
 *
 * @param catalog    itens do cardápio (só o nome da categoria importa aqui)
 * @param configured lista ordenada de nomes de categoria escolhida pelo lojista.
 *                   Vazia / nula → sequência legada (bebida → sobremesa).
 *
 * Passos sem NENHUM item no cardápio são descartados: categoria apagada não vira
 * oferta fantasma, e passo vazio não gasta uma rodada do fechamento.
 */
export function resolveUpsellSequence(
  catalog: readonly CategorizedItem[],
  configured?: readonly string[] | null,
): UpsellStep[] {
  const catalogCategories = [...new Set(catalog.map((i) => i.categoryName).filter(Boolean))];

  const candidates = hasConfiguration(configured)
    ? buildConfiguredSteps(configured, catalogCategories)
    : [...LEGACY_UPSELL_SEQUENCE];

  // Descarta o passo que não tem nenhuma categoria correspondente no cardápio.
  return candidates.filter((step) => catalogCategories.some((c) => step.matches(c)));
}

/** true quando o lojista configurou pelo menos um nome não vazio. */
export function hasConfiguration(configured?: readonly string[] | null): configured is readonly string[] {
  return Array.isArray(configured) && configured.some((c) => typeof c === "string" && c.trim() !== "");
}

function buildConfiguredSteps(
  configured: readonly string[],
  catalogCategories: readonly string[],
): UpsellStep[] {
  const seen  = new Set<string>();
  const steps: UpsellStep[] = [];

  for (const raw of configured) {
    if (typeof raw !== "string") continue;
    const key = normalizeCategoryKey(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    // O rótulo falado é a grafia REAL do cardápio quando ela existe — o lojista
    // pode ter salvo "confeitaria" e a categoria chamar-se "Confeitaria".
    const label = catalogCategories.find((c) => normalizeCategoryKey(c) === key) ?? raw.trim();

    steps.push({
      key:         `cat:${key}`,
      label,
      source:      "configured",
      matches:     (c) => normalizeCategoryKey(c) === key,
      declineKeys: configuredDeclineKeys(key, label),
      legacyStage: isDrinkCategory(label) ? "drink_shown" : "dessert_shown",
    });
  }

  return steps;
}

/**
 * Uma recusa genérica do cliente ("não quero bebida") é registrada na memória
 * como "drink_upsell"/"dessert_upsell". Um passo configurado que É bebida ou
 * sobremesa herda esse apelido — senão o Garçom reofereceria exatamente o que
 * acabou de ser recusado, só porque a categoria tem outro nome.
 */
function configuredDeclineKeys(key: string, label: string): string[] {
  const keys = [`cat:${key}`];
  if (isDrinkCategory(label))                              keys.push("drink_upsell");
  if (!isDrinkCategory(label) && isDessertCategory(label)) keys.push("dessert_upsell");
  return keys;
}

/**
 * Nomes de categoria que o Garçom pode citar no fechamento, na ordem.
 * Usado pelo prompt e pelo perfil — no lugar do literal "bebida/sobremesa".
 */
export function upsellCategoryLabels(
  catalog: readonly CategorizedItem[],
  configured?: readonly string[] | null,
): string[] {
  return resolveUpsellSequence(catalog, configured).map((s) => s.label);
}

/**
 * Saneia a lista vinda do painel antes de persistir:
 * remove vazios, apara espaços, deduplica por nome normalizado, preserva a ordem.
 * Teto de 5 passos — fechamento não é catálogo; mais que isso vira insistência,
 * e insistir é o comportamento que a regra "oferecer uma vez, sem insistir" proíbe.
 */
export const MAX_UPSELL_CATEGORIES = 5;

export function sanitizeUpsellCategories(input: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = normalizeCategoryKey(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= MAX_UPSELL_CATEGORIES) break;
  }
  return out;
}
