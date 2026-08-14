"use client";

// Visão Geral · Solicitações · Projetos — portadas de `app/page.tsx` da
// referência aprovada, com o mesmo DOM e as mesmas classes.
//
// Diferença única em relação ao mockup: todo número vem do DTO. Quando a fonte
// não existe no Foocci, a célula desenha "—" e o motivo (guardrail 1), e as
// listas caem no estado vazio em vez de repetir os exemplos do mockup.

import { useState } from "react";
import { Pill, Head, TabTitle, Kpis, EmptyBlock, ErrorBlock } from "./primitives";
import { RequestModal } from "./modals";
import type { AgencyClientView, ProjectView, RequestView } from "@/lib/agencia/views";

// ─── Visão Geral ─────────────────────────────────────────────────────────────

export function OverviewTab({
  view,
  setTab,
  onOpenPortal,
}: {
  view: AgencyClientView;
  setTab: (t: string) => void;
  onOpenPortal: () => void;
}) {
  const health = view.brand.health;
  return (
    <section className="workspaceTab">
      <TabTitle
        status={view.client.isActive ? "CLIENTE ATIVO" : "CLIENTE INATIVO"}
        title="Client Command Center"
        desc={`O raio X executivo da ${view.client.name}: negócio, marca, canais, operação e relacionamento.`}
      >
        <button type="button">Últimos 30 dias⌄</button>
        <button className="primary" type="button" onClick={onOpenPortal}>Gerar relatório</button>
      </TabTitle>
      <Kpis items={view.areaMetrics.overview} />
      <div className="overviewGrid">
        <article className="card perf">
          <Head over="PERFORMANCE INTEGRADA" title="Ecossistema de canais" action="Ver analytics" />
          <EmptyBlock
            title="Nenhuma fonte de performance conectada"
            hint="Alcance, engajamento e receita atribuída chegam das contas de anúncio e analytics do cliente. Enquanto nenhuma estiver ligada, este gráfico fica vazio de propósito — número inventado aqui viraria decisão errada lá na frente."
            action="Ver integrações"
            onAction={() => setTab("integrations")}
          />
          <div className="channelStrip">
            {view.integrations.length === 0 ? (
              <button type="button" onClick={() => setTab("integrations")}>
                <i>◇</i>
                <span>
                  <b>Sem canais</b>
                  <small>conectar no portal do cliente</small>
                </span>
                →
              </button>
            ) : (
              view.integrations.slice(0, 4).map((x) => (
                <button key={x.name} type="button" onClick={() => setTab("integrations")}>
                  <i>{x.glyph}</i>
                  <span>
                    <b>{x.name}</b>
                    <small>{x.statusLabel}</small>
                  </span>
                  →
                </button>
              ))
            )}
          </div>
        </article>

        <article className="card agentHealth">
          <Head over="OPERAÇÃO AUTÔNOMA" title="Saúde dos agentes" action="Central" />
          <EmptyBlock
            title="Sem telemetria dos agentes"
            hint="A nota de saúde por agente depende de um histórico de execução que ainda não é gravado para a esteira de agência."
          />
        </article>

        <article className="card priorities">
          <Head over="PRÓXIMAS AÇÕES" title="Prioridades coordenadas" action="Ver plano" />
          {view.approvals.length === 0 ? (
            <EmptyBlock
              title="Nenhuma ação pendente registrada"
              hint="Aprovações e decisões pendentes aparecem aqui assim que existirem."
            />
          ) : (
            view.approvals.slice(0, 4).map((a, i) => (
              <div key={a.id}>
                <time>{a.when ?? "—"}</time>
                <span>
                  <b>{a.title}</b>
                  <small>{a.context}</small>
                </span>
                <em className={"p" + i}>{a.decidesIt}</em>
              </div>
            ))
          )}
        </article>

        <article className="card radar">
          <Head over="CLIENT INTELLIGENCE" title="Radar do relacionamento" />
          <div className="nps">
            <b className="noData">—</b>
            <span>
              <strong>NPS RELACIONAL</strong>
              <small>sem pesquisa respondida</small>
            </span>
          </div>
          {[
            ["Sentimento", null],
            ["Risco de churn", null],
            ["Engajamento", null],
            ["Decisões pendentes", view.approvals.length ? String(view.approvals.length) : null],
          ].map(([k, v]) => (
            <div key={k as string}>
              <span>{k}</span>
              <b className={v === null ? "noData" : ""}>{v ?? "—"}</b>
            </div>
          ))}
        </article>

        <article className="card departments">
          <Head over="AGENTES ESPECIALISTAS" title="Panorama dos agentes" />
          {([
            ["Agente Social Media", "social"],
            ["Agente Branding", "branding"],
            ["Agente Design", "design"],
            ["Agente Tráfego Pago", "traffic"],
            ["Agente Estratégia", "intel"],
          ] as const).map(([name, tab]) => (
            <button key={name} type="button" onClick={() => setTab(tab)}>
              <span>
                <b>{name}</b>
                <small>sem atividade registrada</small>
              </span>
              <i>
                <b style={{ width: "0%" }} />
              </i>
              <strong className="noData">—</strong>
            </button>
          ))}
        </article>

        <article className="card reqMini">
          <Head over="VOZ DO CLIENTE" title="Solicitações recentes" action="Ver todas" onAction={() => setTab("requests")} />
          {view.requests.length === 0 ? (
            <EmptyBlock
              title="Nenhuma solicitação do cliente"
              hint="Esta lista é a voz do cliente — não é a fila de tarefas internas dos agentes. As duas coisas não se misturam neste painel."
            />
          ) : (
            view.requests.slice(0, 3).map((r) => (
              <div key={r.id}>
                <i>↗</i>
                <span>
                  <small>{r.routedTo}</small>
                  <b>{r.title}</b>
                </span>
                <Pill>{r.statusLabel}</Pill>
              </div>
            ))
          )}
        </article>
      </div>
      {health === null && (
        <p className="tabFootnote">
          Brand health, alcance e receita atribuída ficam em branco até a fonte correspondente ser
          conectada pelo cliente. Nada nesta tela é estimado.
        </p>
      )}
    </section>
  );
}

// ─── Solicitações ────────────────────────────────────────────────────────────

export function RequestsTab({ view, onOpenPortal }: { view: AgencyClientView; onOpenPortal: () => void }) {
  const [open, setOpen] = useState(false);
  const requests: RequestView[] = view.requests;
  return (
    <section className="workspaceTab">
      <TabTitle
        status={requests.length ? `${requests.length} SOLICITAÇÕES ABERTAS` : "NENHUMA SOLICITAÇÃO ABERTA"}
        title="Client Request Center"
        desc="Entrada universal: o Orquestrador entende, estrutura, distribui e acompanha qualquer demanda."
      >
        <button type="button" onClick={onOpenPortal}>Portal do cliente ↗</button>
        <button className="primary" type="button" onClick={() => setOpen(true)}>
          ＋ Nova solicitação
        </button>
      </TabTitle>
      <Kpis items={view.areaMetrics.requests} className="requestKpis" />
      <div className="requestGrid">
        <article className="card inbox">
          <Head over="FILA INTELIGENTE" title="Solicitações do cliente" action="Filtros" />
          {requests.length === 0 ? (
            <EmptyBlock
              title="A fila está vazia"
              hint="Só entra aqui o que o cliente pediu, pelo chat com o Agente Project Manager ou pelo portal. Tarefa operacional de agente não aparece nesta lista."
              action="Registrar uma solicitação"
              onAction={() => setOpen(true)}
            />
          ) : (
            requests.map((r) => (
              <button className="requestRow" key={r.id} type="button">
                <i className={r.priority} />
                <span>{r.code}</span>
                <span>
                  <b>{r.title}</b>
                  <small>{r.routedTo}</small>
                </span>
                <Pill>{r.statusLabel}</Pill>
                <time>{r.when}</time>
                <em>→</em>
              </button>
            ))
          )}
        </article>
        <aside>
          <article className="card orchestrator">
            <div className="agentTop">
              <i>✦</i>
              <span>
                <small>AGENTE ORQUESTRADOR</small>
                <h3>Request Intelligence</h3>
              </span>
              <Pill>ONLINE</Pill>
            </div>
            <p>Transforma texto, áudio, arquivo ou conversa em briefing, escopo, responsáveis e plano de execução.</p>
            <div>
              <small>PROCESSANDO AGORA</small>
              <b>{requests[0] ? `“${requests[0].title}”` : "Nada na fila"}</b>
              <span>
                {requests.length
                  ? "Detectando objetivo, urgência e dependências…"
                  : "O orquestrador entra em ação na primeira solicitação."}
              </span>
            </div>
            <button type="button" onClick={() => setOpen(true)}>Enviar nova demanda →</button>
          </article>
          <article className="card routing">
            <Head over="DISTRIBUIÇÃO" title="Para onde foram" />
            {requests.length === 0 ? (
              <EmptyBlock title="Sem distribuição" hint="Nenhuma solicitação foi encaminhada ainda." />
            ) : (
              Object.entries(
                requests.reduce<Record<string, number>>((acc, r) => {
                  acc[r.routedTo] = (acc[r.routedTo] ?? 0) + 1;
                  return acc;
                }, {}),
              ).map(([agent, n]) => (
                <div key={agent}>
                  <span>{agent}</span>
                  <i>
                    <b style={{ width: `${Math.min(100, n * 12)}%` }} />
                  </i>
                  <strong>{n}</strong>
                </div>
              ))
            )}
          </article>
        </aside>
      </div>
      {open && <RequestModal close={() => setOpen(false)} />}
    </section>
  );
}

// ─── Projetos ────────────────────────────────────────────────────────────────
//
// O handoff inverte o eixo do painel: o registro principal é o CLIENTE, e o
// projeto passa a ser "iniciativa temporária dentro do relacionamento
// permanente". Esta aba é a lista de `AgencyProject` do cliente — dado real do
// Prisma —, e cada card abre a rota antiga `/agencia/[id]`, que continua sendo
// a página de detalhe do projeto.

export function ProjectsTab({
  view,
  onOpenProject,
  onNewProject,
  error,
}: {
  view: AgencyClientView;
  onOpenProject: (id: string) => void;
  onNewProject: () => void;
  error?: string | null;
}) {
  const [mode, setMode] = useState("portfolio");
  const projects: ProjectView[] = view.projects;
  return (
    <section className="workspaceTab">
      <TabTitle
        status={projects.length ? `${projects.length} PROJETOS DO CLIENTE` : "NENHUM PROJETO"}
        title="Client Project Portfolio"
        desc="Iniciativas temporárias dentro do relacionamento permanente com o cliente."
      >
        <button type="button" onClick={() => setMode("timeline")}>Roadmap</button>
        <button className="primary" type="button" onClick={onNewProject}>＋ Novo projeto</button>
      </TabTitle>
      <nav className="deptNav">
        {([
          ["portfolio", "Portfólio"],
          ["timeline", "Timeline"],
          ["deliverables", "Entregáveis"],
          ["decisions", "Decisões"],
        ] as const).map(([k, label]) => (
          <button key={k} type="button" className={mode === k ? "active" : ""} onClick={() => setMode(k)}>
            {label}
            {k === "deliverables" && view.deliverables.length > 0 && <em>{view.deliverables.length}</em>}
          </button>
        ))}
      </nav>
      <Kpis items={view.areaMetrics.projects} className="projectKpis" />
      {error && <ErrorBlock detail={error} />}

      {mode === "timeline" && (
        <article className="card roadmap">
          <Head over="ROADMAP DO CLIENTE" title="Projetos no tempo" action="Filtros" />
          {projects.length === 0 ? (
            <EmptyBlock title="Nada no roadmap" hint="Crie o primeiro projeto para desenhar a linha do tempo." />
          ) : (
            projects.map((p) => (
              <div key={p.id}>
                <span>{p.name}</span>
                <i>
                  <b style={{ width: `${p.progress ?? 0}%` }} />
                </i>
                <strong className={p.progress === null ? "noData" : ""}>
                  {p.progress === null ? "—" : `${p.progress}%`}
                </strong>
              </div>
            ))
          )}
        </article>
      )}

      {mode === "deliverables" && <DeliverablesModule view={view} />}

      {mode === "decisions" && (
        <article className="card roadmap">
          <Head over="MEMÓRIA ESTRATÉGICA" title="Decisões do relacionamento" />
          <EmptyBlock
            title="Nenhuma decisão registrada"
            hint="O Decision Log da agência ainda não tem tabela neste sistema. Nada é preenchido por dedução."
          />
        </article>
      )}

      {mode === "portfolio" &&
        (projects.length === 0 ? (
          <article className="card">
            <EmptyBlock
              title="Este cliente ainda não tem projeto"
              hint="Projetos, campanhas e entregas pertencem ao cliente. Crie o primeiro para começar o portfólio."
              action="Criar projeto"
              onAction={onNewProject}
            />
          </article>
        ) : (
          <div className="projectPortfolio">
            {projects.map((p, i) => (
              <article className="card" key={p.id}>
                <header>
                  <i className={"pr" + (i % 6)} />
                  <Pill>{p.statusLabel}</Pill>
                </header>
                <small>{p.kind.toUpperCase()}</small>
                <h3>{p.name}</h3>
                <p>{p.agents.length ? p.agents.join(" · ") : "Sem agente atribuído"}</p>
                <div>
                  <i>
                    <b style={{ width: `${p.progress ?? 0}%` }} />
                  </i>
                  <strong className={p.progress === null ? "noData" : ""}>
                    {p.progress === null ? "—" : `${p.progress}%`}
                  </strong>
                </div>
                <footer>
                  <span>{p.decisionCount} decisões</span>
                  <span>{p.deliverableCount} entregáveis</span>
                  <button type="button" aria-label={`Abrir ${p.name}`} onClick={() => onOpenProject(p.id)}>
                    →
                  </button>
                </footer>
              </article>
            ))}
          </div>
        ))}
    </section>
  );
}

// ─── Entregas (módulo 9 do handoff) ─────────────────────────────────────────
//
// A referência tinha "Entregáveis" como botão morto na nav de Projetos. Aqui
// ele passa a existir de verdade, ligado às entregas reais do cliente.

export function DeliverablesModule({ view }: { view: AgencyClientView }) {
  return (
    <article className="card inbox">
      <Head over="ENTREGAS DO CLIENTE" title="O que já foi entregue" action="Histórico" />
      {view.deliverables.length === 0 ? (
        <EmptyBlock
          title="Nenhuma entrega registrada"
          hint="Entregas pertencem ao cliente e atravessam os projetos. Assim que a primeira for concluída, ela aparece aqui e no portal do cliente."
        />
      ) : (
        view.deliverables.map((d) => (
          <button className="requestRow" key={d.id} type="button">
            <i className="done" />
            <span>{d.when ?? "—"}</span>
            <span>
              <b>{d.title}</b>
              <small>{d.projectName ?? "Sem projeto"}</small>
            </span>
            <Pill>{d.statusLabel}</Pill>
            <time>{d.when ?? "—"}</time>
            <em>→</em>
          </button>
        ))
      )}
    </article>
  );
}

// ─── Aprovações (módulo 8 do handoff) ───────────────────────────────────────

export function ApprovalsModule({ view }: { view: AgencyClientView }) {
  return (
    <article className="card inbox">
      <Head over="APPROVAL GATES" title="O que espera decisão" action="Regras do gate" />
      <p className="moduleLead">
        Nenhuma entrega chega ao cliente sem passar por aqui. A coluna de quem decide é o que separa
        o que é da agência do que é do cliente.
      </p>
      {view.approvals.length === 0 ? (
        <EmptyBlock
          title="Nada aguardando aprovação"
          hint="O gate está vazio. Quando uma peça, campanha ou entrega precisar de decisão, ela aparece aqui com o responsável nomeado."
        />
      ) : (
        view.approvals.map((a) => (
          <button className="requestRow" key={a.id} type="button">
            <i className={a.decidesIt === "Cliente" ? "high" : "medium"} />
            <span>{a.decidesIt}</span>
            <span>
              <b>{a.title}</b>
              <small>{a.context}</small>
            </span>
            <Pill>{a.statusLabel}</Pill>
            <time>{a.when ?? "—"}</time>
            <em>→</em>
          </button>
        ))
      )}
    </article>
  );
}
