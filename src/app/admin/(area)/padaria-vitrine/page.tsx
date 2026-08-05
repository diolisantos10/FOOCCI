/**
 * /admin/padaria-vitrine — os dois botões da Foocci Bakery.
 *
 * A padaria de demonstração precisa existir NO BANCO DE PRODUÇÃO para o visitante
 * do site de vendas degustar as três superfícies. Só a produção tem o banco e a
 * chave da OpenAI — por isso o disparo é aqui, e não na linha de comando.
 */

import { PadariaVitrineClient } from "./PadariaVitrineClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Padaria de vitrine" };

export default function AdminPadariaVitrinePage() {
  return <PadariaVitrineClient />;
}
