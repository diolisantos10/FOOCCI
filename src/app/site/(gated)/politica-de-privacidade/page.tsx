/**
 * /site/politica-de-privacidade — RECOLHIDA em 29/08/2026. Só redireciona.
 *
 * Aqui morava uma SEGUNDA política de privacidade, escrita no pré-lançamento e
 * datada de 04/06/2026, enquanto a política completa vivia (e vive) em
 * `/privacidade`, datada de 30/07/2026. Duas políticas no ar ao mesmo tempo, com
 * datas diferentes, é ambiguidade sobre qual texto rege — e o registro de
 * consentimento do formulário do site gravava a versão DESTA, a mais velha.
 *
 * A rota continua existindo, e é isso que importa: ela está no rodapé de todas
 * as páginas de marketing desde o lançamento, no sitemap, e em qualquer link que
 * alguém tenha guardado. Apagá-la trocaria o problema por um 404 na palavra
 * "privacidade" — que é pior. Redirecionar leva quem chega ao único documento.
 *
 * O redirecionamento é PERMANENTE de propósito: não é um desvio temporário, é o
 * endereço definitivo mudando. Buscadores reescrevem o índice, e o link do
 * rodapé (que já aponta direto para o canônico) não fica competindo com este.
 */

import { permanentRedirect } from "next/navigation";
import { POLITICA_PRIVACIDADE_CAMINHO } from "@/lib/site/politicaPrivacidade";

export default function PoliticaPage() {
  permanentRedirect(POLITICA_PRIVACIDADE_CAMINHO);
}
