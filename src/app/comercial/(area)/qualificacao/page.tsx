/**
 * Comercial → Qualificação / Lead Score.
 *
 * O desenho nº 06 do CEO. A tela do termômetro: FRIO → MORNO → QUENTE →
 * PRONTO PARA COMPRAR, com o que move o score e por quê.
 */

import { QualificacaoClient } from "./QualificacaoClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Qualificação · Sala de Vendas" };

export default function QualificacaoPage() {
  return <QualificacaoClient />;
}
