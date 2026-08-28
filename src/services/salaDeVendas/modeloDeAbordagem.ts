/**
 * O MODELO DE ABORDAGEM — a primeira mensagem que o Foocci manda a um lead.
 *
 * ── ⚠️ POR QUE ESTE ARQUIVO PRECISOU EXISTIR, DESCOBERTO NA VÉSPERA ─────────
 *
 * Em 28/08/2026, checando se a abordagem de leads podia começar, achei o
 * bloqueio que ninguém tinha visto: **a Sala Comercial não tem nenhum modelo
 * aprovado na Meta.**
 *
 * Os dezesseis modelos que a casa provisiona (`MetaTemplateProvisionService`)
 * são todos do **CRM dos restaurantes** — aniversário, cupom vencendo, carrinho
 * abandonado, cliente VIP. São o restaurante falando com o cliente DELE. Estão
 * corretamente separados, porque misturar os dois CRMs é proibido.
 *
 * Consequência prática, e ela decide o dia: fora da janela de 24h o WhatsApp só
 * aceita modelo aprovado, e **todo lead abordado está fora da janela** — ele
 * nunca escreveu. Sem um modelo do Foocci, a abordagem fria não sai. Verificar
 * o número na Meta é necessário e **não** é suficiente.
 *
 * ── O QUE ESTE ARQUIVO É, E O QUE ELE NÃO É ─────────────────────────────────
 *
 * É o texto pronto para o CEO submeter, com as regras da Meta já respeitadas e
 * conferidas por teste. **Não submete nada** — submeter modelo à Meta é ação
 * externa e irreversível, e está fora do que um agente faz sozinho.
 *
 * A aprovação leva de minutos a um dia útil. Enquanto ela não sai, o que
 * funciona é o caminho inverso: o lead escreve primeiro (botão do site,
 * anúncio, indicação), a janela abre, e a Sala conversa em texto livre.
 */

/** Categoria da Meta. Abordagem comercial é MARKETING — não há discussão. */
export const CATEGORIA = "MARKETING" as const;

/** O idioma cadastrado na Meta. Espelha o do CRM dos restaurantes. */
export const IDIOMA = "pt_BR" as const;

/**
 * O nome do modelo na Meta.
 *
 * Prefixo `foocci_` de propósito: a conta pode um dia hospedar os modelos dos
 * dois lados, e é o prefixo que impede alguém de disparar um modelo de
 * aniversário de restaurante para um dono de restaurante.
 */
export const NOME_DO_MODELO = "foocci_abordagem_inicial";

/**
 * As variáveis, na ordem em que a Meta as numera.
 *
 * A ordem é contrato: a Meta preenche `{{1}}` com o primeiro parâmetro enviado.
 * Trocar a ordem aqui sem trocar no envio manda o nome do bar no lugar do nome
 * da pessoa — e a mensagem de abordagem vira uma piada.
 */
export const VARIAVEIS = ["nome", "estabelecimento"] as const;

/**
 * O corpo do modelo.
 *
 * ── AS REGRAS DA META QUE ESTE TEXTO RESPEITA, E POR QUE CADA UMA ───────────
 *
 *   · **Não começa nem termina com variável.** A Meta reprova o modelo — ela
 *     não consegue revisar um texto cujas pontas são desconhecidas.
 *   · **Sem duas variáveis coladas.** Mesmo motivo, mesma reprovação.
 *   · **Sem promessa de resultado.** "Aumente 30% das vendas" é reprovado pela
 *     Meta e, pior, seria mentira nossa: não existe número publicado.
 *   · **Diz quem está falando na primeira frase.** Mensagem de origem
 *     desconhecida é denunciada, e denúncia derruba a qualidade do número.
 *   · **Oferece a saída.** Marketing sem opt-out é reprovado no Brasil, e o
 *     pedido de silêncio já é terminal do lado de cá (`optOutAt`).
 *
 * ⚠️ O texto NÃO afirma nada sobre preço, prazo ou recurso. Um modelo é
 * aprovado uma vez e disparado milhares de vezes: o que estiver errado aqui
 * fica errado em escala, e sem ninguém relendo.
 */
export const CORPO =
  "Olá, {{1}}! Aqui é do Foocci. " +
  "A gente trabalha com restaurantes e bares que querem vender direto ao " +
  "cliente, sem depender só dos aplicativos. " +
  "Vi o {{2}} e queria te mostrar como funciona — leva cinco minutos. " +
  "Posso te contar por aqui mesmo?";

/** Rodapé com a saída. Curto: rodapé longo compete com o corpo. */
export const RODAPE = "Se não quiser mais receber, é só responder SAIR.";

/**
 * Exemplos que vão junto na submissão.
 *
 * A Meta exige um valor de amostra para cada variável — sem eles a submissão é
 * recusada antes de qualquer revisão humana.
 */
export const EXEMPLOS: Record<(typeof VARIAVEIS)[number], string> = {
  nome: "Marina",
  estabelecimento: "Bar do Zé",
};

/** O modelo inteiro, do jeito que vai para a Meta. */
export const MODELO_DE_ABORDAGEM = {
  name: NOME_DO_MODELO,
  language: IDIOMA,
  category: CATEGORIA,
  body: CORPO,
  footer: RODAPE,
  variables: VARIAVEIS,
  examples: EXEMPLOS,
} as const;

// ── A conferência, antes de submeter ─────────────────────────────────────────

export type ProblemaNoModelo =
  | "comecaComVariavel"
  | "terminaComVariavel"
  | "variaveisColadas"
  | "numeracaoQuebrada"
  | "exemploFaltando"
  | "semSaida"
  | "prometeResultado";

/**
 * O que reprovaria o modelo — conferido antes de gastar uma submissão.
 *
 * ── POR QUE ISTO É CÓDIGO E NÃO UMA LISTA DE CUIDADOS NO COMENTÁRIO ─────────
 *
 * Cada submissão reprovada custa tempo de revisão da Meta e, repetida, mancha a
 * conta. E a regra que mais escapa não é de formato: é a promessa de resultado,
 * que entra quando alguém "melhora" o texto para vender mais.
 *
 * Guardrail da casa: para o que causa dano real, exige-se o mecanismo, não a
 * boa intenção escrita.
 */
export function problemasDoModelo(m = MODELO_DE_ABORDAGEM): ProblemaNoModelo[] {
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

  // Promessa de resultado: número com % ou verbo de garantia perto de venda.
  if (/\d+\s*%|\bgarant|\btriplic|\bdobr[ae]|aumente? (suas )?vendas/i.test(corpo)) {
    problemas.push("prometeResultado");
  }

  return problemas;
}
