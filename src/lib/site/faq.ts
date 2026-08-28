/**
 * AS PERGUNTAS QUE O VISITANTE FAZ — fonte única.
 *
 * ── POR QUE ISTO SAIU DE DENTRO DO COMPONENTE ───────────────────────────────
 *
 * Estas nove respostas viviam como um `const` local dentro de `FAQSection.tsx`,
 * que é `"use client"`. Elas são a coisa mais próxima de uma **base de verdade
 * comercial** que a casa tem: foram escritas para o prospect, estão publicadas
 * no site e passaram pelo CEO.
 *
 * Em 25/08/2026 o TA — o vendedor de IA — precisou delas, e precisou do lado do
 * servidor. Copiar o array para o serviço criaria duas versões da mesma resposta:
 * o site diria uma coisa ao visitante e o vendedor diria outra ao mesmo
 * visitante, no WhatsApp, no mesmo dia. É a falha de "duas cópias" que este
 * repositório já pagou caro em preço.
 *
 * Então o texto mora aqui, sem `"use client"`, e os dois leem: a página imprime,
 * o TA consulta. **Editar uma resposta muda os dois no mesmo commit.**
 *
 * ── O QUE ENTRA AQUI, E O QUE NÃO ───────────────────────────────────────────
 *
 * Entra o que o Foocci já afirma **em público**. Não entra promessa nova, não
 * entra recurso que ninguém publicou e não entra preço — preço tem fonte própria
 * (`@/lib/billing/pricing`), e duplicá-lo aqui seria a quinta tabela.
 */

export interface PerguntaDoSite {
  q: string;
  a: string;
}

export const FAQS: readonly PerguntaDoSite[] = [
  {
    q: "O Foocci já está disponível?",
    a: "Sim. O Foocci está aberto para restaurantes. Tire suas dúvidas com os nossos agentes pelo botão de contato aqui do site.",
  },
  {
    q: "Posso contratar agora?",
    a: "Pode. A entrada é por conversa: você fala com os nossos agentes, a gente entende a sua operação e monta a proposta certa para o seu momento.",
  },
  {
    q: "Quanto custa?",
    a: "Os planos e os valores estão na página de preços. Se a sua operação não se encaixar nos três, fale com os nossos agentes e a gente monta a proposta certa.",
  },
  {
    q: "O Foocci é um chatbot?",
    a: "Não. O Foocci usa inteligência artificial, mas é um sistema de vendas, relacionamento e fidelização para restaurantes.",
  },
  {
    q: "Preciso trocar meu sistema atual?",
    a: "Não necessariamente. O Foocci pode atuar como uma camada comercial para melhorar pedido direto, atendimento e relacionamento.",
  },
  {
    q: "O Foocci funciona com WhatsApp?",
    a: "Sim, o WhatsApp é um dos canais centrais da experiência Foocci, principalmente para atendimento, relacionamento e retorno de clientes.",
  },
  {
    q: "O Foocci substitui meu atendente?",
    a: "Não. O assistente Foocci ajuda a equipe a atender melhor, vender com mais contexto e manter o restaurante no controle.",
  },
  {
    q: "O Foocci serve para restaurante pequeno?",
    a: "Sim. O Foocci foi pensado para simplificar vendas, relacionamento e recorrência sem exigir uma operação complexa.",
  },
  {
    q: "Preciso entender de tecnologia?",
    a: "Não. A tecnologia trabalha no bastidor. A experiência precisa ser simples para o dono, a equipe e o cliente.",
  },
  /*
    ⚠️ ENTRADA NOVA EM 28/08/2026 — E ELA CORRIGE UM BURACO QUE CUSTAVA VENDA.

    As nove respostas acima dizem "restaurante" nove vezes e **bar nenhuma**.
    Só que o público real é bem maior, e o site descrevia um menor.

    ── A LISTA VEIO DO CEO, E JÁ ESTAVA NO CÓDIGO ──────────────────────────

    Ele definiu o alcance assim, em 28/08: *"o Foocci atende todos os
    estabelecimentos que o iFood e o 99 atendem. Então a gente atende bares sim,
    porque bares vendem comida. E bares vendem bebida. A gente atende delivery
    no geral."*

    A lista abaixo não foi inventada aqui: é **a mesma** que o qualificador já
    usava internamente (`salaDeVendas/ta/sondagem.ts`), escrita a partir de uma
    definição anterior do próprio CEO — *"quem vende comida ou bebida para
    consumo"*. O agente sabia quem qualificar; o site é que não sabia contar.
    Agora as duas pontas leem a mesma coisa.

    ── ⚠️ O IFOOD É A RÉGUA, POR DECISÃO DO CEO ───────────────────────────

    Eu tinha escrito este texto **sem** citar o iFood, com receio de que a
    promessa crescesse sozinha quando o catálogo deles crescesse. Levei a
    ressalva ao CEO e ele decidiu o contrário, com todas as letras:

      *"Use sempre o iFood como referência pra responder essas perguntas. Os
      mesmos clientes do iFood."*

    Decisão dele, registrada, e é ela que vale. A régua tem uma vantagem real
    que o meu texto não tinha: **ela responde sozinha o caso que ninguém
    previu.** Quando aparecer um formato que não está em lista nenhuma, a
    pergunta deixa de ser "será que atendemos?" e vira "o iFood atende?" — que
    qualquer pessoa consegue checar em trinta segundos.

    A lista continua no texto como exemplo, não como limite, porque é ela que
    faz o dono reconhecer o negócio DELE escrito ali.

    ⚠️ **A consequência prática, e ela é grande:** o qualificador
    (`ta/sondagem.ts`) desqualificava farmácia e mercado. Pela régua nova eles
    passam a contar, porque o iFood os atende. Está alinhado lá, no mesmo
    commit — as duas pontas não podem discordar sobre quem é cliente.

    Duas coisas quebravam por causa disso, e as duas na véspera de começar a
    abordar leads:

      · O dono de bar que lê o site se autodesqualifica antes de falar com
        alguém. Ninguém mede essa perda, porque ela acontece antes do primeiro
        contato.
      · O TA **não podia afirmar** que o Foocci atende bar. A base de verdade
        dele é derivada do que está publicado, de propósito — então a pergunta
        *"vocês atendem bar?"*, medida, voltava sem material nenhum, e ele
        respondia "vou confirmar" para a pergunta mais fácil que existe.

    O texto abaixo não promete recurso novo: repete o público que o CEO já
    definiu e o mesmo enquadramento que as respostas acima já publicam.

    ⚠️ Entrou no FIM da lista porque o id do item na base de verdade é
    `faq-${índice}`. Inserir no meio renomearia os ids dos itens seguintes, e
    esses ids são o que fica gravado em `LeadHandoff` como apoio da resposta —
    ou seja, a trilha do que já foi dito passaria a apontar para outra coisa.
  */
  {
    q: "Que tipo de estabelecimento o Foocci atende?",
    a: "Os mesmos estabelecimentos que o iFood atende. Restaurante, bar, boteco, lanchonete, pizzaria, hamburgueria, japonês, cafeteria, padaria, confeitaria, doceria, açaí, sorveteria, food truck, adega, marmitaria, self-service, dark kitchen, mercado, mercearia, conveniência e delivery em geral. Se você vende no iFood, ou poderia vender, o Foocci é para você — a proposta é a mesma: pedido direto, atendimento e relacionamento com o cliente.",
  },
];
