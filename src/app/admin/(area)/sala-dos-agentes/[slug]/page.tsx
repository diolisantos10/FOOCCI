/**
 * Admin → Sala dos Agentes → a FICHA do agente.
 *
 * Nesta primeira versão a ficha é LEITURA. Não há formulário, não há "Salvar":
 * botão que não salva é controle que mente, e é essa família de defeito — não a
 * feiura — que já derrubou tela neste produto.
 */

import { FichaClient } from "./FichaClient";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { slug: string };
}

export default function FichaDoAgentePage({ params }: PageProps) {
  return <FichaClient slug={decodeURIComponent(params.slug)} />;
}
