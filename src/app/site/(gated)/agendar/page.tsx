/**
 * /site/agendar — ROTA APOSENTADA (04/08).
 *
 * A agenda de horários com o fundador foi eliminada por decisão do CEO: o único
 * caminho de demonstração agora é o FORMULÁRIO de /site/demonstracao, onde o
 * cliente deixa os dados e a gente entra em contato. Esta rota vira um redirect
 * permanente em vez de sumir — links externos e bookmarks antigos para /site/agendar
 * não podem virar 404.
 */

import { permanentRedirect } from "next/navigation";

export default function AgendarPage() {
  // 308 permanente: o destino final é /site/demonstracao, para sempre.
  permanentRedirect("/site/demonstracao");
}
