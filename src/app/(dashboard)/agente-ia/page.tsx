import { TopBar } from "@/components/layout/TopBar";
import { AgentePage } from "./AgentePage";

export const metadata = { title: "Agentes IA — Foocci" };

export default function Page() {
  // O cabeçalho é a ÚNICA régua do topo — e é dentro dele que mora a pílula do
  // Assistente. Tela do menu lateral sem `TopBar` ficava sem assistente nenhum.
  return (
    <>
      <TopBar title="Agentes IA" />
      <AgentePage />
    </>
  );
}
