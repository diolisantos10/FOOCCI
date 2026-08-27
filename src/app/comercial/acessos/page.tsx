/**
 * O ENDEREÇO ANTIGO DE "CRIAR ACESSO".
 *
 * ── POR QUE ELE SÓ REDIRECIONA ──────────────────────────────────────────────
 *
 * Aqui morava um formulário em que quem chegava escolhia o próprio tipo de
 * acesso — inclusive "CEO". O CEO leu e desmontou: *"geralmente nas empresas é
 * o RH que tem essa função... esse modelo que você fez, em que a pessoa própria
 * escolhe, não existe."*
 *
 * O erro não era de lugar, era de **quem decide**. Acesso não é coisa que a
 * pessoa pega; é coisa que a empresa concede. A tela nova vive no Admin, em
 * `/admin/pessoas`, e só o CEO a abre.
 *
 * ── E POR QUE O ENDEREÇO NÃO SIMPLESMENTE SUMIU ─────────────────────────────
 *
 * Porque ele foi dado a uma pessoa hoje, por escrito, mais de uma vez. Endereço
 * que some leva junto a confiança de quem guardou o link: quem voltar aqui
 * amanhã veria "página não encontrada" e concluiria que o sistema quebrou.
 *
 * `permanentRedirect` também ensina o navegador a não voltar mais.
 */

import { permanentRedirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function AcessosMudouDeLugar() {
  permanentRedirect("/admin/pessoas");
}
