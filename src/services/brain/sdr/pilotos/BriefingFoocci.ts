/**
 * BriefingFoocci — a sondagem do primeiro cliente fixo da Dioli.
 *
 * A Foocci é cliente da Dioli, não um cenário de teste. Este arquivo é o
 * briefing dela: o que já se sabe, de ONDE se sabe, e o que segue esperando o
 * dono responder. Vive no código, e não num documento solto, por um motivo
 * prático — documento não trava proposta errada; este estado passa pela mesma
 * `avaliarSondagem` que qualquer outro cliente e é reprovado pelas mesmas
 * regras se alguém inventar um campo.
 *
 * A regra que mandou aqui, e que vale mais que completude:
 *
 *   NÃO INVENTAR. Toda resposta abaixo aponta para uma fonte verificável no
 *   repositório ou para uma fala do dono. O que não tem fonte NÃO foi
 *   preenchido — foi para `PENDENTES`, que registra a pergunta como feita e
 *   deixa o plano sair com a pendência impressa no rodapé.
 *
 * É a diferença que a `Sondagem` inteira defende: falta de resposta é
 * aceitável e vai declarada; palpite disfarçado de resposta é o que produz
 * plano prometendo material que ninguém tem.
 *
 * Determinístico: sem IA, sem banco, sem rede. Quem persiste é
 * `scripts/seed-briefing-foocci.ts`, pela mesma porta de memória do SDR.
 */

import type { EstadoDaSondagem, ServicoContratado } from "../../oficina/Sondagem";

/** O cliente dentro da agência. A chave final é `${agenciaId}::foocci`. */
export const CLIENTE_ID = "foocci";

/** Segunda-feira do lançamento comercial. Manda no calendário inteiro. */
export const DATA_DE_LANCAMENTO = "03/08/2026";

// ─────────────────────────────────────────────────────────────────────────────
//  As respostas — cada uma com a fonte que a sustenta
// ─────────────────────────────────────────────────────────────────────────────

export interface RespostaComFonte {
  /** O que entra na ficha, escrito como o cliente falaria. */
  valor: string;
  /** Onde conferir. Sem isto a resposta não entra. */
  fonte: string;
}

/**
 * O que a Foocci já respondeu.
 *
 * Só entram chaves que existem em `CAMPOS_DA_FICHA` — o teste ao lado quebra
 * se alguém inventar um campo novo por aqui.
 */
export const RESPOSTAS: Record<string, RespostaComFonte> = {
  quem_decide: {
    valor:
      "Dioli Santos, fundador da Foocci. É ele quem decide e aprova o que vai ao ar.",
    fonte: "dono do produto e do repositório; o CLAUDE.md e os docs tratam o dono como decisor único",
  },

  o_que_vende: {
    valor:
      "Foocci: assinatura de um sistema de vendas, relacionamento e fidelização para restaurantes. " +
      "Três frentes no mesmo produto — agente de WhatsApp que conduz o cliente até o pedido, " +
      "cardápio e pedido direto (link e QR na mesa) e um CRM que traz o cliente de volta. " +
      "Os planos ainda estão em definição para o lançamento comercial.",
    fonte: "docs/foocci-site/copy-decisions-v1.md (definição aprovada); src/app/site/(gated)/precos; FICHA_TECNICA.md",
  },

  publico: {
    valor:
      "Dono de restaurante pequeno e médio no Brasil que já vende por WhatsApp, depende de " +
      "marketplace e não tem nada próprio de relacionamento — o cliente pede, some, e ele não " +
      "sabe quem foi. Hoje existe restaurante-piloto rodando em produção de verdade, com pedido, " +
      "impressão na cozinha e CRM ativos. O nome dele só entra em peça com autorização.",
    fonte: "docs/foocci-site/copy-decisions-v1.md (tom fala com o dono do restaurante); piloto em produção",
  },

  regiao: {
    valor:
      "Brasil inteiro. É produto digital, não tem raio de entrega. Tudo em português do Brasil, " +
      "com Pix, cartão e nota fiscal brasileira.",
    fonte: "produto todo em pt-BR; MercadoPago/Stone/SumUp; FiscalConfig emite NFC-e via SEFAZ",
  },

  diferencial: {
    valor:
      "A frase que a gente usa: chatbot responde — a Foocci vende, relaciona e ajuda o cliente a " +
      "voltar. E dá para provar em tela: o agente lê o cardápio real e é travado para não afirmar " +
      "o que não está cadastrado (não promete entrega numa cidade que a loja não atende), o pedido " +
      "cai direto na cozinha e o CRM reativa cliente sozinho.",
    fonte: "copy-decisions-v1.md (linha aprovada); guardrail de cobertura de entrega no Brain; CRM ativo",
  },

  site_e_canais: {
    valor:
      "Site em foocci.com.br. Hoje o site comercial vive em /site atrás de senha (prévia privada) e " +
      "vai para a raiz, indexável, no lançamento. WhatsApp comercial de vendas ainda NÃO existe: " +
      "não há número configurado e nenhum botão de WhatsApp aparece no site. Cardápio online é o " +
      "próprio produto.",
    fonte: "docs/foocci-site/pre-launch-mode-v1.md e private-preview-v1.md; WHATSAPP_SALES_NUMBER = null em components/marketing/config.ts",
  },

  identidade_visual: {
    valor:
      "Sim, fechada e escrita. Brand book oficial com logo, mascote e favicon. Laranja #F97316 só " +
      "em CTA e destaque, o resto neutro (~90%). Tipografia com dois pesos embarcados, 400 e 600 — " +
      "não existe outro. Card com raio 2xl, botão e input com xl. Está tudo no DESIGN.md.",
    fonte: "DESIGN.md; docs/foocci-site/brand-implementation-v1.md; docs/foocci-site/brand",
  },

  objetivo: {
    valor:
      "Lançar comercialmente na segunda, 03/08/2026: sair do piloto e abrir venda pública. " +
      "Nos 90 dias seguintes, fechar os primeiros restaurantes pagantes.",
    fonte: "fala do dono (30/07/2026: lançamento na segunda que vem); docs/foocci-site/pre-launch-mode-v1.md",
  },

  datas: {
    valor:
      "03/08/2026, segunda — lançamento comercial. É a data que manda em tudo: é quando o site sai " +
      "do gate de senha, vai para a raiz e passa a ser indexável.",
    fonte: "fala do dono; pre-launch-mode-v1.md (troca de robots no lançamento)",
  },

  proibicoes: {
    valor:
      "Tem, e está escrito. Não posicionar a Foocci como chatbot. Nunca dizer que substitui o " +
      "atendente — a Foocci apoia a equipe. Proibido prometer número ou percentual de aumento. " +
      "Nenhum depoimento, logo de cliente, caso ou métrica inventada: só o que for real e " +
      "autorizado. Não atacar marketplace — o posicionamento é fortalecer o canal direto. Fora do " +
      "vocabulário: omnichannel, agentic, LLM, stack, pipeline, automação cognitiva, máquina de " +
      "vendas. Quando houver dúvida de capacidade, usar ajuda a / permite / organiza / direciona / " +
      "pode integrar, nunca afirmação absoluta.",
    fonte: "docs/foocci-site/copy-decisions-v1.md — palavras a evitar, claims com cautela e verbos de segurança",
  },

  data_inicio: {
    valor: DATA_DE_LANCAMENTO,
    fonte: "fala do dono — publicação começa no dia do lançamento",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
//  O que foi perguntado e ainda não tem resposta
// ─────────────────────────────────────────────────────────────────────────────

export interface Pendente {
  chave: string;
  /** Por que não foi preenchido — a justificativa de não ter chutado. */
  porqueNaoSei: string;
}

/**
 * Perguntado, sem resposta. Vai para `perguntadas` no estado.
 *
 * Isto NÃO é uma lista de coisas esquecidas: é o registro de que a agência
 * perguntou. Por causa dele o plano sai liberado, com estas seis linhas
 * impressas no rodapé em vez de escondidas.
 */
export const PENDENTES: Pendente[] = [
  {
    chave: "redes_sociais",
    porqueNaoSei:
      "não existe um único @ da Foocci em lugar nenhum do repositório ou dos docs — inventar perfil é o pior chute possível",
  },
  {
    chave: "historico",
    porqueNaoSei: "não há histórico de publicação registrado; a conta não aparece em nenhum documento",
  },
  {
    chave: "concorrentes",
    porqueNaoSei:
      "os docs dizem o que a Foocci NÃO é (chatbot, ERP, marketplace), mas nunca nomeiam um concorrente — nomear seria invenção",
  },
  {
    chave: "acesso_contas",
    porqueNaoSei:
      "decisão operacional do dono: a Dioli conecta e publica, ou entrega pronto para ele postar? Muda entrega, aprovação e relatório",
  },
  {
    chave: "metricas_atuais",
    porqueNaoSei: "sem saber a conta, não há seguidor nem engajamento de partida para comparar depois",
  },
  {
    chave: "como_mede",
    porqueNaoSei:
      "dá para supor 'restaurantes pagantes', mas o número que o dono realmente olha define o que a agência reporta — supor aqui gera cobrança por métrica que ninguém combinou",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
//  Os serviços do ciclo de lançamento
// ─────────────────────────────────────────────────────────────────────────────

/**
 * O pacote do primeiro ciclo — proposta da Dioli, à espera do aceite.
 *
 * Duas escolhas deliberadas, e as duas têm motivo:
 *
 * 1. Tudo que entrou é produzível pela agência a partir do que JÁ existe: o
 *    produto no ar, o brand book e o site. Nenhuma peça depende de gravação
 *    presencial ou do fundador na câmera — porque isso não foi combinado, e
 *    calendário que depende de material não combinado para na primeira semana.
 *
 * 2. Ficaram de fora tráfego pago, gestão de comunidade e relatório. Não por
 *    desimportância: cada um exige um dado que só o dono tem (verba, tempo de
 *    resposta, acesso às métricas). Entrar com eles em aberto travaria a
 *    proposta inteira — a `Sondagem` reprova serviço sem definição. Entram no
 *    segundo ciclo, assim que ele responder.
 *
 * Story é o único `misto` do pacote: bastidor de lançamento é material do dia,
 * e dia a dia quem tem é o cliente. Declarado assim, o plano marca essas peças
 * como dependentes dele — que é exatamente o aviso que precisa aparecer.
 */
export const SERVICOS: ServicoContratado[] = [
  {
    chave: "reels",
    origemDoInsumo: "agencia",
    definicoes: {
      tipo_de_reels:
        "tela do produto em uso, motion com a marca e recortes do site — sem gravação presencial e sem fundador na câmera neste primeiro ciclo",
      quantidade: "8 por mês",
    },
  },
  {
    chave: "carrossel",
    origemDoInsumo: "agencia",
    definicoes: { quantidade: "8 por mês" },
  },
  {
    chave: "story",
    origemDoInsumo: "misto",
    quemExecuta:
      "a Dioli produz o story a partir do produto e da marca; quando for bastidor do lançamento, Dioli Santos manda a foto ou o vídeo do dia",
    definicoes: { quantidade: "5 por semana" },
  },
  {
    chave: "legenda",
    origemDoInsumo: "agencia",
    definicoes: {
      tom:
        "humano e comercial, simples e direto, premium e acolhedor — fala com o dono do restaurante, não com um CTO. Frase curta, benefício claro, zero jargão de IA",
    },
  },
];

/** Serviços que só entram quando o dono responder — com o que falta em cada um. */
export const SEGUNDO_CICLO: { chave: string; falta: string }[] = [
  { chave: "trafego",    falta: "verba mensal de mídia e para onde a pessoa vai (WhatsApp, site ou perfil)" },
  { chave: "comunidade", falta: "em quanto tempo a Foocci espera resposta em comentário e direct" },
  { chave: "relatorio",  falta: "periodicidade — e depende da resposta sobre conectar as contas" },
];

// ─────────────────────────────────────────────────────────────────────────────
//  O estado
// ─────────────────────────────────────────────────────────────────────────────

/** O briefing pronto para a `avaliarSondagem` e para a memória do SDR. */
export function briefingFoocci(): EstadoDaSondagem {
  const ficha: Record<string, string> = {};
  for (const [chave, r] of Object.entries(RESPOSTAS)) ficha[chave] = r.valor;

  return {
    ficha,
    perguntadas: PENDENTES.map((p) => p.chave),
    // cópia profunda: quem receber o estado não altera a constante do módulo
    servicos: SERVICOS.map((s) => ({ ...s, definicoes: { ...(s.definicoes ?? {}) } })),
  };
}
