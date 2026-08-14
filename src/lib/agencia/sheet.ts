// A ficha do cliente vazia. Vive fora de `client-data.ts` de propósito: é
// função pura, sem Prisma, e por isso pode ser montada em qualquer contexto —
// inclusive no futuro portal do cliente, que não vai falar com este banco.

import type { ClientSheetData } from "@/components/agencia/modals";

export function emptySheet(name: string): ClientSheetData {
  return {
    responsible:  { name: null, role: null },
    origin:       { label: null, note: null },
    agent:        { label: "Agente Project Manager", note: "Interlocutor único da agência" },
    relationship: { label: "Sem contrato registrado", note: null },
    company:      [{ term: "Nome da marca", value: name }],
    contact:      [{ term: "E-mail", value: null }, { term: "Telefone", value: null }],
    briefing:     { summary: null, pain: null, goal: null, audience: null },
    governance: [
      { term: "Quem fala com o cliente", value: "Agente Project Manager" },
      { term: "Quem recebe o cascata",   value: "Agentes especialistas" },
      { term: "Aprovação final",          value: "Responsável do cliente" },
      { term: "Registro oficial",         value: "Chat + Decision Log" },
    ],
    lastReview: null,
  };
}
