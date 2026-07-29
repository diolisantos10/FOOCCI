/**
 * Sondagem — o que precisa estar sabido antes de existir proposta.
 *
 * Nasceu de uma falha real: a agência entregou planejamento de reels sem nunca
 * ter perguntado de onde viria o vídeo, quem gravaria, nem que formato a
 * cliente queria. Saiu um plano em texto, sem data, sobre material que ninguém
 * sabia se existia.
 *
 * O diagnóstico correto (do dono, 2026-07-28):
 *
 *   "De todos esses serviços que você está pedindo, DE ONDE VIRÃO OS INSUMOS?
 *    Vai vindo da gente ou você já tem pronto?"
 *
 * Por isso o centro desta peça não é um questionário — é uma MATRIZ POR
 * SERVIÇO. Cada serviço contratado precisa declarar de onde vem o material e
 * quem executa. Reels não é "pessoa falando": pode ser o ambiente, o produto,
 * qualquer coisa. A pergunta certa nunca foi "você aparece na câmera", foi
 * "você quer reels? e quem produz?".
 *
 * A segunda regra, igualmente do dono: falta de resposta não é problema —
 * falta de PERGUNTA é. Se foi perguntado e o cliente ainda não respondeu, a
 * proposta pode sair com a pendência declarada. O que não pode é a agência
 * decidir sozinha e mandar.
 *
 * Determinístico: sem IA, sem banco. A IA conduz a conversa por cima disto,
 * mas quem decide se pode propor é esta regra.
 */

// ─────────────────────────────────────────────────────────────────────────────
//  Estado de cada informação
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Três estados, não dois. "Perguntado e sem resposta" é aceitável; "nunca
 * perguntado" é o pecado que produziu o briefing quebrado.
 */
export type EstadoDaInfo = "respondido" | "perguntado" | "nao_perguntado";

export type GrupoDaFicha =
  | "identificacao"  // quem é a pessoa e o negócio
  | "presenca"       // onde ele já está e como vai
  | "acesso"         // o que a agência precisa poder ler/publicar
  | "objetivo"       // o que precisa acontecer
  | "restricao";     // o que não pode

export interface CampoDaFicha {
  chave: string;
  grupo: GrupoDaFicha;
  pergunta: string;
  /** Por que importa — o SDR precisa saber para conseguir insistir. */
  porque: string;
  essencial: boolean;
}

/**
 * A FICHA DO CLIENTE — a leitura que vem antes da conversa de serviço.
 *
 * "Como você começa um trabalho de marketing sem saber qual é o Instagram do
 * cliente, sem conectar os apps, sem ler engajamento e métrica? Primeiro você
 * tem que ler todo o cliente."
 */
export const CAMPOS_DA_FICHA: CampoDaFicha[] = [
  // ── Identificação ────────────────────────────────────────────────────────
  { chave: "quem_decide", grupo: "identificacao", essencial: true,
    pergunta: "Quem decide e aprova aqui? É você mesmo ou tem mais alguém?",
    porque: "aprovação sem dono definido é a causa nº 1 de calendário que atrasa" },
  { chave: "o_que_vende", grupo: "identificacao", essencial: true,
    pergunta: "Me conta o que você vende. O que dá mais dinheiro hoje e o que você gostaria de vender mais?",
    porque: "é a verdade que ancora toda peça — sem ela o conteúdo sai genérico" },
  { chave: "publico", grupo: "identificacao", essencial: true,
    pergunta: "Descreve um cliente real seu, alguém que comprou recentemente.",
    porque: "público genérico devolve conteúdo genérico" },
  { chave: "regiao", grupo: "identificacao", essencial: false,
    pergunta: "Você atende que região? Tem raio de entrega ou é só presencial?",
    porque: "evita anunciar para quem nunca vai conseguir comprar" },
  { chave: "diferencial", grupo: "identificacao", essencial: false,
    pergunta: "Por que alguém escolhe você e não o concorrente? Algo que dê pra provar.",
    porque: "diferencial verificável é o que substitui superlativo vazio" },

  // ── Presença: a leitura do que já existe ─────────────────────────────────
  { chave: "redes_sociais", grupo: "presenca", essencial: true,
    pergunta: "Quais redes você tem? Me passa os @ de todas — Instagram, Facebook, TikTok, o que existir.",
    porque: "sem saber onde ele está, não dá para ler o que já funciona nem medir depois" },
  { chave: "site_e_canais", grupo: "presenca", essencial: false,
    pergunta: "Tem site, WhatsApp comercial, Google Meu Negócio, cardápio online?",
    porque: "é para onde o conteúdo vai mandar a pessoa — sem destino, não há conversão" },
  { chave: "historico", grupo: "presenca", essencial: false,
    pergunta: "O que você já postou que funcionou bem? E o que não funcionou?",
    porque: "o que já deu certo com o público dele vale mais que qualquer tendência" },
  { chave: "concorrentes", grupo: "presenca", essencial: false,
    pergunta: "Tem algum concorrente que você acha que faz bem? E algum com quem não quer se parecer?",
    porque: "define o norte estético e o que evitar" },

  // ── Acesso: sem isto a agência trabalha cega ─────────────────────────────
  { chave: "acesso_contas", grupo: "acesso", essencial: true,
    pergunta: "A gente vai poder conectar as contas para ler as métricas e publicar, ou você prefere receber pronto e postar?",
    porque: "muda o processo inteiro de entrega, aprovação e relatório" },
  { chave: "metricas_atuais", grupo: "acesso", essencial: false,
    pergunta: "Quantos seguidores você tem hoje e quanto costuma engajar? (a gente também lê pela conta, se conectar)",
    porque: "é o ponto de partida — sem ele não dá para mostrar evolução nenhuma" },
  { chave: "identidade_visual", grupo: "acesso", essencial: false,
    pergunta: "Você tem logo, cores e fontes definidas? Manual de marca?",
    porque: "sem identidade, cada peça sai com uma cara diferente" },

  // ── Objetivo ─────────────────────────────────────────────────────────────
  { chave: "objetivo", grupo: "objetivo", essencial: true,
    pergunta: "O que precisa acontecer no negócio nos próximos 90 dias?",
    porque: "sem objetivo, qualquer conteúdo parece certo e nenhum é" },
  { chave: "como_mede", grupo: "objetivo", essencial: false,
    pergunta: "Como você vai perceber que valeu a pena? O que você olha?",
    porque: "define o que a gente reporta — e evita cobrança por número que ninguém combinou" },
  { chave: "datas", grupo: "objetivo", essencial: false,
    pergunta: "Tem data importante chegando? Aniversário da loja, alta temporada, lançamento?",
    porque: "é a espinha dorsal do calendário" },

  // ── Restrição ────────────────────────────────────────────────────────────
  { chave: "proibicoes", grupo: "restricao", essencial: false,
    pergunta: "Tem algo que a gente NÃO pode falar, mostrar ou prometer?",
    porque: "descobrir isso depois de publicar custa caro" },
  { chave: "data_inicio", grupo: "restricao", essencial: true,
    pergunta: "A partir de quando a gente começa a publicar?",
    porque: "sem data de início não existe calendário, existe lista" },
];

// ─────────────────────────────────────────────────────────────────────────────
//  O catálogo: o que a agência oferece
// ─────────────────────────────────────────────────────────────────────────────

/** De onde vem o material de um serviço. É A pergunta da sondagem. */
export type OrigemDoInsumo = "cliente" | "agencia" | "misto";

export interface ServicoDoCatalogo {
  chave: string;
  nome: string;
  /** Que matéria-prima este serviço consome. */
  insumo: string;
  /**
   * Perguntas que SÓ este serviço exige, além da origem do insumo.
   * É aqui que mora "que tipo de reels você quer".
   */
  definicoes: { chave: string; pergunta: string }[];
}

export const CATALOGO_DE_SERVICOS: ServicoDoCatalogo[] = [
  {
    chave: "reels", nome: "Reels / vídeo curto", insumo: "vídeo",
    definicoes: [
      { chave: "tipo_de_reels", pergunta: "Que tipo de reels? Alguém falando, o ambiente, o produto sendo feito, bastidor? Pode ser mais de um." },
      { chave: "quantidade",    pergunta: "Quantos por mês?" },
    ],
  },
  {
    chave: "carrossel", nome: "Carrossel", insumo: "foto ou arte",
    definicoes: [{ chave: "quantidade", pergunta: "Quantos por mês?" }],
  },
  {
    chave: "post_foto", nome: "Post de foto única", insumo: "foto",
    definicoes: [{ chave: "quantidade", pergunta: "Quantos por mês?" }],
  },
  {
    chave: "story", nome: "Stories", insumo: "foto ou vídeo do dia a dia",
    definicoes: [{ chave: "quantidade", pergunta: "Quantos por semana?" }],
  },
  {
    chave: "arte_grafica", nome: "Peça gráfica (sem foto real)", insumo: "identidade visual",
    definicoes: [{ chave: "quantidade", pergunta: "Quantas por mês?" }],
  },
  {
    chave: "legenda", nome: "Legendas e textos", insumo: "informação do negócio",
    definicoes: [{ chave: "tom", pergunta: "Que tom você quer? Formal, próximo, bem-humorado?" }],
  },
  {
    chave: "trafego", nome: "Tráfego pago", insumo: "verba e criativo",
    definicoes: [
      { chave: "verba",  pergunta: "Qual verba mensal de mídia?" },
      { chave: "destino", pergunta: "Para onde a pessoa vai? WhatsApp, site, perfil?" },
    ],
  },
  {
    chave: "comunidade", nome: "Gestão de comentários e direct", insumo: "acesso às contas",
    definicoes: [{ chave: "tempo_resposta", pergunta: "Em quanto tempo você espera que a gente responda?" }],
  },
  {
    chave: "relatorio", nome: "Relatório de resultados", insumo: "acesso às métricas",
    definicoes: [{ chave: "periodicidade", pergunta: "De quanto em quanto tempo você quer o relatório?" }],
  },
];

/** O que o cliente contratou, e o que já se sabe sobre a execução dele. */
export interface ServicoContratado {
  chave: string;
  /** null = ainda não definido. É o que trava a proposta. */
  origemDoInsumo?: OrigemDoInsumo | null;
  /** Quem executa na prática (nome/papel), quando já se sabe. */
  quemExecuta?: string | null;
  /** Respostas das definições específicas do serviço. */
  definicoes?: Record<string, string | undefined>;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Avaliação
// ─────────────────────────────────────────────────────────────────────────────

export interface EstadoDaSondagem {
  /** A ficha: chave → resposta, ou o marcador "perguntado" sem resposta. */
  ficha?: Record<string, string | string[] | boolean | null | undefined>;
  /** Chaves da ficha que já foram PERGUNTADAS mas seguem sem resposta. */
  perguntadas?: string[];
  /** Serviços que o cliente escolheu. Vazio = nem o catálogo foi apresentado. */
  servicos?: ServicoContratado[];
}

export interface Pendencia {
  chave: string;
  pergunta: string;
  porque: string;
  estado: EstadoDaInfo;
  essencial: boolean;
  /** Serviço a que pertence, quando é pendência de serviço. */
  servico?: string;
}

export interface ServicoAvaliado {
  chave: string;
  nome: string;
  /** true quando origem do insumo está definida e as definições respondidas. */
  pronto: boolean;
  origemDoInsumo: OrigemDoInsumo | null;
  /** O que ainda falta perguntar/saber sobre este serviço. */
  pendencias: Pendencia[];
  /** Frase pronta: quem entrega o material deste serviço. */
  quemTrazOMaterial: string;
}

export interface AvaliacaoDaSondagem {
  /** true quando nada essencial ficou SEM PERGUNTAR. */
  podePropor: boolean;
  motivo: string;
  /** 0–100 do essencial já respondido. */
  cobertura: number;
  /** Essencial nunca perguntado — o pecado. */
  naoPerguntado: Pendencia[];
  /** Perguntado e aguardando o cliente — aceitável, mas vai declarado. */
  aguardandoCliente: Pendencia[];
  servicos: ServicoAvaliado[];
  /** As próximas perguntas, na ordem de uma conversa real. */
  perguntar: Pendencia[];
  veredito: string;
}

function estadoDaFicha(e: EstadoDaSondagem, chave: string): EstadoDaInfo {
  const v = e.ficha?.[chave];
  const temResposta =
    v === false ||                                   // "não tenho" é resposta
    (typeof v === "string" && v.trim().length > 0) ||
    (Array.isArray(v) && v.length > 0) ||
    v === true ||
    typeof v === "number";
  if (temResposta) return "respondido";
  return e.perguntadas?.includes(chave) ? "perguntado" : "nao_perguntado";
}

function frasePorOrigem(origem: OrigemDoInsumo | null, insumo: string): string {
  if (origem === "cliente") return `o cliente entrega o ${insumo}`;
  if (origem === "agencia") return `a agência produz o ${insumo}`;
  if (origem === "misto")   return `${insumo}: parte o cliente entrega, parte a agência produz`;
  return `NÃO DEFINIDO — ninguém sabe de onde vem o ${insumo}`;
}

/**
 * Avalia a sondagem inteira: ficha + serviços contratados.
 *
 * A trava não é "está tudo respondido". É "nada essencial ficou sem perguntar".
 * Cliente que ainda não respondeu não impede a proposta — a proposta sai com a
 * pendência escrita. Agência que não perguntou, impede.
 */
export function avaliarSondagem(e: EstadoDaSondagem): AvaliacaoDaSondagem {
  const naoPerguntado: Pendencia[] = [];
  const aguardando: Pendencia[] = [];

  for (const c of CAMPOS_DA_FICHA) {
    const estado = estadoDaFicha(e, c.chave);
    if (estado === "respondido") continue;
    const p: Pendencia = { chave: c.chave, pergunta: c.pergunta, porque: c.porque, estado, essencial: c.essencial };
    (estado === "nao_perguntado" ? naoPerguntado : aguardando).push(p);
  }

  const contratados = e.servicos ?? [];
  const servicos: ServicoAvaliado[] = contratados.map((sc) => {
    const cat = CATALOGO_DE_SERVICOS.find((s) => s.chave === sc.chave);
    const nome = cat?.nome ?? sc.chave;
    const insumo = cat?.insumo ?? "material";
    const pend: Pendencia[] = [];

    if (!sc.origemDoInsumo) {
      pend.push({
        chave: `${sc.chave}.origemDoInsumo`, servico: nome, essencial: true, estado: "nao_perguntado",
        pergunta: `Para ${nome}: o ${insumo} vem de você ou a gente produz?`,
        porque: "é a pergunta que faltou no primeiro teste — sem ela o plano promete material que ninguém sabe se existe",
      });
    }

    // Quem executa só é obrigatório quando o cliente entrega o material.
    if ((sc.origemDoInsumo === "cliente" || sc.origemDoInsumo === "misto") && !sc.quemExecuta?.trim()) {
      pend.push({
        chave: `${sc.chave}.quemExecuta`, servico: nome, essencial: true, estado: "nao_perguntado",
        pergunta: `Para ${nome}: quem aí vai produzir o ${insumo} e com que frequência consegue?`,
        porque: "material que o cliente entrega precisa de dono e ritmo, senão o calendário para na primeira semana",
      });
    }

    for (const d of cat?.definicoes ?? []) {
      if (!sc.definicoes?.[d.chave]?.trim()) {
        pend.push({
          chave: `${sc.chave}.${d.chave}`, servico: nome, essencial: true, estado: "nao_perguntado",
          pergunta: `Para ${nome}: ${d.pergunta}`,
          porque: "define o tamanho e o formato do que vai no plano",
        });
      }
    }

    return {
      chave: sc.chave, nome, pendencias: pend,
      pronto: pend.length === 0,
      origemDoInsumo: sc.origemDoInsumo ?? null,
      quemTrazOMaterial: frasePorOrigem(sc.origemDoInsumo ?? null, insumo),
    };
  });

  const pendServico = servicos.flatMap((s) => s.pendencias);
  const semCatalogo = contratados.length === 0;

  const essenciais = CAMPOS_DA_FICHA.filter((c) => c.essencial);
  const respondidos = essenciais.filter((c) => estadoDaFicha(e, c.chave) === "respondido").length;
  const cobertura = essenciais.length === 0 ? 100 : Math.round((respondidos / essenciais.length) * 100);

  const bloqueios = [
    ...naoPerguntado.filter((p) => p.essencial),
    ...pendServico,
  ];

  const podePropor = !semCatalogo && bloqueios.length === 0;

  const motivo = semCatalogo
    ? "O catálogo de serviços ainda não foi apresentado — o cliente não escolheu nada."
    : bloqueios.length > 0
      ? `Faltou PERGUNTAR: ${bloqueios.slice(0, 4).map((b) => b.chave).join(", ")}${bloqueios.length > 4 ? ` (+${bloqueios.length - 4})` : ""}.`
      : aguardando.length > 0
        ? `Pode propor. ${aguardando.length} resposta(s) pendente(s) do cliente — declare na proposta.`
        : "Pode propor. Tudo perguntado e respondido.";

  // Ordem de conversa: serviço primeiro (é o que trava), depois ficha essencial.
  const perguntar = [...pendServico, ...naoPerguntado.filter((p) => p.essencial), ...naoPerguntado.filter((p) => !p.essencial)];

  const semOrigem = servicos.filter((s) => !s.origemDoInsumo).map((s) => s.nome);
  const veredito = semCatalogo
    ? "Nem começou: apresente o catálogo e pergunte quais serviços ele quer."
    : semOrigem.length > 0
      ? `NÃO mande proposta. Não se sabe de onde vem o material de: ${semOrigem.join("; ")}.`
      : podePropor
        ? "Sondagem fechada. Todo serviço contratado tem origem de material definida."
        : `Ainda falta perguntar ${bloqueios.length} coisa(s) antes de propor.`;

  return { podePropor, motivo, cobertura, naoPerguntado, aguardandoCliente: aguardando, servicos, perguntar: perguntar.slice(0, 20), veredito };
}

/** A trava do bastão: a proposta/planejamento pode sair? */
export function podePropor(e: EstadoDaSondagem): { pode: boolean; motivo: string } {
  const a = avaliarSondagem(e);
  return { pode: a.podePropor, motivo: a.motivo };
}

/** As próximas N perguntas, na ordem de uma conversa real. */
export function proximasPerguntas(e: EstadoDaSondagem, quantas = 3): Pendencia[] {
  return avaliarSondagem(e).perguntar.slice(0, Math.max(1, quantas));
}
