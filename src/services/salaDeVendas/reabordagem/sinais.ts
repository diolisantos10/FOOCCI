/**
 * OS SINAIS QUE SE LEEM NA ÚLTIMA RESPOSTA — determinísticos, e só isso.
 *
 * Mesma doutrina de `gatekeeper/classificacao.ts`: classificar com modelo
 * custaria uma ida e volta por conversa, milhares de vezes, para decidir algo
 * que se lê em palavras. E o padrão de TODOS é "não achei" — ausência de sinal
 * não é sinal (guardrail 1). Quem não dispara nenhuma regra daqui vai para
 * REVISÃO, nunca para um palpite.
 *
 * ⛔ Nada aqui escreve, envia ou decide. Só lê texto.
 */

function normalizar(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * "Pare", "não quero", "sai daqui".
 *
 * ⚠️ Esta leitura só ACRESCENTA bloqueio: ela nunca desbloqueia ninguém. O
 * `optOutAt` da ficha continua sendo a verdade formal; isto pega quem pediu
 * para parar por escrito e cuja ficha ainda não foi carimbada.
 */
const PEDIU_PARA_PARAR =
  /\b(nao (quero|queremos|tenho|temos) interesse|nao me (mande|manda|envie|envia|mandem)( mais)?( mensagens?)?|(pare|parem|para) de (mandar|enviar|me mandar)|nao (perturbe|perturba|encha)|me (tire|tira|remova|remove|descadastr\w*) (da|dessa|desta) lista|sai(r)? da lista|descadastr\w*|nao envie mais|me deixa em paz|nao insista)\b/;

export function pediuParaParar(texto: string | null | undefined): boolean {
  const t = normalizar(texto ?? "");
  if (!t) return false;
  return PEDIU_PARA_PARAR.test(t);
}

/**
 * "Não sou eu", "não é comigo", "não trabalho mais aqui".
 *
 * Distinta do porteiro CLASSIFICADO: aqui a própria pessoa declarou que a
 * decisão não é dela, sem dizer o que ela é.
 */
const NAO_EH_O_RESPONSAVEL =
  /\b(nao sou (eu|o|a) (responsavel|dono|dona|gerente)?|nao sou eu|nao e comigo|nao e comigo nao|isso nao e comigo|nao cuido (disso|dessa parte)|nao trabalho mais (aqui|ai)|nao respondo por isso|quem cuida disso (e|nao sou)|nao tenho (nada a ver|autonomia|autoridade)|sou (so |apenas )?(o|a) (atendente|entregador\w*|garcom|garconete|funcionari\w*))\b/;

export function naoEhOResponsavel(texto: string | null | undefined): boolean {
  const t = normalizar(texto ?? "");
  if (!t) return false;
  return NAO_EH_O_RESPONSAVEL.test(t);
}

/**
 * ⭐ A OPÇÃO DO MENU QUE LEVA A GENTE — e só ela.
 *
 * ── A REGRA QUE NÃO SE QUEBRA ───────────────────────────────────────────────
 *
 * A casa navega o menu **apenas** por uma opção que o próprio menu OFERECEU
 * para falar com atendente, comercial ou humano. Nunca por "1 - Fazer pedido",
 * nunca por um número chutado, nunca fingindo interesse em comprar. Se o menu
 * não oferece caminho para gente, a resposta desta função é `null` e a conversa
 * vai para revisão — que é o lado seguro.
 *
 * Aceita as duas formas que os menus de restaurante usam:
 *   "3 - Falar com um atendente"   → devolve "3"
 *   "Digite ATENDENTE para..."      → devolve "ATENDENTE"
 */
const PALAVRA_DE_HUMANO =
  "(atendente|atendimento humano|falar com (um |uma )?(atendente|pessoa|humano|consultor)|comercial|setor comercial|administrativo|financeiro|gerente|humano|pessoa)";

/** "3 - falar com atendente" / "3) atendente" / "opção 2: comercial" */
// ⚠️ O texto chega NORMALIZADO (quebras de linha já viraram espaço), então a
// âncora não pode ser `\n`: ela é o começo ou um espaço, e o que torna o padrão
// específico é o separador logo depois do número ("3 - ", "2) ", "1: ").
const NUMERO_ANTES = new RegExp(
  `(?:^|\\s)(?:opcao\\s*)?(\\d{1,2})\\s*[-–—).:•]+\\s*[^|;\\d]{0,40}?${PALAVRA_DE_HUMANO}`,
  "i",
);

/** "digite 3 para falar com um atendente" / "para falar com atendente, digite 3" */
const DIGITE_NUMERO = new RegExp(`digit\\w*\\s*(\\d{1,2})\\s*(?:para|pra)\\s*[^\\n]{0,40}?${PALAVRA_DE_HUMANO}`, "i");
const PALAVRA_DEPOIS = new RegExp(`(?:para|pra)\\s+[^\\n]{0,40}?${PALAVRA_DE_HUMANO}[^\\n]{0,20}?digit\\w*\\s*(\\d{1,2})`, "i");

/** "digite ATENDENTE" — a opção é a própria palavra. */
const DIGITE_PALAVRA = /digit\w*\s+(?:a palavra\s+)?["“']?(ATENDENTE|COMERCIAL|HUMANO|ADMINISTRATIVO|GERENTE)["”']?/;

export function opcaoParaFalarComGente(texto: string | null | undefined): string | null {
  const bruto = (texto ?? "").trim();
  if (!bruto) return null;

  // A palavra-opção é lida no texto ORIGINAL (a Meta manda em maiúsculas de
  // propósito nesses menus, e é isso que o robô espera de volta).
  const palavra = bruto.match(DIGITE_PALAVRA)?.[1];
  if (palavra) return palavra;

  const t = normalizar(bruto);
  for (const padrao of [NUMERO_ANTES, DIGITE_NUMERO, PALAVRA_DEPOIS]) {
    const achado = t.match(padrao)?.[1];
    if (achado) return achado;
  }
  return null;
}
