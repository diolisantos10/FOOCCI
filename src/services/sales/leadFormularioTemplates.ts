/**
 * ⭐ O LEAD QUE PREENCHEU O FORMULÁRIO — o texto MORNO, que não existia.
 *
 * ── O BURACO QUE ISTO TAPA (18/09/2026) ─────────────────────────────────────
 *
 * Três leads do Facebook Lead Ads entraram com `fonte = CAMPANHA_PAGA`. Eles
 * deram nome, e-mail e telefone à Meta **pedindo contato**. O catálogo da casa
 * só tinha dois jogos de texto: o FRIO do estágio 1 ("Este contato é do {{1}},
 * certo?") e o do decisor indicado, do estágio 2. Nenhum dos dois serve:
 *
 *   · o frio trata como estranho quem levantou a mão — é constrangedor e queima
 *     o lead no primeiro toque;
 *   · o do estágio 2 fala de uma indicação que aqui não existe.
 *
 * ── ⚠️ POR QUE AINDA PRECISA SER MODELO APROVADO ────────────────────────────
 *
 * Autorização para falar a casa tem (a pessoa pediu). O que ela NÃO tem é a
 * janela de 24h: a janela da Meta abre quando a PESSOA escreve para o número.
 * Preencher formulário não abre nada. Então a primeira mensagem continua sendo
 * modelo aprovado — só que um modelo **morno**, não frio.
 *
 * ── POR QUE MORA EM ARQUIVO PRÓPRIO ─────────────────────────────────────────
 *
 * Não em `coldContactDiscovery.ts`: lá é o estágio 1, e o único critério de
 * entrada daquele arquivo é *número frio que talvez seja um bot de pedidos*.
 * Um texto morno no meio dos frios é a porta aberta para alguém sortear os
 * quatro juntos um dia.
 *
 * Não em `estagio2Templates.ts`: lá é a conversa NOVA com o decisor que o SDR
 * capturou — outro momento, outro pressuposto (alguém indicou a pessoa).
 *
 * Aqui é o ESTÁGIO 1-B: primeiro contato, mas com quem pediu. Arquivo próprio,
 * e **reusando o tipo e os utilitários do estágio 2** (`ModeloDoEstagio2`,
 * `exemplosNaOrdem`, `modeloPodeSair`), porque a disciplina de variável com
 * fonte declarada é a mesma e duplicá-la seria criar uma segunda verdade.
 *
 * ── ⚠️ NENHUM PREÇO, NÚMERO OU PROMESSA ─────────────────────────────────────
 *
 * Mesma regra do estágio 2: preço muda, modelo aprovado não. E estes textos
 * não vendem — quem vende é o closer, dentro da janela. Esta é a mão que
 * recebe: reconhece o pedido e abre UMA pergunta.
 */

import type { ModeloDoEstagio2 } from "./estagio2Templates";

/**
 * ⭐ POR QUE MARKETING, E NÃO UTILITY.
 *
 * Pesa a favor de UTILITY: a pessoa solicitou o contato, e UTILITY é a
 * categoria do seguimento de algo que a própria pessoa pediu.
 *
 * Pesa mais contra: para a Meta, UTILITY é seguimento de uma **transação ou de
 * um evento de conta já em curso** (pedido, entrega, cobrança, agendamento
 * confirmado). Um formulário de interesse não é transação, e o propósito desta
 * mensagem é abrir uma conversa COMERCIAL. Classificar como UTILITY um texto de
 * origem comercial é o caminho conhecido para a Meta reclassificar sozinha ou
 * derrubar o modelo — e um modelo derrubado para de sair sem avisar.
 *
 * Então: **MARKETING**, que é a categoria honesta. O custo é a taxa de
 * marketing; o benefício é um modelo que não cai.
 */
export const CATEGORIA_DO_LEAD_DE_FORMULARIO = "MARKETING" as const;

export const LEAD_FORMULARIO_TEMPLATES: readonly ModeloDoEstagio2[] = [
  {
    name: "foocci_lead_formulario_01",
    language: "pt_BR",
    category: CATEGORIA_DO_LEAD_DE_FORMULARIO,
    porQueACategoria:
      "a pessoa pediu o contato, mas o propósito é abrir conversa comercial e não dar seguimento a uma transação — UTILITY aqui seria classificação frouxa, e modelo mal classificado a Meta derruba",
    momento:
      "primeira mensagem a quem preencheu formulário/campanha e cujo nome de restaurante a casa tem",
    body:
      "Oi, {{1}}! Aqui é {{2}}, do Foocci. Você deixou seu contato pedindo pra gente te chamar sobre o {{3}}.\n" +
      "Pra eu te responder do jeito certo: o que te fez procurar a gente?",
    variaveis: [
      { posicao: 1, fonte: "SiteLead.nome", exemplo: "Marcos" },
      { posicao: 2, fonte: "AgenteEscolhido.nome", exemplo: "Ana" },
      { posicao: 3, fonte: "SiteLead.restaurante", exemplo: "Cantina do Porto" },
    ],
  },
  {
    /**
     * ⚠️ A VARIANTE SEM O NOME DA CASA existe porque o formulário do Lead Ads
     * garante nome, e-mail e telefone — e só. O nome do restaurante é campo
     * opcional, e sem ele o `_01` seria recusado pela Meta contato a contato.
     */
    name: "foocci_lead_formulario_02",
    language: "pt_BR",
    category: CATEGORIA_DO_LEAD_DE_FORMULARIO,
    porQueACategoria: "mesma natureza do _01",
    momento:
      "primeira mensagem a quem preencheu formulário/campanha quando a casa NÃO tem o nome do restaurante",
    body:
      "Oi, {{1}}! Aqui é {{2}}, do Foocci. Você deixou seu contato pedindo pra gente te chamar por aqui.\n" +
      "Antes de eu te explicar qualquer coisa: o que te fez procurar a gente?",
    variaveis: [
      { posicao: 1, fonte: "SiteLead.nome", exemplo: "Marcos" },
      { posicao: 2, fonte: "AgenteEscolhido.nome", exemplo: "Ana" },
    ],
  },
] as const;

/** Os nomes — a chave, como em `MODELOS_DO_PRIMEIRO_CONTATO`. */
export const MODELOS_DO_LEAD_DE_FORMULARIO = LEAD_FORMULARIO_TEMPLATES.map((m) => m.name);
