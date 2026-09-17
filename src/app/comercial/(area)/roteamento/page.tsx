/**
 * Comercial → Motor de Decisão / Roteamento.
 *
 * O desenho nº 07 do CEO. Duas listas, e a segunda é o produto: o que o motor
 * decide hoje, e o que o desenho pede e ainda não existe.
 */

import { RoteamentoClient } from "./RoteamentoClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Roteamento · Sala de Vendas" };

export default function RoteamentoPage() {
  return <RoteamentoClient />;
}
