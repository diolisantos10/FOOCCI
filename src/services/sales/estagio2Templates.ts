/**
 * ⭐ ESTÁGIO 2 — OS MODELOS DA CONVERSA COM QUEM DECIDE.
 *
 * ── OS DOIS ESTÁGIOS, E POR QUE OS TEXTOS NÃO SE MISTURAM ───────────────────
 *
 * ESTÁGIO 1 (`COLD_GREETING_TEMPLATES`, em `coldContactDiscovery.ts`) é o
 * número frio: curto de propósito, porque o destino esperado é bot de pedidos.
 * Ele não vende — ele atravessa o porteiro e acha quem decide. Este arquivo
 * NÃO mexe nele.
 *
 * ESTÁGIO 2 é o que vem depois: conversa NOVA, aberta pela casa, com o
 * responsável comercial que o SDR capturou. Fora da janela de 24h só se abre
 * conversa por modelo aprovado — e era exatamente isso que faltava.
 *
 * ── ⛔ A PASSAGEM É A PEÇA MAIS FRÁGIL ──────────────────────────────────────
 *
 * O modo clássico de estragar: o SDR anuncia o especialista, e o especialista
 * chega com *"olá, como posso ajudar?"*. Nesse instante a pessoa entende que
 * vai repetir tudo de novo, e a confiança vira irritação.
 *
 * Por isso TODO texto daqui cita, na primeira frase, algo que o cliente já
 * disse ou que a casa já sabe — o nome da casa, o desafio contado, a proposta
 * enviada. **O closer nunca chega perguntando; chega sabendo.** Não é estilo:
 * é o motivo de cada `{{n}}` abaixo existir.
 *
 * ── ⚠️ NENHUM PREÇO, NÚMERO OU RESULTADO MORA AQUI ──────────────────────────
 *
 * Preço muda; modelo aprovado na Meta não. Um "R$ X/mês" colado num texto
 * aprovado envelhece sem avisar e passa a mentir em nome da casa. A verdade
 * comercial continua vindo da configuração publicada do TA, dentro da janela
 * de 24h, onde a conversa é livre.
 *
 * ── ⚠️ VARIÁVEL SEM FONTE É DISPARO QUE FALHA ───────────────────────────────
 *
 * Cada `{{n}}` abaixo declara a COLUNA de onde o valor sai. Não é documentação:
 * `estagio2Templates.test.ts` exige a declaração, e `fonteEstaPreenchida`
 * recusa o modelo cujo dado não existe para AQUELE contato — em vez de mandar
 * e descobrir contato a contato. Foi assim que já se perdeu ~10% dos disparos.
 */

/** De onde sai o valor de uma variável — a coluna, não uma descrição. */
export type FonteDoDado =
  | "SiteLead.nome"
  | "SiteLead.restaurante"
  | "SiteLead.desafio"
  | "LeadProposta.plano"
  | "AgenteEscolhido.nome";

export interface VariavelDoModelo {
  /** O `n` de `{{n}}` — inteiro, sequencial, começando em 1. */
  posicao: number;
  fonte: FonteDoDado;
  /** O valor que a Meta mostra ao revisor. Fictício, nunca dado de cliente. */
  exemplo: string;
}

export interface ModeloDoEstagio2 {
  name: string;
  language: "pt_BR";
  /**
   * MARKETING quando a casa abre conversa para apresentar ou retomar venda.
   * UTILITY só quando a mensagem dá seguimento a algo que a PESSOA pediu —
   * caso da proposta que ela mesma solicitou.
   */
  category: "MARKETING" | "UTILITY";
  /** Por que esta categoria, e não a outra. */
  porQueACategoria: string;
  /** Em que momento este texto é o certo. */
  momento: string;
  body: string;
  variaveis: VariavelDoModelo[];
}

export const ESTAGIO_2_TEMPLATES: readonly ModeloDoEstagio2[] = [
  {
    name: "foocci_decisor_indicado_01",
    language: "pt_BR",
    category: "MARKETING",
    porQueACategoria:
      "a casa abre a conversa por iniciativa própria para apresentar o Foocci — não há transação nem pedido prévio desta pessoa",
    momento:
      "primeira mensagem ao decisor indicado, quando o SDR já registrou o desafio da casa",
    body:
      "Oi, {{1}}! Aqui é {{2}}, do Foocci. Passaram seu contato no {{3}} como a pessoa que decide o comercial.\n" +
      "Me contaram que o ponto aí hoje é {{4}} — é por aí mesmo?",
    variaveis: [
      { posicao: 1, fonte: "SiteLead.nome", exemplo: "Marcos" },
      { posicao: 2, fonte: "AgenteEscolhido.nome", exemplo: "Ana" },
      { posicao: 3, fonte: "SiteLead.restaurante", exemplo: "Cantina do Porto" },
      { posicao: 4, fonte: "SiteLead.desafio", exemplo: "cliente que pede uma vez e some" },
    ],
  },
  {
    name: "foocci_decisor_indicado_02",
    language: "pt_BR",
    category: "MARKETING",
    porQueACategoria:
      "mesma natureza do _01: abertura comercial por iniciativa da casa",
    momento:
      "primeira mensagem ao decisor indicado quando o SDR NÃO capturou o desafio — sem dado, o _01 não pode sair",
    body:
      "Oi, {{1}}! Aqui é {{2}}, do Foocci. Passaram seu contato no {{3}} como a pessoa que decide o comercial.\n" +
      "Antes de eu te explicar qualquer coisa, queria entender como vocês fazem o cliente voltar hoje.",
    variaveis: [
      { posicao: 1, fonte: "SiteLead.nome", exemplo: "Marcos" },
      { posicao: 2, fonte: "AgenteEscolhido.nome", exemplo: "Ana" },
      { posicao: 3, fonte: "SiteLead.restaurante", exemplo: "Cantina do Porto" },
    ],
  },
  {
    name: "foocci_decisor_retomada_01",
    language: "pt_BR",
    category: "MARKETING",
    porQueACategoria:
      "retomada comercial de uma conversa que não virou pedido nem proposta — continua sendo iniciativa da casa",
    momento: "o decisor conversou, parou de responder, e a janela de 24h fechou",
    body:
      "Oi, {{1}}! Aqui é {{2}}, do Foocci. Nossa conversa sobre {{3}} ficou parada e eu não quis sumir sem te dar um retorno.\n" +
      "Se ainda fizer sentido aí, me diz por onde você prefere continuar.",
    variaveis: [
      { posicao: 1, fonte: "SiteLead.nome", exemplo: "Marcos" },
      { posicao: 2, fonte: "AgenteEscolhido.nome", exemplo: "Ana" },
      { posicao: 3, fonte: "SiteLead.desafio", exemplo: "cliente que pede uma vez e some" },
    ],
  },
  {
    name: "foocci_proposta_retomada_01",
    language: "pt_BR",
    category: "UTILITY",
    porQueACategoria:
      "dá seguimento a uma proposta que a PRÓPRIA pessoa pediu — é a continuação de uma solicitação dela, não oferta nova",
    momento: "a proposta foi enviada, a pessoa não respondeu, e a janela fechou",
    body:
      "Oi, {{1}}! Aqui é {{2}}, do Foocci. A proposta do {{3}} que te enviei continua de pé e eu fiquei sem seu retorno.\n" +
      "Me diz o que faltou nela para eu ajustar do seu lado.",
    variaveis: [
      { posicao: 1, fonte: "SiteLead.nome", exemplo: "Marcos" },
      { posicao: 2, fonte: "AgenteEscolhido.nome", exemplo: "Ana" },
      { posicao: 3, fonte: "LeadProposta.plano", exemplo: "plano Essencial" },
    ],
  },
] as const;

/** Os nomes do estágio 2 — a chave, como em `MODELOS_DO_PRIMEIRO_CONTATO`. */
export const MODELOS_DO_ESTAGIO_2 = ESTAGIO_2_TEMPLATES.map((m) => m.name);

/**
 * O corpo com `{{n}}` trocado pelos exemplos — é o que a Meta guarda em
 * `example.body_text` e o que a rubrica avalia. Avaliar o texto com `{{1}}`
 * cru mediria a marcação, não a frase que a pessoa lê.
 */
export function corpoComExemplos(modelo: ModeloDoEstagio2): string {
  return modelo.body.replace(/\{\{(\d+)\}\}/g, (_m, n: string) => {
    const v = modelo.variaveis.find((x) => x.posicao === Number(n));
    return v ? v.exemplo : `{{${n}}}`;
  });
}

/** Os exemplos na ordem das posições — o `body_text` que a Meta exige. */
export function exemplosNaOrdem(modelo: ModeloDoEstagio2): string[] {
  return [...modelo.variaveis].sort((a, b) => a.posicao - b.posicao).map((v) => v.exemplo);
}

/**
 * ⛔ FAIL-CLOSED: este modelo pode sair para ESTE contato?
 *
 * Mesma doutrina de `escolherModeloDoPrimeiroContato`: variável sem dado não
 * vira string vazia nem valor inventado — o modelo simplesmente não é elegível.
 * A Meta recusa o disparo de qualquer jeito; a diferença é descobrir isso aqui,
 * de graça, em vez de contato a contato.
 */
export function modeloPodeSair(
  modelo: ModeloDoEstagio2,
  dados: Partial<Record<FonteDoDado, string | null | undefined>>,
): boolean {
  return modelo.variaveis.every((v) => (dados[v.fonte] ?? "").trim().length > 0);
}
