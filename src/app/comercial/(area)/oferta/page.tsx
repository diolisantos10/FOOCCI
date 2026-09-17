/**
 * Comercial → Catálogo, Oferta e Checkout.
 *
 * O desenho nº 08 do CEO. Só leitura: nenhum envio nasce aqui.
 */

import { OfertaClient } from "./OfertaClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Oferta · Sala de Vendas" };

export default function OfertaPage() {
  return <OfertaClient />;
}
