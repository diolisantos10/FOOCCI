/**
 * GUIA COMERCIAL DE CONVERSAÇÃO E DEMONSTRAÇÃO — FOOCCI
 *
 * Ferramenta de orientação, NÃO script e NÃO trava.
 *
 * A conversa real sempre vem primeiro: o agente adapta linguagem, ordem,
 * perguntas e profundidade ao que o lead acabou de dizer e ao que a casa já
 * sabe. Os exemplos abaixo existem para ampliar repertório, nunca para serem
 * copiados mecanicamente.
 *
 * A verdade do produto continua vindo das fontes aprovadas do TA. Este guia
 * ensina COMO conduzir e QUAL prova do site pode ajudar em cada momento; ele
 * não autoriza inventar capacidade, preço, prazo ou resultado.
 */

export const GUIA_COMERCIAL_VERSAO = "foocci-guia-conversacao-demonstracao-2026-09-14-v1";
export const GUIA_COMERCIAL_ORIENTACAO_BASE_ID = "guia-comercial:principios";

export interface ItemDoGuiaComercial {
  id: string;
  capitulo: "guia-comercial";
  secao: string;
  texto: string;
}

export const GUIA_COMERCIAL_PARA_CONHECIMENTO: readonly ItemDoGuiaComercial[] = [
  {
    id: GUIA_COMERCIAL_ORIENTACAO_BASE_ID,
    capitulo: "guia-comercial",
    secao: "Como usar este guia",
    texto: [
      "Isto é uma ferramenta de orientação, não um roteiro rígido.",
      "A conversa atual e os fatos já coletados têm prioridade sobre qualquer exemplo do guia.",
      "Não repita pergunta já respondida. Não force uma sequência só porque ela existe no funil.",
      "Explique pouco e demonstre quando uma prova visual ajudar. Uma dor ou dúvida por vez pede uma prova principal, não uma chuva de links.",
      "Antes de mandar uma pergunta, saiba o que a resposta mudará. Antes de mandar uma mensagem, saiba qual pequeno avanço você espera depois dela.",
      "Quando o lead fizer uma pergunta, responda primeiro; só depois qualifique, se ainda fizer sentido.",
      "Depois de enviar uma demonstração, diga o que observar e continue a conversa explorando a reação do lead.",
      "Adapte palavras, ordem e profundidade ao contexto. Nunca copie os exemplos mecanicamente.",
    ].join("\n"),
  },
  {
    id: "guia-comercial:como-funciona",
    capitulo: "guia-comercial",
    secao: "O que é o Foocci e como funciona",
    texto: [
      "Quando o lead ainda quer entender o sistema como um todo, responda em poucas frases e use a visão geral como prova.",
      "Recurso oficial: https://foocci.com.br/site/como-funciona",
      "Apresente o link com contexto e uma missão simples, por exemplo: veja a jornada do pedido até o relacionamento com o cliente.",
      "Depois, descubra qual etapa dessa jornada é mais relevante para a operação dele.",
    ].join("\n"),
  },
  {
    id: "guia-comercial:ifood-simulador",
    capitulo: "guia-comercial",
    secao: "iFood, marketplace, comissão, taxa e simulador",
    texto: [
      "Quando a dor for comissão, taxa, margem ou dependência de marketplace/iFood, use o simulador antes de fazer conta genérica.",
      "Recurso oficial: https://foocci.com.br/",
      "Convide o lead a colocar faturamento e taxa reais para discutir o cenário dele.",
      "O simulador é estimativa baseada em dados e premissas; nunca trate economia, migração, faturamento ou resultado como garantia.",
    ].join("\n"),
  },
  {
    id: "guia-comercial:cardapios",
    capitulo: "guia-comercial",
    secao: "Cardápios, QR de mesa, delivery sem IA e delivery com IA",
    texto: [
      "Quando o lead quiser ver o cardápio ou a experiência de compra, prefira fazê-lo experimentar em vez de explicar tudo por texto.",
      "Recurso oficial: https://foocci.com.br/site/experimente",
      "Há três experiências para demonstrar conforme a dúvida: QR de mesa para salão; delivery tradicional sem IA; delivery com Garçom de IA.",
      "Diga qual experiência testar e o que fazer nela. Na experiência com IA, por exemplo, peça que converse como falaria com um garçom e peça uma recomendação.",
      "Não antecipe todas as respostas da experiência: deixe o produto demonstrar parte do valor.",
    ].join("\n"),
  },
  {
    id: "guia-comercial:atendimento-ia",
    capitulo: "guia-comercial",
    secao: "Atendimento com IA, Garçom, recomendação e venda adicional",
    texto: [
      "Quando a conversa for sobre IA, atendimento, recomendação, adicionais ou condução do pedido, use a demonstração do atendimento com IA.",
      "Recurso oficial: https://foocci.com.br/site/atendimento-com-ia",
      "Explique em poucas frases e conecte ao que o restaurante vive hoje. Depois da prova, explore se a operação atual consegue sugerir complementos, bebidas, sobremesas ou adicionais de forma consistente.",
    ].join("\n"),
  },
  {
    id: "guia-comercial:crm",
    capitulo: "guia-comercial",
    secao: "CRM, base própria, recompra, recorrência e campanhas",
    texto: [
      "Quando a dor for cliente que não volta, base desorganizada, campanhas, fidelização ou recorrência, use o CRM como prova.",
      "Recurso oficial: https://foocci.com.br/site/crm",
      "A conversa deve ligar o pedido à possibilidade de conhecer e reativar a própria base, sem transformar a resposta em lista de funcionalidades.",
      "Depois da demonstração, uma boa linha de investigação é descobrir se hoje o restaurante sabe quem comprou há semanas e não voltou.",
    ].join("\n"),
  },
  {
    id: "guia-comercial:solucoes",
    capitulo: "guia-comercial",
    secao: "Soluções e recursos do sistema",
    texto: [
      "Quando o lead perguntar tudo que o sistema faz ou trouxer uma necessidade operacional ampla, use a página de soluções como mapa, não como checklist falado.",
      "Recurso oficial: https://foocci.com.br/site/solucoes",
      "Convide o lead a apontar o que mais importa para a operação dele e aprofunde somente o que for relevante.",
    ].join("\n"),
  },
  {
    id: "guia-comercial:precos",
    capitulo: "guia-comercial",
    secao: "Preço, planos e contratação",
    texto: [
      "Quando o lead perguntar preço, responda a pergunta de preço; não esconda a informação atrás de uma bateria de qualificação.",
      "Recurso oficial: https://foocci.com.br/site/precos",
      "Use apenas valores e condições vindos da verdade comercial aprovada. Depois, se houver contexto suficiente, ajude a identificar qual plano parece mais aderente sem inventar condição nem fechar em nome do cliente.",
    ].join("\n"),
  },
] as const;

const PRINCIPIOS_COMPACTOS = [
  "FERRAMENTA, NÃO SCRIPT: adapte linguagem, ordem e profundidade; a conversa real vence o exemplo.",
  "RESPONDA ANTES DE QUALIFICAR: se o lead perguntou algo, responda primeiro.",
  "NÃO REPITA: fato já informado conta como coletado.",
  "EXPLIQUE POUCO, DEMONSTRE MUITO: quando prova visual ajudar, use o recurso oficial adequado.",
  "UMA DÚVIDA/DOR → UMA PROVA PRINCIPAL: não despeje vários links.",
  "CONTEXTO → PROVA → MISSÃO → REAÇÃO: diga por que envia, mostre, diga o que observar e continue a conversa depois.",
  "PERGUNTA COM MOTIVO: só pergunte algo se a resposta puder mudar o próximo movimento.",
  "SEM PROMESSAS: simulador é estimativa; preço, capacidade, prazo e resultado continuam presos à verdade aprovada.",
] as const;

export function guiaComercialParaPrompt(): string {
  const recursos = [
    "Visão geral / como funciona → https://foocci.com.br/site/como-funciona",
    "Comissão, iFood, marketplace, taxa, margem → simulador em https://foocci.com.br/",
    "Cardápios / QR / delivery com e sem IA → https://foocci.com.br/site/experimente",
    "Atendimento / Garçom de IA / recomendações → https://foocci.com.br/site/atendimento-com-ia",
    "CRM / recompra / recorrência / campanhas → https://foocci.com.br/site/crm",
    "Soluções / recursos do sistema → https://foocci.com.br/site/solucoes",
    "Preço / planos → https://foocci.com.br/site/precos",
  ];

  return [
    `GUIA DE CONVERSAÇÃO E DEMONSTRAÇÃO — ${GUIA_COMERCIAL_VERSAO}`,
    ...PRINCIPIOS_COMPACTOS.map((p, i) => `${i + 1}. ${p}`),
    "RECURSOS OFICIAIS — escolha só o que responde ao momento atual:",
    ...recursos.map((r) => `- ${r}`),
    "Depois de qualquer demonstração, explore a reação do lead e escolha o próximo passo pelo que ele respondeu — não por uma sequência mecânica.",
  ].join("\n");
}
