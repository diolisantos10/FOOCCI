/**
 * knowledgeMatch — o casamento entre a pergunta do cliente e o Q&A que o LOJISTA
 * cadastrou (`RestaurantKnowledgeItem`).
 *
 * POR QUE ISTO SAIU DO SERVIÇO
 * A régua vivia dentro de `RestaurantKnowledgeService`, que importa `prisma`. Só
 * o WhatsApp conseguia usá-la; o Garçom do cardápio é puro (sem DB, testado sem
 * banco) e por isso ficou de fora — foi assim que o agente do WhatsApp passou a
 * saber coisas que o agente do cardápio não sabe, sobre o mesmo restaurante.
 *
 * Aqui mora a régua, sem I/O, com UM dono. `RestaurantKnowledgeService` a
 * importa; `WaiterBrainV2` também. Duas cópias da mesma regra seria pior que
 * nenhuma: elas divergem em silêncio.
 */

/** O mínimo que o casamento precisa ler. Compatível com `KnowledgeItem`. */
export interface MatchableKnowledgeItem {
  title:            string;
  category:         string;
  questionPatterns: string[];
  answer:           string;
}

const PT_STOPWORDS = new Set([
  "a","o","e","é","em","de","da","do","dos","das","que","se","por","com",
  "um","uma","mais","como","para","não","nao","sim","mas","ou","eu","tu",
  "ele","ela","nós","vocês","eles","tem","ter","ser","foi","são","sao",
  "esse","esta","este","essa","isso","aqui","ali","lá","la","já","ja",
  "pode","pois","pelo","pela","meu","minha","seu","sua","qual","quando",
  "onde","quem","há","ha","até","ate","ai","aí","tudo","todo","toda","bem",
]);

/**
 * Dobra o plural simples do português (≥4 letras terminadas em "s").
 *
 * Não é preciosismo: o lojista cadastra "rodízio" e a cliente escreve
 * "rodízios" — foi literalmente a primeira mensagem da Júlia no sushi-cazza,
 * 05/08 14:57. Sem isto, o Q&A curado existe e não é encontrado, que é o
 * silêncio parecendo sucesso.
 *
 * Aplicado dos DOIS lados (pergunta do cliente e padrão cadastrado), então a
 * régua continua simétrica — nunca casa mais de um lado que do outro.
 */
function foldPlural(w: string): string {
  return w.length >= 4 && w.endsWith("s") ? w.slice(0, -1) : w;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")   // strip accents
    .replace(/[^\w\s]/g, " ")          // remove punctuation
    .split(/\s+/)
    .filter((w) => w.length > 2 && !PT_STOPWORDS.has(w))
    .map(foldPlural);
}

/**
 * Score how well a customer message matches a knowledge item's question patterns.
 * Returns 0.0–1.0. A score ≥ MATCH_THRESHOLD means the item is relevant.
 */
export const MATCH_THRESHOLD = 0.25;

export function scoreMatch(customerTokens: string[], questionPatterns: string[]): number {
  if (questionPatterns.length === 0 || customerTokens.length === 0) return 0;

  const patternTokens = new Set(questionPatterns.flatMap((p) => tokenize(p)));
  if (patternTokens.size === 0) return 0;

  const matchCount = customerTokens.filter((t) => patternTokens.has(t)).length;
  return matchCount / Math.max(customerTokens.length, patternTokens.size);
}

/**
 * O melhor item de conhecimento para esta mensagem, ou `null`.
 *
 * Recebe itens JÁ filtrados por `status: "ACTIVE"` — quem decide o que está no ar
 * é o lojista, e essa decisão não se reproduz aqui. `UNKNOWN_GAP` é pulado: é uma
 * pergunta sem resposta, e devolver resposta vazia seria o silêncio virando fato.
 */
export function matchKnowledgeItems<T extends MatchableKnowledgeItem>(
  items:   readonly T[],
  message: string,
): T | null {
  if (items.length === 0) return null;
  const tokens = tokenize(message);
  if (tokens.length === 0) return null;

  let best:      T | null = null;
  let bestScore: number   = MATCH_THRESHOLD;

  for (const item of items) {
    if (item.category === "UNKNOWN_GAP") continue;
    if (!item.answer?.trim()) continue;
    const score = scoreMatch(tokens, item.questionPatterns);
    if (score > bestScore) {
      bestScore = score;
      best      = item;
    }
  }

  return best;
}
