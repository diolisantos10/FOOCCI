"use client";

/**
 * A TELA EM QUE O CEO TROCA A META DO MÊS.
 *
 * ── O QUE ELA MOSTRA, E O QUE ELA SE RECUSA A MOSTRAR ───────────────────────
 *
 * Mostra a meta da competência aberta, quem a definiu por último e quando, e o
 * histórico das trocas. Mês sem meta aparece escrito **"sem meta cadastrada"** —
 * nunca R$ 0,00. Os dois estados pedem trabalho oposto: um é decidir, o outro
 * seria "decidimos que não se espera nada".
 *
 * ⛔ Não há, e não pode passar a haver, campo de **previsão**. Meta é o número
 * que o CEO digita; previsão seria conta nossa sobre o futuro, e ela sairia
 * daqui parecendo medição.
 */

import { useCallback, useEffect, useState } from "react";
import { Secao } from "../_pecas/Pecas";

interface Meta {
  definida: boolean;
  competencia: string;
  centavos?: number;
  definidoPorNome?: string;
  atualizadoEm?: string;
}

interface Troca {
  id: string;
  competencia: string;
  valorAnteriorCentavos: number | null;
  valorNovoCentavos: number;
  alteradoPorNome: string;
  motivo: string | null;
  alteradoEm: string;
}

interface Cadastrada {
  competencia: string;
  valorCentavos: number;
  definidoPorNome: string;
  atualizadoEm: string;
}

interface Dados {
  competencia: string;
  meta: Meta;
  historico: Troca[];
  cadastradas: Cadastrada[];
  podeMudar: boolean;
}

type Estado =
  | { fase: "carregando" }
  | { fase: "pronto"; d: Dados }
  | { fase: "semAcesso" }
  | { fase: "erro"; detalhe: string | null };

function emReais(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function mesPorExtenso(competencia: string): string {
  const [ano, mes] = competencia.split("-");
  const nomes = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];
  const i = Number(mes) - 1;
  return `${nomes[i] ?? mes} de ${ano}`;
}

function quando(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("pt-BR");
}

function competenciaDeHoje(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function MetaDeReceitaClient() {
  const [competencia, setCompetencia] = useState(competenciaDeHoje);
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [recado, setRecado] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);

  const buscar = useCallback(async (comp: string) => {
    setEstado({ fase: "carregando" });
    try {
      const r = await fetch(
        `/api/admin/sala-de-vendas/meta-de-receita?competencia=${encodeURIComponent(comp)}`,
        { cache: "no-store" },
      );
      if (r.status === 401 || r.status === 403) {
        setEstado({ fase: "semAcesso" });
        return;
      }
      const j = (await r.json()) as { ok: boolean; data?: Dados; error?: string };
      if (!j.ok || !j.data) {
        setEstado({ fase: "erro", detalhe: j.error ?? null });
        return;
      }
      setEstado({ fase: "pronto", d: j.data });
      setValor(j.data.meta.definida && j.data.meta.centavos ? String(j.data.meta.centavos / 100) : "");
    } catch (e) {
      setEstado({ fase: "erro", detalhe: e instanceof Error ? e.message : null });
    }
  }, []);

  useEffect(() => {
    void buscar(competencia);
  }, [buscar, competencia]);

  async function salvar() {
    const reais = Number(valor.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(reais) || reais <= 0) {
      setRecado({ tom: "erro", texto: "Digite a meta em reais, maior que zero." });
      return;
    }
    setSalvando(true);
    setRecado(null);
    try {
      const r = await fetch("/api/admin/sala-de-vendas/meta-de-receita", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          competencia,
          valorCentavos: Math.round(reais * 100),
          motivo: motivo.trim() || undefined,
        }),
      });
      const j = (await r.json()) as { ok: boolean; error?: string };
      if (!j.ok) {
        setRecado({ tom: "erro", texto: j.error ?? "Não deu para gravar." });
        return;
      }
      setMotivo("");
      setRecado({
        tom: "ok",
        texto: `Meta de ${mesPorExtenso(competencia)} gravada em ${emReais(Math.round(reais * 100))}.`,
      });
      await buscar(competencia);
    } catch (e) {
      setRecado({ tom: "erro", texto: e instanceof Error ? e.message : "Falhou." });
    } finally {
      setSalvando(false);
    }
  }

  if (estado.fase === "carregando") {
    return <p className="text-[13px] text-muted">Carregando a meta…</p>;
  }

  if (estado.fase === "semAcesso") {
    return (
      <p className="max-w-[70ch] rounded-2xl border border-line bg-paper p-4 text-[13.5px] leading-relaxed text-ink2">
        A meta de receita é do CEO, do Diretor, da gerência e da auditoria. A
        recusa vem do servidor, não desta tela.
      </p>
    );
  }

  if (estado.fase === "erro") {
    return (
      <p className="rounded-2xl border border-line bg-paper p-4 text-[13.5px] text-ink2">
        Não deu para ler a meta agora. {estado.detalhe ?? ""}
      </p>
    );
  }

  const d = estado.d;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-[20px] font-semibold text-ink">Meta de receita</h1>
        <p className="mt-1 max-w-[75ch] text-[13px] leading-relaxed text-muted">
          Um valor <strong>por mês</strong>. Trocar a meta de outubro não mexe no
          que setembro cobrava — cada competência guarda a própria decisão, com
          quem a tomou. Aqui não existe previsão de receita: meta é o número que
          o CEO digita.
        </p>
      </header>

      <Secao titulo="O mês">
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-paper p-4">
          <label className="flex flex-col gap-1">
            <span className="text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
              Competência
            </span>
            <input
              type="month"
              value={competencia}
              onChange={(e) => e.target.value && setCompetencia(e.target.value)}
              aria-label="Competência da meta"
              className="rounded-xl border border-line bg-canvas px-3 py-2 text-[14px] text-ink outline-none"
            />
          </label>

          <div className="min-w-[14rem]">
            <p className="text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
              Meta de {mesPorExtenso(d.competencia)}
            </p>
            {d.meta.definida && typeof d.meta.centavos === "number" ? (
              <>
                <p className="text-[22px] font-semibold tabular-nums text-ink">
                  {emReais(d.meta.centavos)}
                </p>
                <p className="text-[12px] leading-snug text-muted">
                  Última troca por <strong>{d.meta.definidoPorNome}</strong>
                  {d.meta.atualizadoEm ? ` em ${quando(d.meta.atualizadoEm)}` : ""}.
                </p>
              </>
            ) : (
              /* ⛔ Mês sem meta NÃO é mês com meta zero. */
              <>
                <p className="text-[15px] font-medium italic text-muted">sem meta cadastrada</p>
                <p className="text-[12px] leading-snug text-muted">
                  Ninguém decidiu a meta deste mês. Enquanto for assim, o Painel
                  não mostra porcentagem nenhuma — e não mostra 0%, que diria que
                  a meta existe e não foi atingida.
                </p>
              </>
            )}
          </div>
        </div>
      </Secao>

      <Secao
        titulo="Trocar a meta"
        descricao="A cifra vale para a competência escolhida acima, e só para ela."
      >
        {!d.podeMudar ? (
          <p className="rounded-2xl border border-line bg-paper p-4 text-[13.5px] leading-relaxed text-ink2">
            Você <strong>lê</strong> a meta, e não a muda. Definir a cifra contra
            a qual o time inteiro é medido é do CEO e do Diretor Foocci — quem
            recusa é o servidor, não esta tela.
          </p>
        ) : (
          <div className="flex flex-col gap-3 rounded-2xl border border-line bg-paper p-4">
            <label className="flex flex-col gap-1">
              <span className="text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
                Meta em reais
              </span>
              <input
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                inputMode="decimal"
                placeholder="100000"
                aria-label="Meta em reais"
                className="rounded-xl border border-line bg-canvas px-3 py-2 text-[15px] tabular-nums text-ink outline-none"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
                Por quê (opcional, e fica na trilha)
              </span>
              <input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="ex.: entrada do time novo"
                aria-label="Motivo da troca"
                className="rounded-xl border border-line bg-canvas px-3 py-2 text-[13.5px] text-ink outline-none"
              />
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void salvar()}
                disabled={salvando}
                className="rounded-xl bg-ink px-4 py-2 text-[13.5px] font-semibold text-paper disabled:opacity-50"
              >
                {salvando ? "Gravando…" : `Gravar a meta de ${mesPorExtenso(d.competencia)}`}
              </button>
              {recado ? (
                <span
                  className={`text-[12.5px] ${recado.tom === "ok" ? "text-emerald-600" : "text-red-600"}`}
                >
                  {recado.texto}
                </span>
              ) : null}
            </div>
          </div>
        )}
      </Secao>

      <Secao titulo="Metas cadastradas">
        {d.cadastradas.length === 0 ? (
          <p className="rounded-2xl border border-line bg-paper p-4 text-[13px] text-muted">
            Nenhuma competência tem meta ainda.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {d.cadastradas.map((m) => (
              <li
                key={m.competencia}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-line bg-paper px-3 py-2"
              >
                <span className="text-[13px] text-ink">{mesPorExtenso(m.competencia)}</span>
                <span className="text-[13.5px] font-semibold tabular-nums text-ink">
                  {emReais(m.valorCentavos)}
                </span>
                <span className="w-full text-[11.5px] text-muted sm:w-auto">
                  {m.definidoPorNome} · {quando(m.atualizadoEm)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <Secao titulo="Quem mexeu, e quando">
        {d.historico.length === 0 ? (
          <p className="rounded-2xl border border-line bg-paper p-4 text-[13px] text-muted">
            Nenhuma troca registrada.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {d.historico.map((t) => (
              <li key={t.id} className="rounded-xl border border-line bg-paper px-3 py-2">
                <p className="text-[13px] text-ink">
                  {mesPorExtenso(t.competencia)}:{" "}
                  {t.valorAnteriorCentavos === null
                    ? `primeira meta, ${emReais(t.valorNovoCentavos)}`
                    : `${emReais(t.valorAnteriorCentavos)} → ${emReais(t.valorNovoCentavos)}`}
                </p>
                <p className="text-[11.5px] text-muted">
                  {t.alteradoPorNome} · {quando(t.alteradoEm)}
                  {t.motivo ? ` · ${t.motivo}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Secao>
    </div>
  );
}
