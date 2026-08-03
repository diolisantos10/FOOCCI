"use client";

/**
 * Gerência dos vídeos de demonstração: adicionar por link do YouTube, publicar/
 * despublicar, reordenar (número menor aparece primeiro) e remover.
 */

import { useCallback, useEffect, useState } from "react";

interface Video {
  id:          string;
  title:       string;
  description: string | null;
  youtubeUrl:  string;
  sortOrder:   number;
  published:   boolean;
  createdAt:   string;
}

export function DemoVideosClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [videos, setVideos]   = useState<Video[]>([]);

  const [title, setTitle]     = useState("");
  const [url, setUrl]         = useState("");
  const [descr, setDescr]     = useState("");
  const [saving, setSaving]   = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/demo-videos");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Falha ao carregar.");
      setVideos(json.data.videos);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar os vídeos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function addVideo() {
    setError(null);
    if (title.trim().length < 2 || !url.trim()) { setError("Informe o título e o link do YouTube."); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/demo-videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          youtubeUrl: url.trim(),
          description: descr.trim() || null,
          sortOrder: videos.length,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Falha ao salvar.");
      setTitle(""); setUrl(""); setDescr("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar o vídeo.");
    } finally {
      setSaving(false);
    }
  }

  async function patch(id: string, fields: Partial<Pick<Video, "published" | "sortOrder">>) {
    setError(null);
    try {
      const res = await fetch("/api/admin/demo-videos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...fields }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Falha ao atualizar.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao atualizar o vídeo.");
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/admin/demo-videos?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Falha ao remover.");
      setVideos((prev) => prev.filter((v) => v.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao remover o vídeo.");
    }
  }

  function move(idx: number, dir: -1 | 1) {
    const other = idx + dir;
    if (other < 0 || other >= videos.length) return;
    // Troca as posições dos dois — número menor aparece primeiro no site.
    void patch(videos[idx]!.id,   { sortOrder: other });
    void patch(videos[other]!.id, { sortOrder: idx });
  }

  return (
    <div className="p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Vídeos do site</h1>
        <p className="mt-1 text-sm text-gray-400">
          Os vídeos publicados aparecem em{" "}
          <code className="rounded bg-gray-800 px-1 text-gray-300">/site/demonstracao</code>, na ordem
          desta lista. Suba o vídeo no YouTube (pode ficar como “não listado”) e cole o link aqui.
        </p>
      </header>

      {/* Adicionar */}
      <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900">Adicionar vídeo</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">Título</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="O Foocci por dentro: do pedido ao relacionamento"
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">Link do YouTube</span>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://youtu.be/…"
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-gray-600">Descrição (opcional)</span>
            <input
              value={descr}
              onChange={(e) => setDescr(e.target.value)}
              placeholder="Uma frase sobre o que o vídeo mostra"
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={addVideo}
          disabled={saving}
          className="mt-4 rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
        >
          {saving ? "Salvando…" : "Adicionar"}
        </button>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </section>

      {/* Lista */}
      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-14 text-center text-sm text-gray-500">
          Carregando…
        </div>
      ) : videos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center">
          <p className="text-base font-medium text-gray-700">Nenhum vídeo ainda.</p>
          <p className="mt-1 text-sm text-gray-500">
            Enquanto não houver vídeo publicado, a página de demonstração continua
            como está — a seção de vídeos só aparece quando o primeiro entrar.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {videos.map((v, idx) => (
            <li key={v.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-4">
              <div className="flex flex-col gap-1">
                <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0} className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-30">▲</button>
                <button type="button" onClick={() => move(idx, 1)} disabled={idx === videos.length - 1} className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-30">▼</button>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900">{v.title}</p>
                {v.description && <p className="truncate text-xs text-gray-500">{v.description}</p>}
                <a href={v.youtubeUrl} target="_blank" rel="noopener noreferrer" className="truncate text-xs text-brand-600 hover:underline">
                  {v.youtubeUrl}
                </a>
              </div>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${v.published ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                {v.published ? "publicado" : "rascunho"}
              </span>
              <button
                type="button"
                onClick={() => patch(v.id, { published: !v.published })}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                {v.published ? "Despublicar" : "Publicar"}
              </button>
              <button
                type="button"
                onClick={() => remove(v.id)}
                className="text-xs font-medium text-gray-400 transition-colors hover:text-red-600"
              >
                remover
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
