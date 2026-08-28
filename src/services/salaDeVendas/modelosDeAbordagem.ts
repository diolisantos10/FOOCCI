/**
 * OS MODELOS DE ABORDAGEM — o funil frio, em quatro passos.
 *
 * ── ⚠️ POR QUE ESTE ARQUIVO FOI REESCRITO NO MESMO DIA ──────────────────────
 *
 * A primeira versão tinha **um** modelo, e ele pedia a reunião logo no primeiro
 * "oi": *"queria te mostrar como funciona — leva cinco minutos. Posso te contar
 * por aqui mesmo?"*. O CEO leu e reprovou, com razão:
 *
 *   *"precisa de mais frases convidando pra conhecer no site, pra levar pro
 *   site, não só já abordando o cliente ali porque vai ter hora que ele não vai
 *   querer. Ele vai querer conversar depois. Então essa abordagem 'deixa eu te
 *   mostrar cinco minutinhos' isso não existe. (…) a gente precisa de um funil
 *   um pouco mais estruturado, isso é muito evasivo."*
 *
 * O erro tem nome: **pedir compromisso antes de dar valor.** Um dono de
 * restaurante às onze da manhã não tem cinco minutos, e a pergunta que ele
 * responde nessa hora é "não". Um "não" no primeiro contato fecha a porta para
 * o segundo — e é no segundo que a venda acontece.
 *
 * ── O DESENHO NOVO ──────────────────────────────────────────────────────────
 *
 * Quatro passos, e **nenhum deles pede reunião**. Todos levam ao **site**, que
 * trabalha sozinho: está no ar 24h, tem os preços publicados, e a pessoa olha
 * na hora que ela quiser sem falar com ninguém.
 *
 * Quem se interessa volta — e quando volta, **ela escreve primeiro**, o que
 * abre a janela de 24h e libera a conversa livre. O agente assume dali. O
 * modelo existe só para atravessar o silêncio; a venda acontece na conversa.
 *
 * Cada passo carrega uma **saída honesta** ("se não for o momento, é só me
 * dizer"). Isso não é educação: é o que torna o passo seguinte possível.
 *
 * ── O QUE ESTE ARQUIVO NÃO FAZ ──────────────────────────────────────────────
 *
 * Não submete nada. Cada modelo é aprovado UMA vez pela Meta e disparado
 * milhares de vezes — submeter é ato externo, e é do CEO.
 *
 * ⚠️ Modelo só é necessário **fora da janela de 24h**. Assim que a pessoa
 * responde, a conversa é livre e nada aqui se aplica.
 */

/** Categoria da Meta. Abordagem comercial é MARKETING — não há discussão. */
export const CATEGORIA = "MARKETING" as const;

/** O idioma cadastrado na Meta. Espelha o do CRM dos restaurantes. */
export const IDIOMA = "pt_BR" as const;

/**
 * O endereço que todos os modelos usam.
 *
 * A raiz, e não `/site`: `foocci.com.br` redireciona para a página comercial, é
 * mais curta de ler no WhatsApp, e sobrevive a uma mudança de caminho — que um
 * modelo aprovado **não** sobrevive, porque reaprovar leva horas.
 */
export const SITE = "foocci.com.br";

/** O rodapé com a saída. Igual em todos: marketing sem opt-out é reprovado. */
export const RODAPE = "Se não quiser mais receber, é só responder SAIR.";

export interface ModeloDeAbordagem {
  /** A ordem no funil. 1 é o primeiro contato. */
  passo: number;
  /** O nome na Meta. O prefixo `foocci_` separa dos modelos dos restaurantes. */
  name: string;
  /** Quando este modelo é usado — a regra do funil, em uma frase. */
  quando: string;
  body: string;
  footer: string;
  variables: readonly string[];
  examples: Readonly<Record<string, string>>;
}

const EXEMPLOS = { nome: "Marina", estabelecimento: "Bar do Zé" } as const;
const VARIAVEIS = ["nome", "estabelecimento"] as const;

/**
 * O funil, em ordem.
 *
 * ⚠️ A ordem das variáveis é contrato: a Meta preenche `{{1}}` com o primeiro
 * parâmetro enviado. Trocar aqui sem trocar no envio manda o nome do bar no
 * lugar do nome da pessoa.
 */
export const MODELOS_DE_ABORDAGEM: readonly ModeloDeAbordagem[] = [
  {
    passo: 1,
    name: "foocci_convite_site",
    quando: "Primeiro contato com quem nunca falou com a gente.",
    /*
      Não pede nada. Diz quem somos, o que fazemos e onde ver — e encerra
      oferecendo presença, não compromisso. O preço aparece porque é a primeira
      pergunta de todo mundo, e mandar a pessoa para onde ele já está publicado
      poupa a conversa que ninguém quer ter às onze da manhã.
    */
    body:
      "Olá, {{1}}! Aqui é do Foocci. A gente ajuda restaurantes e bares a " +
      "vender direto pelo WhatsApp, sem depender só dos aplicativos. " +
      `Se quiser conhecer sem compromisso, está tudo no ${SITE} — preços ` +
      "inclusive. Qualquer dúvida sobre o {{2}}, é só me chamar por aqui.",
    footer: RODAPE,
    variables: VARIAVEIS,
    examples: EXEMPLOS,
  },
  {
    passo: 2,
    name: "foocci_sem_resposta",
    quando: "Alguns dias depois do passo 1, sem nenhuma resposta.",
    /*
      Reconhece o silêncio em vez de fingir que não houve. "Não quero
      incomodar" é literal: quem insiste sem dizer isso vira bloqueio, e
      bloqueio no WhatsApp oficial custa a qualidade do número — o ativo mais
      caro da operação.
    */
    body:
      "Oi, {{1}}! Não quero incomodar — só deixar o caminho aberto. " +
      `Dá para ver o Foocci inteiro sem falar com ninguém, no ${SITE}, ` +
      "com os planos e os valores. Se um dia fizer sentido para o {{2}}, " +
      "estou por aqui.",
    footer: RODAPE,
    variables: VARIAVEIS,
    examples: EXEMPLOS,
  },
  {
    passo: 3,
    name: "foocci_duvida_aberta",
    quando: "Quem respondeu ou demonstrou interesse e parou no meio.",
    /*
      ⚠️ NÃO afirma que a pessoa visitou o site. A gente não mede isso com
      certeza, e "vi que você entrou lá" soa a vigilância, destrói confiança e
      é afirmação sobre fato não apurado — os três de uma vez.
    */
    body:
      "Oi, {{1}}! Ficou alguma dúvida sobre o Foocci para o {{2}}? " +
      "Pode perguntar por aqui, sem compromisso — respondo o que der, e o que " +
      `eu não souber eu confirmo e te retorno. Se preferir olhar com calma, o ` +
      `${SITE} continua no ar.`,
    footer: RODAPE,
    variables: VARIAVEIS,
    examples: EXEMPLOS,
  },
  {
    passo: 4,
    name: "foocci_reativacao",
    quando: "Conversa antiga que esfriou — semanas ou meses sem contato.",
    /*
      A saída explícita é o ponto deste modelo, não a cortesia. Quem diz "não
      insisto" e cumpre pode voltar daqui a seis meses. Quem insiste sem
      combinar, não volta nunca.
    */
    body:
      "Oi, {{1}}! Faz um tempo que a gente falou sobre o Foocci. " +
      `Se ainda fizer sentido para o {{2}}, o ${SITE} está atualizado, com ` +
      "planos e valores. E se não for o momento, é só me dizer que eu não " +
      "insisto.",
    footer: RODAPE,
    variables: VARIAVEIS,
    examples: EXEMPLOS,
  },
];

// ── A conferência, antes de submeter ─────────────────────────────────────────

export type ProblemaNoModelo =
  | "comecaComVariavel"
  | "terminaComVariavel"
  | "variaveisColadas"
  | "numeracaoQuebrada"
  | "exemploFaltando"
  | "semSaida"
  | "prometeResultado"
  | "pedeCompromisso"
  | "naoLevaAoSite";

/**
 * O que reprovaria o modelo — na Meta ou na régua do CEO.
 *
 * ── POR QUE ISTO É CÓDIGO E NÃO UMA LISTA DE CUIDADOS NO COMENTÁRIO ─────────
 *
 * Cada submissão reprovada custa revisão da Meta e, repetida, mancha a conta.
 * Mas as duas regras que mais escapam não são de formato — são as duas de
 * baixo, e as duas entram exatamente quando alguém "melhora" o texto para
 * vender mais:
 *
 *   · **prometeResultado** — o número inventado que fecha contrato e depois
 *     aparece na reclamação. É também o que o CDC art. 37 §1º alcança.
 *   · **pedeCompromisso** — a versão anterior deste arquivo pedia cinco
 *     minutos no primeiro "oi", e foi reprovada pelo CEO. Sem trava, ela
 *     volta: é a frase que todo vendedor escreve por instinto.
 *
 * Guardrail da casa: para o que causa dano real, exige-se o mecanismo, não a
 * boa intenção escrita.
 */
export function problemasDoModelo(m: ModeloDeAbordagem): ProblemaNoModelo[] {
  const problemas: ProblemaNoModelo[] = [];
  const corpo = m.body.trim();

  if (/^\{\{\d+\}\}/.test(corpo)) problemas.push("comecaComVariavel");
  if (/\{\{\d+\}\}$/.test(corpo)) problemas.push("terminaComVariavel");
  if (/\{\{\d+\}\}\s*\{\{\d+\}\}/.test(corpo)) problemas.push("variaveisColadas");

  // A numeração tem de ser 1..n, em ordem e sem buraco — a Meta casa por
  // posição, e um {{3}} sem {{2}} manda o parâmetro errado para o cliente.
  const numeros = [...corpo.matchAll(/\{\{(\d+)\}\}/g)].map((x) => Number(x[1]));
  const esperada = m.variables.map((_, i) => i + 1);
  if (numeros.length !== esperada.length || numeros.some((n, i) => n !== esperada[i])) {
    problemas.push("numeracaoQuebrada");
  }

  if (m.variables.some((v) => !m.examples[v]?.trim())) problemas.push("exemploFaltando");

  const saida = `${corpo} ${m.footer ?? ""}`.toLowerCase();
  if (!/\bsair\b|descadastr|n[ãa]o (quiser|quero) (mais )?receber/.test(saida)) {
    problemas.push("semSaida");
  }

  if (/\d+\s*%|\bgarant|\btriplic|\bdobr[ae]|aumente? (suas )?vendas/i.test(corpo)) {
    problemas.push("prometeResultado");
  }

  // ⚠️ A régua do CEO. Nenhum modelo de abordagem pede reunião, ligação,
  // demonstração nem "uns minutinhos" — o convite é sempre para o site, que
  // trabalha sozinho e não exige que a pessoa pare o que está fazendo.
  if (
    /\b(reuni[ãa]o|demonstra[çc][ãa]o|call|te ligo|me liga|agendar|agenda um|minutinhos?|\d+\s*minutos?)\b/i
      .test(corpo)
  ) {
    problemas.push("pedeCompromisso");
  }

  // Todo modelo leva ao site. É o funil inteiro: o site apresenta o produto sem
  // consumir o tempo de ninguém.
  if (!corpo.includes(SITE)) problemas.push("naoLevaAoSite");

  return problemas;
}

/** O modelo de um passo do funil. */
export function modeloDoPasso(passo: number): ModeloDeAbordagem | undefined {
  return MODELOS_DE_ABORDAGEM.find((m) => m.passo === passo);
}
