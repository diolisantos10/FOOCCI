/**
 * truthLabels — UMA tabela de rótulos da verdade, lida por quem RESPONDE
 * (BrainReasoner) e por quem JULGA (BrainCoherenceCritic).
 *
 * POR QUE ISTO EXISTE (06/08/2026): as duas tabelas eram cópias. O PR #111
 * acrescentou `loja` (estado da loja AGORA), `entrega` e `local` à ficha e
 * atualizou só a do BrainReasoner. No juiz, as três chaves caíam em prioridade
 * 99 — atrás do cardápio inteiro — e o corte de 15.000 caracteres as apagava.
 * Resultado: o agente sabia que a loja estava fechada, dizia isso, e o juiz
 * julgava essa frase SEM a linha que a sustenta. O oposto do que o #111 quis.
 *
 * A trava contra a repetição não é lembrar de editar dois arquivos: é não haver
 * dois arquivos. Fonte nova entra aqui, uma vez, e os dois leitores enxergam.
 */

/** Rótulo humano por fonte — o juiz e o agente leem verdade rotulada, não JSON cru. */
export const TRUTH_LABELS: Record<string, string> = {
  // Distinto de `hours` de propósito: aquele é o que está CADASTRADO, este é o
  // que vale NESTE minuto. Sem o rótulo, o modelo lia "loja: {...}" e tratava o
  // estado de agora como mais uma linha de configuração.
  loja: "Estado da loja AGORA (aceita pedido? quando reabre?)",
  policies: "Identidade/política",
  prices: "Preços",
  payments: "Pagamentos",
  hours: "Horários/atendimento",
  entrega: "Entrega (taxa/área/raio/mínimo)",
  local: "Endereço do restaurante",
  materials: "Materiais",
  evidence: "Evidências",
  systemSignals: "Sinais read-only do sistema agora",
  manual: "Manual/documentação curada (trechos relevantes)",
  products: "Produtos",
  customers: "Clientes (agregado)",
  orders: "Pedidos (agregado)",
  conversations: "Conversas (agregado)",
};

/**
 * Ordem de leitura quando há orçamento de caracteres (o juiz corta; o agente não).
 *
 * Regra: **fato pequeno, volátil e decisivo primeiro; bloco grande por último.**
 * `loja` abre a lista porque é a menor linha da ficha e a única que muda de
 * minuto a minuto — é ela que decide se "estamos fechados" é verdade ou mentira.
 */
export const TRUTH_PRIORITY: readonly string[] = [
  // ── Fatos pequenos e decisivos: nunca podem ser cortados ────────────────────
  "loja",
  "policies",
  "prices",
  "payments",
  "hours",
  "entrega",
  "local",
  "materials",
  "evidence",
  "systemSignals",
  // ── Blocos GRANDES: cardápio e agregados. Cortar aqui é aceitável ───────────
  "manual",
  "products",
  "customers",
  "orders",
  "conversations",
];

/** Primeira fonte considerada GRANDE — a fronteira entre "não cortar" e "pode cortar". */
export const FIRST_BULKY_TRUTH_SOURCE = "manual";

const BULKY_START = TRUTH_PRIORITY.indexOf(FIRST_BULKY_TRUTH_SOURCE);

/**
 * Posição de uma fonte na fila. Fonte NÃO listada entra **imediatamente antes**
 * dos blocos grandes — nunca no fim da fila.
 *
 * O fim da fila era o comportamento antigo (índice 99) e ele transforma
 * "ninguém classificou esta chave" em "esta chave é descartável" — que é
 * ausência de informação virando informação, dentro do próprio código. Uma
 * fonte nova, de tamanho desconhecido, não pode ser silenciosamente apagada
 * atrás do cardápio; ela também não pode empurrar preço/horário para fora.
 * Entre os dois riscos, este é o lugar honesto.
 */
export function truthPriorityIndex(key: string): number {
  const i = TRUTH_PRIORITY.indexOf(key);
  return i >= 0 ? i : BULKY_START - 0.5;
}
