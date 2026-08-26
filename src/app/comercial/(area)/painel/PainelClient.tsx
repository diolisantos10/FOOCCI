"use client";

/**
 * O PAINEL DO AGENTE GERENTE COMERCIAL (itens 14 e 15).
 *
 * ── A ORDEM DA TELA É A DECISÃO MAIS IMPORTANTE DELA ────────────────────────
 *
 * Começa pelo que exige ação AGORA — fila sem responsável, esperando gente, SLA
 * estourado — e só depois mostra desempenho. Um painel que abre com "conversão
 * do mês" ensina o gerente a olhar o passado enquanto a fila de hoje esfria.
 *
 * ── E A REGRA QUE ATRAVESSA CADA CARD ───────────────────────────────────────
 *
 * Onde não há dado, a tela escreve **"sem dados"** — nunca zero. Zero é uma
 * afirmação ("medimos, e deu zero") e é indistinguível de "ninguém mediu". Os
 * dois pintariam o card da mesma cor, e só um merece ação.
 */

import { useEffect, useState } from "react";

type Taxa =
  | { medido: true; valor: number; base: number }
  | { medido: false; motivo: "amostraPequena"; base: number }
  | { medido: false; motivo: "semDados" };

type Duracao =
  | { medido: true; minutos: number; base: number }
  | { medido: false; motivo: "semDados" };

interface Visao {
  agora: {
    semResponsavel: number;
    aguardandoHumano: number;
    comIA: number;
    slaEstourado: number;
    followUpVencido: number;
    semProximaAcao: number;
    entrandoAgora: number;
  };
  time: {
    sdrs: Array<{ userId: string; nome: string; estado: string; carga: number; capacidade: number }>;
    porEstado: Record<string, number>;
    semCadastro: boolean;
  };
  espera:
    | { medido: true; handoffsAbertos: number; maiorEsperaMin: number }
    | { medido: false; motivo: string };
  primeiraResposta: Duracao;
  conversao: {
    degraus: Array<{ etapa: string; rotulo: string; total: number }>;
    pontaAPonta: Taxa;
    ganhos: number;
    perdidos: number;
    emNutricao: number;
  };
  comparecimento:
    | { medido: true; realizadas: number; naoCompareceram: number; taxa: number }
    | { medido: false; motivo: string };
  receita:
    | { medido: true; centavos: number; propostas: number }
    | { medido: false; motivo: string; propostas?: number };
  perdas: Array<{ rotulo: string; grupo: string | null; total: number }>;
  iaVsHumano: {
    ia: { atendimentos: number; qa: unknown };
    humano: { atendimentos: number; qa: unknown };
    handoffs: number;
    porMotivo: Array<{ motivo: string; total: number }>;
  };
}

type Estado =
  | { fase: "carregando" }
  | { fase: "pronto"; v: Visao }
  | { fase: "semAcesso" }
  | { fase: "erro"; detalhe: string | null };

export function PainelClient() {
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });

  useEffect(() => {
    let vivo = true;

    (async () => {
      try {
        const r = await fetch("/api/admin/sala-de-vendas/painel", { cache: "no-store" });
        if (!vivo) return;

        if (r.status === 401 || r.status === 403) {
          setEstado({ fase: "semAcesso" });
          return;
        }

        const j = (await r.json()) as { ok: boolean; data?: Visao; error?: string };
        if (!vivo) return;

        if (!j.ok || !j.data) {
          setEstado({ fase: "erro", detalhe: j.error ?? null });
          return;
        }
        setEstado({ fase: "pronto", v: j.data });
      } catch (e) {
        if (vivo) setEstado({ fase: "erro", detalhe: e instanceof Error ? e.message : null });
      }
    })();

    return () => { vivo = false; };
  }, []);

  if (estado.fase === "carregando") {
    return <p className="p-6 text-[13px] text-muted">Carregando o painel…</p>;
  }

  if (estado.fase === "semAcesso") {
    return (
      <div className="p-6">
        <p className="max-w-[70ch] text-[13.5px] leading-relaxed text-ink2">
          Este painel é do Agente Gerente Comercial, do Diretor, do CEO e da
          auditoria. Ele mostra carga e desempenho de todo o time — por isso o SDR
          não entra, e a recusa vem do servidor.
        </p>
      </div>
    );
  }

  if (estado.fase === "erro") {
    return <p className="p-6 text-[13.5px] text-ink2">{estado.detalhe ?? "Falhou."}</p>;
  }

  const { v } = estado;

  return (
    <div className="min-h-full bg-canvas px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-[-.02em] text-ink">
            Painel comercial
          </h1>
          <p className="mt-1 max-w-[70ch] text-[13.5px] leading-relaxed text-muted">
            O que precisa de você agora vem primeiro. Onde não há dado, a tela diz
            &quot;sem dados&quot; — nunca zero.
          </p>
        </header>

        {/* ── AGORA ─────────────────────────────────────────────────────── */}
        <section>
          <h2 className="mb-2 text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
            Agora
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            <Card rotulo="Sem responsável" valor={v.agora.semResponsavel} alerta={v.agora.semResponsavel > 0} />
            <Card rotulo="Esperando gente" valor={v.agora.aguardandoHumano} alerta={v.agora.aguardandoHumano > 0} />
            <Card rotulo="SLA estourado" valor={v.agora.slaEstourado} alerta={v.agora.slaEstourado > 0} />
            <Card rotulo="Follow-up vencido" valor={v.agora.followUpVencido} alerta={v.agora.followUpVencido > 0} />
            <Card
              rotulo="Sem próxima ação"
              valor={v.agora.semProximaAcao}
              alerta={v.agora.semProximaAcao > 0}
              nota="não aparecem em nenhuma fila de atraso"
            />
            <Card rotulo="Com a IA" valor={v.agora.comIA} />
            <Card rotulo="Entraram em 24 h" valor={v.agora.entrandoAgora} />
            <Card
              rotulo="Maior espera"
              texto={v.espera.medido ? `${v.espera.maiorEsperaMin} min` : "ninguém esperando"}
              alerta={v.espera.medido && v.espera.maiorEsperaMin > 15}
            />
          </div>
        </section>

        {/* ── O TIME ────────────────────────────────────────────────────── */}
        <section>
          <h2 className="mb-2 text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
            O time
          </h2>

          {v.time.semCadastro ? (
            <p className="max-w-[70ch] rounded-2xl border border-line bg-paper p-4 text-[13px] leading-relaxed text-ink2">
              <strong>Ninguém registrou disponibilidade ainda.</strong> Isso não é o
              mesmo que o time inteiro estar offline — e a distinção importa, porque
              só uma das duas é problema de operação.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-line bg-paper">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-line text-left text-[11.5px] uppercase tracking-[.04em] text-muted">
                    <th className="px-3 py-2 font-semibold">Pessoa</th>
                    <th className="px-3 py-2 font-semibold">Estado</th>
                    <th className="px-3 py-2 text-right font-semibold">Carga</th>
                  </tr>
                </thead>
                <tbody>
                  {v.time.sdrs.map((s) => (
                    <tr key={s.userId} className="border-b border-line last:border-0">
                      <td className="px-3 py-2 text-ink">{s.nome}</td>
                      <td className="px-3 py-2 text-ink2">{s.estado.toLowerCase()}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-ink2">
                        {s.carga}/{s.capacidade}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── DESEMPENHO ────────────────────────────────────────────────── */}
        <section>
          <h2 className="mb-2 text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
            Últimos 30 dias
          </h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <CardDeMedida rotulo="Conversão ponta a ponta" taxa={v.conversao.pontaAPonta} />
            <CardDeDuracao rotulo="Tempo até a 1ª resposta" d={v.primeiraResposta} />
            <Card
              rotulo="Comparecimento em demos"
              texto={
                v.comparecimento.medido
                  ? `${Math.round(v.comparecimento.taxa * 100)}% (${v.comparecimento.realizadas} de ${v.comparecimento.realizadas + v.comparecimento.naoCompareceram})`
                  : "sem demonstrações no período"
              }
            />
            <Card rotulo="Ganhos" valor={v.conversao.ganhos} />
            <Card rotulo="Perdidos" valor={v.conversao.perdidos} />
            <Card rotulo="Em nutrição" valor={v.conversao.emNutricao} nota="não é perda" />
            <CardDeReceita receita={v.receita} />
            <Card rotulo="Handoffs IA → gente" valor={v.iaVsHumano.handoffs} />
            <Card
              rotulo="Mensagens: IA / gente"
              texto={`${v.iaVsHumano.ia.atendimentos} / ${v.iaVsHumano.humano.atendimentos}`}
            />
          </div>
        </section>

        {/* ── POR QUE PERDEMOS ──────────────────────────────────────────── */}
        <section>
          <h2 className="mb-2 text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
            Por que perdemos
          </h2>

          {v.perdas.length === 0 ? (
            <p className="rounded-2xl border border-line bg-paper p-4 text-[13px] text-ink2">
              Nenhuma perda registrada no período.
            </p>
          ) : (
            <ul className="flex flex-col gap-1 rounded-2xl border border-line bg-paper p-3">
              {v.perdas.map((p) => (
                <li key={p.rotulo} className="flex items-baseline justify-between gap-3 text-[13px]">
                  {/* "sem motivo registrado" aparece como linha, e não é omitido:
                      se metade não tem motivo, a leitura certa é "não sabemos por
                      que perdemos metade". */}
                  <span className={p.grupo === null ? "italic text-muted" : "text-ink2"}>
                    {p.rotulo}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-ink">{p.total}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── O QUE MAIS FAZ A IA LARGAR ────────────────────────────────── */}
        {v.iaVsHumano.porMotivo.length > 0 && (
          <section>
            <h2 className="mb-2 text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
              O que mais faz a IA passar para gente
            </h2>
            <ul className="flex flex-col gap-1 rounded-2xl border border-line bg-paper p-3">
              {v.iaVsHumano.porMotivo.map((m) => (
                <li key={m.motivo} className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="text-ink2">{m.motivo.toLowerCase().replace(/_/g, " ")}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-ink">{m.total}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

function Card({
  rotulo,
  valor,
  texto,
  alerta,
  nota,
}: {
  rotulo: string;
  valor?: number;
  texto?: string;
  alerta?: boolean;
  nota?: string;
}) {
  return (
    <div
      className={cx(
        "rounded-2xl border p-3",
        alerta ? "border-red-200 bg-red-50" : "border-line bg-paper",
      )}
    >
      <p className="text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
        {rotulo}
      </p>
      <p
        className={cx(
          "mt-1 font-semibold tabular-nums",
          texto ? "text-[15px]" : "text-2xl",
          alerta ? "text-red-700" : "text-ink",
        )}
      >
        {texto ?? valor ?? 0}
      </p>
      {nota && <p className="mt-0.5 text-[11.5px] leading-snug text-muted">{nota}</p>}
    </div>
  );
}

/** Uma taxa, ou a recusa honesta de mostrá-la. */
function CardDeMedida({ rotulo, taxa }: { rotulo: string; taxa: Taxa }) {
  if (taxa.medido) {
    return <Card rotulo={rotulo} texto={`${Math.round(taxa.valor * 100)}% (de ${taxa.base})`} />;
  }
  return (
    <Card
      rotulo={rotulo}
      texto={taxa.motivo === "amostraPequena" ? `${taxa.base} — amostra pequena` : "sem dados"}
    />
  );
}

function CardDeDuracao({ rotulo, d }: { rotulo: string; d: Duracao }) {
  return (
    <Card
      rotulo={rotulo}
      texto={d.medido ? `${d.minutos} min (sobre ${d.base})` : "sem dados"}
    />
  );
}

/**
 * A receita, e o caso que parece defeito e não é.
 *
 * Propostas aceitas SEM valor cadastrado não viram R$ 0 — o CEO ainda não fechou
 * os valores dos planos. "R$ 0" ao lado de "8 aceitas" seria lido como sistema
 * quebrado, e com razão.
 */
function CardDeReceita({
  receita,
}: {
  receita: { medido: true; centavos: number; propostas: number } | { medido: false; motivo: string; propostas?: number };
}) {
  if (receita.medido) {
    return (
      <Card
        rotulo="Receita ganha (mensal)"
        texto={(receita.centavos / 100).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        })}
        nota={`${receita.propostas} proposta(s)`}
      />
    );
  }

  return (
    <Card
      rotulo="Receita ganha (mensal)"
      texto={receita.motivo === "semValores" ? "valor não cadastrado" : "sem propostas aceitas"}
      nota={
        receita.motivo === "semValores"
          ? `${receita.propostas} aceita(s), nenhuma com valor — os planos ainda não têm preço fechado`
          : undefined
      }
    />
  );
}

function cx(...p: Array<string | false | null | undefined>): string {
  return p.filter(Boolean).join(" ");
}
