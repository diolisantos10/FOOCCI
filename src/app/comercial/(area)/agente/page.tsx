/**
 * O AGENTE — a tela onde o dono vê o TA e decide se ele trabalha.
 *
 * ── POR QUE ELA EXISTE ──────────────────────────────────────────────────────
 *
 * Até 26/08/2026 ligar o TA era um `UPDATE` numa tabela. Ou seja: a decisão do
 * dono dependia de alguém traduzi-la em SQL, e a data em que o agente foi ligado
 * não seria a data em que ele decidiu.
 *
 * ── E POR QUE AS TRÊS CHAVES APARECEM JUNTAS ────────────────────────────────
 *
 * O TA só atende de verdade quando três coisas são verdade ao mesmo tempo: ele
 * está ligado, existe IA-piloto configurada, e o canal da Meta está de pé.
 * Espalhadas por três telas, ninguém monta o quadro — e o sintoma vira "o TA não
 * respondeu", sem causa nomeada.
 */

import { AgenteClient } from "./AgenteClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "O agente" };

export default function Page() {
  return <AgenteClient />;
}
