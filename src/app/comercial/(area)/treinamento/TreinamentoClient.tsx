"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Cabecalho, Caixa, cx } from "../_pecas/Pecas";

type Eixo = "PRODUTO" | "VENDA_CONSULTIVA" | "SEGURANCA_E_MARCA";

interface Unidade {
  id: string;
  eixo: Eixo;
  titulo: string;
  resumo: string;
  conteudo: string[];
  fonte: string;
}

interface Trilha {
  eixo: Eixo;
  titulo: string;
  objetivo: string;
  publico: string;
  unidades: Unidade[];
}

interface Progresso {
  unidadesConcluidas: string[];
  porEixo: Record<Eixo, {
    concluidas: number;
    total: number;
    percentual: number;
    ultimaAvaliacao: { nota: number; acertos: number; total: number; criadaEm: string } | null;
    nivel: string;
  }>;
}

interface Pessoa {
  id: string;
  nome: string;
  tipo: "Humano" | "Agente de IA";
  notaGeral: number | null;
  nivel: string;
  concluidas: number;
  eixosAvaliados: Array<{ eixo: Eixo; nota: number; origem: string; criadaEm: string }>;
}

interface Dados {
  catalogo: Trilha[];
  progresso: Progresso;
  equipe: Pessoa[] | null;
  podeVerEquipe: boolean;
}

interface Questao {
  id: string;
  eixo: Eixo;
  enunciado: string;
  opcoes: Array<{ id: string; texto: string }>;
}

const ROTA = "/api/admin/sala-de-vendas/treinamento";

const NOME_DO_EIXO: Record<Eixo, string> = {
  PRODUTO: "Produto",
  VENDA_CONSULTIVA: "Venda consultiva",
  SEGURANCA_E_MARCA: "Segurança e marca",
};

const TOM_DO_EIXO: Record<Eixo, string> = {
  PRODUTO: "bg-blue-500",
  VENDA_CONSULTIVA: "bg-emerald-500",
  SEGURANCA_E_MARCA: "bg-amber-500",
};

function Barra({ valor, eixo }: { valor: number; eixo: Eixo }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-canvas" aria-label={`${valor}% concluído`}>
      <div className={cx("h-full rounded-full transition-all", TOM_DO_EIXO[eixo])} style={{ width: `${valor}%` }} />
    </div>
  );
}

function Nivel({ nome }: { nome: string }) {
  const forte = nome === "Especialista" || nome === "Proficiente";
  return (
    <span className={cx(
      "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
      forte ? "bg-emerald-50 text-emerald-800" : "bg-canvas text-ink2",
    )}>{nome}</span>
  );
}

export function TreinamentoClient() {
  const [fase, setFase] = useState<"carregando" | "pronto" | "erro">("carregando");
  const [dados, setDados] = useState<Dados | null>(null);
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const [aba, setAba] = useState<"trilhas" | "equipe">("trilhas");
  const [eixoAberto, setEixoAberto] = useState<Eixo>("PRODUTO");
  const [unidadeAberta, setUnidadeAberta] = useState<string | null>(null);
  const [questoes, setQuestoes] = useState<Questao[] | null>(null);
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [resultado, setResultado] = useState<{ nota: number; acertos: number; total: number; nivel: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    setFase("carregando");
    setDetalhe(null);
    try {
      const res = await fetch(ROTA, { cache: "no-store" });
      const corpo = await res.json().catch(() => null) as { data?: Dados; error?: string } | null;
      if (!res.ok || !corpo?.data) throw new Error(corpo?.error ?? `Servidor respondeu ${res.status}`);
      setDados(corpo.data);
      setFase("pronto");
    } catch (e) {
      setDetalhe(e instanceof Error ? e.message : "Falha de rede.");
      setFase("erro");
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  const trilha = useMemo(() => dados?.catalogo.find((t) => t.eixo === eixoAberto) ?? null, [dados, eixoAberto]);
  const concluidas = useMemo(() => new Set(dados?.progresso.unidadesConcluidas ?? []), [dados]);

  async function postar(corpo: object) {
    const res = await fetch(ROTA, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const json = await res.json().catch(() => null) as { data?: unknown; error?: string } | null;
    if (!res.ok) throw new Error(json?.error ?? `Servidor respondeu ${res.status}`);
    return json?.data;
  }

  async function concluir(unidade: Unidade) {
    setOcupado(true);
    try {
      await postar({ acao: "concluir-unidade", eixo: unidade.eixo, unidadeId: unidade.id });
      await carregar();
    } catch (e) {
      setDetalhe(e instanceof Error ? e.message : "Não foi possível registrar o progresso.");
    } finally {
      setOcupado(false);
    }
  }

  async function abrirProva() {
    setOcupado(true);
    setResultado(null);
    setRespostas({});
    try {
      const data = await postar({ acao: "abrir-prova", eixo: eixoAberto }) as { questoes: Questao[] };
      setQuestoes(data.questoes);
    } catch (e) {
      setDetalhe(e instanceof Error ? e.message : "Não foi possível abrir a prova.");
    } finally {
      setOcupado(false);
    }
  }

  async function enviarProva() {
    if (!questoes) return;
    setOcupado(true);
    try {
      const data = await postar({
        acao: "enviar-prova",
        eixo: eixoAberto,
        respostas: questoes.map((q) => ({ questaoId: q.id, opcaoId: respostas[q.id] })),
      }) as { nota: number; acertos: number; total: number; nivel: string };
      setResultado(data);
      await carregar();
    } catch (e) {
      setDetalhe(e instanceof Error ? e.message : "Não foi possível corrigir a prova.");
    } finally {
      setOcupado(false);
    }
  }

  if (fase === "carregando") return <Caixa>Carregando trilhas, progresso e avaliações…</Caixa>;
  if (fase === "erro" || !dados) {
    return <Caixa><strong>O Centro de Treinamento não abriu.</strong> {detalhe}<button onClick={() => void carregar()} className="ml-2 font-semibold text-accent">Tentar de novo</button></Caixa>;
  }

  return (
    <main className="space-y-5">
      <Cabecalho
        titulo="Centro de Treinamento Comercial"
        subtitulo="A mesma verdade do produto e a mesma régua de atendimento para vendedores humanos e agentes de IA."
      />

      <div className="flex gap-1 rounded-xl border border-line bg-paper p-1" role="tablist" aria-label="Áreas do treinamento">
        <button onClick={() => setAba("trilhas")} className={cx("rounded-lg px-4 py-2 text-[13px] font-semibold", aba === "trilhas" ? "bg-canvas text-ink" : "text-muted")}>Trilhas e provas</button>
        {dados.podeVerEquipe ? <button onClick={() => setAba("equipe")} className={cx("rounded-lg px-4 py-2 text-[13px] font-semibold", aba === "equipe" ? "bg-canvas text-ink" : "text-muted")}>Inteligência do time</button> : null}
      </div>

      {detalhe ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12.5px] text-amber-950">{detalhe}</p> : null}

      {aba === "trilhas" ? (
        <>
          <section className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {dados.catalogo.map((t) => {
              const p = dados.progresso.porEixo[t.eixo];
              return (
                <button key={t.eixo} onClick={() => { setEixoAberto(t.eixo); setQuestoes(null); setResultado(null); }} className={cx("rounded-2xl border bg-paper p-4 text-left transition-colors", eixoAberto === t.eixo ? "border-accent" : "border-line hover:bg-canvas") }>
                  <div className="flex items-start justify-between gap-2"><h2 className="text-[15px] font-semibold text-ink">{t.titulo}</h2><Nivel nome={p.nivel} /></div>
                  <p className="mt-2 min-h-10 text-[12px] leading-relaxed text-muted">{t.objetivo}</p>
                  <div className="mt-3"><Barra valor={p.percentual} eixo={t.eixo} /></div>
                  <p className="mt-1.5 text-[11.5px] text-muted">{p.concluidas}/{p.total} unidades · {p.ultimaAvaliacao ? `última nota ${p.ultimaAvaliacao.nota}` : "ainda sem prova"}</p>
                </button>
              );
            })}
          </section>

          {trilha ? (
            <section className="rounded-2xl border border-line bg-paper">
              <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="text-[11px] font-semibold uppercase tracking-[.08em] text-muted">Trilha ativa</p><h2 className="mt-0.5 text-[17px] font-semibold text-ink">{trilha.titulo}</h2><p className="text-[12px] text-muted">{trilha.publico}</p></div>
                <button disabled={ocupado} onClick={() => void abrirProva()} className="rounded-lg bg-accent px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50">Fazer prova desta trilha</button>
              </div>
              <div className="divide-y divide-line">
                {trilha.unidades.map((u, indice) => {
                  const feita = concluidas.has(u.id);
                  const aberta = unidadeAberta === u.id;
                  return (
                    <article key={u.id} className="p-4">
                      <button onClick={() => setUnidadeAberta(aberta ? null : u.id)} className="flex w-full items-start gap-3 text-left">
                        <span className={cx("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold", feita ? "bg-emerald-100 text-emerald-800" : "bg-canvas text-muted")}>{feita ? "✓" : indice + 1}</span>
                        <span className="min-w-0 flex-1"><span className="block text-[13.5px] font-semibold text-ink">{u.titulo}</span><span className="mt-0.5 block text-[12px] leading-relaxed text-muted">{u.resumo}</span></span>
                        <span className="text-muted" aria-hidden>{aberta ? "−" : "+"}</span>
                      </button>
                      {aberta ? <div className="ml-9 mt-3 rounded-xl bg-canvas p-4"><ul className="space-y-2 text-[12.5px] leading-relaxed text-ink2">{u.conteudo.map((linha, i) => <li key={i}>{linha}</li>)}</ul><div className="mt-4 flex items-center justify-between gap-3"><span className="text-[11px] text-muted">Fonte: {u.fonte}</span><button disabled={ocupado || feita} onClick={() => void concluir(u)} className="rounded-lg border border-line bg-paper px-3 py-1.5 text-[12px] font-semibold text-ink disabled:opacity-50">{feita ? "Concluída" : "Marcar como concluída"}</button></div></div> : null}
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}

          {questoes ? (
            <section className="rounded-2xl border border-line bg-paper p-4">
              <div className="flex items-start justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-[.08em] text-muted">Avaliação</p><h2 className="text-[16px] font-semibold text-ink">{NOME_DO_EIXO[eixoAberto]}</h2></div><button onClick={() => setQuestoes(null)} className="text-[12px] text-muted">Fechar</button></div>
              <div className="mt-4 space-y-5">
                {questoes.map((q, indice) => <fieldset key={q.id}><legend className="text-[13px] font-semibold text-ink">{indice + 1}. {q.enunciado}</legend><div className="mt-2 grid gap-2">{q.opcoes.map((opcao) => <label key={opcao.id} className="flex cursor-pointer gap-2 rounded-xl border border-line p-3 text-[12.5px] text-ink2 hover:bg-canvas"><input type="radio" name={q.id} checked={respostas[q.id] === opcao.id} onChange={() => setRespostas((r) => ({ ...r, [q.id]: opcao.id }))} />{opcao.texto}</label>)}</div></fieldset>)}
              </div>
              {resultado ? <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-[13px] text-emerald-900"><strong>{resultado.nota}/100 · {resultado.nivel}</strong> — {resultado.acertos} de {resultado.total} respostas corretas.</p> : <button disabled={ocupado || Object.keys(respostas).length !== questoes.length} onClick={() => void enviarProva()} className="mt-5 rounded-lg bg-accent px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50">Corrigir minha prova</button>}
            </section>
          ) : null}
        </>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-line bg-paper">
          <div className="border-b border-line p-4"><h2 className="text-[16px] font-semibold text-ink">Inteligência de produto e atendimento</h2><p className="mt-0.5 text-[12px] text-muted">Nota com origem e data. “Não avaliado” nunca vira zero.</p></div>
          {dados.equipe && dados.equipe.length > 0 ? <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left"><thead className="bg-canvas text-[11px] uppercase tracking-[.04em] text-muted"><tr><th className="px-4 py-3">Pessoa ou agente</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Nível</th><th className="px-4 py-3">Nota geral</th><th className="px-4 py-3">Eixos avaliados</th></tr></thead><tbody className="divide-y divide-line">{dados.equipe.map((p) => <tr key={p.id} className="text-[12.5px]"><td className="px-4 py-3 font-semibold text-ink">{p.nome}</td><td className="px-4 py-3 text-ink2">{p.tipo}</td><td className="px-4 py-3"><Nivel nome={p.nivel} /></td><td className="px-4 py-3 tabular-nums text-ink">{p.notaGeral === null ? "Não avaliado" : `${p.notaGeral}/100`}</td><td className="px-4 py-3 text-muted">{p.eixosAvaliados.length}/3</td></tr>)}</tbody></table></div> : <div className="p-4 text-[13px] text-muted">Nenhuma pessoa ou agente comercial foi encontrado.</div>}
        </section>
      )}
    </main>
  );
}
