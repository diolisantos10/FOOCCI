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
    /**
     * ⭐ TEXTO DO CEO, 18/09/2026 — aprovado por ele, palavra por palavra.
     * Ele recusou a versão anterior ("o que te fez procurar a gente?") porque
     * devolve uma REDAÇÃO para o cliente escrever. A pergunta daqui responde-se
     * com uma palavra, e cada resposta já diz ao closer por onde entrar.
     * ⚠️ Tom e pontuação não se ajustam sem ele.
     */
    name: "foocci_lead_formulario_01",
    language: "pt_BR",
    category: CATEGORIA_DO_LEAD_DE_FORMULARIO,
    porQueACategoria:
      "a pessoa pediu o contato, mas o propósito é abrir conversa comercial e não dar seguimento a uma transação — UTILITY aqui seria classificação frouxa, e modelo mal classificado a Meta derruba",
    momento: "o principal: primeira mensagem a quem preencheu formulário/campanha",
    body:
      "Oi, {{1}}! Tudo certo? 😊 Aqui é da Foocci. Vi que você deixou seu contato para conhecer a plataforma.\n" +
      "Hoje vocês vendem mais pelo iFood, pelo WhatsApp ou pelos dois?",
    variaveis: [{ posicao: 1, fonte: "SiteLead.nome", exemplo: "Marcos" }],
  },
  {
    /** Reserva — só onde "acabou de chegar" é VERDADE. Texto do CEO. */
    name: "foocci_lead_formulario_02",
    language: "pt_BR",
    category: CATEGORIA_DO_LEAD_DE_FORMULARIO,
    porQueACategoria: "mesma natureza do _01",
    momento: "reserva, quando o contato acabou de chegar e a frase é verdade",
    body:
      "Oi, {{1}}! 😊 Aqui é da Foocci. Seu contato acabou de chegar pra gente e eu vim pessoalmente te receber.\n" +
      "Me conta: como vocês recebem os pedidos hoje?",
    variaveis: [{ posicao: 1, fonte: "SiteLead.nome", exemplo: "Marcos" }],
  },
  {
    /**
     * Sem o nome do restaurante — e é ele que a pergunta vai buscar, em vez de
     * gastar a primeira mensagem com um dado que o Lead Ads não traz.
     * Texto do CEO.
     */
    name: "foocci_lead_formulario_03",
    language: "pt_BR",
    category: CATEGORIA_DO_LEAD_DE_FORMULARIO,
    porQueACategoria: "mesma natureza do _01",
    momento: "quando a casa NÃO tem o nome do restaurante — a pergunta preenche a ficha",
    body:
      "Olá, {{1}}! Que bom ter você por aqui 😊 Vi que você se interessou pela Foocci e deixou seu contato. Me conta: qual é o nome do seu restaurante?",
    variaveis: [{ posicao: 1, fonte: "SiteLead.nome", exemplo: "Marcos" }],
  },
] as const;

/**
 * ⚠️ NENHUM DELES CITA O NOME DO RESTAURANTE, de propósito: o Lead Ads garante
 * nome, e-mail e telefone — e só. Variável sem fonte é disparo que falha na
 * Meta. Só `{{1}}` = nome da pessoa, nos três.
 */
export const MODELO_DE_FORMULARIO_QUE_PERGUNTA_O_RESTAURANTE = "foocci_lead_formulario_03";

/** Os nomes — a chave, como em `MODELOS_DO_PRIMEIRO_CONTATO`. */
export const MODELOS_DO_LEAD_DE_FORMULARIO = LEAD_FORMULARIO_TEMPLATES.map((m) => m.name);
