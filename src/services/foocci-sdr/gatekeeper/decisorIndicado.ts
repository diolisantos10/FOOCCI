/**
 * "É COM A JULIANA" — o ativo mais valioso da prospecção, lido da frase.
 *
 * ── POR QUE NÃO É O `referredDecisionMakerFromText` ─────────────────────────
 * Aquele continua de pé e continua servindo ao que foi feito para servir: só
 * aceita indicação quando há telefone, porque o que ele alimenta é a criação de
 * um SiteLead novo, e lead sem número não se aborda.
 *
 * Aqui a pergunta é outra. "Fala com o proprietário" não dá um lead novo, mas dá
 * um FATO sobre a empresa que vale ser guardado — é ele que diz ao vendedor, três
 * semanas depois, que o caminho é o dono e não a recepção. Recusar essa frase por
 * falta de telefone seria jogar fora exatamente o que o documento manda guardar.
 *
 * ── A REGRA QUE NÃO SE QUEBRA ───────────────────────────────────────────────
 * **Campo que a mensagem não trouxe fica ausente.** Nunca "não informado" como
 * valor, nunca nome deduzido do cargo, nunca cargo deduzido do nome. A casa já
 * nomeou o custo disso: escrever um valor onde a resposta é "não sei" apaga a
 * fila de quem falta apurar.
 */

import type { ConfiancaDaInformacao } from "@prisma/client";

export interface DecisorIndicado {
  /** Ausente quando a mensagem citou só o cargo ("fala com o proprietário"). */
  nome?: string;
  /** Ausente quando a mensagem citou só o nome ("é com a Juliana"). */
  cargo?: string;
  /** "whatsapp", "telefone", "email" — só quando a mensagem indicou o canal. */
  canal?: string;
  telefone?: string;
  email?: string;
  confianca: ConfiancaDaInformacao;
  /** Frase para `Contato.comoFoiDescoberto`. */
  comoFoiDescoberto: string;
}

function semAcentos(valor: string): string {
  return valor.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Há uma indicação sendo feita, e não apenas as palavras soltas? */
const SINAL_DE_INDICACAO =
  /\b(fal[ae]r? com|fale com|fala com|converse com|contat[ae]r? |procur[ae]r? (o|a|pel[oa]) |quem (cuida|responde|decide|ve isso)|e com [oa]? ?|responsavel|o numero (comercial|do comercial|dela|dele)|whats(app)? (comercial|dela|dele)|email (comercial|dela|dele))/i;

const CARGOS: ReadonlyArray<{ rotulo: string; teste: RegExp }> = [
  { rotulo: "proprietário", teste: /\b(propriet[aá]ri[oa]|dono|dona)\b/i },
  { rotulo: "sócio", teste: /\bs[oó]ci[oa]\b/i },
  { rotulo: "diretor", teste: /\bdiretor[a]?\b/i },
  { rotulo: "gerente", teste: /\bgerente\b/i },
  { rotulo: "comercial", teste: /\bcomercial\b/i },
  { rotulo: "marketing", teste: /\bmarketing\b/i },
  { rotulo: "administrativo", teste: /\badministrativ[oa]\b/i },
  { rotulo: "responsável", teste: /\brespons[aá]vel\b/i },
];

/** Palavras que NUNCA são nome próprio, por mais que venham em maiúscula. */
const NAO_E_NOME =
  /^(proprietari[oa]|dono|dona|socio|socia|diretor|diretora|gerente|comercial|marketing|administrativo|responsavel|atendimento|recepcao|caixa|sac|whatsapp|numero|telefone|email)$/i;

const TELEFONE = /(?:\+?55\s*)?(?:\(?\d{2}\)?[\s.-]*)?9?\d{4}[-\s.]?\d{4}/;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;

function acharNome(texto: string): string | undefined {
  const padroes = [
    /\b(?:fal(?:ar|e|a)|convers(?:ar|e|a)|contat(?:ar|e)|procur(?:ar|e))\s+com\s+(?:o|a|os|as)?\s*([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][\p{L}'-]{1,30}(?:\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][\p{L}'-]{1,30})?)/u,
    /\b(?:[ée]|quem cuida disso [ée]|quem responde [ée])\s+(?:com\s+)?(?:o|a)\s+([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][\p{L}'-]{1,30}(?:\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][\p{L}'-]{1,30})?)/u,
    /\b(?:respons[aá]vel|gerente|propriet[aá]ri[oa]|dona?)\s+(?:[ée]\s+)?(?:o|a)\s+([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][\p{L}'-]{1,30}(?:\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][\p{L}'-]{1,30})?)/u,
  ];

  for (const padrao of padroes) {
    const achado = texto.match(padrao)?.[1]?.trim();
    if (!achado) continue;
    const primeira = achado.split(/\s+/)[0] ?? "";
    if (NAO_E_NOME.test(semAcentos(primeira))) continue;
    return achado;
  }
  return undefined;
}

function acharCargo(texto: string): string | undefined {
  for (const cargo of CARGOS) {
    if (cargo.teste.test(texto)) return cargo.rotulo;
  }
  return undefined;
}

/**
 * Extrai o decisor que o atendimento indicou. `null` quando a mensagem não
 * indicou ninguém — que é o caso normal e não é falha.
 *
 * A confiança é ALTA quando veio canal (telefone ou e-mail) junto: um nome sem
 * canal ainda é um caminho, mas é um caminho que ninguém consegue andar hoje.
 */
export function extrairDecisorIndicado(texto: string | null | undefined): DecisorIndicado | null {
  const bruto = (texto ?? "").trim();
  if (!bruto) return null;
  if (!SINAL_DE_INDICACAO.test(semAcentos(bruto))) return null;

  const nome = acharNome(bruto);
  const cargo = acharCargo(bruto);
  const telefone = bruto.match(TELEFONE)?.[0]?.trim();
  const email = bruto.match(EMAIL)?.[0]?.trim();

  // Nada de concreto: a frase tinha as palavras, mas não trouxe ninguém.
  if (!nome && !cargo && !telefone && !email) return null;

  const canal = telefone ? "whatsapp" : email ? "email" : undefined;

  return {
    ...(nome ? { nome } : {}),
    ...(cargo ? { cargo } : {}),
    ...(canal ? { canal } : {}),
    ...(telefone ? { telefone } : {}),
    ...(email ? { email } : {}),
    confianca: (telefone || email ? "ALTA" : "MEDIA") as ConfiancaDaInformacao,
    comoFoiDescoberto: "informado pelo atendimento",
  };
}
