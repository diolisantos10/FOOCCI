import { MODULES } from "@/lib/modules";
import { ModuleDetailClient } from "./Client";

// Exportação estática: pré-gera uma página para cada um dos 15 capítulos.
export function generateStaticParams() {
  return MODULES.map((m) => ({ id: String(m.id) }));
}

export const dynamicParams = false;

export default function ModuleDetailPage({ params }: { params: { id: string } }) {
  return <ModuleDetailClient id={Number(params.id)} />;
}
