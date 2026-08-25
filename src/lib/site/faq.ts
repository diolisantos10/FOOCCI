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
];
