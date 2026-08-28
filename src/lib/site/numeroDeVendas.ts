/**
 * O NÚMERO DE VENDAS DO FOOCCI — um lugar só, e nenhum outro.
 *
 * ── ⚠️ POR QUE ESTE ARQUIVO NASCEU, E O QUE ELE IMPEDIA DE ACONTECER ────────
 *
 * Achado em 28/08/2026, no dia em que o CEO estava trocando o número na Meta.
 * O mesmo número estava escrito **em dois lugares independentes**:
 *
 *   src/components/marketing/config.ts   → HARDCODED_SALES_NUMBER
 *   src/lib/site/canalDeVendas.ts        → NUMERO_DE_VENDAS
 *
 * E o pior: os dois seguiam **políticas diferentes**. O primeiro aceita ser
 * trocado por `NEXT_PUBLIC_WHATSAPP_SALES_NUMBER` no Railway; o segundo, de
 * propósito, não aceita variável nenhuma.
 *
 * O estrago concreto: trocar o número pela variável do Railway mudaria **metade
 * do site**. A outra metade continuaria mandando gente para o número antigo —
 * sem erro, sem log, sem sintoma. O botão funciona, o link abre, a conversa
 * começa… no telefone errado.
 *
 * ── A REGRA ─────────────────────────────────────────────────────────────────
 *
 * O número mora **aqui**, e só aqui. Quem precisa dele importa. Existe teste que
 * varre o código atrás de um terceiro lugar e reprova.
 *
 * Este módulo é **puro de propósito**: nenhum import, nenhum `process.env`.
 * É o que permite que o servidor e o navegador leiam a mesma constante sem que
 * um arraste para o outro coisa que não devia — a mesma razão pela qual a
 * política de senha virou módulo próprio em 27/08.
 *
 * ⚠️ Trocar o número é editar a linha abaixo e fazer deploy. Não adianta só
 * mexer no Railway: `NEXT_PUBLIC_*` é congelada no build.
 */

/**
 * O WhatsApp comercial do Foocci. Só dígitos, com DDI.
 *
 * Decidido pelo CEO em 23/08/2026: **+55 11 94372-3316**.
 *
 * ⚠️ Em 27/08/2026 o CEO cadastrou um segundo número na Meta —
 * **+55 11 91137-7608** — que na madrugada de 28/08 ainda **não** tinha passado
 * pela verificação. Enquanto ele não verificar e o CEO não disser qual dos dois
 * é o número de vendas, esta linha continua no antigo: trocar antes deixaria o
 * site apontando para um número que não atende, que é pior que botão nenhum.
 */
export const NUMERO_DE_VENDAS = "5511943723316";
