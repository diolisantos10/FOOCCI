"use client";

/**
 * UpsellCategoriesPicker — o lojista escolhe QUAIS categorias do cardápio dele o
 * Garçom oferece no fechamento do pedido, e em QUE ORDEM.
 *
 * Por que esta tela existe: a sequência era constante no código ("bebida" →
 * "sobremesa"). Uma padaria não tem sobremesa — tem Confeitaria — e o upsell
 * simplesmente não acontecia. Sem esta tela a configuração existiria só no banco,
 * e uma configuração que o dono do restaurante não consegue mexer não é
 * configuração: é outra constante, só que escondida.
 *
 * Três estados obrigatórios (DESIGN.md §6.1):
 *   carregando → esqueleto
 *   vazio      → cardápio sem categoria: diz o que fazer, com link
 *   erro       → falha ao ler o cardápio, com botão de tentar de novo
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface MenuCategoryLite { id: string; name: string }

const MAX_CATEGORIES = 5;

export function UpsellCategoriesPicker({
  value,
  onChange,
}: {
  value:    string[];
  onChange: (next: string[]) => void;
}) {
  const [categories, setCategories] = useState<MenuCategoryLite[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/menu/categories")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("http"))))
      .then((json) => {
        const rows = Array.isArray(json?.data) ? json.data : [];
        setCategories(
          rows
            .map((c: { id?: string; name?: string }) => ({ id: c.id ?? "", name: c.name ?? "" }))
            .filter((c: MenuCategoryLite) => c.id && c.name),
        );
      })
      .catch(() => setError("Não foi possível carregar as categorias do cardápio."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const selected  = value ?? [];
  const available = categories.filter((c) => !selected.includes(c.name));

  function add(name: string) {
    if (selected.includes(name) || selected.length >= MAX_CATEGORIES) return;
    onChange([...selected, name]);
  }
  function remove(name: string) {
    onChange(selected.filter((c) => c !== name));
  }
  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= selected.length) return;
    const next = [...selected];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item!);
    onChange(next);
  }

  // ── Estado: carregando ────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-2" aria-busy="true">
        <div className="h-10 animate-pulse rounded-xl bg-canvas" />
        <div className="h-10 animate-pulse rounded-xl bg-canvas" />
        <p className="text-xs text-muted">Carregando as categorias do seu cardápio…</p>
      </div>
    );
  }

  // ── Estado: erro ──────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="rounded-xl border border-line2 bg-canvas p-4">
        <p className="text-sm text-ink">{error}</p>
        <p className="mt-1 text-xs text-muted">
          Enquanto isso o Garçom segue com o comportamento padrão — nada foi desligado.
        </p>
        <button
          type="button"
          onClick={load}
          className="mt-3 rounded-xl border border-line2 px-3 py-1.5 text-xs font-semibold text-ink hover:bg-paper"
        >
          Tentar de novo
        </button>
      </div>
    );
  }

  // ── Estado: vazio (cardápio sem categoria) ────────────────────────────────
  if (categories.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line2 bg-canvas p-5 text-center">
        <p className="text-sm font-semibold text-ink">Seu cardápio ainda não tem categorias</p>
        <p className="mt-1 text-xs text-muted">
          Crie as categorias do cardápio e volte aqui para escolher quais o Garçom oferece no fechamento.
        </p>
        <Link
          href="/menu"
          className="mt-3 inline-block rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700"
        >
          Ir para o cardápio
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Selecionadas, na ordem em que serão oferecidas */}
      {selected.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line2 bg-canvas p-4">
          <p className="text-sm text-ink">Nenhuma categoria escolhida</p>
          <p className="mt-1 text-xs text-muted">
            O Garçom segue com o padrão: bebidas e depois sobremesas, quando o seu cardápio tiver
            categorias assim. Escolha abaixo para definir a sequência do seu jeito.
          </p>
        </div>
      ) : (
        <ol className="space-y-2">
          {selected.map((name, i) => {
            const existsInMenu = categories.some((c) => c.name === name);
            return (
              <li
                key={name}
                className="flex items-center gap-3 rounded-xl border border-line2 bg-paper px-3 py-2.5"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-xs font-semibold text-brand-700">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{name}</span>
                {!existsInMenu && (
                  // Categoria configurada que sumiu do cardápio. O Garçom já a
                  // ignora sozinho (não vira oferta fantasma) — aqui o lojista
                  // entende por que ela não está sendo oferecida.
                  <span className="shrink-0 rounded-lg bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-600">
                    fora do cardápio
                  </span>
                )}
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label={`Subir ${name}`}
                    className="rounded-lg border border-line2 px-2 py-1 text-xs text-ink2 hover:bg-canvas disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === selected.length - 1}
                    aria-label={`Descer ${name}`}
                    className="rounded-lg border border-line2 px-2 py-1 text-xs text-ink2 hover:bg-canvas disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(name)}
                    aria-label={`Remover ${name}`}
                    className="rounded-lg border border-line2 px-2 py-1 text-xs text-ink2 hover:bg-canvas"
                  >
                    Remover
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {/* Disponíveis */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
          Categorias do seu cardápio
        </p>
        {available.length === 0 ? (
          <p className="text-xs text-muted">Todas as categorias do cardápio já estão na sequência.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {available.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => add(c.name)}
                disabled={selected.length >= MAX_CATEGORIES}
                className="rounded-xl border border-line2 bg-paper px-3 py-1.5 text-xs font-semibold text-ink hover:border-brand-400 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                + {c.name}
              </button>
            ))}
          </div>
        )}
        <p className="mt-2 text-[11px] text-muted">
          {selected.length >= MAX_CATEGORIES
            ? `Máximo de ${MAX_CATEGORIES} categorias — o fechamento é uma despedida, não um segundo cardápio.`
            : `Até ${MAX_CATEGORIES} categorias. Cada uma é oferecida uma única vez, na ordem acima, e só depois que o cliente sinaliza que quer fechar.`}
        </p>
      </div>
    </div>
  );
}
