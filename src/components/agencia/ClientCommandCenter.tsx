"use client";

// ═══════════════════════════════════════════════════════════════════════════
//  Dioli Client Command Center — o casco.
//
//  Porte fiel de `AgencyShell` + `Home` de `app/page.tsx` da referência
//  aprovada (CLAUDE_HANDOFF.md, 14/08/2026). Mesmo DOM, mesmas classes.
//
//  O EIXO DO PAINEL É O CLIENTE, não o projeto — é a mudança conceitual do
//  handoff. O casco recebe UM cliente e todas as abas leem esse mesmo cliente.
//  Projeto virou conteúdo de uma aba (`ProjectsTab`), e a rota antiga
//  `/agencia/[id]` continua sendo a página de detalhe de um projeto.
//
//  A NAVEGAÇÃO NÃO TEM BARRA DE ROLAGEM: a trilha de abas rola por seta
//  (`navArrow prev` / `navArrow next`), que é o critério de aceite 3 do
//  handoff. As setas se apagam sozinhas quando não há para onde rolar, e a
//  trilha some do fluxo do teclado por conta própria — nunca por `overflow`
//  visível.
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ClientSheet, PMChat, type ClientSheetData } from "./modals";
import { OverviewTab, RequestsTab, ProjectsTab } from "./tabs-core";
import { SocialTab, DesignTab, TrafficTab, IntelligenceTab } from "./tabs-depts";
import { BrandingTab } from "./tabs-branding";
import { IntegrationsTab } from "./tabs-integrations";
import { ErrorBlock, LoadingBlock } from "./primitives";
import type { AgencyClientView } from "@/lib/agencia/views";

const TABS: [string, string][] = [
  ["overview", "Visão Geral"],
  ["requests", "Solicitações"],
  ["social", "Social Media"],
  ["branding", "Branding"],
  ["design", "Design"],
  ["traffic", "Tráfego Pago"],
  ["projects", "Projetos"],
  ["intel", "Inteligência"],
  ["integrations", "Integrações"],
];

export function ClientCommandCenter({
  view,
  sheet,
  loadError,
}: {
  view: AgencyClientView;
  sheet: ClientSheetData;
  /** Falha ao carregar o cliente. Estado obrigatório de erro. */
  loadError?: string | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState("overview");
  const [showSheet, setShowSheet] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [navigating, setNavigating] = useState(false);

  const tabRail = useRef<HTMLElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const syncArrows = useCallback(() => {
    const el = tabRail.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanPrev(el.scrollLeft > 1);
    setCanNext(el.scrollLeft < max - 1);
  }, []);

  useEffect(() => {
    syncArrows();
    const el = tabRail.current;
    if (!el) return;
    el.addEventListener("scroll", syncArrows, { passive: true });
    window.addEventListener("resize", syncArrows);
    return () => {
      el.removeEventListener("scroll", syncArrows);
      window.removeEventListener("resize", syncArrows);
    };
  }, [syncArrows]);

  const moveTabs = (dir: number) => tabRail.current?.scrollBy({ left: dir * 280, behavior: "smooth" });

  const openProject = (id: string) => {
    setNavigating(true);
    router.push(`/agencia/${id}`);
  };
  const newProject = () => {
    setNavigating(true);
    router.push("/agencia/novo");
  };
  const openPortal = () => setShowChat(true);

  const badge: Record<string, number> = {
    requests: view.requests.length,
    projects: view.projects.length,
    integrations: view.integrations.filter((i) => i.tone === "warn" || i.tone === "partial" || i.tone === "off").length,
  };

  let body: React.ReactNode;
  if (loadError) {
    body = (
      <section className="workspaceTab">
        <ErrorBlock detail={loadError} onRetry={() => router.refresh()} />
      </section>
    );
  } else if (navigating) {
    body = (
      <section className="workspaceTab">
        <LoadingBlock rows={5} />
      </section>
    );
  } else if (tab === "overview") {
    body = <OverviewTab view={view} setTab={setTab} onOpenPortal={openPortal} />;
  } else if (tab === "requests") {
    body = <RequestsTab view={view} onOpenPortal={openPortal} />;
  } else if (tab === "social") {
    body = <SocialTab view={view} />;
  } else if (tab === "branding") {
    body = <BrandingTab view={view} />;
  } else if (tab === "design") {
    body = <DesignTab view={view} />;
  } else if (tab === "traffic") {
    body = <TrafficTab view={view} />;
  } else if (tab === "projects") {
    body = <ProjectsTab view={view} onOpenProject={openProject} onNewProject={newProject} />;
  } else if (tab === "intel") {
    body = <IntelligenceTab view={view} />;
  } else {
    body = <IntegrationsTab view={view} onOpenPortal={openPortal} />;
  }

  const c = view.client;

  return (
    <div className="dioliOS">
      <div className="agencyBar">
        <div className="agencyLogo">
          <i>O°</i>
          <b>Dioli</b>
          <small>AGÊNCIA</small>
        </div>
        <div className="agencySearch">⌕ Buscar clientes, projetos, tarefas…</div>
        <div className="agencyActions">
          <button type="button" onClick={newProject}>＋ Nova OS</button>
          <i>DO</i>
        </div>
      </div>

      <main className="projectPage clientWorkspace">
        <div className="projectHead clientHead">
          <div className="clientTitle">
            <span>{c.initial}</span>
            <div>
              <h1>{c.name}</h1>
              <p>
                {c.isActive ? "Cliente ativo" : "Cliente inativo"}
                {c.category ? ` · ${c.category}` : ""}
              </p>
              <div>
                <span>{c.isActive ? "Ativo" : "Inativo"}</span>
                <span>{view.approvals.length > 0 ? "Com pendência" : "Sem pendência"}</span>
                <span>{c.activeSince ? `Desde ${c.activeSince}` : "Data de início não registrada"}</span>
              </div>
            </div>
          </div>
          <div className="clientHeadActions">
            <button type="button" onClick={() => setShowSheet(true)}>▤ Ficha do cliente</button>
            <button className="pmChatButton" type="button" onClick={() => setShowChat(true)}>
              ✦ Chat do cliente {view.chat.length > 0 && <em>{view.chat.length}</em>}
            </button>
            <button type="button">Editar Cliente</button>
          </div>
        </div>

        <div className="clientPulse">
          <span>
            <small>RELACIONAMENTO</small>
            <b className={c.isActive ? "" : "noData"}>{c.isActive ? "Ativo" : "—"}</b>
          </span>
          <span>
            <small>CONTRATO</small>
            <b className="noData">—</b>
          </span>
          <span>
            <small>PRÓXIMA REUNIÃO</small>
            <b className="noData">—</b>
          </span>
          <span>
            <small>AGENTE PROJECT MANAGER</small>
            <b>PM Geral · Todos os clientes</b>
          </span>
          <button type="button" onClick={openPortal}>Portal do cliente ↗</button>
        </div>

        <div className="clientNavShell">
          <button
            className="navArrow prev"
            type="button"
            onClick={() => moveTabs(-1)}
            aria-label="Ver abas anteriores"
            disabled={!canPrev}
            style={{ visibility: canPrev ? "visible" : "hidden" }}
          >
            ‹
          </button>
          <nav ref={tabRail} className="projectTabs clientTabs" aria-label="Áreas do cliente">
            {TABS.map((x) => (
              <button
                type="button"
                onClick={() => setTab(x[0])}
                className={tab === x[0] ? "active" : ""}
                key={x[0]}
                aria-current={tab === x[0] ? "page" : undefined}
              >
                {x[1]}
                {(badge[x[0]] ?? 0) > 0 && <em>{badge[x[0]]}</em>}
              </button>
            ))}
          </nav>
          <button
            className="navArrow next"
            type="button"
            onClick={() => moveTabs(1)}
            aria-label="Ver próximas abas"
            disabled={!canNext}
            style={{ visibility: canNext ? "visible" : "hidden" }}
          >
            ›
          </button>
        </div>

        {body}
      </main>

      {showSheet && (
        <ClientSheet close={() => setShowSheet(false)} clientName={c.name} initial={c.initial} data={sheet} />
      )}
      {showChat && (
        <PMChat
          close={() => setShowChat(false)}
          clientName={c.name}
          messages={view.chat}
          context={{
            headline: view.brand.tagline,
            counters: [
              `${view.projects.length} projeto${view.projects.length === 1 ? "" : "s"}`,
              `${view.requests.length} solicitaç${view.requests.length === 1 ? "ão" : "ões"}`,
              `${view.approvals.length} decis${view.approvals.length === 1 ? "ão" : "ões"} pendente${view.approvals.length === 1 ? "" : "s"}`,
            ],
          }}
          cascadeAgents={["Agente Social Media", "Agente Branding", "Agente Design", "Agente Tráfego Pago"]}
          cascade={view.internal.cascade}
          /* Painel interno: o cascateamento aparece. No portal do cliente este
             mesmo componente é montado com `showCascade={false}` — e o dado nem
             chega lá, porque `toClientPortalView()` não o carrega. */
          showCascade
        />
      )}
    </div>
  );
}
