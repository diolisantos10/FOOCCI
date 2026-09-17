/**
 * A TELA DE DEFINIR A PRÓPRIA SENHA.
 *
 * ⚠️ Ela vive FORA do grupo `(area)` de propósito. Dentro, o layout mandaria
 * quem deve trocar para cá — e cá é dentro dele. O laço seria infinito, e o
 * sintoma para a pessoa seria a página piscando sem nunca abrir.
 */

import { redirect } from "next/navigation";
import { lerSessaoInterna } from "@/lib/internal-auth";
import { TrocarSenhaClient } from "./TrocarSenhaClient";
import { destinoDoAdmin } from "@/lib/destino-por-papel";

export const dynamic = "force-dynamic";

export const metadata = { title: "Definir sua senha · Foocci" };

export default function TrocarSenhaPage() {
  const sessao = lerSessaoInterna();
  if (!sessao) redirect("/admin/login");

  // ── DEPOIS DE TROCAR, A PESSOA VOLTA PARA A CASA DELA ────────────────────
  //
  // Esta tela é alcançada a partir do Admin (é o layout do Admin que manda para
  // cá) e o destino era `/comercial`, fixo: o CEO trocava a senha e terminava no
  // Comercial — o mesmo defeito da porta de entrada, um passo adiante. O destino
  // agora vem do papel, pela MESMA régua da entrada do Admin.
  return <TrocarSenhaClient nome={sessao.nome} destino={destinoDoAdmin(sessao.role)} />;
}
