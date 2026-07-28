/**
 * Sondagem — o que o SDR PRECISA descobrir antes de qualquer plano existir.
 *
 * Nasceu de uma falha real: a agência entregou um planejamento de reels sem
 * nunca ter perguntado se a cliente consegue gravar reels. O problema não foi
 * "faltou uma pergunta" — foi não existir uma regra dizendo que aquele
 * entregável tem pré-requisito.
 *
 * Então a peça central aqui NÃO é a lista de perguntas. É o mapa de
 * EXIGÊNCIAS: cada entregável declara de que informação ele depende, e sem ela
 * fica bloqueado. Prometer o que não se sabe se o cliente sustenta é o jeito
 * mais rápido de queimar uma conta nova.
 *
 * Determinístico: sem IA, sem banco. A IA pode redigir a conversa por cima
 * disto, mas quem decide se a sondagem acabou é esta regra.
 */

export type GrupoDaSondagem =
  | "insumo"      // o que o cliente JÁ tem
  | "execucao"    // o que ele consegue sustentar
  | "negocio"     // a verdade que ancora as peças
  | "objetivo"    // o que precisa acontecer
  | "restricao"   // o que não pode
  | "operacao";   // como o plano roda

export interface CampoDaSondagem {
  chave: string;
  grupo: GrupoDaSondagem;
  /** Como perguntar de um jeito que uma pessoa responde. */
  pergunta: string;
  /** Por que isso importa — entra no relatório para o humano entender. */
  porque: string;
  /** Sem isto, nenhum plano é honesto. */
  essencial: boolean;
}

/**
 * O questionário. A ordem importa: começa pelo que o cliente responde fácil e
 * termina no que exige decisão dele.
 */
export const CAMPOS_DA_SONDAGEM: CampoDaSondagem[] = [
  // ── Objetivo: sem isto o plano é decoração ────────────────────────────────
  { chave: "objetivo", grupo: "objetivo", essencial: true,
    pergunta: "O que precisa acontecer no negócio nos próximos 90 dias? (mais agendamento, mais pedido, ficar conhecido…)",
    porque: "sem objetivo, qualquer conteúdo parece certo e nenhum é" },
  { chave: "como_mede", grupo: "objetivo", essencial: false,
    pergunta: "Como você percebe hoje que o marketing funcionou? O que você olha?",
    porque: "define o que a gente vai reportar — e evita cobrança por número que ninguém combinou" },

  // ── Negócio: a verdade que ancora tudo ────────────────────────────────────
  { chave: "ofertas", grupo: "negocio", essencial: true,
    pergunta: "Quais serviços ou produtos você quer divulgar? Quais dão mais dinheiro hoje?",
    porque: "é a verdade que ancora cada peça; sem ela o conteúdo sai genérico" },
  { chave: "publico", grupo: "negocio", essencial: true,
    pergunta: "Quem é o seu cliente típico? Descreve uma pessoa real que comprou de você.",
    porque: "público genérico devolve conteúdo genérico" },
  { chave: "diferencial", grupo: "negocio", essencial: false,
    pergunta: "Por que alguém escolhe você e não o concorrente da esquina? Algo que dê pra provar.",
    porque: "diferencial verificável é o que substitui superlativo vazio" },
  { chave: "regiao", grupo: "negocio", essencial: false,
    pergunta: "Você atende que região? Tem raio de entrega ou é presencial?",
    porque: "evita anunciar para quem nunca vai conseguir comprar" },
  { chave: "datas", grupo: "negocio", essencial: false,
    pergunta: "Tem alguma data importante nos próximos meses? Aniversário da loja, alta temporada, lançamento?",
    porque: "é o que dá espinha dorsal ao calendário" },

  // ── Insumo: o que ele JÁ tem (a etapa que falhou) ─────────────────────────
  { chave: "tem_fotos", grupo: "insumo", essencial: true,
    pergunta: "Você tem fotos suas, do produto ou do espaço? Quantas, mais ou menos, e são atuais?",
    porque: "define se a gente trabalha com o material dele ou precisa produzir" },
  { chave: "tem_videos", grupo: "insumo", essencial: true,
    pergunta: "Tem vídeo gravado? Mesmo bruto, de celular, serve.",
    porque: "vídeo bruto existente é a diferença entre plano possível e plano de papel" },
  { chave: "identidade_visual", grupo: "insumo", essencial: false,
    pergunta: "Você tem logo, cores e fontes definidas? Tem um manual da marca?",
    porque: "sem identidade, cada peça sai com uma cara diferente" },
  { chave: "provas", grupo: "insumo", essencial: false,
    pergunta: "Tem print de elogio, depoimento ou avaliação de cliente que possa usar?",
    porque: "prova social é o conteúdo que mais converte e custa zero produzir" },
  { chave: "acesso_redes", grupo: "insumo", essencial: false,
    pergunta: "A gente publica direto ou você prefere receber pronto e postar?",
    porque: "muda o processo inteiro de entrega e aprovação" },

  // ── Execução: o que ele CONSEGUE sustentar ────────────────────────────────
  { chave: "alguem_na_camera", grupo: "execucao", essencial: true,
    pergunta: "Tem alguém disposto a aparecer falando na câmera? Você, alguém da equipe?",
    porque: "é o que decide se reels e vídeo entram no plano — prometer sem isto é vender o que não vai sair" },
  { chave: "frequencia_gravacao", grupo: "execucao", essencial: false,
    pergunta: "Quantas vezes por semana dá pra parar 20 minutos pra gravar ou fotografar?",
    porque: "define o volume real do calendário, não o volume ideal" },
  { chave: "quem_aprova", grupo: "execucao", essencial: true,
    pergunta: "Quem aprova o conteúdo antes de publicar, e em quanto tempo consegue responder?",
    porque: "aprovação lenta é a causa nº 1 de calendário que atrasa" },
  { chave: "responde_mensagem", grupo: "execucao", essencial: false,
    pergunta: "Quem responde comentário e direct? Em quanto tempo?",
    porque: "não adianta gerar demanda que ninguém atende" },

  // ── Restrição ─────────────────────────────────────────────────────────────
  { chave: "proibicoes", grupo: "restricao", essencial: false,
    pergunta: "Tem algo que a gente NÃO pode falar, mostrar ou prometer?",
    porque: "descobrir isso depois de publicar custa caro" },

  // ── Operação: como o plano roda (a etapa que ficou sem data) ──────────────
  { chave: "formatos", grupo: "operacao", essencial: true,
    pergunta: "Que formato você quer? Reels, carrossel, foto única, story? Tem algum que você não gosta?",
    porque: "foi exatamente o que não se perguntou no primeiro teste — plano sem formato acordado é chute" },
  { chave: "frequencia", grupo: "operacao", essencial: true,
    pergunta: "Quantas publicações por semana você quer, de verdade?",
    porque: "sem isto o calendário não tem tamanho" },
  { chave: "data_inicio", grupo: "operacao", essencial: true,
    pergunta: "A partir de que data a gente começa a publicar?",
    porque: "sem data de início não existe calendário, existe lista" },
];

/**
 * O mapa que faltava: cada entregável e de que informação ele DEPENDE.
 *
 * É isto que impede a agência de prometer reels para quem não grava.
 */
export const EXIGENCIAS_POR_ENTREGAVEL: Record<string, string[]> = {
  "reels com a pessoa falando": ["alguem_na_camera", "frequencia_gravacao"],
  "reels sem aparecer (mãos/produto)": ["tem_videos", "frequencia_gravacao"],
  "carrossel com foto real":            ["tem_fotos"],
  "post de foto única":                 ["tem_fotos"],
  "peça gráfica (sem foto)":            ["identidade_visual"],
  "story do dia a dia":                 ["frequencia_gravacao"],
  "prova social / depoimento":          ["provas"],
  "calendário com datas":               ["data_inicio", "frequencia", "formatos"],
  "anúncio pago":                       ["objetivo", "publico", "ofertas"],
};

export interface EstadoDaSondagem {
  /** Chaves já respondidas. Valor vazio conta como NÃO respondida. */
  respostas: Record<string, string | string[] | boolean | null | undefined>;
}

function respondida(estado: EstadoDaSondagem, chave: string): boolean {
  const v = estado.respostas[chave];
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true; // boolean false é resposta válida ("não tem vídeo" é informação)
}

export interface Lacuna {
  chave: string;
  pergunta: string;
  porque: string;
  grupo: GrupoDaSondagem;
  essencial: boolean;
}

export interface EntregavelAvaliado {
  entregavel: string;
  liberado: boolean;
  /** O que falta saber para poder prometer. */
  faltaSaber: string[];
}

export interface AvaliacaoDaSondagem {
  /** true quando todo campo essencial foi respondido. */
  completa: boolean;
  /** 0–100: quanto da sondagem essencial foi coberto. */
  cobertura: number;
  lacunas: Lacuna[];
  /** A próxima pergunta a fazer. Null quando não falta nada. */
  proxima: Lacuna | null;
  entregaveis: EntregavelAvaliado[];
  /** Frase pronta para o humano: o que dá e o que não dá para prometer. */
  veredito: string;
}

/**
 * Avalia a sondagem.
 *
 * A ordem das lacunas é a ordem dos campos: essencial primeiro dentro do
 * grupo, e os grupos na sequência em que uma conversa real acontece.
 */
export function avaliarSondagem(estado: EstadoDaSondagem): AvaliacaoDaSondagem {
  const lacunas: Lacuna[] = CAMPOS_DA_SONDAGEM
    .filter((c) => !respondida(estado, c.chave))
    .map((c) => ({ chave: c.chave, pergunta: c.pergunta, porque: c.porque, grupo: c.grupo, essencial: c.essencial }));

  const essenciais = CAMPOS_DA_SONDAGEM.filter((c) => c.essencial);
  const essenciaisOk = essenciais.filter((c) => respondida(estado, c.chave)).length;
  const cobertura = essenciais.length === 0 ? 100 : Math.round((essenciaisOk / essenciais.length) * 100);

  const entregaveis: EntregavelAvaliado[] = Object.entries(EXIGENCIAS_POR_ENTREGAVEL).map(([entregavel, exigidas]) => {
    const faltaSaber = exigidas.filter((chave) => !respondida(estado, chave));
    return { entregavel, liberado: faltaSaber.length === 0, faltaSaber };
  });

  // Essencial não respondido vem primeiro — é o que trava o plano.
  const proxima = lacunas.find((l) => l.essencial) ?? lacunas[0] ?? null;

  const liberados = entregaveis.filter((e) => e.liberado).map((e) => e.entregavel);
  const travados  = entregaveis.filter((e) => !e.liberado).map((e) => e.entregavel);

  const veredito = lacunas.filter((l) => l.essencial).length > 0
    ? `Sondagem INCOMPLETA (${cobertura}% do essencial). Não prometa: ${travados.join("; ") || "—"}.`
    : liberados.length === entregaveis.length
      ? "Sondagem completa. Todos os entregáveis estão sustentados pelo que o cliente tem."
      : `Sondagem completa no essencial. Ainda não dá para prometer: ${travados.join("; ")}.`;

  return { completa: lacunas.filter((l) => l.essencial).length === 0, cobertura, lacunas, proxima, entregaveis, veredito };
}

/**
 * O plano pode ser entregue?
 *
 * Trava de propósito: enquanto faltar essencial, o SDR não passa o bastão. Foi
 * exatamente essa passagem prematura que produziu o briefing quebrado.
 */
export function podeEntregarPlano(estado: EstadoDaSondagem): { pode: boolean; motivo: string } {
  const a = avaliarSondagem(estado);
  if (a.completa) return { pode: true, motivo: a.veredito };
  const faltando = a.lacunas.filter((l) => l.essencial).map((l) => l.chave);
  return { pode: false, motivo: `Faltam respostas essenciais: ${faltando.join(", ")}.` };
}

/** As próximas N perguntas, para o SDR conduzir sem parecer formulário. */
export function proximasPerguntas(estado: EstadoDaSondagem, quantas = 3): Lacuna[] {
  const a = avaliarSondagem(estado);
  const essenciais = a.lacunas.filter((l) => l.essencial);
  const resto = a.lacunas.filter((l) => !l.essencial);
  return [...essenciais, ...resto].slice(0, Math.max(1, quantas));
}
