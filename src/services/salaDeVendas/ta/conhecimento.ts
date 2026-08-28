/**
 * O QUE O TA SABE SOBRE O FOOCCI — e o muro que separa isso do que ele AFIRMA.
 *
 * ── DOIS ARQUIVOS, DUAS FUNÇÕES DIFERENTES ──────────────────────────────────
 *
 * `verdade.ts` guarda **frases prontas para o lead ler**: preço, FAQ do site,
 * posicionamento dos planos. Sai como está, palavra por palavra.
 *
 * Este arquivo guarda **contexto para o modelo pensar**: o Manual Operacional da
 * casa, que descreve o produto inteiro. Nada daqui sai verbatim — o manual foi
 * escrito para engenheiro, fala de `productIds`, de `stage`, de contrato de UI.
 * Despejar isso num dono de pizzaria seria pior que não responder.
 *
 * A separação é a razão de existirem dois arquivos: **saber não é poder afirmar.**
 *
 * ── ⚠️ O QUE NUNCA PODE ATRAVESSAR ESTE MURO ────────────────────────────────
 *
 * O Manual tem capítulos e seções que descrevem o que **ainda não existe**:
 * "Backlog", "Gaps conhecidos", "Histórico de Decisões". Um SDR com acesso a
 * isso vira o pior vendedor possível — o que promete o roadmap. O cliente compra
 * a promessa e descobre na implantação.
 *
 * Tem também o que é interno e não é da conta de um estranho: arquitetura,
 * segurança operacional, marca.
 *
 * Por isso o filtro é **lista de permissão em dois níveis**: o capítulo precisa
 * estar autorizado, E a seção precisa não estar na lista de proibidas. Lista de
 * bloqueio sozinha falha no dia em que o Manual ganha um capítulo novo — e o
 * capítulo novo entraria calado.
 *
 * O teste prova as duas coisas, e prova pelo conteúdo: ele procura frases reais
 * do backlog dentro da base e exige que não estejam lá.
 */

import { MANUAL_V01_CONTENT } from "@/services/manual/manualV01Content";
// Uma lista de palavras vazias para as duas buscas — ver `vocabulario.ts`.
import { palavras } from "./vocabulario";

/**
 * Os capítulos que um prospecto pode conhecer.
 *
 * Cada entrada é uma decisão, não uma conveniência:
 *
 *   · `visao-geral`        — o que o Foocci é. A primeira pergunta de todo lead.
 *   · `waiter-agent`       — o pedido guiado. O coração do produto.
 *   · `crm-agent`          — a recompra. O que separa o Foocci de um cardápio.
 *   · `whatsapp-agent`     — o atendimento. Onde o lojista já vive.
 *   · `integracoes`        — "funciona com o que eu já uso?" — a pergunta que
 *                            mais derruba negócio quando a resposta é chutada.
 *   · `checkout-pagamentos`— como o dinheiro entra.
 *   · `analytics`          — o que ele passa a enxergar.
 *
 * Fora da lista, e de propósito: `arquitetura-do-sistema`, `seguranca-operacional`,
 * `branding`, `ui-ux` e `principios-operacionais` (internos, não são da conta de
 * um estranho), `backlog` e `historico-de-decisoes` (o que não existe).
 */
export const CAPITULOS_PERMITIDOS = [
  "visao-geral",
  "waiter-agent",
  "crm-agent",
  "whatsapp-agent",
  "integracoes",
  "checkout-pagamentos",
  "analytics",
] as const;

/**
 * Seções que não atravessam, mesmo dentro de capítulo autorizado.
 *
 * "Gaps conhecidos" é a mais importante da lista: ela aparece em quase todo
 * capítulo do Manual e é, literalmente, a lista do que ainda não funciona bem.
 * Um SDR municiado com ela responderia "a busca do cardápio precisa evoluir" a
 * quem está decidindo se compra.
 */
const SECOES_PROIBIDAS =
  /^(#+\s*)?(gaps?\b|backlog|riscos?\b|d[ée]bito|pend[êe]ncias?\b|hist[óo]rico|decis[õo]es|arquitetura|seguran[çc]a|roadmap|pr[óo]ximos passos)/i;

export interface PedacoDeConhecimento {
  /** Chave estável: capítulo + seção. Vai na trilha, para auditar a resposta. */
  id: string;
  capitulo: string;
  /** O título da seção, como o Manual escreveu. */
  secao: string;
  texto: string;
}

/**
 * Quebra um capítulo nas suas seções `##`.
 *
 * Por seção e não por capítulo inteiro porque o capítulo do CRM tem 150 linhas:
 * mandar isso inteiro ao modelo para responder "vocês mandam mensagem de
 * aniversário?" gasta contexto com noventa por cento de assunto que não é o da
 * pergunta — e contexto gasto é atenção tirada do que importa.
 */
function secoesDe(slug: string, conteudo: string): PedacoDeConhecimento[] {
  const pedacos: PedacoDeConhecimento[] = [];

  // A primeira quebra são os `##`. O que vem antes do primeiro `##` é a abertura
  // do capítulo — costuma ser a definição, e é o pedaço mais útil de todos.
  const partes = conteudo.split(/\n(?=##\s)/);

  for (const parte of partes) {
    const linhas = parte.trim().split("\n");
    const cabecalho = (linhas[0] ?? "").replace(/^#+\s*/, "").trim();
    const corpo = linhas.slice(1).join("\n").trim();

    if (!corpo) continue;
    if (SECOES_PROIBIDAS.test(cabecalho)) continue;

    pedacos.push({
      id: `${slug}:${normalizarChave(cabecalho)}`,
      capitulo: slug,
      secao: cabecalho,
      texto: corpo,
    });
  }

  return pedacos;
}

function normalizarChave(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "abertura";
}

/**
 * Tudo que o TA sabe, pronto para virar contexto do modelo.
 *
 * Função e não constante pelo mesmo motivo de `baseDeVerdade()`: o Manual é
 * dado do produto, e congelá-lo num módulo faria o TA parar no dia do deploy.
 */
export function baseDeConhecimento(): PedacoDeConhecimento[] {
  const permitidos = new Set<string>(CAPITULOS_PERMITIDOS);

  return MANUAL_V01_CONTENT
    .filter((c) => permitidos.has(c.slug))
    .flatMap((c) => secoesDe(c.slug, c.content));
}

// ── A BUSCA ──────────────────────────────────────────────────────────────────

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


/**
 * Quantos pedaços vão junto na pergunta.
 *
 * Seis, e não "todos": o modelo lê melhor cinco parágrafos certos do que
 * quarenta mornos, e enfiar a base inteira em todo turno é o jeito mais caro de
 * piorar a resposta. Quem escolhe é a busca; quem redige é o modelo.
 */
export const PEDACOS_POR_TURNO = 6;

/**
 * Todas as palavras que aparecem em algum lugar da base.
 *
 * Memorizada por base: `baseDeConhecimento()` devolve a mesma lista a cada
 * turno, e varrer o Manual inteiro em toda pergunta é trabalho repetido à toa.
 */
const VOCABULARIOS = new WeakMap<object, Set<string>>();

function vocabularioDa(base: PedacoDeConhecimento[]): Set<string> {
  const guardado = VOCABULARIOS.get(base);
  if (guardado) return guardado;

  const vocabulario = new Set<string>();
  for (const p of base) {
    for (const t of palavras(`${p.secao} ${p.texto}`)) vocabulario.add(t);
  }
  VOCABULARIOS.set(base, vocabulario);
  return vocabulario;
}

/**
 * O que a base tem sobre esta pergunta.
 *
 * ⚠️ Diferente de `buscarNaVerdade`, aqui **não há piso de admissão**, e a
 * diferença é o desenho: aquilo ali decide o que o TA pode AFIRMAR, e afirmar
 * com base fraca é inventar. Isto aqui é contexto de leitura — mandar um
 * parágrafo pouco relacionado junto não faz o modelo mentir, faz ele ignorar.
 *
 * A trava contra invenção não mora aqui: mora no verificador, depois.
 */
export function buscarNoConhecimento(
  pergunta: string,
  base = baseDeConhecimento(),
  quantos = PEDACOS_POR_TURNO,
): PedacoDeConhecimento[] {
  const termos = palavras(pergunta);
  if (termos.length === 0) return [];

  // ── ⚠️ AQUI O DENOMINADOR IGNORA O QUE A BASE NÃO CONHECE ────────────────
  //
  // E **só aqui**. Medido em 28/08/2026: dividir por todas as palavras da
  // pergunta pune quem fala como gente — cada palavra a mais derruba a nota, e
  // "quanto eu economizo saindo do ifood" reprovava enquanto "quanto o ifood
  // cobra" passava. O primeiro é como um dono de restaurante pergunta.
  //
  // A mesma mudança em `buscarNaVerdade` foi TENTADA e revertida: lá ela fez
  // "vocês integram com o sistema Colibri?" achar material, e aquilo decide o
  // que o TA pode AFIRMAR. A diferença entre os dois arquivos é essa, e é toda
  // a diferença: **isto aqui é contexto de leitura**. Mandar um parágrafo pouco
  // relacionado junto não faz o modelo mentir — faz ele ignorar. Lá, afirmar com
  // base fraca É mentir.
  const vocabulario = vocabularioDa(base);
  const pesam = termos.filter((t) => vocabulario.has(t));
  if (pesam.length === 0) return [];

  return base
    .map((p) => {
      const texto = new Set(palavras(`${p.secao} ${p.texto}`));
      const cobertos = pesam.filter((t) => texto.has(t)).length;
      return { p, nota: cobertos / pesam.length };
    })
    .filter((x) => x.nota > 0)
    .sort((a, b) => b.nota - a.nota)
    .slice(0, quantos)
    .map((x) => x.p);
}
