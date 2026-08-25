"use client";

/**
 * OS NOVE AGENTES COMERCIAIS — ficha e desempenho na mesma tela.
 *
 * ── POR QUE OS DOIS JUNTOS ──────────────────────────────────────────────────
 *
 * A ficha sozinha é um documento: diz o que a função pode e não pode, e envelhece
 * sem ninguém perceber. O desempenho sozinho é um número sem régua: "8 handoffs"
 * não diz se é muito.
 *
 * Juntos eles se cobram. A ficha diz **"mede-se por: taxa e motivo de handoff"**,
 * e o número ao lado responde. Quando o número não existe, a tela diz por quê — e
 * "o agente está desligado" é uma resposta melhor que um zero.
 *
 * ── O QUE ESTA TELA NÃO FAZ ─────────────────────────────────────────────────
 *
 * Não liga, não desliga, não edita. Não há botão que salve nada — ligar um agente
 * é decisão do proprietário, uma por uma, com gate, e um botão aqui seria o
 * atalho que contorna isso. Botão que não deveria existir é pior que botão que
 * não funciona.
 */

import { useEffect, useState } from "react";

type Medida =
  | { medido: true; valor: number; nota?: string }
  | { medido: false; motivo: string };

interface Agente {
  numero: string;
  slug: string;
  nome: string;
  modo: "IA" | "HUMANO" | "HIBRIDO";
  resumo: string | null;
  pode: string[];
  naoPode: string[];
  escalaQuando: string[];
  medeSePor: string[];
  regraDura: string[];
  cadastrada: boolean;
  status: string | null;
  ligada: boolean;
  pessoas: number;
  desempenho: {
    mensagens: Medida;
    handoffs: Medida;
    qa: Medida;
    leadsAgora: Medida;
  };
}

interface Resumo {
  total: number;
  deIA: number;
  humanos: number;
  hibridos: number;
  cadastradas: number;
  ligadas: number;
  ocupados: number;
}

type Estado =
  | { fase: "carregando" }
  | { fase: "pronto"; agentes: Agente[]; resumo: Resumo }
  | { fase: "semAcesso" }
  | { fase: "erro"; detalhe: string | null };

const COR_MODO: Record<string, string> = {
  IA: "border-violet-200 bg-violet-50 text-violet-700",
  HUMANO: "border-sky-200 bg-sky-50 text-sky-700",
  HIBRIDO: "border-teal-200 bg-teal-50 text-teal-700",
};

const ROTULO_MODO: Record<string, string> = {
  IA: "IA",
  HUMANO: "humano",
  HIBRIDO: "híbrido",
};

export function AgentesClient() {
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });
  const [aberto, setAberto] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;

    (async () => {
      try {
        const r = await fetch("/api/admin/sala-de-vendas/agentes", { cache: "no-store" });
        if (!vivo) return;

        if (r.status === 401 || r.status === 403) {
          setEstado({ fase: "semAcesso" });
          return;
        }

        const j = (await r.json()) as {
          ok: boolean;
          data?: { agentes: Agente[]; resumo: Resumo };
          error?: string;
        };
        if (!vivo) return;

        if (!j.ok || !j.data) {
          setEstado({ fase: "erro", detalhe: j.error ?? null });
          return;
        }

        setEstado({ fase: "pronto", agentes: j.data.agentes, resumo: j.data.resumo });
      } catch (e) {
        if (vivo) setEstado({ fase: "erro", detalhe: e instanceof Error ? e.message : null });
      }
    })();

    return () => { vivo = false; };
  }, []);

  if (estado.fase === "carregando") {
    return <p className="p-6 text-[13px] text-muted">Carregando as fichas…</p>;
  }

  if (estado.fase === "semAcesso") {
    return (
      <p className="max-w-[70ch] p-6 text-[13.5px] leading-relaxed text-ink2">
        Sem acesso. É preciso um login interno para ver as fichas.
      </p>
    );
  }

  if (estado.fase === "erro") {
    return (
      <p className="max-w-[70ch] p-6 text-[13.5px] leading-relaxed text-ink2">
        {estado.detalhe ?? "Não foi possível carregar as fichas."}
      </p>
    );
  }

  const { agentes, resumo } = estado;

  return (
    <div className="min-h-full bg-canvas px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-5">
          <h1 className="text-2xl font-semibold tracking-[-.02em] text-ink">
            Agentes comerciais
          </h1>
          <p className="mt-1 max-w-[68ch] text-[13.5px] leading-relaxed text-muted">
            As nove fichas de Vendas, com o que cada função pode, o que ela não pode,
            e como ela está indo. <strong>A ficha é um cargo, não uma pessoa</strong> —
            o desempenho é sempre do cargo inteiro.
          </p>
        </header>

        {/* O estado geral, e ele é o que mais importa hoje. */}
        <section className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Numero valor={resumo.total} rotulo="fichas" />
          <Numero valor={resumo.cadastradas} rotulo="no banco" />
          <Numero
            valor={resumo.ligadas}
            rotulo="ligadas"
            nota={resumo.ligadas === 0 ? "nenhuma IA opera" : undefined}
          />
          <Numero
            valor={resumo.ocupados}
            rotulo="cargos ocupados"
            nota={resumo.ocupados === 0 ? "todos vagos" : undefined}
          />
        </section>

        <ul className="flex flex-col gap-2">
          {agentes.map((a) => (
            <CartaoDoAgente
              key={a.slug}
              agente={a}
              aberto={aberto === a.slug}
              aoAlternar={() => setAberto(aberto === a.slug ? null : a.slug)}
            />
          ))}
        </ul>

        <p className="mt-5 max-w-[68ch] text-[12.5px] leading-relaxed text-muted">
          Esta tela não liga nem desliga agente. Ligar cada um é decisão do
          proprietário, uma por vez, com evidência — um botão aqui seria o atalho
          que contorna isso.
        </p>
      </div>
    </div>
  );
}

function Numero({ valor, rotulo, nota }: { valor: number; rotulo: string; nota?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-paper p-3">
      <p className="text-2xl font-semibold tabular-nums text-ink">{valor}</p>
      <p className="text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
        {rotulo}
      </p>
      {nota && <p className="mt-0.5 text-[11.5px] leading-snug text-muted">{nota}</p>}
    </div>
  );
}

function CartaoDoAgente({
  agente,
  aberto,
  aoAlternar,
}: {
  agente: Agente;
  aberto: boolean;
  aoAlternar: () => void;
}) {
  const a = agente;

  return (
    <li className="overflow-hidden rounded-2xl border border-line bg-paper">
      <button
        onClick={aoAlternar}
        aria-expanded={aberto}
        className="flex w-full items-start justify-between gap-3 p-4 text-left transition-colors hover:bg-canvas"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11.5px] font-semibold tabular-nums text-muted">
              {a.numero}
            </span>
            <h2 className="text-[15.5px] font-semibold text-ink">{a.nome}</h2>
            <Etiqueta texto={ROTULO_MODO[a.modo] ?? a.modo} tom={COR_MODO[a.modo]} />
            {a.modo !== "HUMANO" && (
              <Etiqueta
                texto={a.ligada ? "ligado" : "desligado"}
                tom={
                  a.ligada
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-line2 bg-chip text-muted"
                }
              />
            )}
            {a.modo !== "IA" && (
              <Etiqueta
                texto={a.pessoas === 0 ? "cargo vago" : `${a.pessoas} pessoa(s)`}
                tom={
                  a.pessoas === 0
                    ? "border-line2 bg-chip text-muted"
                    : "border-sky-200 bg-sky-50 text-sky-700"
                }
              />
            )}
          </div>

          {a.resumo && (
            <p className="mt-1 max-w-[62ch] text-[13px] leading-relaxed text-ink2">
              {a.resumo}
            </p>
          )}
        </div>

        <span className="shrink-0 pt-1 text-[13px] text-muted">{aberto ? "−" : "+"}</span>
      </button>

      {aberto && (
        <div className="border-t border-line px-4 pb-4 pt-3">
          <Desempenho agente={a} />

          <Lista titulo="Pode" itens={a.pode} />
          <Lista titulo="Não pode" itens={a.naoPode} tom="text-red-800" />
          <Lista titulo="Escala quando" itens={a.escalaQuando} />
          <Lista titulo="Mede-se por" itens={a.medeSePor} />
          {a.regraDura.length > 0 && (
            <Lista titulo="Regra dura" itens={a.regraDura} tom="text-ink" destaque />
          )}
        </div>
      )}
    </li>
  );
}

/**
 * O desempenho, e o cuidado que ele exige.
 *
 * Cada número que não existe é escrito com o MOTIVO de não existir. "Sem dados"
 * sozinho parece defeito do sistema; "o agente está desligado" é uma informação
 * que o leitor consegue usar.
 */
function Desempenho({ agente }: { agente: Agente }) {
  const d = agente.desempenho;

  const linhas: Array<{ rotulo: string; m: Medida }> = [
    { rotulo: "Mensagens escritas", m: d.mensagens },
    { rotulo: "Conversas passadas adiante", m: d.handoffs },
    { rotulo: "Nota de QA", m: d.qa },
  ];

  if (agente.modo !== "IA") {
    linhas.push({ rotulo: "Leads sob responsabilidade agora", m: d.leadsAgora });
  }

  return (
    <section className="mb-4 rounded-xl border border-line bg-canvas p-3">
      <h3 className="mb-2 text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
        Desempenho · últimos 30 dias
      </h3>

      <dl className="flex flex-col gap-1.5">
        {linhas.map((l) => (
          <div key={l.rotulo} className="flex items-baseline justify-between gap-3">
            <dt className="text-[13px] text-ink2">{l.rotulo}</dt>
            <dd className="shrink-0 text-right">
              {l.m.medido ? (
                <>
                  <span className="text-[15px] font-semibold tabular-nums text-ink">
                    {l.m.valor}
                  </span>
                  {l.m.nota && (
                    <span className="ml-1.5 text-[11.5px] text-muted">{l.m.nota}</span>
                  )}
                </>
              ) : (
                <span className="text-[12.5px] italic text-muted">{l.m.motivo}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Lista({
  titulo,
  itens,
  tom,
  destaque,
}: {
  titulo: string;
  itens: string[];
  tom?: string;
  destaque?: boolean;
}) {
  if (itens.length === 0) return null;

  return (
    <section className="mb-3">
      <h3 className="mb-1 text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
        {titulo}
      </h3>
      <ul
        className={
          destaque
            ? "rounded-xl border border-amber-200 bg-amber-50 px-3 py-2"
            : undefined
        }
      >
        {itens.map((i, n) => (
          <li
            key={n}
            className={`flex gap-2 py-0.5 text-[13px] leading-relaxed ${tom ?? "text-ink2"}`}
          >
            <span className="shrink-0 text-muted">·</span>
            <span>{i}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Etiqueta({ texto, tom }: { texto: string; tom?: string }) {
  return (
    <span
      className={`rounded-full border px-1.5 py-0.5 text-[11px] font-semibold ${
        tom ?? "border-line2 bg-chip text-ink2"
      }`}
    >
      {texto}
    </span>
  );
}
