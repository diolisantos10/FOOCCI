/**
 * ForjaDeTexto — o irmão da ForjaDeFoto, para tudo que é escrito.
 *
 * Mesma ideia: o pedido do cliente vira um COMANDO de altíssimo nível. Só que
 * em vez de gramática de câmera (luz, lente, profundidade), a gramática aqui é
 * de redação — estrutura, abertura, tamanho, ritmo e o que nunca dizer.
 *
 * Puro e determinístico: sem IA, sem banco, sem rede. Custa zero.
 *
 * As duas travas são as mesmas da foto:
 *   1. LISTA NEGRA — os vícios que denunciam texto de IA ("no mundo de hoje",
 *      "não perca", "imperdível"). Todo mundo usa; quem usa fica igual.
 *   2. VARIAÇÃO — dois pedidos iguais não devolvem o mesmo texto. O índice gira
 *      abertura, estrutura e fechamento dentro do que serve àquele tipo.
 */

export type TipoDeTexto =
  | "legenda" | "mensagem" | "anuncio" | "roteiro"
  | "email" | "titulo" | "resposta" | "descricao" | "generico";

interface PresetDeTexto {
  /** O que a peça precisa fazer, em uma frase. Entra no comando. */
  missao: string;
  abertura: string[];
  estrutura: string[];
  fechamento: string[];
  tamanho: string[];
  /** Vício típico deste tipo, além da lista negra geral. */
  evitar: string[];
}

const PRESETS: Record<TipoDeTexto, PresetDeTexto> = {
  legenda: {
    missao: "fazer quem está rolando o feed parar e querer saber mais",
    abertura: [
      "comece por um fato concreto, sem rodeio",
      "comece por uma cena curta que dê pra visualizar",
      "comece por uma pergunta direta que o leitor responderia na cabeça",
      "comece pelo detalhe menos óbvio da coisa",
    ],
    estrutura: [
      "uma ideia só, do começo ao fim",
      "duas frases: a cena e o convite",
      "frase curta, quebra de linha, frase curta",
    ],
    fechamento: ["termine com um convite leve", "termine sem chamada — deixe a imagem trabalhar", "termine com uma pergunta"],
    tamanho: ["até 2 linhas", "até 4 linhas", "1 linha só"],
    evitar: ["hashtag genérica", "emoji em toda frase", "chamada de vendedor"],
  },
  mensagem: {
    missao: "soar como uma pessoa da casa falando com alguém que ela conhece",
    abertura: [
      "abra citando algo verdadeiro sobre aquela pessoa ou aquele dia",
      "abra direto pelo motivo da mensagem, sem saudação genérica",
      "abra por uma novidade concreta",
    ],
    estrutura: ["uma frase só", "duas frases curtas", "uma frase e uma pergunta"],
    fechamento: ["termine com uma pergunta que dê pra responder em uma palavra", "termine sem pedir nada"],
    tamanho: ["1 linha", "até 2 linhas"],
    evitar: ["'sentimos sua falta'", "'passando para avisar'", "tom de robô de cobrança", "mais de um pedido na mesma mensagem"],
  },
  anuncio: {
    missao: "fazer quem não conhece entender a oferta em três segundos",
    abertura: ["abra pelo benefício concreto", "abra pelo problema que a pessoa reconhece", "abra pelo diferencial verificável"],
    estrutura: ["promessa, prova, convite", "problema, solução, convite", "oferta direta e uma razão pra acreditar"],
    fechamento: ["chamada clara e específica", "chamada com o próximo passo explícito"],
    tamanho: ["até 3 linhas", "até 2 linhas"],
    evitar: ["superlativo sem prova", "'a melhor da cidade'", "urgência inventada", "promessa de resultado garantido"],
  },
  roteiro: {
    missao: "prender nos primeiros 2 segundos e entregar uma ideia só",
    abertura: ["abra no meio da ação, sem apresentação", "abra por uma afirmação que gere discordância saudável", "abra mostrando o resultado antes do processo"],
    estrutura: ["gancho, desenvolvimento, virada", "três passos numerados", "antes e depois"],
    fechamento: ["termine com o convite falado", "termine na virada, sem explicar"],
    tamanho: ["até 15 segundos", "até 30 segundos", "até 45 segundos"],
    evitar: ["'fala pessoal, tudo bem?'", "apresentação antes do gancho", "mais de uma ideia por vídeo"],
  },
  email: {
    missao: "ser aberto e lido até o fim por quem tem a caixa cheia",
    abertura: ["abra pelo motivo real do e-mail, na primeira linha", "abra por uma informação útil antes de qualquer pedido"],
    estrutura: ["assunto, uma ideia, um pedido", "contexto curto, oferta, próximo passo"],
    fechamento: ["um pedido só, explícito", "encerre com a assinatura de quem escreve de verdade"],
    tamanho: ["até 5 linhas", "até 8 linhas"],
    evitar: ["assunto vago", "'espero que esteja bem'", "vários pedidos no mesmo e-mail"],
  },
  titulo: {
    missao: "dizer a coisa mais interessante em menos palavras",
    abertura: ["comece pelo substantivo concreto", "comece pelo número, quando houver um verdadeiro"],
    estrutura: ["afirmação direta", "pergunta", "contraste entre duas ideias"],
    fechamento: ["sem ponto final", "sem reticências"],
    tamanho: ["até 6 palavras", "até 10 palavras"],
    evitar: ["caça-clique", "'você não vai acreditar'", "promessa que o conteúdo não cumpre"],
  },
  resposta: {
    missao: "resolver o que a pessoa perguntou, sem enrolação",
    abertura: ["responda a pergunta na primeira frase", "confirme o que foi entendido e responda"],
    estrutura: ["resposta, detalhe, próximo passo", "resposta direta e só"],
    fechamento: ["ofereça o próximo passo concreto", "termine perguntando se resolveu"],
    tamanho: ["até 2 linhas", "até 4 linhas"],
    evitar: ["pedir desculpa mais de uma vez", "explicar processo interno", "prometer prazo sem ter o dado"],
  },
  descricao: {
    missao: "fazer o item ser escolhido por quem está decidindo agora",
    abertura: ["comece pelo ingrediente ou característica que mais importa", "comece pela sensação de quem consome"],
    estrutura: ["o que é, do que é feito, por que vale", "uma frase sensorial e uma factual"],
    fechamento: ["termine no detalhe que dá água na boca", "termine seco, sem chamada"],
    tamanho: ["até 2 linhas", "1 linha"],
    evitar: ["adjetivo vazio ('delicioso', 'incrível')", "repetir o nome do item", "superlativo sem prova"],
  },
  generico: {
    missao: "entregar a mensagem com clareza e voz própria",
    abertura: ["comece pelo mais concreto que existir", "comece pelo que o leitor ganha"],
    estrutura: ["uma ideia por parágrafo", "começo, meio e chamada"],
    fechamento: ["termine com o próximo passo", "termine sem chamada"],
    tamanho: ["curto", "médio"],
    evitar: [],
  },
};

/** Vícios que denunciam texto de IA em qualquer formato. */
const LISTA_NEGRA_GERAL = [
  "no mundo de hoje", "nos dias atuais", "em um mundo cada vez mais",
  "não perca", "imperdível", "clique agora", "corra",
  "é importante ressaltar", "vale destacar", "em suma",
  "revolucionário", "inovador", "solução completa",
  "transforme sua experiência", "eleve o seu",
];

const PISTAS: [TipoDeTexto, string[]][] = [
  ["roteiro",   ["roteiro", "video", "reels", "tiktok", "shorts", "gravar", "falar na camera"]],
  ["legenda",   ["legenda", "post", "publicacao", "feed", "carrossel", "story", "instagram"]],
  ["mensagem",  ["mensagem", "whatsapp", "zap", "disparo", "recuperar cliente", "crm", "lembrete"]],
  ["anuncio",   ["anuncio", "ads", "trafego", "patrocinado", "campanha paga", "impulsionar"]],
  ["email",     ["email", "e-mail", "newsletter", "disparo de email"]],
  ["titulo",    ["titulo", "headline", "chamada", "manchete", "assunto do email"]],
  ["resposta",  ["resposta", "responder", "atendimento", "duvida do cliente", "suporte", "reclamacao"]],
  ["descricao", ["descricao", "descrever", "cardapio", "ficha do produto", "texto do produto"]],
];

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function detectarTipoDeTexto(pedido: string): TipoDeTexto {
  const alvo = normalizar(pedido);
  for (const [tipo, pistas] of PISTAS) {
    if (pistas.some((p) => alvo.includes(normalizar(p)))) return tipo;
  }
  return "generico";
}

function girar<T>(opcoes: T[], indice: number): T {
  return opcoes[((indice % opcoes.length) + opcoes.length) % opcoes.length] as T;
}

export interface PedidoDeTexto {
  /** O que o cliente pediu, em linguagem solta. */
  pedido: string;
  /** Fatos verdadeiros que a peça pode citar. Sem isto, sai genérico. */
  verdade?: string[];
  publico?: string;
  /** A voz da marca: "direto e caloroso, sem gíria". */
  tom?: string;
  tipo?: TipoDeTexto;
  /** Coisas que esta marca nunca diz. */
  proibicoes?: string[];
  variacao?: number;
}

export interface PromptDeTexto {
  tipo: TipoDeTexto;
  prompt: string;
  negativo: string;
  receita: { abertura: string; estrutura: string; fechamento: string; tamanho: string };
}

/**
 * Forja o comando de texto.
 *
 * Sai em instruções numeradas, não em prosa: para escrita, uma lista de regras
 * é obedecida com mais fidelidade do que um parágrafo descritivo — o contrário
 * da imagem, onde a descrição corrida funciona melhor.
 */
export function forjarPromptDeTexto(input: PedidoDeTexto): PromptDeTexto {
  const tipo = input.tipo ?? detectarTipoDeTexto(input.pedido);
  const preset = PRESETS[tipo];
  const v = input.variacao ?? 0;

  const receita = {
    abertura:   girar(preset.abertura, v),
    estrutura:  girar(preset.estrutura, v),
    fechamento: girar(preset.fechamento, v),
    tamanho:    girar(preset.tamanho, v),
  };

  const evitar = [...preset.evitar, ...LISTA_NEGRA_GERAL];

  const linhas: string[] = [
    `TAREFA: escreva ${tipo === "generico" ? "o texto" : `um(a) ${tipo}`} para: ${input.pedido.trim()}`,
    `MISSÃO DA PEÇA: ${preset.missao}.`,
  ];

  if (input.publico?.trim()) linhas.push(`PÚBLICO: ${input.publico.trim()}`);
  if (input.tom?.trim())     linhas.push(`VOZ: ${input.tom.trim()}`);

  if (input.verdade?.length) {
    linhas.push("VERDADE (use só isto como fato — não invente nada):");
    for (const f of input.verdade) linhas.push(`  - ${f}`);
  }

  linhas.push(
    "COMO ESCREVER:",
    `  1. ${receita.abertura}`,
    `  2. ${receita.estrutura}`,
    `  3. ${receita.fechamento}`,
    `  4. Tamanho: ${receita.tamanho}`,
    "  5. Escreva como uma pessoa escreveria — contração, ritmo irregular, nada de simetria perfeita.",
  );

  const proibicoes = [...(input.proibicoes ?? []), ...evitar];
  linhas.push("NUNCA:");
  for (const p of proibicoes) linhas.push(`  - ${p}`);

  linhas.push("Entregue só o texto final, sem explicação e sem alternativas.");

  return { tipo, prompt: linhas.join("\n"), negativo: evitar.join(", "), receita };
}

/** Várias opções do mesmo pedido, todas diferentes. */
export function forjarOpcoesDeTexto(input: PedidoDeTexto, quantas = 3): PromptDeTexto[] {
  const total = Math.max(1, Math.min(quantas, 10));
  const base = input.variacao ?? 0;
  return Array.from({ length: total }, (_, i) => forjarPromptDeTexto({ ...input, variacao: base + i }));
}
