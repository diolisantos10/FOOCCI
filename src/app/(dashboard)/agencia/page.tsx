import { Suspense } from "react";
import { getTenantId } from "@/lib/tenant";
import { loadAgencyClient, emptySheet } from "@/lib/agencia/client-data";
import { emptyAgencyClientView } from "@/lib/agencia/views";
import { ClientCommandCenter } from "@/components/agencia/ClientCommandCenter";
import { sora } from "@/components/agencia/fonts";
import "@/components/agencia/dioli.css";

export const metadata = { title: "Agência — Client Command Center" };
export const dynamic = "force-dynamic";

// O eixo desta tela é o CLIENTE, não o projeto (CLAUDE_HANDOFF.md). O cliente
// da agência, aqui, é o `Restaurant` do tenant da sessão. A lista de projetos
// virou uma aba dentro do cliente; `/agencia/[id]` continua sendo o detalhe de
// um projeto e `/agencia/novo` continua sendo a criação.

async function Content() {
  let restaurantId: string | null = null;
  try {
    restaurantId = getTenantId();
  } catch {
    /* sem sessão */
  }

  if (!restaurantId) {
    return (
      <div className={`dioliOS ${sora.variable}`}>
        <ClientCommandCenter
          view={emptyAgencyClientView({
            id: "—", name: "Cliente", initial: "?",
            category: null, activeSince: null, isActive: false,
          })}
          sheet={emptySheet("Cliente")}
          loadError="Sessão sem restaurante associado. Entre novamente para carregar o cliente."
        />
      </div>
    );
  }

  const { view, sheet, error } = await loadAgencyClient(restaurantId);

  return (
    <div className={sora.variable}>
      <ClientCommandCenter view={view} sheet={sheet} loadError={error} />
    </div>
  );
}

export default function AgenciaPage() {
  return (
    <Suspense
      fallback={
        <div className="dioliOS">
          <div className="agencyBar">
            <div className="agencyLogo">
              <i>O°</i>
              <b>Dioli</b>
              <small>AGÊNCIA</small>
            </div>
          </div>
          <main className="projectPage clientWorkspace">
            <div className="loadingBlock" aria-busy="true" aria-live="polite">
              <span className="srOnly">Carregando o cliente…</span>
              <i /><i /><i /><i /><i />
            </div>
          </main>
        </div>
      }
    >
      <Content />
    </Suspense>
  );
}
