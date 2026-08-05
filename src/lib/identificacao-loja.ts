/**
 * Quem pode entrar na loja SEM entregar o telefone — e por que quase ninguém pode.
 *
 * ─── O problema que isto resolve ─────────────────────────────────────────────
 * A identificação por WhatsApp na entrada da Loja e do Garçom é decisão do CEO
 * (04/08): é ali que nasce pedido, cupom e histórico, e cliente anônimo quebra a
 * atribuição de receita do CRM. Essa regra continua de pé para TODO restaurante
 * de verdade — este arquivo não a afrouxa.
 *
 * O caso que ela não previu é a VITRINE. `/site/experimente` promete, com estas
 * palavras, "peça à vontade, nada é cobrado" e "sem baixar aplicativo e sem
 * cadastro", e joga o visitante em `/pedido/foocci-bakery`. Lá ele batia num
 * painel de telefone sem saída — obrigado a entregar o número para ver um pão,
 * depois de o site ter prometido que não precisaria. É o visitante mais
 * qualificado do site (o desconfiado que quer ver antes de acreditar) parando na
 * porta.
 *
 * ─── Por que só a vitrine, e não "toda loja" ─────────────────────────────────
 * Afrouxar para todo mundo seria o guardrail 5: a proteção que dispara ficaria
 * mais destrutiva que o problema que evita. Quem depende da identificação hoje é
 * gente real — o lojista que precisa do contato para confirmar o pedido, o cupom
 * que só existe amarrado a um cliente, e a atribuição de receita do CRM. Trocar
 * um atrito na demonstração por pedido órfão em loja de cliente é péssimo negócio.
 *
 * ─── A marca é a coluna, não o slug ──────────────────────────────────────────
 * A fonte da verdade é `Restaurant.isDemo` (ver `src/lib/demo-restaurant.ts`),
 * nunca o nome "foocci-bakery": guardrail 4 — convenção de nome é aviso, coluna é
 * trava. E a falha é FECHADA: `undefined`, `null` ou campo ausente devolvem
 * `false`. Não saber se é vitrine nunca pode virar "então libera" (guardrail 1).
 *
 * PURO de propósito: sem Prisma, sem I/O. Roda no servidor (para decidir a prop)
 * e pode ser lido pelo cliente sem arrastar o banco para dentro do pacote.
 */

/** O mínimo que precisa ser sabido do restaurante para decidir. */
export interface RestauranteParaIdentificacao {
  isDemo?: boolean | null;
}

/**
 * A identificação por telefone pode ser PULADA na entrada desta loja?
 *
 * `true` apenas para restaurante de demonstração. Qualquer outra coisa —
 * inclusive "não sei" — devolve `false`.
 */
export function identificacaoPodeSerPulada(r: RestauranteParaIdentificacao | null | undefined): boolean {
  return r?.isDemo === true;
}
