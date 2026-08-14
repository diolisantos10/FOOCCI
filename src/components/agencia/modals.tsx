"use client";

// Modais da referência Dioli, portados com o mesmo DOM e as mesmas classes:
//   · ClientSheet   → "Ficha do cliente"                (módulo 11 do handoff)
//   · PMChat        → "Chat do Agente Project Manager"  (módulo 12 do handoff)
//   · RequestModal  → entrada universal de solicitação
//   · Interview     → entrevista adaptativa do Agente Branding
//
// O que mudou em relação à referência: os textos fixos ("Foocci", "Diego
// Oliveira", "38 respostas consolidadas") viraram props. Onde não existe fonte
// de dado no Foocci, o campo mostra "—" e o card mostra o motivo, em vez de
// repetir o exemplo do mockup como se fosse do cliente real.

import { useState } from "react";
import { Pill, Head, EmptyBlock } from "./primitives";
import type { AgencyClientView, ChatMessageView } from "@/lib/agencia/views";

// ─── Ficha do cliente ────────────────────────────────────────────────────────

export type ClientSheetData = {
  responsible: { name: string | null; role: string | null };
  origin: { label: string | null; note: string | null };
  agent: { label: string; note: string };
  relationship: { label: string; note: string | null };
  company: { term: string; value: string | null }[];
  contact: { term: string; value: string | null }[];
  briefing: { summary: string | null; pain: string | null; goal: string | null; audience: string | null };
  governance: { term: string; value: string }[];
  lastReview: string | null;
};

function Dl({ rows }: { rows: { term: string; value: string | null }[] }) {
  return (
    <dl>
      {rows.map((r) => (
        <div key={r.term}>
          <dt>{r.term}</dt>
          <dd className={r.value === null ? "noData" : ""}>{r.value ?? "— não informado"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ClientSheet({
  close,
  clientName,
  initial,
  data,
}: {
  close: () => void;
  clientName: string;
  initial: string;
  data: ClientSheetData;
}) {
  const b = data.briefing;
  return (
    <div className="modalBackdrop" role="dialog" aria-modal="true" aria-label="Ficha do cliente">
      <section className="clientSheet">
        <header>
          <div className="agentMini">{initial}</div>
          <div>
            <small>FICHA TÉCNICA DO CLIENTE</small>
            <h2>{clientName} · Client Profile</h2>
          </div>
          <Pill>CADASTRO ATIVO</Pill>
          <button onClick={close} aria-label="Fechar ficha do cliente">
            ×
          </button>
        </header>
        <div className="sheetMeta">
          <span>
            <small>RESPONSÁVEL DO CLIENTE</small>
            <b>{data.responsible.name ?? "—"}</b>
            <em>{data.responsible.role ?? "sem responsável cadastrado"}</em>
          </span>
          <span>
            <small>ORIGEM</small>
            <b>{data.origin.label ?? "—"}</b>
            <em>{data.origin.note ?? "sem registro de intake"}</em>
          </span>
          <span>
            <small>AGENTE RESPONSÁVEL</small>
            <b>{data.agent.label}</b>
            <em>{data.agent.note}</em>
          </span>
          <span>
            <small>RELACIONAMENTO</small>
            <b>{data.relationship.label}</b>
            <em>{data.relationship.note ?? "—"}</em>
          </span>
        </div>
        <div className="sheetGrid">
          <article>
            <Head over="EMPRESA" title="Informações cadastrais" />
            <Dl rows={data.company} />
          </article>
          <article>
            <Head over="CONTATO PRINCIPAL" title="Responsável do lado do cliente" />
            <Dl rows={data.contact} />
          </article>
          <article className="briefingCard">
            <Head over="INTAKE DO AGENTE SDR" title="Briefing original" />
            {b.summary === null ? (
              <EmptyBlock
                title="Nenhum briefing do SDR registrado"
                hint="A entrevista de sondagem do Agente SDR ainda não foi feita para este cliente. Enquanto ela não existir, nada é preenchido aqui por dedução."
              />
            ) : (
              <>
                <p>{b.summary}</p>
                <div>
                  <span>
                    <small>DOR CENTRAL</small>
                    <b>{b.pain ?? "— não perguntado"}</b>
                  </span>
                  <span>
                    <small>OBJETIVO</small>
                    <b>{b.goal ?? "— não perguntado"}</b>
                  </span>
                  <span>
                    <small>PÚBLICO</small>
                    <b>{b.audience ?? "— não perguntado"}</b>
                  </span>
                </div>
                <button type="button">Reler briefing completo →</button>
              </>
            )}
          </article>
          <article>
            <Head over="GOVERNANÇA" title="Regras do relacionamento" />
            <Dl rows={data.governance} />
          </article>
        </div>
        <footer>
          <span>{data.lastReview ? `Última revisão: ${data.lastReview} · histórico preservado` : "Sem revisão registrada"}</span>
          <button onClick={close}>Fechar</button>
          <button className="primary">Editar ficha</button>
        </footer>
      </section>
    </div>
  );
}

// ─── Chat do Agente Project Manager ──────────────────────────────────────────
//
// O handoff é explícito: o Agente Project Manager é o ÚNICO interlocutor do
// cliente, e o chat global é a fonte de verdade — o chat dentro do cliente é
// uma visão contextual da MESMA conversa. Por isso este componente recebe as
// mensagens de fora; ele não guarda conversa própria.
//
// O bloco "Cascata criada pelo Agente PM" é INTERNO (o cliente não pode ver o
// cascateamento operacional entre agentes). Ele só é desenhado quando
// `showCascade` é verdadeiro, e o portal do cliente monta este mesmo componente
// com `showCascade={false}`. A fronteira de dado está em
// `src/lib/agencia/views.ts`; esta é a fronteira de tela correspondente.

export function PMChat({
  close,
  clientName,
  messages,
  context,
  cascadeAgents,
  cascade,
  showCascade,
}: {
  close: () => void;
  clientName: string;
  messages: ChatMessageView[];
  context: { headline: string | null; counters: string[] };
  cascadeAgents: string[];
  cascade: { requestId: string; chain: string[] }[];
  showCascade: boolean;
}) {
  return (
    <div className="modalBackdrop pmBackdrop" role="dialog" aria-modal="true" aria-label="Chat do Agente Project Manager">
      <section className="pmChat">
        <header>
          <div className="agentMini">✦</div>
          <div>
            <small>CANAL OFICIAL · {clientName.toUpperCase()}</small>
            <h2>Agente Project Manager</h2>
            <p>Único interlocutor da agência com este cliente</p>
          </div>
          <Pill>ONLINE</Pill>
          <button onClick={close} aria-label="Fechar chat">
            ×
          </button>
        </header>
        <div className="pmFlow">
          <span>
            <i>1</i>
            <b>Cliente conversa</b>
            <small>Dashboard do cliente</small>
          </span>
          <em>→</em>
          <span>
            <i>2</i>
            <b>Agente PM interpreta</b>
            <small>Contexto e prioridade</small>
          </span>
          <em>→</em>
          <span>
            <i>3</i>
            <b>Cascateia</b>
            <small>Agentes especialistas</small>
          </span>
        </div>
        <div className="chatBody">
          <aside>
            <small>CONTEXTO ATIVO</small>
            <h3>{clientName}</h3>
            <p>{context.headline ?? "Sem contexto consolidado"}</p>
            <div>
              {context.counters.length === 0 ? (
                <span>sem contadores</span>
              ) : (
                context.counters.map((c) => <span key={c}>{c}</span>)
              )}
            </div>
            <b>Agentes no cascata</b>
            {cascadeAgents.map((x) => (
              <span className="chatAgent" key={x}>
                ✦ {x}
              </span>
            ))}
          </aside>
          <main>
            {messages.length === 0 ? (
              <EmptyBlock
                title="Nenhuma conversa ainda"
                hint="O chat com o Agente Project Manager é a fonte de verdade do relacionamento. Assim que a primeira mensagem existir, ela aparece aqui — e no portal do cliente, na mesma conversa."
              />
            ) : (
              messages.map((m) => (
                <div className={"message " + (m.side === "client" ? "clientMessage" : "pmMessage")} key={m.id}>
                  <small>
                    {m.author.toUpperCase()} · {m.when}
                  </small>
                  <p>{m.body}</p>
                </div>
              ))
            )}
            {showCascade &&
              cascade.map((c) => (
                <div className="cascadeNote" key={c.requestId}>
                  <i>✦</i>
                  <span>
                    <b>Cascata criada pelo Agente PM</b>
                    <small>{c.chain.join(" → ")}</small>
                  </span>
                  <button type="button">Ver OS →</button>
                </div>
              ))}
          </main>
        </div>
        <footer>
          <button type="button" aria-label="Anexar">＋</button>
          <textarea placeholder="Responder como Agente Project Manager…" />
          <button className="send" type="button">Enviar →</button>
        </footer>
      </section>
    </div>
  );
}

// ─── Nova solicitação ────────────────────────────────────────────────────────

export function RequestModal({ close }: { close: () => void }) {
  const [mode, setMode] = useState("text");
  return (
    <div className="modalBackdrop" role="dialog" aria-modal="true" aria-label="Nova solicitação">
      <section className="requestModal">
        <header>
          <div className="agentMini">✦</div>
          <div>
            <small>REQUEST INTELLIGENCE</small>
            <h2>O que você precisa da agência?</h2>
          </div>
          <button onClick={close} aria-label="Fechar">×</button>
        </header>
        <p>Conte do seu jeito. O Orquestrador estrutura e encaminha para os agentes certos.</p>
        <nav>
          {([
            ["text", "⌨ Texto"],
            ["audio", "● Áudio"],
            ["file", "↑ Arquivos"],
            ["chat", "✦ Conversar com IA"],
          ] as const).map(([k, label]) => (
            <button className={mode === k ? "active" : ""} onClick={() => setMode(k)} key={k} type="button">
              {label}
            </button>
          ))}
        </nav>
        <div className="requestInput">
          {mode === "text" ? (
            <textarea placeholder="Ex.: Preciso de uma campanha para alcançar donos de hamburguerias e gerar demonstrações…" />
          ) : (
            <div>
              <i>{mode === "audio" ? "●" : mode === "file" ? "↑" : "✦"}</i>
              <b>
                {mode === "audio"
                  ? "Clique para gravar seu pedido"
                  : mode === "file"
                    ? "Envie materiais e referências"
                    : "Olá! Qual resultado você quer alcançar?"}
              </b>
              <small>O agente organizará o contexto automaticamente.</small>
            </div>
          )}
        </div>
        <div className="hints">
          <span>＋ Prazo</span>
          <span>＋ Prioridade</span>
          <span>＋ Projeto</span>
          <span>＋ Referência</span>
        </div>
        <footer>
          <button onClick={close}>Cancelar</button>
          <span>O envio cria uma solicitação; o Orquestrador decide se vira projeto.</span>
          <button className="primary" onClick={close}>
            Analisar solicitação →
          </button>
        </footer>
      </section>
    </div>
  );
}

// ─── Entrevista adaptativa do Agente Branding ────────────────────────────────

export function Interview({ close, clientName }: { close: () => void; clientName: string }) {
  const [step, setStep] = useState(0);
  const questions = [
    {
      tag: "PERSONALIDADE DE SERVIÇO",
      q: `Quando um cliente está no caos e procura a ${clientName}, como você quer que ele se sinta depois do primeiro contato?`,
      why: "Define tom de voz, experiência e comportamento dos agentes.",
      choices: ["Aliviado e no controle", "Motivado a crescer", "Acolhido e compreendido"],
    },
    {
      tag: "DIFERENCIAL PERCEBIDO",
      q: `Na prática, o que um cliente consegue fazer com a ${clientName} que antes parecia impossível ou trabalhoso demais?`,
      why: "Alimenta posicionamento, proposta de valor e mensagens-chave.",
      choices: [
        "Vender mais sem depender de marketplaces",
        "Atender em escala sem perder humanidade",
        "Entender e reter cada cliente",
      ],
    },
    {
      tag: "PROVA DA MARCA",
      q: `Qual resultado real faria um cliente dizer: “a ${clientName} mudou meu negócio”?`,
      why: "Transforma promessas abstratas em prova e critérios de sucesso.",
      choices: ["Mais pedidos e margem", "Menos caos operacional", "Mais clientes recorrentes"],
    },
  ];
  const q = questions[Math.min(step, questions.length - 1)] ?? questions[0]!;
  return (
    <div className="modalBackdrop" role="dialog" aria-modal="true" aria-label="Entrevista de marca">
      <section className="interview">
        <header>
          <div className="agentMini">✦</div>
          <div>
            <small>AGENTE BRANDING · ENTREVISTA ADAPTATIVA</small>
            <h2>Vamos completar a marca {clientName}</h2>
          </div>
          <button onClick={close} aria-label="Fechar">×</button>
        </header>
        <div className="interviewProgress">
          <span>
            Bloco 2 de 6 · Essência &amp; personalidade <b>{step + 1}/3</b>
          </span>
          <i>
            <b style={{ width: `${(step + 1) * 33.3}%` }} />
          </i>
        </div>
        <div className="conversation">
          <aside>
            <b>O que já sei</b>
            <span>✓ Segmento e modelo de negócio</span>
            <span>✓ Produto e público primário</span>
            <span>✓ Proposta funcional</span>
            <span className="pending">◷ Personalidade emocional</span>
          </aside>
          <main>
            <Pill>{q.tag}</Pill>
            <h3>{q.q}</h3>
            <p>Responda do seu jeito ou escolha uma direção para começar.</p>
            <div className="choices">
              {q.choices.map((x) => (
                <button key={x} type="button">{x}</button>
              ))}
            </div>
            <textarea placeholder="Ou conte com suas palavras…" />
            <div className="why">
              <i>✦</i>
              <span>
                <b>Por que estou perguntando</b>
                <small>{q.why}</small>
              </span>
            </div>
          </main>
        </div>
        <footer>
          <button onClick={close}>Salvar e continuar depois</button>
          <span>O agente adapta a próxima pergunta à sua resposta.</span>
          <button className="next" onClick={() => (step < 2 ? setStep(step + 1) : close())}>
            {step < 2 ? "Continuar →" : "Concluir bloco ✓"}
          </button>
        </footer>
      </section>
    </div>
  );
}

export type { AgencyClientView };
