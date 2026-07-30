"use client";

/**
 * FichaDoCliente — o cadastro de quem é aquele restaurante.
 *
 * A tela é um formulário, mas a parte que importa é o topo: o que FALTA.
 * Um cadastro que não grita o vazio vira o que já existia — uma tela bonita
 * onde ninguém repara que o Instagram nunca foi preenchido.
 */

import { useCallback, useEffect, useState } from "react";

interface Campo {
  chave: string; grupo: string; rotulo: string; porque: string;
  essencial: boolean; longo?: boolean;
}
interface Grupo { chave: string; titulo: string; subtitulo: string }
interface Pendencia { chave: string; rotulo: string; grupo: string; porque: string; essencial: boolean }
interface Avaliacao {
  completude: number; preenchidos: number; total: number;
  faltando: Pendencia[]; faltandoPorGrupo: Record<string, number>; veredito: string;
}
interface Restaurante {
  id: string; name: string; slug: string; isActive: boolean; plan: string; createdAt: string;
}

export function FichaDoCliente({ restaurantId }: { restaurantId: string }) {
  const [restaurante, setRestaurante] = useState<Restaurante | null>(null);
  const [campos, setCampos]           = useState<Campo[]>([]);
  const [grupos, setGrupos]           = useState<Grupo[]>([]);
  const [valores, setValores]         = useState<Record<string, string>>({});
  const [avaliacao, setAvaliacao]     = useState<Avaliacao | null>(null);
  const [carregando, setCarregando]   = useState(true);
  const [salvando, setSalvando]       = useState(false);
  const [msg, setMsg]                 = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [sujo, setSujo]               = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const r = await fetch(`/api/admin/restaurants/${restaurantId}/ficha`, { cache: "no-store" })
      .then((x) => x.json())
      .catch(() => ({ ok: false }));
    if (r?.ok) {
      setRestaurante(r.restaurante);
      setCampos(r.campos ?? []);
      setGrupos(r.grupos ?? []);
      setAvaliacao(r.avaliacao ?? null);
      const v: Record<string, string> = {};
      for (const [k, val] of Object.entries(r.cadastro ?? {})) v[k] = typeof val === "string" ? val : "";
      setValores(v);
      setSujo(false);
    } else {
      setMsg({ tipo: "erro", texto: r?.error ?? "Não consegui carregar a ficha." });
    }
    setCarregando(false);
  }, [restaurantId]);

  useEffect(() => { void carregar(); }, [carregar]);

  const salvar = async () => {
    setSalvando(true);
    setMsg(null);
    const r = await fetch(`/api/admin/restaurants/${restaurantId}/ficha`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(valores),
    }).then((x) => x.json()).catch(() => ({ ok: false }));
    setSalvando(false);
    if (r?.ok) {
      setAvaliacao(r.avaliacao ?? null);
      setSujo(false);
      setMsg({ tipo: "ok", texto: "Ficha salva." });
    } else {
      setMsg({ tipo: "erro", texto: r?.error ?? "Não consegui salvar." });
    }
  };

  const mudar = (chave: string, v: string) => {
    setValores((p) => ({ ...p, [chave]: v }));
    setSujo(true);
    setMsg(null);
  };

  if (carregando) return <p className="text-sm text-gray-500">Carregando a ficha…</p>;
  if (!restaurante) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {msg?.texto ?? "Ficha indisponível."}
      </div>
    );
  }

  // Um campo pode aparecer em dois grupos (razão social é identificação e fiscal).
  // Renderiza no primeiro para não pedir a mesma coisa duas vezes.
  const jaRenderizado = new Set<string>();

  return (
    <div className="space-y-4">
      {/* Cabeçalho do cliente */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900">{restaurante.name}</h1>
            <p className="mt-0.5 text-xs text-gray-500">
              /{restaurante.slug} · plano {restaurante.plan} ·{" "}
              {restaurante.isActive ? "ativo" : "inativo"} · cliente desde{" "}
              {new Date(restaurante.createdAt).toLocaleDateString("pt-BR")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void salvar()}
            disabled={salvando || !sujo}
            className="shrink-0 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-40"
          >
            {salvando ? "Salvando…" : sujo ? "Salvar ficha" : "Tudo salvo"}
          </button>
        </div>

        {msg && (
          <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${
            msg.tipo === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"
          }`}>
            {msg.texto}
          </p>
        )}
      </div>

      {/* O que falta — a razão de a ficha existir */}
      {avaliacao && (
        <div className={`rounded-xl border p-5 ${
          avaliacao.completude === 100 ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"
        }`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className={`text-sm font-bold ${avaliacao.completude === 100 ? "text-green-900" : "text-amber-900"}`}>
                {avaliacao.completude}% do essencial preenchido
              </p>
              <p className={`mt-0.5 text-xs ${avaliacao.completude === 100 ? "text-green-800" : "text-amber-800"}`}>
                {avaliacao.veredito}
              </p>
            </div>
            <span className="text-xs text-gray-600">
              {avaliacao.preenchidos}/{avaliacao.total} campos
            </span>
          </div>

          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/70">
            <div
              className={`h-full rounded-full transition-all ${avaliacao.completude === 100 ? "bg-green-500" : "bg-brand-500"}`}
              style={{ width: `${avaliacao.completude}%` }}
            />
          </div>

          {avaliacao.faltando.filter((p) => p.essencial).length > 0 && (
            <div className="mt-4 space-y-1.5">
              <p className="text-xs font-semibold text-amber-900">Perguntar ao cliente:</p>
              {avaliacao.faltando.filter((p) => p.essencial).map((p) => (
                <div key={p.chave} className="rounded-lg border border-amber-200 bg-white px-3 py-2">
                  <p className="text-sm font-semibold text-gray-900">{p.rotulo}</p>
                  <p className="text-xs text-gray-600">{p.porque}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Os grupos */}
      {grupos.map((g) => {
        const doGrupo = campos.filter((c) => c.grupo === g.chave && !jaRenderizado.has(c.chave));
        doGrupo.forEach((c) => jaRenderizado.add(c.chave));
        if (doGrupo.length === 0) return null;
        const faltam = avaliacao?.faltandoPorGrupo[g.chave] ?? 0;

        return (
          <section key={g.chave} className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-gray-900">{g.titulo}</h2>
                <p className="mt-0.5 text-xs text-gray-500">{g.subtitulo}</p>
              </div>
              {faltam > 0 && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                  {faltam} em branco
                </span>
              )}
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {doGrupo.map((c) => {
                const vazio = !(valores[c.chave] ?? "").trim();
                return (
                  <div key={c.chave} className={c.longo ? "sm:col-span-2" : ""}>
                    <label htmlFor={c.chave} className="block text-xs font-semibold text-gray-700">
                      {c.rotulo}
                      {c.essencial && <span className="ml-1 text-brand-600" title="essencial">•</span>}
                    </label>
                    {c.longo ? (
                      <textarea
                        id={c.chave}
                        rows={3}
                        value={valores[c.chave] ?? ""}
                        onChange={(e) => mudar(c.chave, e.target.value)}
                        className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm text-gray-900 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 ${
                          vazio && c.essencial ? "border-amber-300 bg-amber-50/40" : "border-gray-300"
                        }`}
                      />
                    ) : (
                      <input
                        id={c.chave}
                        type="text"
                        value={valores[c.chave] ?? ""}
                        onChange={(e) => mudar(c.chave, e.target.value)}
                        className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm text-gray-900 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 ${
                          vazio && c.essencial ? "border-amber-300 bg-amber-50/40" : "border-gray-300"
                        }`}
                      />
                    )}
                    {vazio && <p className="mt-1 text-[11px] text-gray-500">{c.porque}</p>}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* Salvar de novo no pé — a ficha é longa */}
      <div className="flex justify-end pb-2">
        <button
          type="button"
          onClick={() => void salvar()}
          disabled={salvando || !sujo}
          className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-40"
        >
          {salvando ? "Salvando…" : sujo ? "Salvar ficha" : "Tudo salvo"}
        </button>
      </div>
    </div>
  );
}
