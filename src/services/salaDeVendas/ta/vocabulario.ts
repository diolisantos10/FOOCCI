/**
 * O VOCABULÁRIO DA BUSCA — uma lista de palavras vazias, num lugar só.
 *
 * ── POR QUE ESTE ARQUIVO NASCEU ─────────────────────────────────────────────
 *
 * Existiam **duas** listas de palavras vazias: uma em `verdade.ts` e outra em
 * `conhecimento.ts`. Quase iguais, e "quase" é o problema — em 28/08/2026
 * acrescentei uma palavra a uma delas e o defeito continuou de pé, porque a
 * busca que eu estava consertando lia a outra.
 *
 * Duas cópias da mesma regra sempre divergem, e a divergência aqui não aparece
 * como erro: aparece como o agente achando material numa pergunta e não achando
 * na irmã dela.
 *
 * ── ⚠️ O DEFEITO QUE ESTA LISTA EXISTE PARA IMPEDIR ─────────────────────────
 *
 * As duas buscas medem `palavras que casaram ÷ palavras que pesam`. Uma palavra
 * que aparece em qualquer frase do português — "esta", "muito", "onde" — casa
 * com quase tudo, e sozinha vale 100% de cobertura.
 *
 * Foi assim que *"meu cachorro está doente"* devolveu dois itens de **preço**.
 * A única palavra da pergunta que a base conhecia era "esta".
 *
 * Palavra gramatical é **classe fechada**: dá para enumerar, e a lista acaba.
 * Por isso a correção mora aqui e não num filtro por frequência — medir
 * frequência derrubaria "planos" junto, e *"qual a diferença entre os planos?"*
 * é uma das perguntas mais comuns de uma venda.
 */

/**
 * O acento sai, o resto vira espaço.
 *
 * Sem isto, "não" e "nao" são palavras diferentes, e metade dos leads escreve
 * sem acento no WhatsApp.
 */
export function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * As palavras que não dizem nada sobre o assunto.
 *
 * Organizada por classe, e não em ordem alfabética, porque é assim que se
 * percebe o que está faltando: lendo "verbo de ligação" dá para notar que
 * "seremos" não está lá; lendo uma lista alfabética, não dá.
 */
export const VAZIAS = new Set(
  [
    // Artigo, preposição, conjunção.
    "a o e de da do das dos em no na nos nas um uma uns umas para por com sem que",
    "se ao aos as os ou mas pra pro numa num sobre entre ate desde apenas so tambem",

    // Pergunta e quantidade — "quanto custa" tem a informação em "custa".
    "como qual quais quanto quanta quantos quantas onde quando porque pois",

    // Pronome e possessivo.
    "voce voces eu meu minha meus minhas seu sua seus suas nosso nossa dele dela",
    "isso isto esse essa este esta aquele aquela",

    // ⚠️ Verbo de ligação. Foi a ausência de "esta" aqui que fez uma pergunta
    // sobre cachorro doente casar com a tabela de preço.
    "sao tem ter esta estao estou estamos era eram foi fui sera serao ser sendo",

    // Advérbio e intensificador.
    "muito muita muitos muitas mais menos bem mal tudo nada algum alguma",
    "entao ainda depois antes agora hoje ja aqui la nao sim talvez",
  ]
    .join(" ")
    .split(" ")
    .filter(Boolean),
);

/**
 * O plural vira singular.
 *
 * ── ⚠️ O DEFEITO QUE ISTO CORRIGE, E ELE ERA GRANDE ─────────────────────────
 *
 * Medido em 28/08/2026, na véspera de começar a abordar leads:
 *
 *   "plano"                            → 7 itens
 *   "planos"                           → 0
 *   "qual a diferença entre os planos" → 0
 *
 * **Uma letra.** E o cliente fala no plural o tempo todo: "os planos", "as
 * taxas", "minhas lojas", "meus clientes", "as integrações". O agente sabia
 * responder e dizia "não sei" — o pior jeito de perder uma venda, porque
 * ninguém descobre por quê.
 *
 * As regras cobrem o plural do português na ordem certa (a mais específica
 * primeiro), e o corte em quatro letras protege palavra curta que TERMINA em
 * "s" sendo singular: "mes", "gas", "pais".
 *
 * ⚠️ Isto roda dos DOIS lados — na pergunta e no texto da base. Aplicar só de
 * um lado moveria o problema em vez de resolvê-lo.
 */
function semPlural(p: string): string {
  if (p.length < 4) return p;
  if (p.endsWith("oes")) return `${p.slice(0, -3)}ao`; // integracoes → integracao
  if (p.endsWith("aes")) return `${p.slice(0, -3)}ao`; // paes → pao
  if (p.endsWith("ais")) return `${p.slice(0, -3)}al`; // canais → canal
  if (p.endsWith("eis")) return `${p.slice(0, -3)}el`; // papeis → papel
  if (p.endsWith("ns")) return `${p.slice(0, -2)}m`; // nuvens → nuvem

  // ⚠️ Palavra terminada em consoante faz plural em "-es", e tirar só o "s"
  // deixa uma palavra que não existe. Medido em 28/08/2026:
  //
  //   "bar"   → bar     |  "bares" → bare     ← não casam
  //   "vez"   → vez     |  "vezes" → veze     ← não casam
  //
  // E "bar" é literalmente metade do público do Foocci: o CEO define o
  // atendimento como "restaurantes, bares e afins". Um dono de bar perguntando
  // *"vocês atendem bares?"* não encontrava a resposta sobre bar.
  //
  // A condição olha a letra antes do "-es" porque é ela que separa o plural de
  // consoante (bar→bares, luz→luzes, sol→sois… ) de "-tes"/"-des"/"-pes", que
  // são plural comum de palavra em "-e": "cliente"→"clientes" tem de perder só
  // o "s", e não virar "client".
  if (p.endsWith("es") && /[rszl]$/.test(p.slice(0, -2))) {
    return p.slice(0, -2); // bares → bar, vezes → vez, lugares → lugar
  }

  if (p.endsWith("s")) return p.slice(0, -1); // planos → plano
  return p;
}

/**
 * A pergunta virada em termos que valem busca.
 *
 * `length > 2` corta o que sobrou de sigla e ruído. Uma palavra de duas letras
 * que importasse já estaria na lista de vazias.
 */
export function palavras(s: string): string[] {
  return normalizar(s)
    .split(" ")
    .filter((p) => p.length > 2 && !VAZIAS.has(p))
    .map(semPlural);
}
