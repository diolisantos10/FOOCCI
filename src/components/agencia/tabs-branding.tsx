"use client";

// Branding / Brand Hub — portado da referência aprovada (BrandHeader, Control,
// Detail, AgentCard), com o mesmo DOM e as mesmas classes.
//
// Aqui existe dado real: `RestaurantBrandConfig` já guarda tom de voz,
// formalidade, uso de emoji, estilo de comunicação, preset de personalidade e
// as cores da marca. É a única área da agência com fonte de verdade no Foocci
// hoje, e o mapa de conhecimento reflete isso — o que está preenchido conta
// como confirmado, o que está no default do sistema conta como não perguntado.

import { useState } from "react";
import { Pill, Head, Ring, EmptyBlock } from "./primitives";
import { Interview } from "./modals";
import type { AgencyClientView } from "@/lib/agencia/views";

const brandNav: [string, string][] = [
  ["control", "Control Room"],
  ["core", "Brand Core"],
  ["people", "Públicos"],
  ["voice", "Verbal"],
  ["visual", "Visual"],
  ["mood", "Moodboards"],
  ["assets", "Assets"],
  ["audit", "Auditor"],
  ["gates", "Gates"],
  ["evolve", "Evolution"],
];

const details: Record<string, [string, string, string[]]> = {
  core: ["Brand Core", "O núcleo estratégico e imutável da marca.",
    ["Essência e propósito", "Posicionamento", "Proposta de valor", "Territórios", "Arquétipos", "Manifesto"]],
  people: ["Públicos & Cultura", "Pessoas, contextos e tensões que movem a marca.",
    ["Segmentos vivos", "Personas", "Jobs to be Done", "Jornadas", "Comunidades", "Radar cultural"]],
  voice: ["Sistema Verbal", "Como a marca pensa, fala e se comporta.",
    ["Tom e voz", "Message house", "Vocabulário", "Do / Don't", "Claims", "Prompts oficiais"]],
  visual: ["Sistema Visual", "A linguagem visual modular da marca.",
    ["Arquitetura de logo", "Tokens visuais", "Tipografia", "Fotografia", "Motion & som", "Acessibilidade"]],
  mood: ["Moodboard Lab", "Referências vivas ligadas às decisões criativas.",
    ["Território HumanTech", "Presença humana", "Growth", "Anti-referências", "Campanhas", "Deriva visual"]],
  assets: ["Asset Intelligence", "DAM com inteligência, direitos e performance.",
    ["Biblioteca mestre", "Busca semântica", "Direitos de uso", "Versões", "Coleções", "ROI de ativos"]],
  audit: ["Brand Auditor", "Auditoria multimodal e explicável.",
    ["Texto e voz", "Logo e cores", "Composição", "Acessibilidade", "Compliance", "Correções sugeridas"]],
  gates: ["Approval Gates", "A trava que protege cada entrega antes do cliente.",
    ["Pré-auditoria", "Revisão humana", "Exceções", "Aprovações", "SLA", "Trilha de evidência"]],
  evolve: ["Evolution Lab", "Mudança controlada sem perder coerência.",
    ["Radar de sinais", "Hipóteses", "Experimentos", "Brand equity", "Change requests", "Rollback"]],
};

function BrandHeader({
  view, brandView, setView, onInterview,
}: {
  view: string;
  brandView: AgencyClientView["brand"];
  setView: (v: string) => void;
  onInterview: () => void;
}) {
  const missing = brandView.knowledge.filter((k) => k.state !== "confirmed").length;
  const total = brandView.knowledge.length;
  const pendingPct = total ? Math.round((missing / total) * 100) : null;
  return (
    <>
      <section className="brandHeader">
        <div className="brandIdentity">
          <div className="brandMark">{brandView.headline.charAt(0).toUpperCase()}</div>
          <div>
            <span>
              <Pill>BRAND OS ATIVO</Pill>
              <small>{brandView.tagline ? "Perfil de marca preenchido" : "Perfil de marca no padrão do sistema"}</small>
            </span>
            <h2>{brandView.headline} Brand Space</h2>
            <p>{brandView.tagline ?? "Nenhuma descrição de marca cadastrada para este cliente."}</p>
          </div>
        </div>
        <div className="brandHealth">
          <Ring n={brandView.health} />
          <span>
            <small>BRAND HEALTH</small>
            <b>{brandView.health === null ? "Sem medição" : brandView.health >= 80 ? "Forte & coerente" : "Em construção"}</b>
            <em>{brandView.health === null ? "sem base de comparação" : "conhecimento preenchido"}</em>
          </span>
        </div>
        <div className="brandAura">
          <i />
          <i />
          <b>{brandView.headline.charAt(0).toUpperCase()}</b>
        </div>
      </section>
      <div className="brandTools">
        <nav>
          {brandNav.map((x) => (
            <button key={x[0]} type="button" onClick={() => setView(x[0])} className={view === x[0] ? "active" : ""}>
              {x[1]}
            </button>
          ))}
        </nav>
        <button className="interviewButton" type="button" onClick={onInterview}>
          ✦ Completar marca com IA <span>{pendingPct === null ? "sem mapa" : `${pendingPct}% pendente`}</span>
        </button>
      </div>
    </>
  );
}

function AgentCard({ onInterview, answered }: { onInterview: () => void; answered: number }) {
  return (
    <article className="card agentCard">
      <div className="agentTop">
        <i>✦</i>
        <span>
          <small>AGENTE DIRETOR DE BRANDING</small>
          <h3>Agente Branding AI</h3>
        </span>
        <Pill>ONLINE</Pill>
      </div>
      <p>Coordena a inteligência de marca deste cliente e sincroniza aprendizados com o sistema de branding da agência.</p>
      <div className="agentFocus">
        <small>PRÓXIMA MELHOR AÇÃO</small>
        <b>Confirmar com o cliente o que hoje está no padrão do sistema.</b>
        <span>Essa informação afeta: tom de voz, UX writing, campanhas e o agente de atendimento.</span>
      </div>
      <button type="button" onClick={onInterview}>Iniciar entrevista inteligente →</button>
      <footer>
        <span>
          <i /> {answered} campos confirmados
        </span>
        <span>
          <i /> 1 fonte conectada
        </span>
      </footer>
    </article>
  );
}

function Control({
  brandView, setView, onInterview,
}: {
  brandView: AgencyClientView["brand"];
  setView: (v: string) => void;
  onInterview: () => void;
}) {
  const confirmed = brandView.knowledge.filter((k) => k.state === "confirmed").length;
  const total = brandView.knowledge.length;
  const areaToView: Record<string, string> = {
    "Brand Core": "core",
    "Públicos": "people",
    "Sistema Verbal": "voice",
    "Sistema Visual": "visual",
    "Experiência": "evolve",
    "Governança": "gates",
  };
  return (
    <div className="controlGrid">
      <section className="mainCol">
        <div className="signals">
          {[
            ["COMPLETUDE", total ? `${Math.round((confirmed / total) * 100)}%` : null, total ? `${total - confirmed} a descobrir` : null],
            ["CONSISTÊNCIA", null, null],
            ["ATIVOS", null, null],
            ["GATES ABERTOS", null, null],
            ["RISCO", null, null],
          ].map(([label, value, hint]) => (
            <div key={label as string}>
              <small>{label}</small>
              <b className={value === null ? "noData" : ""}>{value ?? "—"}</b>
              <span>{hint ?? "sem dado conectado"}</span>
            </div>
          ))}
        </div>
        <article className="card readiness">
          <Head over="PRONTIDÃO DA MARCA" title="Mapa de conhecimento" action="Ver diagnóstico" />
          <p>O sistema separa o que está confirmado, inferido e ainda precisa ser perguntado.</p>
          {brandView.knowledge.length === 0 ? (
            <EmptyBlock
              title="Nenhum perfil de marca cadastrado"
              hint="Sem o perfil de marca do cliente não há o que mapear. O mapa não presume nada."
            />
          ) : (
            <div className="knowledge">
              {brandView.knowledge.map((k) => (
                <button key={k.area} type="button" onClick={() => setView(areaToView[k.area] ?? "core")}>
                  <span>
                    <b>{k.area}</b>
                    <small>
                      {k.state === "confirmed"
                        ? "Confirmado"
                        : k.state === "mixed"
                          ? "Parcialmente validado"
                          : "Informação insuficiente"}
                    </small>
                  </span>
                  <i>
                    <b style={{ width: `${k.pct ?? 0}%` }} />
                  </i>
                  <strong className={k.pct === null ? "noData" : ""}>{k.pct === null ? "—" : `${k.pct}%`}</strong>
                </button>
              ))}
            </div>
          )}
        </article>
        <article className="card gatePanel">
          <Head over="CONTROLE DE ENTREGA" title="Brand Gate Pipeline" action="Abrir central" />
          <p>Nenhuma entrega chega ao cliente sem cumprir as regras críticas da marca.</p>
          <div className="flow">
            {["Em produção", "Pré-auditoria", "Revisão humana", "Liberados"].map((label, i) => (
              <div key={label} className={"f" + i}>
                <b className="noData">—</b>
                <small>{label}</small>
                {i < 3 && <em>→</em>}
              </div>
            ))}
          </div>
          <div className="blocked">
            <span>
              ! <b>Nenhuma entrega bloqueada</b>
              <small>o pipeline de entregas ainda não é registrado para este cliente</small>
            </span>
            <button type="button" onClick={() => setView("gates")}>Ver regras →</button>
          </div>
        </article>
        <article className="card mood">
          <Head over="DIREÇÃO CRIATIVA" title="Living Moodboards" action="Abrir laboratório" />
          <EmptyBlock
            title="Nenhum moodboard"
            hint="Referências visuais do cliente ainda não têm onde ser guardadas neste sistema."
          />
        </article>
      </section>
      <aside className="rightCol">
        <AgentCard onInterview={onInterview} answered={confirmed} />
        <article className="card aiAudit">
          <Head over="AUDITORIA CONTÍNUA" title="Brand Auditor AI" />
          <div className="scan">
            <i>✦</i>
            <span>
              <b>Monitoramento multimodal</b>
              <small>Texto · Imagem · Vídeo · Interface</small>
            </span>
            <Pill>ATIVO</Pill>
          </div>
          {["Voz & mensagem", "Sistema visual", "Contexto cultural", "Acessibilidade"].map((x) => (
            <div className="score" key={x}>
              <span>{x}</span>
              <i>
                <b style={{ width: "0%" }} />
              </i>
              <strong className="noData">—</strong>
            </div>
          ))}
          <button type="button" onClick={() => setView("audit")}>Executar auditoria</button>
        </article>
        <article className="card sources">
          <Head over="FONTES DA MARCA" title="Conhecimento conectado" />
          <div>
            <i>▤</i>
            <span>
              <b>Perfil de marca do cliente</b>
              <small>{brandView.tagline ? "Preenchido" : "No padrão do sistema"}</small>
            </span>
            <em>✓</em>
          </div>
        </article>
      </aside>
    </div>
  );
}

function Detail({ view, setView }: { view: string; setView: (v: string) => void }) {
  const d: [string, string, string[]] = details[view] ?? details.core!;
  return (
    <div className="detail">
      <div className="detailIntro">
        <button type="button" onClick={() => setView("control")}>← Control Room</button>
        <Pill>MÓDULO ATIVO</Pill>
        <h2>{d[0]}</h2>
        <p>{d[1]}</p>
      </div>
      <div className="detailGrid">
        <article className="card capabilities">
          <Head over="CAPACIDADES" title="O que este módulo controla" />
          <div>
            {d[2].map((x, i) => (
              <button key={x} type="button">
                <i>{String(i + 1).padStart(2, "0")}</i>
                <span>
                  <b>{x}</b>
                  <small className="noData">sem estado registrado</small>
                </span>
                <em>→</em>
              </button>
            ))}
          </div>
        </article>
        <article className="card maturity">
          <Head over="SAÚDE DO MÓDULO" title="Score por dimensão" />
          {["Estrutura", "Cobertura", "Consistência", "Adoção", "Atualidade"].map((x) => (
            <div key={x}>
              <span>{x}</span>
              <i>
                <b style={{ width: "0%" }} />
              </i>
              <strong className="noData">—</strong>
            </div>
          ))}
          <aside>
            <small>PRÓXIMA MELHOR AÇÃO</small>
            <b>Validar os itens inferidos com o cliente.</b>
            <button type="button">Gerar perguntas →</button>
          </aside>
        </article>
      </div>
    </div>
  );
}

export function BrandingTab({ view }: { view: AgencyClientView }) {
  const [sub, setSub] = useState("control");
  const [interview, setInterview] = useState(false);
  return (
    <>
      <section className="brandingTab">
        <BrandHeader view={sub} brandView={view.brand} setView={setSub} onInterview={() => setInterview(true)} />
        {sub === "control" ? (
          <Control brandView={view.brand} setView={setSub} onInterview={() => setInterview(true)} />
        ) : (
          <Detail view={sub} setView={setSub} />
        )}
      </section>
      {interview && <Interview close={() => setInterview(false)} clientName={view.client.name} />}
    </>
  );
}
