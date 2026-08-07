/**
 * dietarySafety — a régua de segurança alimentar. Um dono, vários consumidores.
 *
 * ── POR QUE ELA MORA AQUI, E NÃO EM `ConversationGuardrails` ─────────────────
 *
 * A regra nasceu dentro de `ConversationGuardrails`, que importa `prisma`. O
 * Garçom (`WaiterBrainV2`) é puro por construção — e o preço disso apareceu em
 * 07/08/2026: para poder testar o Garçom sem banco, as suítes **mockavam**
 * `ConversationGuardrails` inteiro. Um mock que exporta duas funções e omite as
 * outras não quebra o build; ele apenas devolve `undefined` — e a regra de
 * segurança some sem que nada fique vermelho.
 *
 * É a mesma história de `knowledgeMatch.ts`: quando uma régua que o Garçom
 * precisa mora atrás de um import de banco, ela acaba não sendo usada pelo
 * Garçom, ou é reimplementada em segundo lugar. Aqui o módulo é puro — sem
 * `prisma`, sem I/O — e `ConversationGuardrails` reexporta o que sempre exportou,
 * então nenhum consumidor antigo precisou mudar de import.
 */

// ── Vocabulário de bloqueio ──────────────────────────────────────────────────
//
// ── 07/08/2026 — O MAPA NÃO CONHECIA O NOME DO PRÓPRIO ALÉRGENO ─────────────
//
// "sem glúten" listava trigo/farinha/pão/massa e **não listava "glúten"**. O
// campo em que o lojista declara chama-se `alergenosDetalhados`, e o que ele
// escreve lá é exatamente a palavra que faltava: `"glúten"`, `"lactose"`,
// `"castanhas"`. Medido na padaria de vitrine: mesmo DEPOIS de o filtro passar a
// ler o campo, a Baguete Rústica (`alergenosDetalhados: "glúten"`) continuava
// saindo para um celíaco — o dado era lido e mesmo assim não casava.
//
// A regra que fica: quando existe um campo em que a informação é declarada PELO
// NOME, o vocabulário do filtro tem que conter esse nome. Sinônimo de
// ingrediente é reforço; o nome declarado é o casamento principal.
//
// Sem acento também entra: lojista digita "gluten" tanto quanto "glúten".
export const DIETARY_BLOCK_MAP: Record<string, string[]> = {
  vegetariano:       ["carne", "frango", "peixe", "bacon", "presunto", "costela", "boi", "bovino"],
  vegetariana:       ["carne", "frango", "peixe", "bacon", "presunto", "costela", "boi", "bovino"],
  vegano:            ["carne", "frango", "peixe", "bacon", "queijo", "leite", "ovo", "manteiga", "mel", "lactose"],
  vegana:            ["carne", "frango", "peixe", "bacon", "queijo", "leite", "ovo", "manteiga", "mel", "lactose"],
  "sem glúten":      ["glúten", "gluten", "trigo", "farinha", "pão", "massa", "pizza", "macarrão", "cevada", "centeio"],
  "sem lactose":     ["lactose", "queijo", "leite", "creme", "manteiga", "iogurte", "requeijão"],
  "sem peixe":       ["peixe", "salmão", "atum", "tilápia", "bacalhau"],
  "sem frutos do mar": ["camarão", "lagosta", "mariscos", "fruto do mar", "polvo", "lula"],
  "sem carne":       ["carne", "boi", "bovino", "bacon", "costela", "presunto"],
  halal:             ["porco", "bacon", "presunto", "linguiça"],
};

/**
 * How safe an item is for a customer who declared a restriction.
 *
 * `unknown` is the state that was missing, and its absence was the dietary P1: the
 * filter matched keywords against the item name plus its ingredients, so an item with
 * NO ingredients registered never matched anything — and not matching was read as
 * "safe". A dish named "Risoto do Chef" with an empty ingredient list went straight to
 * a customer who had declared "sem lactose".
 *
 * That is guardrail 1 inverted — absence of information treated as information — and
 * here the cost is not money or reputation. It is the health of whoever ordered.
 */
export type DietarySafety = "safe" | "blocked" | "unknown";

/**
 * Classifies an item against the customer's restrictions.
 *
 * Returns `unknown` when the customer declared a restriction AND the item has no
 * ingredients registered: we cannot prove it conflicts, and we equally cannot prove it
 * is safe. An `unknown` item must never be presented as suitable — it either stays out
 * of the suggestion, or goes out with an explicit "preciso confirmar".
 *
 * `ingredients` é a PROVA: é o campo em que o restaurante declarou a composição
 * (`ingredients` no caminho antigo, `alergenosDetalhados` no catálogo do Garçom).
 * `itemName` pode carregar nome + descrição + categoria — quanto mais texto,
 * mais chance de BLOQUEAR; mas só o campo declarado transforma "não achei nada"
 * em "está limpo".
 */
export function classifyDietarySafety(
  itemName:     string,
  ingredients:  string | null | undefined,
  dietary:      string[],
  allergies:    string[],
): DietarySafety {
  const restrictions = [...dietary, ...allergies].filter((r) => r && r.trim());
  // Nothing declared → nothing to prove.
  if (restrictions.length === 0) return "safe";

  const text = `${itemName} ${ingredients ?? ""}`.toLowerCase();

  for (const restriction of restrictions) {
    const lower = restriction.toLowerCase().trim();

    // Direct match: restriction term appears literally in the item text
    if (text.includes(lower)) return "blocked";

    // Mapped blockers: restriction maps to specific ingredient keywords
    const blockers = DIETARY_BLOCK_MAP[lower] ?? [];
    if (blockers.some((b) => text.includes(b))) return "blocked";
  }

  // Nothing matched — but that only means "safe" if there was something to read.
  const hasIngredients = !!ingredients && ingredients.trim().length > 0;
  return hasIngredients ? "safe" : "unknown";
}

/**
 * Returns true if an item must NOT be offered to this customer.
 *
 * Both `blocked` and `unknown` exclude it. Staying quiet about a dish is recoverable;
 * a wrong reassurance to someone with an allergy is not — so when the two are in
 * tension, silence wins.
 */
export function isBlockedByDietary(
  itemName:     string,
  ingredients:  string | null | undefined,
  dietary:      string[],
  allergies:    string[],
): boolean {
  return classifyDietarySafety(itemName, ingredients, dietary, allergies) !== "safe";
}
