/**
 * A VERDADE DO FOOCCI — o que o TA pode afirmar, e de onde cada frase veio.
 *
 * ── POR QUE ESTE ARQUIVO É O PRIMEIRO, E NÃO O PROMPT ───────────────────────
 *
 * Um vendedor de IA sem base de verdade **inventa**. Não é risco teórico: é o
 * comportamento padrão de um modelo perguntado sobre um produto que ele não
 * conhece. E inventar integração, recurso ou prazo é o defeito mais caro que
 * esta função pode ter — o cliente compra pela promessa e descobre na
 * implantação.
 *
 * Por isso a ordem aqui é: **primeiro o que se pode dizer, depois quem diz**.
 *
 * ── DERIVA, NUNCA TRANSCREVE ────────────────────────────────────────────────
 *
 * Nenhuma frase de venda é digitada neste arquivo. Tudo vem de fonte que já
 * existe e que o CEO já aprovou:
 *
 *   · as nove perguntas do site  → `@/lib/site/faq`
 *   · a tabela de preço          → `@/lib/billing/pricing`, via `precos.ts`
 *   · o posicionamento dos planos→ `@/lib/site/plans`
 *
 * O teste lê o código-fonte deste arquivo e reprova se aparecer uma afirmação
 * de venda escrita à mão. Uma frase digitada aqui viveria fora do site, fora da
 * revisão e fora do dia em que o CEO mudasse de ideia.
 *
 * ── O PISO DE ADMISSÃO, E A LIÇÃO DE 04/08 ──────────────────────────────────
 *
 * `manualRetrieval` desta casa já pagou esta lição: enquanto a busca **nunca
 * devolvia vazio**, toda pergunta voltava com um documento, e o agente
 * apresentava o documento mais parecido como verdade. Medido no corpus real:
 * 30 de 30 perguntas devolviam guia, inclusive "como emito nota fiscal", que
 * casava com o guia de acompanhar pedidos.
 *
 * Aqui vale a mesma regra, pelo mesmo motivo: sem casamento forte o suficiente,
 * **devolvemos nada** — e o TA diz que não sabe. Ausência de informação não é
 * informação.
 */

import { FAQS } from "@/lib/site/faq";
import { PLANS } from "@/lib/site/plans";
import { tabelaPublicada, descontoPublicado } from "../precos";

/** De onde a frase veio. Vai junto na resposta, para a Sala poder auditar. */
export type FonteDaVerdade = "faq-do-site" | "tabela-de-preco" | "posicionamento-do-plano";

export interface ItemDeVerdade {
  /** Chave estável, para o teste e para a trilha. */
  id: string;
  fonte: FonteDaVerdade;
  /** A pergunta que este item responde, do jeito que o lead faria. */
  sobre: string;
  /** O que se pode afirmar. Texto pronto para o lead ler. */
  texto: string;
}

/** Sem acento e sem pontuação, para comparar palavra com palavra. */
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
 * Palavras que não distinguem nada.
 *
 * Sem esta lista, "o", "de" e "que" casam com tudo e o piso de admissão deixa
 * de ser piso — foi exatamente assim que "pedido", presente em 21 dos 36 guias,
 * fazia "nota fiscal do pedido" casar com o guia errado.
 */
const VAZIAS = new Set(
  ("a o e de da do das dos em no na nos nas um uma uns umas para por com sem que " +
    "se ao aos as os e ou mas como qual quais quanto quanta é sao são tem ter " +
    "voce voces eu meu minha isso isto esse essa aqui la ja nao sim").split(" "),
);

function palavras(s: string): string[] {
  return normalizar(s)
    .split(" ")
    .filter((p) => p.length > 2 && !VAZIAS.has(p));
}

/**
 * A base inteira, montada das fontes.
 *
 * É função e não constante porque a tabela de preço é derivada em tempo de
 * execução — congelá-la num módulo faria o TA anunciar o preço do dia do
 * deploy.
 */
/**
 * Resposta que só faz sentido para quem está OLHANDO O SITE.
 *
 * ── ACHADO DO PRIMEIRO ENSAIO (25/08/2026) ─────────────────────────────────
 *
 * O TA foi ensaiado com "oi, vi o site de vocês" e respondeu, com apoio na
 * FAQ: *"Tire suas dúvidas com os nossos agentes pelo botão de contato aqui do
 * site."*
 *
 * A frase está certa no site e é absurda no WhatsApp: manda a pessoa que **já
 * está falando com a gente** voltar ao site para falar com a gente. O mesmo
 * vale para "os valores estão na página de preços" — o TA tem a tabela na mão e
 * mandaria o lead procurar sozinho.
 *
 * A regra é derivada do texto, e não uma lista escrita à mão: item que empurra
 * o leitor de volta para a página não serve a quem já saiu dela.
 */
const APONTA_PARA_O_SITE = /(aqui do site|neste site|no site|bot[ãa]o de contato|p[áa]gina de pre[çc]os|na p[áa]gina)/i;

export function baseDeVerdade(): ItemDeVerdade[] {
  const itens: ItemDeVerdade[] = [];

  // 1. As nove do site, menos as que só funcionam DENTRO do site.
  FAQS.forEach((f, i) => {
    if (APONTA_PARA_O_SITE.test(f.a)) return;
    itens.push({
      id: `faq-${i + 1}`,
      fonte: "faq-do-site",
      sobre: f.q,
      texto: f.a,
    });
  });

  // 2. Preço — montado da tabela viva, nunca digitado.
  for (const plano of tabelaPublicada()) {
    const mensal = plano.ciclos.find((c) => c.ciclo === "MENSAL")!;
    const anual = plano.ciclos.find((c) => c.ciclo === "ANUAL")!;
    const posicionamento = PLANS.find((p) => p.id === plano.id);

    itens.push({
      id: `preco-${plano.id}`,
      fonte: "tabela-de-preco",
      sobre: `quanto custa o plano ${plano.nome}`,
      texto:
        `O plano ${plano.nome} é ${mensal.doCiclo} por mês. ` +
        `No anual sai por ${anual.equivalenteAoMes} por mês. ` +
        `Na primeira cobrança você paga ${mensal.primeiraCobranca} no mensal, ` +
        "porque o primeiro mês é pela metade.",
    });

    if (posicionamento) {
      itens.push({
        id: `plano-${plano.id}`,
        fonte: "posicionamento-do-plano",
        sobre: `para que serve o plano ${plano.nome}`,
        texto: `${plano.nome}: ${posicionamento.onlyHere} ${posicionamento.forWho}`,
      });
    }
  }

  // 3. O desconto — a única regra de abatimento que existe.
  const d = descontoPublicado();
  if (d.sabe) {
    itens.push({
      id: "desconto",
      fonte: "tabela-de-preco",
      sobre: "tem desconto",
      texto: d.valor.regra,
    });
  }

  return itens;
}

// ── A BUSCA ──────────────────────────────────────────────────────────────────

export interface Achado {
  item: ItemDeVerdade;
  /** Quantos termos da pergunta o item cobre, de 0 a 1. */
  cobertura: number;
}

/**
 * Quanto da PERGUNTA o item cobre — e não quanto do item a pergunta cobre.
 *
 * A direção importa. Medir ao contrário premia item curto: um texto de cinco
 * palavras que casa duas parece ótimo, e não respondeu nada.
 */
export const COBERTURA_MINIMA = 0.34;

/**
 * O que a base tem sobre esta pergunta. Vazio quando não tem nada forte.
 *
 * ⚠️ **Devolver `[]` é um resultado, não uma falha.** É ele que faz o TA dizer
 * "não sei" em vez de responder com o item mais parecido — que é como um
 * agente ensina o que não existe com cara de fundamentado.
 */
export function buscarNaVerdade(pergunta: string, base = baseDeVerdade()): Achado[] {
  const termos = palavras(pergunta);
  if (termos.length === 0) return [];

  return base
    .map((item) => {
      const texto = new Set(palavras(`${item.sobre} ${item.texto}`));
      const cobertos = termos.filter((t) => texto.has(t)).length;
      return { item, cobertura: cobertos / termos.length };
    })
    .filter((a) => a.cobertura >= COBERTURA_MINIMA)
    .sort((a, b) => b.cobertura - a.cobertura);
}
