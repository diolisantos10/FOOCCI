"use client";

// Social Media · Design · Tráfego Pago · Inteligência — portadas da referência
// aprovada com o mesmo DOM e as mesmas classes.
//
// Duas diferenças, ambas pedidas no despacho:
//  1. Os números vêm do DTO; sem fonte ligada, a célula mostra "—" e o motivo.
//  2. Os sub-navs da referência tinham botões que não faziam nada. Aqui todos
//     abrem um módulo — e "Aprovações" e "Entregas", os módulos 8 e 9 do
//     handoff, deixam de ser placeholder e passam a ler a fila real do cliente.

import { useState } from "react";
import { Pill, Head, TabTitle, Kpis, Ring, EmptyBlock } from "./primitives";
import { ApprovalsModule, DeliverablesModule } from "./tabs-core";
import type { AgencyClientView } from "@/lib/agencia/views";

/** O módulo genérico da referência, para as áreas que ainda não têm fonte. */
export function DepartmentModule({ title, kind }: { title: string; kind: string }) {
  return (
    <div className="departmentModule">
      <div>
        <Pill>{kind.toUpperCase()} OS</Pill>
        <h2>{title}</h2>
        <p>Operação conectada aos agentes, ao histórico do cliente e às regras de governança.</p>
      </div>
      <section>
        {[
          "Fila e prioridades",
          "Automação inteligente",
          "Integrações",
          "Aprovações e gates",
          "Histórico e evidências",
          "Insights e recomendações",
        ].map((label, i) => (
          <article className="card" key={label}>
            <i>{["▦", "✦", "↗", "✓", "◷", "◎"][i]}</i>
            <span>
              <b>{label}</b>
              <small className="noData">sem fonte conectada</small>
            </span>
            <button type="button">Abrir →</button>
          </article>
        ))}
      </section>
    </div>
  );
}

// ─── Social Media ────────────────────────────────────────────────────────────

export function SocialTab({ view }: { view: AgencyClientView }) {
  const [sub, setSub] = useState("Command Center");
  const nav = ["Command Center", "Planner", "Conteúdo", "Canais", "Community", "Listening", "Analytics", "Aprovações"];
  const pendingApprovals = view.approvals.length;
  return (
    <section className="workspaceTab socialTab">
      <div className="socialHero">
        <div>
          <Pill>SOCIAL OS ATIVO</Pill>
          <h2>Social Media Command Center</h2>
          <p>Planejamento, criação, publicação, comunidade e inteligência multicanal.</p>
        </div>
        <div className="socialScore">
          <Ring n={null} />
          <span>
            <small>SOCIAL HEALTH</small>
            <b>Sem medição</b>
            <em>nenhuma rede conectada</em>
          </span>
        </div>
      </div>
      <nav className="socialNav">
        {nav.map((x) => (
          <button className={sub === x ? "active" : ""} onClick={() => setSub(x)} key={x} type="button">
            {x}
            {x === "Aprovações" && pendingApprovals > 0 && <em>{pendingApprovals}</em>}
          </button>
        ))}
        <button className="create" type="button">＋ Criar conteúdo</button>
      </nav>
      {sub === "Aprovações" ? (
        <ApprovalsModule view={view} />
      ) : sub !== "Command Center" ? (
        <DepartmentModule title={sub} kind="social" />
      ) : (
        <>
          <Kpis items={view.areaMetrics.social} className="socialKpis" />
          <div className="socialGrid">
            <article className="card planner">
              <Head over="PLANNER MULTICANAL" title="Próximos 7 dias" action="Abrir planner" />
              <EmptyBlock
                title="Nenhuma publicação agendada"
                hint="O calendário editorial ainda não tem fonte neste sistema. Nenhuma data é sugerida por dedução."
              />
            </article>
            <article className="card socialAgent">
              <div className="agentTop">
                <i>✦</i>
                <span>
                  <small>AGENTE SOCIAL MEDIA</small>
                  <h3>Inteligência editorial</h3>
                </span>
                <Pill>ONLINE</Pill>
              </div>
              <p>Coordena estratégia, pauta, criação, calendário, comunidade e performance.</p>
              <div>
                <small>OPORTUNIDADE</small>
                <b>Sem histórico suficiente para recomendar.</b>
                <span>O agente só sugere pauta depois de ler desempenho real.</span>
                <button type="button">Gerar plano editorial →</button>
              </div>
            </article>
            <article className="card pipeline">
              <Head over="OPERAÇÃO DE CONTEÚDO" title="Pipeline editorial" action="Ver kanban" />
              <div>
                {["Ideias", "Estratégia", "Produção", "Aprovação", "Agendados", "Publicados"].map((label, i) => (
                  <button key={label} type="button">
                    <i className={"c" + i} />
                    <b className="noData">—</b>
                    <small>{label}</small>
                  </button>
                ))}
              </div>
              <aside>
                <Pill>SEM DADO</Pill>
                <span>O pipeline editorial ainda não é registrado para este cliente.</span>
                <button type="button" onClick={() => setSub("Aprovações")}>Ver aprovações →</button>
              </aside>
            </article>
            <article className="card socialChannels">
              <Head over="CANAIS CONECTADOS" title="Performance por rede" action="Comparar" />
              {view.integrations.filter((i) => i.tone !== "off").length === 0 ? (
                <EmptyBlock
                  title="Nenhuma rede conectada"
                  hint="Só o cliente conecta as contas. A agência vê o status, nunca a credencial."
                />
              ) : (
                view.integrations
                  .filter((i) => i.tone !== "off")
                  .map((x) => (
                    <button key={x.name} type="button">
                      <i>{x.glyph}</i>
                      <span>
                        <b>{x.name}</b>
                        <small>{x.scopes}</small>
                      </span>
                      <strong className="noData">—</strong>
                    </button>
                  ))
              )}
            </article>
            <article className="card listening">
              <Head over="SOCIAL LISTENING" title="O que o mercado diz" action="Abrir radar" />
              <div>
                {["Positivo", "Neutro", "Negativo"].map((k) => (
                  <span key={k}>
                    <b className="noData">—</b>
                    <small>{k}</small>
                  </span>
                ))}
              </div>
              <h4>Assuntos em aceleração</h4>
              <EmptyBlock title="Sem escuta ativa" hint="Nenhuma fonte de listening está conectada." />
            </article>
          </div>
        </>
      )}
    </section>
  );
}

// ─── Design ──────────────────────────────────────────────────────────────────

export function DesignTab({ view }: { view: AgencyClientView }) {
  const [sub, setSub] = useState("Command Center");
  const nav = ["Command Center", "Briefings", "Produção", "Creative Review", "Biblioteca", "Templates", "Performance"];
  return (
    <section className="workspaceTab">
      <TabTitle
        status="DESIGN OS"
        title="Design Command Center"
        desc="Da demanda ao ativo final: capacidade, direção criativa, produção, QA e Brand Gate."
      >
        <button type="button">Capacidade da equipe</button>
        <button className="primary" type="button">＋ Nova peça</button>
      </TabTitle>
      <nav className="deptNav">
        {nav.map((x) => (
          <button className={sub === x ? "active" : ""} onClick={() => setSub(x)} key={x} type="button">
            {x}
            {x === "Creative Review" && view.approvals.length > 0 && <em>{view.approvals.length}</em>}
          </button>
        ))}
      </nav>
      {sub === "Creative Review" ? (
        <ApprovalsModule view={view} />
      ) : sub !== "Command Center" ? (
        <DepartmentModule title={sub} kind="design" />
      ) : (
        <>
          <div className="designKpis">
            {["Fila criativa", "Em produção", "Em revisão", "Aprovadas", "CAPACIDADE"].map((label) => (
              <article className="card" key={label}>
                <small>{label}</small>
                <b className="noData">—</b>
                <span>sem dado conectado</span>
              </article>
            ))}
          </div>
          <div className="designFullGrid">
            <article className="card designBoard">
              <Head over="PRODUÇÃO CRIATIVA" title="Design Pipeline" action="Abrir kanban" />
              <div>
                {["Briefing", "Direção", "Criação", "Revisão", "Brand Gate", "Cliente", "Finalizado"].map((x) => (
                  <span key={x}>
                    <b className="noData">—</b>
                    <small>{x}</small>
                  </span>
                ))}
              </div>
              <aside>
                <Pill>SEM DADO</Pill>
                <span>A produção criativa ainda não é registrada para este cliente.</span>
                <button type="button">Replanejar capacidade →</button>
              </aside>
            </article>
            <article className="card designAgent">
              <div className="agentTop">
                <i>✦</i>
                <span>
                  <small>AGENTE DESIGN</small>
                  <h3>Creative Operations</h3>
                </span>
                <Pill>ONLINE</Pill>
              </div>
              <p>Transforma briefings em direção criativa, distribui capacidade e protege qualidade, marca e prazos.</p>
              <div>
                <small>RECOMENDAÇÃO</small>
                <b>Sem peças em fila para recomendar agrupamento.</b>
                <span>A recomendação depende de produção real.</span>
              </div>
              <button type="button">Aplicar recomendação →</button>
            </article>
            <article className="card activePieces">
              <Head over="EM PRODUÇÃO" title="Peças prioritárias" action="Ver todas" />
              <EmptyBlock title="Nada em produção" hint="Nenhuma peça criativa está registrada para este cliente." />
            </article>
            <article className="card quality">
              <Head over="QUALITY SYSTEM" title="Qualidade criativa" />
              {["Brand compliance", "Acessibilidade", "Originalidade", "Performance prevista"].map((x) => (
                <div key={x}>
                  <span>{x}</span>
                  <i>
                    <b style={{ width: "0%" }} />
                  </i>
                  <strong className="noData">—</strong>
                </div>
              ))}
              <aside>
                <b className="noData">—</b>
                <span>sem teste de hook executado</span>
              </aside>
            </article>
          </div>
        </>
      )}
    </section>
  );
}

// ─── Tráfego Pago ────────────────────────────────────────────────────────────

export function TrafficTab({ view }: { view: AgencyClientView }) {
  const [sub, setSub] = useState("Command Center");
  const nav = ["Command Center", "Campanhas", "Experimentos", "Criativos", "Audiências", "Atribuição", "Budget Control"];
  return (
    <section className="workspaceTab">
      <TabTitle
        status="GROWTH OS"
        title="Paid Media Command Center"
        desc="Investimento, experimentação, atribuição e escala com governança de risco."
      >
        <button type="button">Últimos 30 dias⌄</button>
        <button className="primary" type="button">＋ Nova campanha</button>
      </TabTitle>
      <nav className="deptNav">
        {nav.map((x) => (
          <button className={sub === x ? "active" : ""} onClick={() => setSub(x)} key={x} type="button">
            {x}
          </button>
        ))}
      </nav>
      {sub !== "Command Center" ? (
        <DepartmentModule title={sub} kind="growth" />
      ) : (
        <>
          <Kpis items={view.areaMetrics.traffic} className="growthKpis" />
          <div className="trafficGrid">
            <article className="card spendChart">
              <Head over="PERFORMANCE & INVESTIMENTO" title="Eficiência da mídia" action="Abrir relatório" />
              <div className="growthChart">
                <div>
                  <span>
                    <b className="noData">—</b>
                    <small>Investimento</small>
                  </span>
                  <span>
                    <b className="noData">—</b>
                    <small>Receita atribuída</small>
                  </span>
                </div>
              </div>
              <EmptyBlock
                title="Nenhuma conta de anúncio conectada"
                hint="Investimento, receita atribuída, ROAS e CPA vêm das contas do cliente. Sem conexão, esta área fica vazia — estimar aqui seria inventar dinheiro."
              />
              <div className="platforms">
                <button type="button">
                  <i>◇</i>
                  <span>
                    <b>Sem plataforma</b>
                    <small>conectar no portal do cliente</small>
                  </span>
                  <strong className="noData">—</strong>
                </button>
              </div>
            </article>
            <article className="card growthAgent">
              <div className="agentTop">
                <i>✦</i>
                <span>
                  <small>AGENTE TRÁFEGO PAGO</small>
                  <h3>Media Intelligence</h3>
                </span>
                <Pill>ONLINE</Pill>
              </div>
              <p>Monitora orçamento, aprendizado e risco. Nunca aumenta investimento real sem autorização.</p>
              <div>
                <small>OPORTUNIDADE</small>
                <b>Sem campanha para analisar.</b>
                <span>O agente não sugere escala sem dado medido.</span>
              </div>
              <button type="button">Simular redistribuição →</button>
            </article>
            <article className="card campaigns">
              <Head over="CAMPANHAS ATIVAS" title="Performance e decisão" action="Ver todas" />
              <EmptyBlock title="Nenhuma campanha ativa" hint="Nenhuma conta de mídia paga está conectada a este cliente." />
            </article>
            <article className="card experiments">
              <Head over="EXPERIMENTATION ENGINE" title="Testes em andamento" />
              <EmptyBlock title="Nenhum experimento" hint="Sem campanha conectada não há teste rodando." />
            </article>
          </div>
        </>
      )}
    </section>
  );
}

// ─── Inteligência ────────────────────────────────────────────────────────────

export function IntelligenceTab({ view }: { view: AgencyClientView }) {
  const [sub, setSub] = useState("Executive Intelligence");
  const nav = [
    "Executive Intelligence",
    "Marketing Analytics",
    "Customer Intelligence",
    "Competitive Radar",
    "Forecasts",
    "Decision Log",
  ];
  return (
    <section className="workspaceTab">
      <TabTitle
        status="INTELLIGENCE OS"
        title="Client Intelligence Center"
        desc="Dados transformados em decisões, recomendações e memória estratégica."
      >
        <button type="button">Fontes conectadas</button>
        <button className="primary" type="button">Gerar análise</button>
      </TabTitle>
      <nav className="deptNav">
        {nav.map((x) => (
          <button className={sub === x ? "active" : ""} onClick={() => setSub(x)} key={x} type="button">
            {x}
          </button>
        ))}
      </nav>
      {sub !== "Executive Intelligence" ? (
        <DepartmentModule title={sub} kind="intelligence" />
      ) : (
        <div className="intelGrid">
          <article className="card executiveBrief">
            <Head over="AI EXECUTIVE BRIEF" title="O que mudou e o que fazer agora" action="Ver briefing completo" />
            <div className="briefHero">
              <i>✦</i>
              <div>
                <small>SÍNTESE DE HOJE</small>
                <h3>Ainda não há dado suficiente para uma síntese executiva.</h3>
                <p>
                  O briefing executivo só é gerado quando existe série histórica conectada. Escrever
                  uma conclusão sem ela seria opinião apresentada como leitura de dado.
                </p>
              </div>
            </div>
            <EmptyBlock
              title="Sem oportunidade, risco ou decisão calculados"
              hint="Conecte as fontes do cliente para o agente ter o que ler."
            />
          </article>
          <article className="card dataSources">
            <Head over="DATA FOUNDATION" title="Fontes e confiabilidade" />
            {view.integrations.length === 0 ? (
              <EmptyBlock title="Nenhuma fonte" hint="Nada conectado a este cliente." />
            ) : (
              view.integrations.map((x) => (
                <div key={x.name}>
                  <i>{x.tone === "ok" ? "✓" : x.tone === "off" ? "×" : "◇"}</i>
                  <span>
                    <b>{x.name}</b>
                    <small>{x.statusLabel}</small>
                  </span>
                  <strong className="noData">—</strong>
                </div>
              ))
            )}
          </article>
          <article className="card forecast">
            <Head over="FORECAST" title="Projeção de leads e receita" />
            <div className="forecastValues">
              {["LEADS · 30D", "RECEITA ATRIBUÍDA", "CONFIANÇA"].map((k) => (
                <span key={k}>
                  <small>{k}</small>
                  <b className="noData">—</b>
                  <em>sem série histórica</em>
                </span>
              ))}
            </div>
          </article>
          <article className="card decisionLog">
            <Head over="MEMÓRIA ESTRATÉGICA" title="Decisões e efeitos" action="Ver log" />
            <EmptyBlock
              title="Decision Log vazio"
              hint="Nenhuma decisão do relacionamento foi registrada ainda."
            />
          </article>
        </div>
      )}
    </section>
  );
}

export { DeliverablesModule, ApprovalsModule };
