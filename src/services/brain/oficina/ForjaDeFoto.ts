/**
 * ForjaDeFoto — o pedido do cliente vira prompt de foto de altíssimo nível.
 *
 * É o miolo do que a Oficina existe pra fazer em imagem: o agente recebe
 * "quero uma foto do hambúrguer" e devolve um comando de fotógrafo — luz com
 * nome, lente em milímetros, profundidade de campo, textura e imperfeição real.
 *
 * Puro e determinístico: sem IA, sem banco, sem rede. Chamar custa zero e
 * responde na hora, então qualquer agente pode usar em qualquer lugar.
 *
 * Duas coisas que separam isto de copiar a receita pronta da internet:
 *   1. LISTA NEGRA — os termos que todo mundo usa ("hiper-realista, 8K, obra-
 *      prima") empilham palavra e entregam a mesma foto de banco de imagem. A
 *      técnica entra descrita, não em etiqueta.
 *   2. VARIAÇÃO — dois pedidos iguais não devolvem a mesma foto. O índice gira
 *      a luz, o ângulo e a lente dentro do que faz sentido para aquele assunto.
 */

export type TipoDeFoto =
  | "comida" | "bebida" | "produto" | "retrato" | "ambiente"
  | "fachada" | "paisagem" | "urbano" | "animal" | "bastidor"
  | "procedimento" | "detalhe" | "generico";

interface Preset {
  /** Como a cena é enquadrada — entra no meio da frase. */
  enquadramento: string[];
  luz: string[];
  lente: string[];
  profundidade: string[];
  /** O detalhe que faz o olho acreditar. É o que mais importa. */
  textura: string[];
  /** Clichê específico deste tipo, além da lista negra geral. */
  evitar: string[];
}

/**
 * Presets por assunto. O valor está aqui: é a diferença entre "foto de comida"
 * e o que um fotógrafo de gastronomia realmente pediria.
 */
const PRESETS: Record<TipoDeFoto, Preset> = {
  comida: {
    enquadramento: [
      "vista em ângulo de 45 graus, na altura de quem vai comer",
      "vista de cima, o prato ocupando o centro com respiro em volta",
      "quase na altura da mesa, o prato em primeiro plano",
      "close bem fechado num detalhe da textura",
    ],
    luz: [
      "luz de janela lateral no fim da tarde, sombra longa e suave",
      "luz natural difusa de manhã, vinda de trás em três quartos",
      "luz quente de salão à noite, com um ponto de brilho no alimento",
      "luz suave de softbox por cima, sem estourar o branco",
    ],
    lente: ["50 mm", "85 mm", "macro 100 mm", "35 mm"],
    profundidade: [
      "profundidade rasa, o fundo dissolvido",
      "profundidade média, dá pra reconhecer a mesa atrás",
      "foco preciso no ponto de interesse, o resto cedendo suavemente",
    ],
    textura: [
      "vapor tênue subindo, gordura brilhando de forma irregular, migalhas reais na superfície",
      "textura visível do pão e da carne, molho escorrendo de um lado só, sem simetria",
      "condensação irregular, marca de dedo discreta na louça, nada perfeito demais",
      "grelhado com marcas desiguais, ervas levemente murchas como comida de verdade",
    ],
    evitar: ["tábua de madeira rústica", "folha de manjericão solta no centro", "queijo escorrendo em fio simétrico"],
  },
  bebida: {
    enquadramento: [
      "copo em primeiro plano, ligeiramente abaixo da linha dos olhos",
      "vista de cima do copo, com a superfície da bebida preenchendo o quadro",
      "de lado, contra a luz, mostrando a translucidez",
    ],
    luz: [
      "contraluz suave atravessando o líquido",
      "luz lateral fria, revelando o gelo e a condensação",
      "luz quente de balcão à noite",
    ],
    lente: ["50 mm", "85 mm", "macro 100 mm"],
    profundidade: ["profundidade rasa, o balcão desfocado", "foco no copo, o ambiente sugerido atrás"],
    textura: [
      "condensação irregular escorrendo pelo vidro, gelo com bordas derretendo",
      "espuma assentando de forma natural, bolhas subindo em ritmos diferentes",
    ],
    evitar: ["gotas de água perfeitamente iguais", "respingo congelado em coroa"],
  },
  produto: {
    enquadramento: [
      "produto centralizado, levemente girado para mostrar volume",
      "vista de três quartos, com sombra própria no chão",
      "close no acabamento e no material",
    ],
    luz: [
      "iluminação uniforme de estúdio, reflexos suaves e controlados",
      "luz direcional criando um brilho único na borda",
    ],
    lente: ["85 mm", "100 mm", "50 mm"],
    profundidade: ["tudo em foco, nitidez de catálogo", "profundidade rasa isolando o produto"],
    textura: ["textura fiel do material, sem plástico artificial", "microarranhões e reflexos honestos da superfície"],
    evitar: ["fundo com gradiente colorido chamativo"],
  },
  retrato: {
    enquadramento: [
      "do peito para cima, olhando para a câmera",
      "três quartos, olhar levemente fora do eixo",
      "close no rosto, com espaço para respiro acima",
    ],
    luz: [
      "luz suave estilo softbox vinda de um lado",
      "luz natural de janela, sombra macia do lado oposto",
      "luz dourada de fim de tarde batendo de lado",
    ],
    lente: ["85 mm", "50 mm", "35 mm"],
    profundidade: ["profundidade rasa, o fundo dissolvido em tons neutros", "fundo levemente reconhecível atrás"],
    textura: [
      "pele com textura natural, poros visíveis, brilho leve na testa",
      "fios de cabelo fora do lugar, expressão relaxada entre um sorriso e outro",
      "pequenas imperfeições preservadas — sinais, linhas de expressão",
    ],
    evitar: ["pele alisada como cera", "sorriso perfeitamente simétrico", "olhar vazio de manequim"],
  },
  ambiente: {
    enquadramento: [
      "do canto do salão, mostrando profundidade entre as mesas",
      "na altura de quem está sentado, com uma mesa em primeiro plano",
      "vista ampla da entrada para o fundo",
    ],
    luz: [
      "luz quente das luminárias somada à luz que entra pela vitrine",
      "fim de tarde entrando pelas janelas, poeira suspensa visível na luz",
      "noite, com as luminárias criando ilhas de luz entre as mesas",
    ],
    lente: ["24 mm", "35 mm", "50 mm"],
    profundidade: ["quase tudo em foco, com o fundo cedendo de leve", "primeiro plano desfocado enquadrando a cena"],
    textura: ["marcas de uso reais nas mesas e no piso, nada de showroom", "reflexos honestos nas superfícies, cadeiras fora de alinhamento perfeito"],
    evitar: ["salão vazio impecável como render de arquitetura"],
  },
  fachada: {
    enquadramento: ["de frente, ligeiramente de lado para dar volume", "do outro lado da rua, com movimento na calçada"],
    luz: ["início da noite, letreiro aceso contra o céu ainda azul", "manhã, luz lateral revelando a textura da parede"],
    lente: ["24 mm", "35 mm"],
    profundidade: ["tudo em foco", "passantes levemente borrados pelo movimento"],
    textura: ["reflexos reais no vidro, sinais de uso na fachada", "calçada com textura, sombras de árvore"],
    evitar: ["céu azul artificialmente saturado"],
  },
  paisagem: {
    enquadramento: ["horizonte no terço inferior, céu dominando", "primeiro plano com detalhe, profundidade até o fundo"],
    luz: ["nascer do sol, luz rasante e dourada", "hora azul depois do pôr do sol", "sol alto com nuvens quebrando a luz"],
    lente: ["16 mm", "24 mm", "35 mm"],
    profundidade: ["tudo em foco, do primeiro plano ao horizonte"],
    textura: ["névoa leve nas camadas de distância, detalhe fino no primeiro plano"],
    evitar: ["cores exageradas de cartão-postal"],
  },
  urbano: {
    enquadramento: ["altura dos olhos, no meio da rua", "de um ponto elevado, mostrando o fluxo"],
    luz: ["noite, letreiros refletindo no asfalto molhado", "fim de tarde, luz entrando entre os prédios"],
    lente: ["28 mm", "35 mm", "50 mm"],
    profundidade: ["profundidade média, pessoas reconhecíveis mas não em destaque"],
    textura: ["reflexos irregulares no chão, pessoas em meio-movimento, textura documental"],
    evitar: ["cena limpa demais para uma rua movimentada"],
  },
  animal: {
    enquadramento: ["na altura do bicho, olhando para a câmera", "em movimento, acompanhando a ação"],
    luz: ["luz da manhã, dourada e lateral", "sombra de árvore com luz filtrada"],
    lente: ["85 mm", "teleobjetiva 200 mm", "50 mm"],
    profundidade: ["profundidade rasa, fundo dissolvido", "movimento congelado com fundo em leve arrasto"],
    textura: ["pelo com fios individuais visíveis, umidade natural no focinho, olhos com reflexo real"],
    evitar: ["pelo escovado como pelúcia"],
  },
  bastidor: {
    enquadramento: ["por cima do ombro de quem trabalha", "de lado, mostrando as mãos e o que está sendo feito"],
    luz: ["luz dura de cozinha misturada com a natural", "vapor e luz de trabalho, sem preparo de estúdio"],
    lente: ["35 mm", "50 mm"],
    profundidade: ["profundidade rasa nas mãos, cozinha sugerida atrás"],
    textura: ["mãos com marcas de trabalho, avental sujo de verdade, movimento com leve arrasto"],
    evitar: ["cozinha impecável de propaganda"],
  },
  procedimento: {
    enquadramento: [
      "por cima do ombro do profissional, mostrando as mãos em ação",
      "de lado, o profissional e o cliente no mesmo quadro",
      "close nas mãos e no instrumento, rosto fora de foco",
      "vista do cliente deitado, perspectiva de quem recebe o cuidado",
    ],
    luz: [
      "luz clínica suave, difusa, sem sombra dura no rosto",
      "luz de janela lateral filtrada por cortina, ambiente calmo",
      "luz de trabalho focada na área tratada, resto em penumbra suave",
    ],
    lente: ["50 mm", "85 mm", "35 mm", "macro 100 mm"],
    profundidade: [
      "profundidade rasa, foco nas mãos, ambiente sugerido",
      "foco no ponto do procedimento, o resto cedendo",
    ],
    textura: [
      "luvas com brilho real, produto de textura visível, pele com poros naturais",
      "mãos firmes com movimento sutil, gotícula de produto, toalha levemente amassada",
      "pele real, sem alisamento — a naturalidade é o que passa confiança",
    ],
    evitar: ["pele de plástico sem poro", "sorriso de propaganda antiga", "equipamento sem nenhum sinal de uso"],
  },
  detalhe: {
    enquadramento: [
      "close extremo, o assunto preenchendo o quadro",
      "recorte parcial, cortando o assunto de propósito",
      "detalhe de textura em ângulo rasante",
    ],
    luz: [
      "luz rasante revelando o relevo",
      "luz difusa aproximando o olho da textura",
      "contraluz suave marcando o contorno",
    ],
    lente: ["macro 100 mm", "85 mm", "macro 60 mm"],
    profundidade: ["profundidade muito rasa, só um plano nítido", "foco preciso num ponto, resto dissolvido"],
    textura: ["microtextura visível, imperfeições reais preservadas", "brilho irregular, poeira ou umidade honesta da cena"],
    evitar: ["superfície limpa demais para ser real"],
  },
  generico: {
    enquadramento: ["enquadramento natural, na altura dos olhos", "levemente de lado, dando volume à cena"],
    luz: ["luz natural difusa, direção clara", "luz lateral de fim de tarde"],
    lente: ["35 mm", "50 mm", "85 mm"],
    profundidade: ["profundidade média, assunto destacado do fundo"],
    textura: ["texturas honestas e imperfeições sutis do mundo real"],
    evitar: [],
  },
};

/**
 * Etiquetas que TODO mundo empilha e que puxam qualquer modelo pro miolo do que
 * ele mais viu — banco de imagem. A técnica entra descrita, não etiquetada.
 */
const LISTA_NEGRA_GERAL = [
  "hiper-realista", "ultra realista", "8K", "4K", "obra-prima",
  "ultra detalhado", "award winning", "trending on artstation",
  "fundo preto desfocado com facho de luz", "perfeição sem imperfeição",
];

const PISTAS: [TipoDeFoto, string[]][] = [
  ["bebida",   ["drink", "suco", "cerveja", "chopp", "caipirinha", "café", "cafe", "copo", "taça", "taca", "coquetel", "milkshake", "refrigerante", "vinho", "caneca"]],
  ["comida",   ["prato", "comida", "hambúrguer", "hamburguer", "burger", "pizza", "sushi", "massa", "carne", "picanha", "sobremesa", "doce", "salada", "porção", "porcao", "lanche", "sanduíche", "sanduiche", "açaí", "acai", "espeto", "churrasco", "bolo", "pastel", "esfiha", "marmita", "combo", "batata"]],
  ["retrato",  ["retrato", "pessoa", "chef", "atendente", "garçom", "garcom", "cliente", "rosto", "selfie", "equipe", "time", "sócio", "socio", "dono"]],
  ["produto",  ["produto", "embalagem", "delivery", "caixa", "sacola", "garrafa", "rótulo", "rotulo", "kit"]],
  ["ambiente", ["salão", "salao", "ambiente", "interior", "mesa posta", "decoração", "decoracao", "espaço", "espaco", "balcão", "balcao"]],
  ["fachada",  ["fachada", "frente da loja", "entrada", "letreiro", "vitrine", "exterior"]],
  ["procedimento", ["procedimento", "tratamento", "limpeza de pele", "atendimento", "sessão", "sessao", "aplicação", "aplicacao", "massagem", "consulta", "corte de cabelo", "manicure", "estética", "estetica", "clínica", "clinica", "cliente sendo atendido"]],
  ["detalhe",      ["detalhe", "textura", "close", "macro", "de perto", "acabamento"]],
  ["bastidor", ["cozinha", "bastidor", "preparo", "fazendo", "mão na massa", "mao na massa", "chapa", "forno", "produção", "producao"]],
  ["animal",   ["cachorro", "gato", "pet", "animal", "bicho"]],
  ["paisagem", ["paisagem", "praia", "montanha", "campo", "natureza", "pôr do sol", "por do sol", "amanhecer"]],
  ["urbano",   ["rua", "cidade", "avenida", "urbano", "calçada", "calcada", "trânsito", "transito"]],
];

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Descobre o tipo de foto pelo pedido em linguagem solta. */
export function detectarTipo(pedido: string): TipoDeFoto {
  const alvo = normalizar(pedido);
  for (const [tipo, pistas] of PISTAS) {
    if (pistas.some((p) => alvo.includes(normalizar(p)))) return tipo;
  }
  return "generico";
}

/**
 * Tira o "quero uma foto do..." da frente do pedido.
 *
 * Sem isto sai "Fotografia real de foto do hambúrguer" — redundância que já
 * denuncia peça feita às pressas, que é exatamente o que a gente não entrega.
 */
export function limparPedido(pedido: string): string {
  let texto = pedido.trim();
  const prefixos = [
    /^(por favor,?\s*)?(me\s+)?(faz|faça|faca|cria|crie|gera|gere|quero|preciso|manda|monta)\s+/i,
    /^(uma?|um)\s+/i,
    /^(foto|fotografia|imagem|clique|registro)\s+/i,
    /^(de|do|da|dos|das)\s+/i,
  ];
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const p of prefixos) {
      const novo = texto.replace(p, "");
      if (novo !== texto) { texto = novo; mudou = true; }
    }
  }
  // Pedido vazio é erro de quem chamou. Não devolvemos string vazia — isso
  // sairia como "Fotografia real de ." e vazaria descuido pra peça. Melhor o
  // prompt dizer alto que o assunto não veio.
  return texto.trim() || pedido.trim() || "assunto não informado";
}

/** Escolhe determinística e circularmente — variação sem Math.random. */
function girar<T>(opcoes: T[], indice: number): T {
  const seguro = opcoes.length > 0 ? opcoes : ([] as T[]);
  return seguro[((indice % seguro.length) + seguro.length) % seguro.length] as T;
}

export interface PedidoDeFoto {
  /** O que o cliente pediu, em linguagem solta: "foto do nosso hambúrguer". */
  pedido: string;
  /** Detalhes verdadeiros do assunto — ingredientes, cores, louça, lugar. */
  detalhes?: string;
  /** Onde a cena acontece, quando importa. */
  cenario?: string;
  /** "4:5", "9:16", "1:1"… Entra no comando como proporção. */
  formato?: string;
  /** Força um tipo em vez de detectar. */
  tipo?: TipoDeFoto;
  /** Gira a receita: 0, 1, 2… Dois pedidos iguais com índices diferentes dão fotos diferentes. */
  variacao?: number;
}

export interface PromptDeFoto {
  tipo: TipoDeFoto;
  /** O comando pronto pra colar em qualquer gerador de imagem. */
  prompt: string;
  /** O que pedir para NÃO aparecer, quando o gerador aceita negativo separado. */
  negativo: string;
  /** A receita escolhida — útil pra auditar e pra não repetir. */
  receita: { enquadramento: string; luz: string; lente: string; profundidade: string; textura: string };
}

/**
 * Forja o comando de foto.
 *
 * O texto sai em PROSA, não em lista de etiquetas: os geradores modernos leem
 * descrição melhor do que palavra-chave empilhada — e etiqueta empilhada é
 * justamente o que produz a foto genérica que todo mundo posta.
 */
export function forjarPromptDeFoto(input: PedidoDeFoto): PromptDeFoto {
  const tipo = input.tipo ?? detectarTipo(input.pedido);
  const preset = PRESETS[tipo];
  const v = input.variacao ?? 0;

  const receita = {
    enquadramento: girar(preset.enquadramento, v),
    luz:           girar(preset.luz, v),
    lente:         girar(preset.lente, v),
    profundidade:  girar(preset.profundidade, v),
    textura:       girar(preset.textura, v),
  };

  const alvo = limparPedido(input.pedido);
  const assunto = input.detalhes?.trim() ? `${alvo} — ${input.detalhes.trim()}` : alvo;

  const frases: string[] = [
    `Fotografia real de ${assunto}.`,
    input.cenario?.trim() ? `Cenário: ${input.cenario.trim()}.` : "",
    `Câmera: ${receita.enquadramento}, lente ${receita.lente}, ${receita.profundidade}.`,
    `Luz: ${receita.luz}.`,
    `Detalhe que faz parecer real: ${receita.textura}.`,
    "Deve parecer uma foto tirada por um fotógrafo profissional com câmera de verdade — cores fiéis, sem retoque exagerado, sem aparência digital.",
    input.formato?.trim() ? `Proporção ${input.formato.trim()}.` : "",
  ];

  const evitar = [...preset.evitar, ...LISTA_NEGRA_GERAL];

  return {
    tipo,
    prompt: [...frases.filter(Boolean), `Evite: ${evitar.join(", ")}.`].join(" "),
    negativo: evitar.join(", "),
    receita,
  };
}

/**
 * Várias opções do MESMO pedido, todas diferentes entre si.
 *
 * É como um fotógrafo trabalha: não entrega um clique, entrega uma seleção.
 */
export function forjarOpcoesDeFoto(input: PedidoDeFoto, quantas = 3): PromptDeFoto[] {
  const total = Math.max(1, Math.min(quantas, 10));
  const base = input.variacao ?? 0;
  return Array.from({ length: total }, (_, i) => forjarPromptDeFoto({ ...input, variacao: base + i }));
}
