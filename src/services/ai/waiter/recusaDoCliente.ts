/**
 * recusaDoCliente — quando o cliente diz "acabei", e quando ele só COMEÇA com
 * "não".
 *
 * ─── O caso que originou este arquivo ────────────────────────────────────────
 * O sinal genérico de fechamento morava numa regex só
 * (`WaiterBrainV2.REFUSAL_GENERIC_RE`) cujo primeiro ramo era, na prática,
 * `^não\s`:
 *
 *     /^(n[ãa]o\s*,?\s*(obrigad[oa])?\.?|...)\b/i
 *
 * `(obrigad[oa])?` e `\.?` são opcionais e `\s*` casa o espaço — sobra `^não `.
 * Resultado medido, rodando `decide()`:
 *
 *   cliente: "nao consigo achar o rodizio"
 *   garçom : "Perfeito 😊 Fico por aqui se precisar de uma sugestão."
 *
 *   cliente: "não gosto de peixe cru, tem outra coisa?"      → mesma frase
 *   cliente: "não entendi o preço do combo"                  → mesma frase
 *   cliente: "não faço ideia, o que pedir aqui?"             → mesma frase
 *   cliente: "não quero gastar muito"                        → mesma frase
 *
 * A primeira é o incidente do rodízio com outra roupa: o handler que responde
 * "temos sim, R$ X, só no salão" mora DEPOIS do bloco de recusa e nunca era
 * alcançado. E `sanitizeUnprovenDenial` é cego para isso — **não há negação na
 * resposta, há ausência de resposta**. Negar tem trava; enrolar não tinha.
 *
 * Com item no carrinho o estrago é maior: vira `CHECKOUT_SUPPORT`, e o caminho
 * da IA apaga os cards à força nesse modo (`AIOrderService`). Quem pediu ajuda
 * era empurrado para o caixa.
 *
 * ─── A regra que este arquivo carrega ────────────────────────────────────────
 * **A mensagem tem que SER uma recusa, não começar parecida com uma.**
 *
 * Duas travas juntas, porque cada uma sozinha erra para um lado:
 *
 *  1. **Lista fechada** de formas de recusa. Nada de "parece que ele está
 *     recusando" — é uma das formas escritas aqui, ou não é.
 *  2. **A mensagem inteira** precisa se resolver em recusa + cortesia. Todo
 *     pedaço com conteúdo próprio ("consigo achar o rodizio", "gosto de peixe
 *     cru", "quero gastar muito") derruba a classificação.
 *
 * ─── E a outra metade, que importa igual (guardrail 5) ───────────────────────
 * Detector que só aperta vira outro defeito: um Garçom que não reconhece "não,
 * obrigado" insiste com quem já disse que acabou, e isso é pior que a evasiva.
 * Por isso metade do teste deste módulo prova que a recusa LEGÍTIMA continua
 * encerrando — "não", "não, obrigado", "não quero mais nada", "só isso",
 * "pode fechar", "já chega", "tudo certo".
 *
 * Puro: sem DB, sem I/O, sem catálogo.
 */

/** Ruído que não muda o sentido: acentos, caixa, emoji, espaço repetido. */
function normalizar(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    // Mantém letras, números e espaço. Emoji, asterisco e afins saem.
    .replace(/[^a-z0-9\s,.;!?…\n]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * As formas de recusa, com âncora nos DOIS lados.
 *
 * Cada linha é uma frase inteira que um cliente escreve para dizer "acabei".
 * Ancorada em `^...$` de propósito: é isto que separa "não" (recusa) de "não
 * consigo achar o rodízio" (pergunta). Acrescentar linha aqui é decisão
 * consciente, e cada uma que entrar precisa de caso nos dois lados do teste.
 */
const NUCLEOS_DE_RECUSA: readonly RegExp[] = [
  /^nao$/,
  /^nao\s+obrigad[oa]$/,
  /^nao\s+quero(\s+mais)?(\s+nada)?$/,
  /^nao\s+quero\s+nada\s+mais$/,
  /^nao\s+precisa(\s+mais)?$/,
  /^nao\s+vou\s+querer(\s+mais)?(\s+nada)?$/,
  /^(e\s+)?so\s+isso(\s+mesmo)?$/,
  /^(e\s+)?isso(\s+mesmo)?$/,
  /^ta\s+(bom|certo|otimo)\s+assim$/,
  /^pode\s+fechar(\s+o\s+pedido)?$/,
  /^(ja\s+)?chega$/,
  /^nada\s+mais$/,
  /^tudo\s+certo$/,
  /^por\s+enquanto\s+(e\s+)?so$/,
];

/**
 * Cortesia: pedaço sem conteúdo próprio, que acompanha a recusa sem mudá-la.
 * "não, obrigado" e "só isso mesmo, valeu" continuam sendo recusa.
 *
 * Fechada de propósito. Qualquer coisa fora desta lista é tratada como conteúdo
 * — e conteúdo derruba a classificação, que é o lado seguro do erro: na dúvida,
 * o Garçom continua a conversa em vez de encerrar por conta própria.
 */
const CORTESIA: readonly RegExp[] = [
  /^obrigad[oa]$/,
  /^brigad[oa]$/,
  /^valeu$/,
  /^vlw$/,
  /^ok(ay)?$/,
  /^blz$/,
  /^beleza$/,
  /^por\s+favor$/,
  /^pfv$/,
  /^pf$/,
  /^tchau$/,
  /^ate\s+mais$/,
  /^ate\s+logo$/,
  /^mesmo$/,
  /^entao$/,
  /^por\s+enquanto$/,
  /^pra\s+mim$/,
  /^agora$/,
];

const casaAlguma = (fragmento: string, lista: readonly RegExp[]): boolean =>
  lista.some((re) => re.test(fragmento));

/**
 * A mensagem inteira é um sinal genérico de fechamento?
 *
 * Verdadeiro só quando TODO pedaço da mensagem é recusa ou cortesia, e pelo
 * menos um é recusa. Um único pedaço com conteúdo próprio devolve `false` — o
 * Garçom segue a conversa, que é o lado barato do erro.
 */
export function ehRecusaGenerica(message: string): boolean {
  const texto = normalizar(message);
  if (!texto) return false;

  const fragmentos = texto
    .split(/[,.;!?…\n]+/)
    .map((f) => f.trim())
    .filter(Boolean);
  if (fragmentos.length === 0) return false;

  let temRecusa = false;
  for (const fragmento of fragmentos) {
    if (casaAlguma(fragmento, NUCLEOS_DE_RECUSA)) {
      temRecusa = true;
      continue;
    }
    if (casaAlguma(fragmento, CORTESIA)) continue;
    return false; // pedaço com conteúdo próprio: não é recusa, é assunto
  }
  return temRecusa;
}

/**
 * Recusa de complemento com a negação DEPOIS do substantivo: "não, bebida não",
 * "sobremesa não".
 *
 * Existe porque as réguas de bebida/sobremesa do `WaiterBrainV2` só olham a
 * forma "não quero bebida" — a forma posposta caía na regex genérica e só era
 * reconhecida por acidente, pelo mesmo defeito que este arquivo conserta. Sem
 * ela, apertar o genérico faria o Garçom voltar a oferecer bebida a quem
 * acabou de recusar.
 *
 * O `$` no fim é a trava contra "bebida não alcoólica": ali o "não" tem
 * continuação, e continuação quer dizer que é outro assunto.
 */
const COMPLEMENTO_POSPOSTO: ReadonlyArray<{ tipo: "BEBIDA" | "SOBREMESA"; re: RegExp }> = [
  { tipo: "BEBIDA",    re: /\b(bebida|refri(gerante)?|suco|drink)s?\s*,?\s*nao\s*$/ },
  { tipo: "SOBREMESA", re: /\b(sobremesa|doce)s?\s*,?\s*nao\s*$/ },
];

/** Qual complemento a mensagem recusa na forma posposta, se algum. */
export function recusaDeComplementoPosposta(message: string): "BEBIDA" | "SOBREMESA" | null {
  const texto = normalizar(message);
  if (!texto) return null;
  for (const fragmento of texto.split(/[.;!?…\n]+/)) {
    const f = fragmento.trim();
    for (const { tipo, re } of COMPLEMENTO_POSPOSTO) if (re.test(f)) return tipo;
  }
  return null;
}
