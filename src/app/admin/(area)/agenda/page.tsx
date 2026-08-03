/**
 * /admin/agenda — os horários do CEO para chamadas de demonstração.
 *
 * O CEO abre horários (data + horas, criação em lote); o site (/site/agendar)
 * mostra os livres; quem agenda aparece aqui com nome e WhatsApp. Horário
 * agendado não se apaga por esta tela — o compromisso é registro.
 */

import { AgendaClient } from "./AgendaClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agenda de demonstrações" };

export default function AdminAgendaPage() {
  return <AgendaClient />;
}
