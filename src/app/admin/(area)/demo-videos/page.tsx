/**
 * /admin/demo-videos — os vídeos exibidos na página pública /site/demonstracao.
 *
 * O CEO grava (tela do sistema, celular fazendo pedido), sobe no YouTube e cola
 * o link aqui. Publicado = aparece no site na ordem definida; rascunho = não.
 */

import { DemoVideosClient } from "./DemoVideosClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vídeos do site" };

export default function AdminDemoVideosPage() {
  return <DemoVideosClient />;
}
