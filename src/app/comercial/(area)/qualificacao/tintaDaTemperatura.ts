/**
 * O ÍCONE E A COR DE CADA DEGRAU — pelo nome do BANCO, não pelo do desenho.
 *
 * ── POR QUE MORA SOZINHO ────────────────────────────────────────────────────
 *
 * A tela e a mesa de trabalho pintam a mesma temperatura, e passaram a ser dois
 * arquivos. Duas tabelas de cor divergiriam no primeiro degrau novo — e aí a
 * pílula da tabela diria uma coisa e o cartão do topo diria outra sobre o mesmo
 * lead. Uma tabela só, importada pelos dois.
 *
 * ── E A REGRA QUE ELA CARREGA ───────────────────────────────────────────────
 *
 * O desenho tem quatro degraus (chama, chama, termômetro, floco). O banco tem
 * seis. Os extras **não ganham cor emprestada de vizinho**: saem em cinza,
 * porque cor é afirmação, e a tela não afirma que DESQUALIFICADO é "quase frio".
 */

import type { NomeDeIcone, Tom } from "../_pecas/Pecas";

export const TINTA_DA_TEMPERATURA: Record<string, { icone: NomeDeIcone; tom: Tom }> = {
  PRIORIDADE_MAXIMA: { icone: "chama", tom: "vermelho" },
  QUENTE: { icone: "chama", tom: "ambar" },
  MORNO: { icone: "termometro", tom: "azul" },
  FRIO: { icone: "floco", tom: "cinza" },
};

export function tintaDe(temperatura: string): { icone: NomeDeIcone; tom: Tom } {
  return TINTA_DA_TEMPERATURA[temperatura] ?? { icone: "alvo", tom: "cinza" };
}
