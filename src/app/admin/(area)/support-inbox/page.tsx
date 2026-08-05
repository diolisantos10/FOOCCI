"use client";

/**
 * /admin/support-inbox — the Foocci team answers help threads that lojistas
 * escalated from the in-app widget ("Falar com a FOOD"). Two panes: the thread
 * list (left) and the live transcript + reply box (right). Auth is enforced by
 * the (area) layout.
 */

import { useCallback, useEffect, useRef, useState } from "react";

type Filter = "ESCALATED" | "RESOLVED" | "ALL";

interface ThreadSummary {
  id: string;
  restaurantName: string;
  status: string;
  mode: string;
  lastMessageAt: string;
  preview: string;
  messageCount: number;
}

interface ThreadAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  bytes: number;
  kind: "IMAGE" | "PDF" | "AUDIO";
  /** Rota de ADMIN — a do lojista confere tenant e responderia 404 aqui. */
  url: string;
}

interface ThreadMessage {
  id: string;
  role: string;
  content: string;
  authorName: string | null;
  createdAt: string;
  attachments?: ThreadAttachment[];
}

interface ThreadDetail {
  id: string;
  restaurantName: string;
  status: string;
  mode: string;
  createdAt: string;
  lastMessageAt: string;
  messages: ThreadMessage[];
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: "ESCALATED", label: "Escaladas" },
  { key: "RESOLVED", label: "Resolvidas" },
  { key: "ALL", label: "Todas" },
];

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_STYLE: Record<string, string> = {
  ESCALATED: "bg-orange-900/50 text-orange-300",
  RESOLVED: "bg-green-900/50 text-green-300",
  OPEN: "bg-gray-700 text-gray-300",
};

export default function SupportInboxPage() {
  const [filter, setFilter] = useState<Filter>("ESCALATED");
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [reply, setReply] = useState("");
  const [authorName, setAuthorName] = useState("Equipe Foocci");
  const [sending, setSending] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [view, setView] = useState<"inbox" | "metrics">("inbox");
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── List ────────────────────────────────────────────────────────────────────
  const fetchThreads = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/support/threads?status=${filter}`);
      if (!res.ok) return;
      const json = await res.json();
      setThreads((json.data ?? []) as ThreadSummary[]);
    } catch {
      // keep current state
    }
  }, [filter]);

  useEffect(() => {
    fetchThreads();
    const id = setInterval(fetchThreads, 12_000);
    return () => clearInterval(id);
  }, [fetchThreads]);

  // ── Detail ──────────────────────────────────────────────────────────────────
  const fetchDetail = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/admin/support/threads/${id}`);
      if (!res.ok) return;
      const json = await res.json();
      setDetail((json.data ?? null) as ThreadDetail | null);
    } catch {
      // keep current state
    }
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    fetchDetail(selectedId);
    const id = setInterval(() => fetchDetail(selectedId), 8_000);
    return () => clearInterval(id);
  }, [selectedId, fetchDetail]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [detail?.messages.length]);

  // ── Actions ─────────────────────────────────────────────────────────────────
  async function sendReply() {
    const content = reply.trim();
    if (!content || !selectedId || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/admin/support/threads/${selectedId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, authorName }),
      });
      if (res.ok) {
        setReply("");
        await fetchDetail(selectedId);
        await fetchThreads();
      }
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  }

  async function resolveThread() {
    if (!selectedId || resolving) return;
    setResolving(true);
    try {
      const res = await fetch(`/api/admin/support/threads/${selectedId}/resolve`, {
        method: "POST",
      });
      if (res.ok) {
        await fetchDetail(selectedId);
        await fetchThreads();
      }
    } catch {
      // ignore
    } finally {
      setResolving(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
        <div>
          <h1 className="text-xl font-bold text-white">Suporte — Falar com a FOOD</h1>
          <p className="mt-0.5 text-sm text-gray-400">
            Conversas que os lojistas encaminharam pelo widget de ajuda.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-gray-800 p-1">
          <button
            type="button"
            onClick={() => setView("inbox")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              view === "inbox" ? "bg-violet-900/50 text-violet-200" : "text-gray-400 hover:text-gray-200"
            }`}
          >
            💬 Conversas
          </button>
          <button
            type="button"
            onClick={() => setView("metrics")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              view === "metrics" ? "bg-violet-900/50 text-violet-200" : "text-gray-400 hover:text-gray-200"
            }`}
          >
            📈 Perguntas
          </button>
        </div>
      </header>

      {view === "metrics" ? (
        <MetricsPanel />
      ) : (
      <div className="flex min-h-0 flex-1">
        {/* ── Thread list ─────────────────────────────────────────────────── */}
        <div className="flex w-80 shrink-0 flex-col border-r border-gray-800">
          <div className="flex gap-1 border-b border-gray-800 p-2">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => {
                  setFilter(f.key);
                  setSelectedId(null);
                }}
                className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ${
                  filter === f.key
                    ? "bg-violet-900/50 text-violet-200"
                    : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {threads.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-gray-500">
                Nenhuma conversa por aqui.
              </p>
            ) : (
              <ul className="divide-y divide-gray-800">
                {threads.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(t.id)}
                      className={`w-full px-4 py-3 text-left transition-colors hover:bg-gray-800/60 ${
                        selectedId === t.id ? "bg-gray-800" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-white">
                          {t.restaurantName}
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                            STATUS_STYLE[t.status] ?? "bg-gray-700 text-gray-300"
                          }`}
                        >
                          {t.status === "ESCALATED" ? "aberta" : t.status === "RESOLVED" ? "resolvida" : t.status}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-gray-400">{t.preview || "—"}</p>
                      <p className="mt-1 text-[10px] text-gray-500">{fmtTime(t.lastMessageAt)}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* ── Transcript + reply ──────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col">
          {!detail ? (
            <div className="flex flex-1 items-center justify-center text-sm text-gray-500">
              Selecione uma conversa para responder.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-gray-800 px-5 py-3">
                <div>
                  <p className="text-sm font-bold text-white">{detail.restaurantName}</p>
                  <p className="text-[11px] text-gray-500">
                    Aberta em {fmtTime(detail.createdAt)} · {detail.messages.length} mensagens
                  </p>
                </div>
                {detail.status !== "RESOLVED" && (
                  <button
                    type="button"
                    onClick={resolveThread}
                    disabled={resolving}
                    className="rounded-lg border border-green-800 bg-green-900/30 px-3 py-1.5 text-xs font-semibold text-green-300 transition-colors hover:bg-green-900/60 disabled:opacity-50"
                  >
                    {resolving ? "…" : "Marcar como resolvida"}
                  </button>
                )}
              </div>

              <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-gray-950 px-5 py-4">
                {detail.messages.map((m) => (
                  <AdminMessage key={m.id} message={m} />
                ))}
              </div>

              <div className="border-t border-gray-800 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <label className="text-[11px] text-gray-500">Assinar como</label>
                  <input
                    value={authorName}
                    onChange={(e) => setAuthorName(e.target.value)}
                    className="rounded-md border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-200 focus:border-violet-500 focus:outline-none"
                  />
                </div>
                {/* SEM MICROFONE, DE PROPÓSITO (05/08/2026).
                    O ditado por voz do produto vive em @/components/voice e fala com
                    /api/help/transcribe, que exige contexto de TENANT (x-restaurant-id).
                    A área /admin não passa por esse middleware: o botão apareceria e
                    tomaria 401 em silêncio — "botão que não grava é pior que botão
                    nenhum". Para ligar aqui, primeiro criar /api/admin/transcribe
                    autenticada como admin; o gancho já aceita `endpoint`. */}
                <div className="flex items-end gap-2">
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void sendReply();
                      }
                    }}
                    rows={2}
                    placeholder="Responder ao lojista…"
                    className="min-w-0 flex-1 resize-none rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-violet-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={sendReply}
                    disabled={!reply.trim() || sending}
                    className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-40"
                  >
                    {sending ? "Enviando…" : "Enviar"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      )}
    </div>
  );
}

interface MetricsData {
  since: string;
  totalQuestions: number;
  uniqueQuestions: number;
  gapTotal: number;
  topQuestions: Array<{ question: string; count: number }>;
  gaps: Array<{ question: string; count: number }>;
}

function MetricsPanel() {
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [mining, setMining] = useState(false);
  const [mineMsg, setMineMsg] = useState<string | null>(null);

  async function runFaqMiner() {
    if (mining) return;
    setMining(true);
    setMineMsg(null);
    try {
      const res = await fetch("/api/admin/support/mine-faq", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      const d = json?.data as
        | { threadsScanned: number; proposed: number; skippedDuplicates: number }
        | undefined;
      setMineMsg(
        res.ok && d
          ? `✓ ${d.threadsScanned} conversa(s) analisada(s) → ${d.proposed} FAQ(s) proposta(s) (${d.skippedDuplicates} duplicada(s)). Aprove em Manual → Solicitações.`
          : "Falha ao gerar FAQ.",
      );
    } catch {
      setMineMsg("Falha ao gerar FAQ.");
    } finally {
      setMining(false);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/support/metrics");
        if (res.ok) {
          const json = await res.json();
          setData((json.data ?? null) as MetricsData | null);
        }
      } catch {
        // keep null
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <div className="flex flex-1 items-center justify-center text-sm text-gray-500">Carregando métricas…</div>;
  }
  if (!data) {
    return <div className="flex flex-1 items-center justify-center text-sm text-gray-500">Não foi possível carregar as métricas.</div>;
  }

  return (
    <div className="flex-1 space-y-6 overflow-y-auto p-6">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Perguntas (30 dias)</p>
          <p className="mt-1 text-2xl font-extrabold text-white">{data.totalQuestions}</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Perguntas únicas</p>
          <p className="mt-1 text-2xl font-extrabold text-white">{data.uniqueQuestions}</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Sem boa resposta (gaps)</p>
          <p className={`mt-1 text-2xl font-extrabold ${data.gapTotal > 0 ? "text-amber-400" : "text-green-400"}`}>{data.gapTotal}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={runFaqMiner}
          disabled={mining}
          className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
        >
          {mining ? "Gerando…" : "🧠 Gerar FAQ das conversas resolvidas"}
        </button>
        {mineMsg && <span className="text-xs text-gray-400">{mineMsg}</span>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-gray-800 bg-gray-900">
          <p className="border-b border-gray-800 px-4 py-2.5 text-sm font-bold text-white">Mais perguntadas</p>
          {data.topQuestions.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-500">Sem perguntas no período.</p>
          ) : (
            <ul className="divide-y divide-gray-800">
              {data.topQuestions.map((q, i) => (
                <li key={i} className="flex items-start justify-between gap-3 px-4 py-2.5">
                  <span className="text-sm text-gray-300">{q.question}</span>
                  <span className="shrink-0 rounded-full bg-gray-800 px-2 py-0.5 text-xs font-bold text-gray-300">{q.count}×</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-amber-900/50 bg-gray-900">
          <div className="border-b border-gray-800 px-4 py-2.5">
            <p className="text-sm font-bold text-amber-300">Sem boa resposta — vira guia novo</p>
            <p className="text-[11px] text-gray-500">O assistente admitiu não saber. Cada item aqui é um capítulo a escrever.</p>
          </div>
          {data.gaps.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-500">Nenhum gap — o manual está dando conta. 🎉</p>
          ) : (
            <ul className="divide-y divide-gray-800">
              {data.gaps.map((q, i) => (
                <li key={i} className="flex items-start justify-between gap-3 px-4 py-2.5">
                  <span className="text-sm text-gray-300">{q.question}</span>
                  <span className="shrink-0 rounded-full bg-amber-900/40 px-2 py-0.5 text-xs font-bold text-amber-300">{q.count}×</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function AdminMessage({ message }: { message: ThreadMessage }) {
  if (message.role === "SYSTEM") {
    return (
      <p className="mx-auto max-w-[80%] rounded-full bg-gray-800 px-3 py-1 text-center text-[11px] text-gray-400">
        {message.content}
      </p>
    );
  }

  // SUPPORT = us (Foocci team) → right; lojista USER / AI ASSISTANT → left.
  const isUs = message.role === "SUPPORT";
  const label =
    message.role === "SUPPORT"
      ? message.authorName || "Equipe Foocci"
      : message.role === "ASSISTANT"
        ? "Assistente IA"
        : "Lojista";

  return (
    <div className={`flex ${isUs ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[80%]">
        <span className="mb-0.5 block px-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
          {label} · {fmtTime(message.createdAt)}
        </span>
        {message.content && (
          <div
            className={`whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed ${
              isUs
                ? "rounded-br-md bg-violet-600 text-white"
                : message.role === "ASSISTANT"
                  ? "rounded-bl-md bg-gray-800 text-gray-300"
                  : "rounded-bl-md bg-gray-700 text-white"
            }`}
          >
            {message.content}
          </div>
        )}

        {/* O print/PDF/áudio que o lojista mandou. Sem isto, quem atende lê
            "a tela está assim" e não vê a tela. */}
        {(message.attachments?.length ?? 0) > 0 && (
          <div className="mt-1 flex flex-wrap gap-2">
            {message.attachments!.map((a) => (
              <AdminAttachment key={a.id} file={a} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AdminAttachment({ file }: { file: ThreadAttachment }) {
  const kb =
    file.bytes < 1024 * 1024
      ? `${Math.max(1, Math.round(file.bytes / 1024))} KB`
      : `${(file.bytes / 1048576).toFixed(1)} MB`;

  if (file.kind === "IMAGE") {
    return (
      <a href={file.url} target="_blank" rel="noreferrer" title={`${file.fileName} · ${kb}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={file.url}
          alt={file.fileName}
          className="max-h-48 max-w-[16rem] rounded-lg border border-gray-700 object-cover"
        />
      </a>
    );
  }
  if (file.kind === "AUDIO") {
    return (
      <span className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900 px-2 py-1.5">
        <span aria-hidden>🎤</span>
        <audio controls src={file.url} className="h-8 max-w-[14rem]" />
      </span>
    );
  }
  return (
    <a
      href={file.url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-xs text-gray-200 transition-colors hover:border-violet-600"
    >
      <span aria-hidden>📄</span>
      <span className="max-w-[12rem] truncate font-semibold">{file.fileName}</span>
      <span className="text-gray-500">{kb}</span>
    </a>
  );
}
