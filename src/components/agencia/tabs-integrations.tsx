"use client";

// Integrações — portado da referência aprovada com o mesmo DOM e as mesmas
// classes, incluindo a faixa `accessBanner` e o card `permissionMap`.
//
// A REGRA DESTA TELA, que é de permissão e não de estética:
//   "A agência pode visualizar o status das integrações, mas somente o cliente
//    pode conectar, reconectar, alterar ou remover credenciais."  (handoff, §27)
//
// Ela está travada em três camadas, não só escrita:
//   1. No DTO — `IntegrationView.agencyAccess` é o literal "Somente leitura";
//      não existe outro valor possível no tipo (`src/lib/agencia/views.ts`).
//   2. Nesta tela — nenhum controle de escrita é renderizado. O único botão por
//      linha abre o detalhe de status; não há "conectar", "reconectar" nem
//      "remover".
//   3. Na origem do dado — o seletor lê status e horário de sincronização e
//      NUNCA o `configBlob`/token, que é cifrado e nem chega ao servidor desta
//      página (`src/lib/agencia/client-data.ts`).

import { useState } from "react";
import { Pill, Head, TabTitle, Kpis, EmptyBlock } from "./primitives";
import type { AgencyClientView, IntegrationView } from "@/lib/agencia/views";

export function IntegrationsTab({
  view,
  onOpenPortal,
}: {
  view: AgencyClientView;
  onOpenPortal: () => void;
}) {
  const [filter, setFilter] = useState("Todas");
  const integrations: IntegrationView[] = view.integrations;
  const visible =
    filter === "Todas"
      ? integrations
      : integrations.filter((x) =>
          filter === "Com atenção" ? x.tone === "warn" || x.tone === "partial" : x.tone === "off",
        );

  const attention = integrations.filter((x) => x.tone === "warn" || x.tone === "partial");
  const off = integrations.filter((x) => x.tone === "off");

  return (
    <section className="workspaceTab integrationsTab">
      <TabTitle
        status="INTEGRATION HEALTH"
        title="Client Integration Center"
        desc="Visibilidade operacional das conexões do cliente. A agência monitora; somente o cliente autoriza, reconecta ou remove acessos."
      >
        <button type="button">Histórico de sincronização</button>
        <button className="primary" type="button" onClick={onOpenPortal}>Abrir portal do cliente ↗</button>
      </TabTitle>

      <div className="accessBanner">
        <i>◇</i>
        <div>
          <b>Modo agência · somente leitura</b>
          <span>Nenhuma credencial, permissão ou conexão pode ser alterada por esta tela.</span>
        </div>
        <Pill>GOVERNANÇA ATIVA</Pill>
      </div>

      <Kpis items={view.areaMetrics.integrations} className="integrationKpis" />

      <nav className="integrationFilters">
        {["Todas", "Com atenção", "Não conectadas"].map((x) => (
          <button key={x} type="button" onClick={() => setFilter(x)} className={filter === x ? "active" : ""}>
            {x}
          </button>
        ))}
        <span>Estado lido do banco a cada carregamento</span>
      </nav>

      <div className="integrationGrid">
        <article className="card integrationList">
          <Head over="ECOSSISTEMA DO CLIENTE" title="Conexões e saúde" action="Ver diagnóstico" />
          <div className="integrationHeader">
            <span>INTEGRAÇÃO</span>
            <span>STATUS</span>
            <span>ÚLTIMA SYNC</span>
            <span>AGENTES</span>
            <span>ACESSO</span>
          </div>
          {visible.length === 0 ? (
            <EmptyBlock
              title={filter === "Todas" ? "Nenhuma integração cadastrada" : `Nada em “${filter}”`}
              hint={
                filter === "Todas"
                  ? "Só o cliente conecta. Enquanto ele não conectar nada, esta lista fica vazia — e nenhum dado desta tela pode ser estimado a partir de outra fonte."
                  : "Troque o filtro para ver o restante."
              }
            />
          ) : (
            visible.map((x) => (
              <div className="integrationRow" key={x.name}>
                <i>{x.glyph}</i>
                <span>
                  <b>{x.name}</b>
                  <small>{x.scopes}</small>
                </span>
                <Pill t={x.tone}>{x.statusLabel}</Pill>
                <time className={x.lastSync === null ? "noData" : ""}>{x.lastSync ?? "—"}</time>
                <strong className={x.consumers === null ? "noData" : ""}>{x.consumers ?? "—"}</strong>
                <em>{x.agencyAccess}</em>
                <button type="button" aria-label={`Ver detalhes de ${x.name}`}>→</button>
              </div>
            ))
          )}
        </article>

        <aside>
          <article className="card systemDoctor">
            <div className="agentTop">
              <i>✦</i>
              <span>
                <small>AGENTE DE INTEGRAÇÕES</small>
                <h3>Connection Intelligence</h3>
              </span>
              <Pill>ATIVO</Pill>
            </div>
            <p>Testa disponibilidade, escopos, latência e qualidade dos dados sem acessar ou expor credenciais.</p>
            <div>
              <small>AÇÃO RECOMENDADA AO CLIENTE</small>
              <b>
                {attention.length > 0
                  ? `Revisar ${attention.length} conexão${attention.length > 1 ? "ões" : ""} com pendência.`
                  : off.length > 0
                    ? `${off.length} fonte${off.length > 1 ? "s" : ""} ainda não conectada${off.length > 1 ? "s" : ""}.`
                    : "Nada pendente do lado do cliente."}
              </b>
              <span>A agência só pode pedir; a autorização é sempre do cliente.</span>
            </div>
            <button type="button">Gerar solicitação ao cliente →</button>
          </article>

          <article className="card integrationAlerts">
            <Head over="INCIDENTES & PENDÊNCIAS" title="O que exige atenção" />
            {attention.length === 0 && off.length === 0 ? (
              <EmptyBlock title="Sem incidentes" hint="Nenhuma conexão com pendência registrada." />
            ) : (
              [...attention, ...off].map((x) => (
                <div key={x.name}>
                  <i className={x.tone === "off" ? "off" : x.tone === "partial" ? "partial" : "warn"}>
                    {x.tone === "off" ? "×" : x.tone === "partial" ? "◇" : "!"}
                  </i>
                  <span>
                    <b>
                      {x.name} · {x.statusLabel.toLowerCase()}
                    </b>
                    <small>{x.scopes}</small>
                  </span>
                  <Pill>Cliente</Pill>
                </div>
              ))
            )}
          </article>

          <article className="card permissionMap">
            <Head over="GOVERNANÇA" title="Permissões desta área" />
            {[
              ["Ver status e saúde", "Agência + Cliente"],
              ["Executar diagnóstico", "Agência + Cliente"],
              ["Conectar ou reconectar", "Somente Cliente"],
              ["Alterar escopos e contas", "Somente Cliente"],
              ["Remover integração", "Somente Cliente"],
            ].map(([what, who]) => (
              <div key={what}>
                <span>{what}</span>
                <b>{who}</b>
              </div>
            ))}
          </article>
        </aside>
      </div>
    </section>
  );
}
