/**
 * /site/agendar — ROTA APOSENTADA (04/08).
 *
 * A agenda de horários com o fundador foi eliminada por decisão do CEO: o único
 * caminho de demonstração é o FORMULÁRIO, onde o cliente deixa os dados e a gente
 * entra em contato. Esta rota vira um redirect permanente em vez de sumir — links
 * externos e bookmarks antigos para /site/agendar não podem virar 404.
 *
 * 06/08: o formulário mudou de casa (virou a última seção de /site/precos) e este
 * destino foi ATUALIZADO junto, de propósito. Ele apontava para /site/demonstracao,
 * que agora também redireciona — deixar como estava criaria um pulo duplo
 * (/agendar → /demonstracao → /precos#demonstracao), que o buscador desconta e o
 * celular sente. Redirect de redirect é dívida que ninguém lembra de pagar.
 *
 * O destino sai de `DEMO_URL`, a fonte única — não é digitado aqui.
 */

import { permanentRedirect } from "next/navigation";
import { DEMO_URL } from "@/components/marketing/config";

export default function AgendarPage() {
  // 308 permanente, direto no destino final — sem escala.
  permanentRedirect(DEMO_URL);
}
