"use client";

/**
 * Admin → Credenciais: o cofre de tokens de infraestrutura.
 *
 * Quem lê esta tela não é técnico. Então três coisas são obrigatórias aqui:
 *
 * 1. Cada cartão diz, em UMA frase, o que é aquele serviço e por que se cola um código
 *    ali — e mais uma frase dizendo onde achar o código, em passos.
 * 2. O estado é declarado, não sugerido por cor. "Guardado e testado", "guardado mas não
 *    testado" e "não guardado" são frases; o selo colorido só acompanha. Selo verde que
 *    não prova nada já custou nove dias de Instagram morto nesta casa.
 * 3. Código recusado NÃO é guardado, e a tela diz isso com todas as letras.
 *
 * Os três estados obrigatórios (carregando / vazio / erro) estão tratados.
 */

import { useCallback, useEffect, useState } from "react";

interface CredentialView {
  service: string;
  label: string;
  whatItIs: string | null;
  whereToGet: string | null;
  blastRadius: string | null;
  canValidate: boolean;
  stored: boolean;
  last4: string | null;
  tokenLength: number | null;
  savedBy: string | null;
  savedAt: string | null;
  validationStatus: "valid" | "invalid" | "unknown" | null;
  validationDetail: string | null;
  validatedAt: string | null;
  useCount: number;
  lastUsedAt: string | null;
}

interface AccessEntry {
  service: string;
  actor: string;
  purpose: string;
  outcome: string;
  at: string;
}

interface VaultData {
  credentials: CredentialView[];
  access: AccessEntry[];
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/** A frase de estado. Primeiro o texto; a cor é enfeite. */
function statusLine(c: CredentialView): { text: string; className: string } {
  if (!c.stored) {
    return { text: "Nenhum código guardado", className: "bg-gray-800 text-gray-400" };
  }
  if (c.validationStatus === "valid") {
    return { text: "Guardado e testado", className: "bg-emerald-900/50 text-emerald-300" };
  }
  return { text: "Guardado, mas não testado", className: "bg-amber-900/50 text-amber-300" };
}

const OUTCOME_LABEL: Record<string, string> = {
  ok: "leu o código",
  missing: "tentou ler — não havia código",
  decrypt_failed: "tentou ler — o código não abriu",
};

export function InfraCredentialsClient() {
  const [data, setData] = useState<VaultData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ service: string; kind: "ok" | "warn" | "error"; text: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  // Serviço avulso ("amanhã outra"): nome + código, sem virar gerenciador universal.
  const [newSlug, setNewSlug] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newToken, setNewToken] = useState("");
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/infra-credentials");
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? `Falha ao carregar (HTTP ${res.status}).`);
      }
      setData(json.data as VaultData);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Falha ao carregar o cofre.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(service: string, token: string, label?: string) {
    if (!token.trim()) {
      setMessage({ service, kind: "error", text: "Cole o código antes de salvar." });
      return;
    }
    setBusy(service);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/infra-credentials", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service, token, label }),
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        // Recusado pelo serviço: NADA foi guardado, e a tela precisa dizer isso.
        const rejected = json?.details?.rejected === true;
        setMessage({
          service,
          kind: "error",
          text: rejected
            ? `Não guardei: ${json.error} O código anterior (se havia) continua como estava.`
            : (json.error ?? `Falha ao salvar (HTTP ${res.status}).`),
        });
        return;
      }

      setData({ credentials: json.data.credentials, access: json.data.access });
      setDraft((d) => ({ ...d, [service]: "" }));
      setNewSlug("");
      setNewLabel("");
      setNewToken("");

      const validation = json.data.validation as { status: string; detail: string };
      setMessage(
        validation.status === "valid"
          ? { service, kind: "ok", text: `Guardado e testado. ${validation.detail}` }
          : { service, kind: "warn", text: `Guardado — mas NÃO testado. ${validation.detail}` },
      );
    } catch (err) {
      setMessage({
        service,
        kind: "error",
        text: err instanceof Error ? err.message : "Falha ao salvar.",
      });
    } finally {
      setBusy(null);
    }
  }

  async function remove(service: string) {
    setBusy(service);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/infra-credentials/${service}?confirmar=1`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? `Falha ao remover (HTTP ${res.status}).`);
      }
      setData({ credentials: json.data.credentials, access: json.data.access });
      setMessage({ service, kind: "ok", text: "Código apagado. O registro de quem já usou continua guardado." });
    } catch (err) {
      setMessage({
        service,
        kind: "error",
        text: err instanceof Error ? err.message : "Falha ao remover.",
      });
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  }

  /* ---------- carregando ---------- */
  if (loading) {
    return (
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        <div className="h-7 w-56 animate-pulse rounded bg-gray-800" />
        <div className="mt-3 h-4 w-full max-w-lg animate-pulse rounded bg-gray-800/60" />
        <div className="mt-6 space-y-4">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-2xl border border-gray-800 bg-gray-900/40 p-4">
              <div className="h-5 w-40 animate-pulse rounded bg-gray-800" />
              <div className="mt-3 h-4 w-full animate-pulse rounded bg-gray-800/60" />
              <div className="mt-4 h-9 w-full animate-pulse rounded-xl bg-gray-800/60" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ---------- erro ---------- */
  if (loadError) {
    return (
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        <div className="rounded-2xl border border-red-900/60 bg-red-950/40 p-4">
          <p className="text-sm font-semibold text-red-300">Não consegui abrir o cofre</p>
          <p className="mt-1 text-sm text-red-200/80">{loadError}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 rounded-xl bg-red-900/60 px-3 py-1.5 text-sm font-semibold text-red-100 hover:bg-red-900"
          >
            Tentar de novo
          </button>
        </div>
      </div>
    );
  }

  const credentials = data?.credentials ?? [];
  const nothingStored = credentials.every((c) => !c.stored);

  return (
    <div className="mx-auto max-w-3xl p-4 pb-16 sm:p-6">
      <header>
        <h1 className="text-xl font-semibold text-white">Credenciais</h1>
        <p className="mt-1 text-sm text-gray-400">
          O cofre dos códigos de acesso dos serviços que sustentam o Foocci. Você cola o
          código <strong className="text-gray-200">uma vez</strong> e ele fica guardado —
          não precisa gerar de novo a cada uso.
        </p>
      </header>

      <div className="mt-4 rounded-2xl border border-amber-900/60 bg-amber-950/30 p-3">
        <p className="text-xs leading-relaxed text-amber-200/90">
          🔒 <strong>O código entra e não sai.</strong> Assim que você salva, ele é
          trancado com criptografia e esta tela passa a mostrar só os{" "}
          <strong>4 últimos caracteres</strong>. Nem você, nem o navegador, nem nenhum
          relatório conseguem vê-lo inteiro de novo. Se precisar de um novo, gere outro no
          serviço e cole aqui por cima.
        </p>
      </div>

      {/* ---------- vazio ---------- */}
      {nothingStored ? (
        <div className="mt-4 rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
          <p className="text-sm font-medium text-gray-200">O cofre está vazio</p>
          <p className="mt-1 text-sm text-gray-400">
            Comece pelo Railway, logo abaixo: o passo a passo de onde achar o código está
            no próprio cartão.
          </p>
        </div>
      ) : null}

      {/* ---------- cartões ---------- */}
      <section className="mt-6 space-y-4">
        {credentials.map((c) => {
          const badge = statusLine(c);
          const isBusy = busy === c.service;
          const msg = message?.service === c.service ? message : null;

          return (
            <article
              key={c.service}
              className="rounded-2xl border border-gray-800 bg-gray-900/40 p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-white">{c.label}</h2>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badge.className}`}
                >
                  {badge.text}
                </span>
              </div>

              {c.whatItIs ? (
                <p className="mt-2 text-sm leading-relaxed text-gray-400">{c.whatItIs}</p>
              ) : (
                <p className="mt-2 text-sm leading-relaxed text-gray-500">
                  Serviço adicionado à mão. Guardo o código, mas não sei testá-lo.
                </p>
              )}

              {c.blastRadius ? (
                <p className="mt-2 text-xs leading-relaxed text-amber-200/70">
                  ⚠️ {c.blastRadius}
                </p>
              ) : null}

              {/* O que está guardado — só fato, nada de valor */}
              {c.stored ? (
                <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 rounded-xl border border-gray-800 bg-gray-950/50 p-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-gray-500">Código guardado</dt>
                    <dd className="font-mono text-gray-200">
                      ••••{c.last4}
                      <span className="ml-2 font-sans text-xs text-gray-500">
                        ({c.tokenLength} caracteres)
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500">Salvo por / quando</dt>
                    <dd className="text-gray-200">
                      {c.savedBy ?? "—"} · {formatDate(c.savedAt)}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-gray-500">Teste na hora de salvar</dt>
                    <dd
                      className={
                        c.validationStatus === "valid" ? "text-emerald-300" : "text-amber-300"
                      }
                    >
                      {c.validationDetail ?? "sem registro"}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-gray-500">Usos registrados</dt>
                    <dd className="text-gray-200">
                      {c.useCount === 0
                        ? "nunca foi usado ainda"
                        : `${c.useCount} vez(es) · último em ${formatDate(c.lastUsedAt)}`}
                    </dd>
                  </div>
                </dl>
              ) : null}

              {/* Onde achar */}
              {c.whereToGet ? (
                <details className="mt-4 rounded-xl border border-gray-800 bg-gray-950/40 p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-gray-300">
                    Onde eu acho esse código?
                  </summary>
                  <p className="mt-2 text-sm leading-relaxed text-gray-400">{c.whereToGet}</p>
                </details>
              ) : null}

              {/* Colar */}
              <div className="mt-4">
                <label
                  htmlFor={`cred-${c.service}`}
                  className="text-sm font-medium text-gray-200"
                >
                  {c.stored ? "Trocar por um código novo" : "Cole o código aqui"}
                </label>
                <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
                  <input
                    id={`cred-${c.service}`}
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    value={draft[c.service] ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, [c.service]: e.target.value }))}
                    placeholder={c.stored ? "Deixe em branco para manter o atual" : "Cole aqui"}
                    className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-600 outline-none transition-colors focus:border-violet-500"
                  />
                  <button
                    type="button"
                    onClick={() => void save(c.service, draft[c.service] ?? "")}
                    disabled={isBusy}
                    className="shrink-0 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
                  >
                    {isBusy ? "Salvando…" : "Salvar"}
                  </button>
                </div>
                {c.canValidate ? (
                  <p className="mt-1.5 text-xs text-gray-500">
                    Ao salvar, eu pergunto ao serviço se o código funciona. Se ele recusar,
                    não guardo — e digo aqui o motivo.
                  </p>
                ) : (
                  <p className="mt-1.5 text-xs text-gray-500">
                    Não sei testar este serviço: vou guardar sem confirmar se o código está
                    certo.
                  </p>
                )}
              </div>

              {/* Remover */}
              {c.stored ? (
                <div className="mt-3">
                  {confirming === c.service ? (
                    <div className="rounded-xl border border-red-900/60 bg-red-950/30 p-3">
                      <p className="text-sm text-red-200">
                        Apagar o código de <strong>{c.label}</strong>? O que depender dele
                        para de funcionar até você colar outro.
                      </p>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => void remove(c.service)}
                          disabled={isBusy}
                          className="rounded-xl bg-red-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50"
                        >
                          {isBusy ? "Apagando…" : "Sim, apagar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirming(null)}
                          className="rounded-xl border border-gray-700 px-3 py-1.5 text-sm font-semibold text-gray-300 hover:bg-gray-800"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirming(c.service)}
                      className="text-sm font-medium text-red-400 hover:text-red-300"
                    >
                      Remover este código
                    </button>
                  )}
                </div>
              ) : null}

              {msg ? (
                <p
                  className={`mt-3 text-sm ${
                    msg.kind === "ok"
                      ? "text-emerald-400"
                      : msg.kind === "warn"
                        ? "text-amber-400"
                        : "text-red-400"
                  }`}
                >
                  {msg.text}
                </p>
              ) : null}
            </article>
          );
        })}
      </section>

      {/* ---------- outro serviço ---------- */}
      <section className="mt-6">
        {showNew ? (
          <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-4">
            <h2 className="text-base font-semibold text-white">Guardar outro serviço</h2>
            <p className="mt-1 text-sm text-gray-400">
              Para um serviço que ainda não está na lista. Eu guardo o código do mesmo
              jeito, mas não sei testá-lo — vou avisar que não foi testado.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label htmlFor="novo-slug" className="text-sm font-medium text-gray-200">
                  Apelido do serviço
                </label>
                <input
                  id="novo-slug"
                  value={newSlug}
                  onChange={(e) => setNewSlug(e.target.value)}
                  placeholder="ex.: cloudflare (letras minúsculas, sem espaço)"
                  className="mt-1.5 w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-violet-500"
                />
              </div>
              <div>
                <label htmlFor="novo-label" className="text-sm font-medium text-gray-200">
                  Nome que aparece na tela
                </label>
                <input
                  id="novo-label"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="ex.: Cloudflare (DNS do site)"
                  className="mt-1.5 w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-violet-500"
                />
              </div>
              <div>
                <label htmlFor="novo-token" className="text-sm font-medium text-gray-200">
                  Código
                </label>
                <input
                  id="novo-token"
                  type="password"
                  autoComplete="off"
                  value={newToken}
                  onChange={(e) => setNewToken(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void save(newSlug.trim().toLowerCase(), newToken, newLabel)}
                  disabled={busy !== null}
                  className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
                >
                  Guardar
                </button>
                <button
                  type="button"
                  onClick={() => setShowNew(false)}
                  className="rounded-xl border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-300 hover:bg-gray-800"
                >
                  Cancelar
                </button>
              </div>
              {message && !credentials.some((c) => c.service === message.service) ? (
                <p className={`text-sm ${message.kind === "error" ? "text-red-400" : "text-emerald-400"}`}>
                  {message.text}
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowNew(true)}
            className="rounded-xl border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-300 hover:bg-gray-800"
          >
            + Guardar outro serviço
          </button>
        )}
      </section>

      {/* ---------- trilha ---------- */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-500">
          Quem usou os códigos
        </h2>
        <p className="mt-1 text-sm text-gray-400">
          Toda vez que o sistema abre um código guardado, fica registrado aqui. É como
          saber quem entrou no cofre.
        </p>
        {data?.access.length ? (
          <ul className="mt-3 divide-y divide-gray-800 rounded-2xl border border-gray-800 bg-gray-900/40">
            {data.access.map((a, i) => (
              <li key={`${a.at}-${i}`} className="px-4 py-2.5 text-sm">
                <span className="text-gray-300">{a.actor}</span>{" "}
                <span className="text-gray-500">{OUTCOME_LABEL[a.outcome] ?? a.outcome}</span>{" "}
                <span className="text-gray-300">de {a.service}</span>
                <span className="text-gray-500"> — {a.purpose}</span>
                <span className="block text-xs text-gray-600">{formatDate(a.at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 rounded-2xl border border-gray-800 bg-gray-900/40 px-4 py-6 text-center text-sm text-gray-500">
            Nenhum código foi aberto ainda.
          </p>
        )}
      </section>
    </div>
  );
}
