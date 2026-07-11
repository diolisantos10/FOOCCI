"use client";

/**
 * Conexões externas (API) — where the lojista generates a read-only key and
 * copies the API address so external systems (ex.: Foocci Manager) receive the
 * sales on their own. Three blocks per the integration brief:
 *   A — Sua chave de conexão (token)  ⭐ principal
 *   B — Endereço da API
 *   C — Formato dos dados (recolhível)
 *
 * Leigo-first: zero jargão, um toque (copiar/gerar), o token aparece UMA vez.
 */

import { useCallback, useEffect, useState } from "react";
import { API_SCOPES, API_SCOPE_META } from "@/lib/api-scopes";

interface ApiKeyView {
  id: string;
  name: string | null;
  tokenPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  createdAt: string;
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}

// ── One-tap copy button ───────────────────────────────────────────────────────
function CopyButton({ value, label = "Copiar", className }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }).catch(() => { /* clipboard blocked — user can select manually */ });
      }}
      className={className ?? "shrink-0 rounded-lg border border-brand-200 bg-paper px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50 transition"}
    >
      {copied ? "Copiado! ✓" : label}
    </button>
  );
}

const EXAMPLE_JSON = `{
  "data": [
    {
      "id": "PED-10231",
      "valor": 125.90,
      "data": "2026-07-11T18:22:04.000Z",
      "canal": "Delivery",
      "vendas": 1,
      "itens": 3
    }
  ]
}`;

export function ApiConnectionsClient({ userRole }: { userRole: string }) {
  const isOwner = userRole === "OWNER";

  const [keys, setKeys]         = useState<ApiKeyView[]>([]);
  const [loading, setLoading]   = useState(true);
  const [name, setName]         = useState("");
  // What the new key may pull. Vendas on by default; Clientes (PII) off by default.
  const [scopes, setScopes]     = useState<Set<string>>(new Set(["sales:read"]));
  const [generating, setGen]    = useState(false);

  const toggleScope = (s: string) =>
    setScopes((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      if (next.size === 0) next.add("sales:read"); // never a zero-permission key
      return next;
    });
  const [freshToken, setFresh]  = useState<string | null>(null); // shown ONCE
  const [error, setError]       = useState<string | null>(null);
  const [showFormat, setFormat] = useState(false);

  // Endpoint is derived from the current origin so it's always correct per env.
  const endpoint = typeof window !== "undefined"
    ? `${window.location.origin}/api/v1/vendas`
    : "/api/v1/vendas";

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/api-keys");
      const json = await res.json().catch(() => ({}));
      setKeys(json?.data?.keys ?? []);
    } catch { /* keep whatever we had */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const generate = async () => {
    setGen(true);
    setError(null);
    setFresh(null);
    try {
      const res = await fetch("/api/settings/api-keys", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name: name.trim() || undefined, scopes: Array.from(scopes) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error ?? "Não deu para gerar agora, tente de novo.");
      } else {
        setFresh(json?.data?.key?.token ?? null);
        setName("");
        await load();
      }
    } catch {
      setError("Não deu para gerar agora, tente de novo.");
    } finally {
      setGen(false);
    }
  };

  const revoke = async (id: string, label: string) => {
    if (!confirm(`Revogar a chave "${label}"? A conexão será desativada na hora.`)) return;
    try {
      const res = await fetch(`/api/settings/api-keys/${id}`, { method: "DELETE" });
      if (res.ok) await load();
      else setError("Não foi possível revogar. Tente de novo.");
    } catch {
      setError("Não foi possível revogar. Tente de novo.");
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      {/* Intro */}
      <div className="mb-6">
        <h1 className="text-lg font-bold text-ink">Conecte o Foocci a outros sistemas</h1>
        <p className="mt-1 text-sm text-muted">
          Gere uma chave e o outro sistema (ex.: o financeiro) recebe suas vendas sozinho.
          Nada de configuração técnica — é só gerar, copiar e colar.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          ⚠ {error}
        </div>
      )}

      {/* ── Bloco A — Sua chave de conexão ⭐ ─────────────────────────────── */}
      <section className="mb-5 rounded-2xl border border-line bg-paper p-5 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-base">🔑</span>
          <h2 className="text-sm font-bold text-ink">Sua chave de conexão</h2>
        </div>
        <p className="mb-4 text-xs text-muted">
          A chave é como uma senha só-de-leitura das suas vendas. Dá pra revogar quando quiser.
        </p>

        {/* Freshly generated token — shown ONCE */}
        {freshToken && (
          <div className="mb-4 rounded-xl border-2 border-brand-300 bg-brand-50 p-4">
            <p className="mb-2 text-xs font-bold text-brand-800">
              ✅ Chave criada! Guarde ou copie agora — por segurança, não mostramos de novo.
            </p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-lg bg-paper px-3 py-2 font-mono text-xs text-ink ring-1 ring-brand-200">
                {freshToken}
              </code>
              <CopyButton
                value={freshToken}
                label="Copiar chave"
                className="shrink-0 rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white hover:bg-brand-700 transition"
              />
            </div>
          </div>
        )}

        {isOwner ? (
          <div className="space-y-4">
            {/* What this key may access — least privilege, per key */}
            <div>
              <p className="mb-2 text-xs font-medium text-ink2">O que esta chave pode acessar?</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {API_SCOPES.map((s) => {
                  const meta = API_SCOPE_META[s];
                  const checked = scopes.has(s);
                  return (
                    <label
                      key={s}
                      className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 transition ${
                        checked ? "border-brand-300 bg-brand-50" : "border-line2 bg-paper hover:bg-[#FAFAF8]"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleScope(s)}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-line2 accent-brand-600"
                      />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                          {meta.label}
                          {meta.pii && (
                            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700">
                              dado pessoal
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-muted">{meta.description}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[11px] text-muted">
                A chave só alcança o que estiver marcado. Dê o mínimo necessário para cada sistema.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-ink2">
                  Pra que é esta chave? <span className="font-normal text-muted">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: Foocci Manager"
                  maxLength={60}
                  className="w-full rounded-xl border border-line2 bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition"
                />
              </div>
              <button
                type="button"
                onClick={generate}
                disabled={generating}
                className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50 transition"
              >
                {generating ? "Gerando…" : "Gerar chave de conexão"}
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-line bg-[#FAFAF8] px-4 py-3 text-sm text-muted">
            Apenas o proprietário pode gerar ou revogar chaves de conexão.
          </div>
        )}

        {/* Active keys list */}
        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold text-ink2">Chaves ativas</p>
          {loading ? (
            <div className="h-12 animate-pulse rounded-xl bg-[#F4F4F2]" />
          ) : keys.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line2 px-4 py-3 text-xs text-muted">
              Nenhuma chave ainda. Clique em <strong>Gerar chave de conexão</strong> para criar a primeira.
            </p>
          ) : (
            <ul className="space-y-2">
              {keys.map((k) => (
                <li key={k.id} className="flex items-center gap-3 rounded-xl border border-line bg-[#FAFAF8] px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">
                      {k.name || "Chave sem apelido"}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      <span className="font-mono">{k.tokenPrefix}…</span> · criada em {formatDate(k.createdAt)}
                      {" · "}
                      {k.lastUsedAt ? `último uso ${formatDate(k.lastUsedAt)}` : "nunca usada"}
                    </p>
                    {k.scopes.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {k.scopes.map((s) => (
                          <span key={s} className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold text-brand-700">
                            {API_SCOPE_META[s as keyof typeof API_SCOPE_META]?.label ?? s}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {isOwner && (
                    <button
                      type="button"
                      onClick={() => revoke(k.id, k.name || k.tokenPrefix)}
                      className="shrink-0 rounded-lg border border-red-200 bg-paper px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 transition"
                    >
                      Revogar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ── Bloco B — Endereço da API ─────────────────────────────────────── */}
      <section className="mb-5 rounded-2xl border border-line bg-paper p-5 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-base">🔗</span>
          <h2 className="text-sm font-bold text-ink">Endereço da API</h2>
          <span className="ml-auto flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-[11px] font-semibold text-green-700">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> Ativo
          </span>
        </div>
        <p className="mb-3 text-xs text-muted">
          Cole este endereço no outro sistema, junto com a chave acima. Este é o de vendas —
          os demais aparecem em <strong>Ver formato dos dados</strong>.
        </p>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 break-all rounded-lg bg-[#FAFAF8] px-3 py-2 font-mono text-xs text-ink ring-1 ring-line2">
            {endpoint}
          </code>
          <CopyButton value={endpoint} label="Copiar endereço" />
        </div>
        <p className="mt-2 text-[11px] text-muted">
          Também disponível conforme as permissões da chave:{" "}
          <code className="font-mono">/clientes</code> · <code className="font-mono">/produtos</code> ·{" "}
          <code className="font-mono">/financeiro</code>
        </p>

        {/* Bloco C — Formato dos dados (recolhível) */}
        <button
          type="button"
          onClick={() => setFormat((v) => !v)}
          className="mt-3 text-xs font-medium text-brand-600 hover:text-brand-700 transition"
        >
          {showFormat ? "Ocultar formato dos dados" : "Ver formato dos dados"} {showFormat ? "▲" : "▼"}
        </button>
        {showFormat && (
          <div className="mt-2 space-y-3">
            <p className="text-[11px] text-muted">
              Todas as chamadas usam o cabeçalho{" "}
              <code className="font-mono">Authorization: Bearer SUA_CHAVE</code>. Cada endereço
              exige a permissão correspondente — a chave só responde no que você marcou.
            </p>

            {/* Endpoint catalogue */}
            <div className="space-y-1.5">
              {[
                { path: "/vendas",     perm: "Vendas",     q: "?desde=AAAA-MM-DD" },
                { path: "/clientes",   perm: "Clientes",   q: "?desde=AAAA-MM-DD" },
                { path: "/produtos",   perm: "Produtos",   q: "" },
                { path: "/financeiro", perm: "Financeiro", q: "?desde=AAAA-MM-DD" },
              ].map((e) => (
                <div key={e.path} className="flex flex-wrap items-center gap-2 rounded-lg border border-line2 bg-[#FAFAF8] px-3 py-1.5">
                  <code className="font-mono text-[11px] text-ink">GET /api/v1{e.path}{e.q}</code>
                  <span className="ml-auto rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold text-brand-700">
                    permissão: {e.perm}
                  </span>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-muted">Exemplo da resposta de <strong>vendas</strong>:</p>
            <div className="overflow-x-auto rounded-xl border border-line2 bg-[#0f172a] p-3">
              <pre className="font-mono text-[11px] leading-relaxed text-[#e2e8f0]">{EXAMPLE_JSON}</pre>
            </div>
            <p className="text-[11px] text-muted">
              <strong>valor</strong> = total em reais · <strong>data</strong> = data/hora ·
              <strong> canal</strong> = Delivery / Retirada / Salão · <strong>itens</strong> = quantidade.
              Uma venda = os mesmos pedidos que contam no seu Faturamento.
            </p>
          </div>
        )}
      </section>

      {/* Passo a passo */}
      <section className="rounded-2xl border border-line bg-[#FAFAF8] p-5">
        <p className="mb-2 text-xs font-bold text-ink2">Como conectar (passo a passo)</p>
        <ol className="list-decimal space-y-1 pl-5 text-xs text-muted">
          <li>Clique em <strong>Gerar chave de conexão</strong> e copie a chave.</li>
          <li>Copie o <strong>endereço da API</strong> acima.</li>
          <li>Cole os dois no outro sistema (ex.: Foocci Manager).</li>
          <li>Pronto: as vendas passam a chegar sozinhas. A chave mostra o <em>último uso</em> quando conectar.</li>
        </ol>
      </section>
    </div>
  );
}
