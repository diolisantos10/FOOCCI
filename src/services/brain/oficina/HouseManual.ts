/**
 * HouseManual — o manual da casa, por domínio (o "DESIGN.md dos prompts").
 *
 * Mesmo molde do KnowledgeAdapterRegistry: o core da Oficina nunca importa um
 * manual direto. Cada domínio registra o seu, e um domínio novo (agência,
 * clínica, …) é UM `registerManual()` no módulo dele — zero edição aqui.
 *
 * O manual carrega duas listas: o que toda ficha do domínio precisa ter, e a
 * LISTA NEGRA — os termos que denunciam IA. Clichê novo no mercado entra aqui e
 * some de todas as entregas sem avisar agente nenhum.
 */

import type { Medium } from "./OficinaTypes";

export interface Manual {
  dominio: string;
  /** Termos proibidos. Comparação sem acento e sem caixa. */
  listaNegra: string[];
  /**
   * Chaves que a `verdade` precisa trazer — sem elas a IA vai inventar.
   * Use as chaves do `truthSources` do snapshot (products, prices, hours, …),
   * que é o que o TruthSource entrega. Exigir chave que a fonte nunca emite
   * trava toda peça do domínio.
   */
  verdadeExigida: string[];
  /** Entram em TODA ficha do domínio, além das proibições do pedido. */
  proibicoesPadrao: string[];
  /** Eixos que o Variador gira, por meio. */
  eixosPorMedium: Partial<Record<Medium, { nome: string; opcoes: string[] }[]>>;
}

const registry = new Map<string, Manual>();

export function registerManual(manual: Manual): void {
  registry.set(manual.dominio, manual);
}

/** Null quando o domínio não tem manual — a Oficina reprova por construção. */
export function resolveManual(dominio: string): Manual | null {
  return registry.get(dominio) ?? null;
}

export function registeredDominios(): string[] {
  return [...registry.keys()];
}

/** Minúsculo, sem acento — pra "Hiper-Realista" bater com "hiper realista". */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Quais termos da lista negra aparecem no texto. Vazio = limpo. */
export function violacoes(texto: string, manual: Manual): string[] {
  const alvo = normalizar(texto);
  return manual.listaNegra.filter((termo) => alvo.includes(normalizar(termo)));
}

// ── Manual v1: restaurante ────────────────────────────────────────────────────

export const manualRestaurante: Manual = {
  dominio: "restaurante",
  listaNegra: [
    // o sotaque de IA — empilhar superlativo técnico não deixa melhor, deixa igual
    "hiper-realista",
    "ultra detalhado",
    "obra-prima",
    "8k",
    "award winning",
    // os clichês visuais de comida que todo restaurante já postou
    "tábua de madeira rústica",
    "manjericão solto",
    "fundo preto desfocado",
    // os vícios de texto
    "sentimos sua falta",
    "não perca essa oportunidade",
    "imperdível",
    "clique agora",
  ],
  // o cardápio é o mínimo: sem ele não existe peça de restaurante ancorada
  verdadeExigida: ["products"],
  proibicoesPadrao: [
    "inventar item que não está no cardápio",
    "prometer prazo, preço ou desconto que não veio da verdade",
    "superlativo sobre a comida ('o melhor da cidade')",
  ],
  eixosPorMedium: {
    texto: [
      { nome: "abertura",  opcoes: ["fato concreto", "pergunta direta", "convite", "notícia do dia"] },
      { nome: "tamanho",   opcoes: ["1 linha", "2 linhas", "curta com quebra"] },
      { nome: "fechamento", opcoes: ["chamada leve", "sem chamada", "pergunta"] },
    ],
    imagem: [
      { nome: "angulo",       opcoes: ["45°", "de cima", "nível da mesa", "macro no detalhe"] },
      { nome: "luz",          opcoes: ["janela de manhã", "fim de tarde dourado", "softbox neutro", "luz quente do salão à noite"] },
      { nome: "lente",        opcoes: ["35 mm", "50 mm", "85 mm", "macro"] },
      { nome: "superficie",   opcoes: ["balcão do salão", "granito", "aço escovado", "papel kraft"] },
      { nome: "formato",      opcoes: ["4:5 feed", "9:16 story", "1:1"] },
    ],
  },
};

registerManual(manualRestaurante);
