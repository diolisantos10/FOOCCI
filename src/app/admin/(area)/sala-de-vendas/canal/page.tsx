/**
 * A CONFERÊNCIA DO CANAL — a tela que responde "as chaves da Meta funcionam?".
 *
 * ── POR QUE ELA É UMA TELA, E NÃO UM COMANDO ────────────────────────────────
 *
 * Quem cola as chaves no Railway é o dono, e ele não abre terminal. Até aqui a
 * única forma de saber se elas serviam era esperar um cliente escrever — e
 * descobrir no silêncio dele que alguma coisa estava errada.
 *
 * ── O QUE ELA MOSTRA, E POR QUE NESTA ORDEM ─────────────────────────────────
 *
 * Primeiro **o número que a Meta devolve**. É o único dado que prova que a
 * chave certa está apontando para o telefone certo — em 26/08/2026 duas telas
 * da Meta mostraram identificadores diferentes para o mesmo número, e nenhuma
 * checagem de "a variável está preenchida?" teria pego isso.
 *
 * Depois as três chaves, com o que cada uma faz. Presença nunca é prova de que
 * a credencial serve (guardrail 1) — por isso a presença vem DEPOIS da prova.
 */

import { ConferenciaClient } from "./ConferenciaClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "Canal de vendas — conferência" };

export default function Page() {
  return <ConferenciaClient />;
}
