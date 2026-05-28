"use client";

import { useState, useCallback } from "react";

// ── Types: restaurant-mismatch endpoint ──────────────────────────────────────────

type RestaurantRole =
  | "CANONICAL_WHATSAPP_ACTIVE"
  | "CANONICAL_EVO_NO_CONVS"
  | "PUBLIC_SLUG_NO_EVO"
  | "HAS_MENU_NO_EVO"
  | "LEGACY_NO_EVO"
  | "UNKNOWN";

interface DiagRow {
  restaurantId:             string;
  slug:                     string;
  name:                     string;
  isActive:                 boolean;
  hasEvolutionConfig:       boolean;
  evoActive:                boolean | null;
  instanceName:             string | null;
  conversationCountLast90d: number;
  openDrafts:               number;
  menuItemCount:            number;
  ordersLast30d:            number;
  likelyRole:               RestaurantRole;
}

interface SlugResolution {
  queriedSlug:            string;
  resolvedRestaurantId:   string | null;
  resolvedRestaurantName: string | null;
  hasEvolutionConfig:     boolean;
  relatedSlugs:           string[];
}

interface Diagnosis {
  likelyCanonicalRestaurantId: string | null;
  likelyLegacyRestaurantIds:   string[];
  likelyRootCause:             string;
  safeRecommendation:          string;
  slugSwapSafe:                boolean;
  slugSwapSQL:                 string | null;
}

interface MismatchResponse {
  ok:             true;
  queriedAt:      string;
  diagTable:      DiagRow[];
  slugResolution: SlugResolution;
  diagnosis:      Diagnosis;
}

// ── Types: cart-drafts endpoint ───────────────────────────────────────────────

interface DraftRow {
  draftId:             string;
  restaurantId:        string;
  customerId:          string | null;
  customerName:        string | null;
  customerPhoneMasked: string;
  phoneExists:         boolean;
  phoneIsGuest:        boolean;
  phoneValid:          boolean;
  status:              string;
  itemCount:           number;
  updatedAt:           string;
  recoveryAttempts:    number;
  lastRecoveryAt:      string | null;
  recoveryEligible:    boolean;
  skipReason:          string | null;
}

interface RestaurantDrafts {
  restaurantId:       string;
  slug:               string;
  name:               string;
  hasEvolutionConfig: boolean;
  evoActive:          boolean | null;
  instanceName:       string | null;
  drafts:             DraftRow[];
}

interface DraftsResponse {
  ok:          true;
  queriedAt:   string;
  slugFilter:  string;
  restaurants: RestaurantDrafts[];
  rootCause:   string;
}

// ── Role badge ────────────────────────────────────────────────────────────────────

const ROLE_STYLES: Record<RestaurantRole, string> = {
  CANONICAL_WHATSAPP_ACTIVE: "bg-green-900/50 text-green-300 border border-green-700",
  CANONICAL_EVO_NO_CONVS:    "bg-blue-900/50  text-blue-300  border border-blue-700",
  PUBLIC_SLUG_NO_EVO:        "bg-yellow-900/50 text-yellow-300 border border-yellow-700",
  HAS_MENU_NO_EVO:           "bg-orange-900/50 text-orange-300 border border-orange-700",
  LEGACY_NO_EVO:             "bg-gray-800 text-gray-400 border border-gray-700",
  UNKNOWN:                   "bg-gray-800 text-gray-500 border border-gray-700",
};

function RoleBadge({ role }: { role: RestaurantRole }) {
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${ROLE_STYLES[role] ?? ROLE_STYLES.UNKNOWN}`}>
      {role}
    </span>
  );
}

function Bool({ v }: { v: boolean | null }) {
  if (v === null) return <span className="text-gray-600">—</span>;
  return v
    ? <span className="text-green-400">✓</span>
    : <span className="text-red-400">✗</span>;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="ml-2 rounded px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
    >
      {copied ? "Copiado!" : "Copiar"}
    </button>
  );
}

function KV({ label, value, mono = false, valueClass }: {
  label: string; value: string; mono?: boolean; valueClass?: string;
}) {
  return (
    <div>
      <span className="text-gray-500">{label}: </span>
      <span className={`${mono ? "font-mono text-xs" : ""} ${valueClass ?? "text-gray-200"}`}>
        {value}
      </span>
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────────

export default function RestaurantMismatchDiagPage() {
  const [slug,         setSlug]         = useState("sushi-cazza");
  const [loading,      setLoading]      = useState(false);
  const [mismatch,     setMismatch]     = useState<MismatchResponse | null>(null);
  const [draftsResult, setDraftsResult] = useState<DraftsResponse | null>(null);
  const [error,        setError]        = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMismatch(null);
    setDraftsResult(null);
    try {
      const enc = encodeURIComponent(slug.trim());
      const [r1, r2] = await Promise.all([
        fetch(`/api/admin/diagnostics/restaurant-mismatch?slug=${enc}`),
        fetch(`/api/admin/diagnostics/cart-drafts?slug=${enc}&limit=10`),
      ]);

      if (r1.status === 401 || r1.status === 403) {
        setError("Sessão expirada — faça login novamente.");
        return;
      }

      const [j1, j2] = await Promise.all([r1.json(), r2.json()]) as [
        MismatchResponse & { error?: string },
        DraftsResponse  & { error?: string },
      ];

      if (!r1.ok || j1.error) { setError(j1.error ?? `Mismatch HTTP ${r1.status}`); return; }
      if (!r2.ok || j2.error) { setError(j2.error ?? `Drafts HTTP ${r2.status}`);   return; }

      setMismatch(j1);
      setDraftsResult(j2);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [slug]);

  const { diagTable, slugResolution, diagnosis } = mismatch ?? {};

  return (
    <div className="p-6 space-y-6 max-w-6xl">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">Diagnóstico de Restaurante</h1>
        <p className="mt-1 text-sm text-gray-400">
          Detecta registros duplicados, Evolution config no restaurantId errado,
          e por que drafts de carrinho abandonado não se tornam recuperáveis.
          Somente leitura — nenhum dado é alterado.
        </p>
      </div>

      {/* Controls */}
      <div className="flex items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="slug-input" className="text-xs text-gray-400 font-medium">
            Slug do restaurante
          </label>
          <input
            id="slug-input"
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void run(); }}
            placeholder="sushi-cazza"
            className="w-56 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
        <button
          type="button"
          onClick={() => void run()}
          disabled={loading || !slug.trim()}
          className="rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-white transition-colors"
        >
          {loading ? "Rodando…" : "Rodar diagnóstico"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-700 bg-red-900/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {mismatch && (
        <>
          <p className="text-xs text-gray-600">
            Consultado em {new Date(mismatch.queriedAt).toLocaleString("pt-BR")}
          </p>

          {/* ── diagTable ──────────────────────────────────────────────────────────────────────── */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
              Tabela diagnóstica
            </h2>
            {diagTable && diagTable.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-gray-800">
                <table className="w-full text-xs">
                  <thead className="bg-gray-900 text-gray-400">
                    <tr>
                      {["Slug", "Nome", "Ativo", "Evo?", "Evo ativo", "Instância",
                        "Convs 90d", "Drafts abertos", "Itens menu", "Pedidos 30d", "Role",
                      ].map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {diagTable.map((row) => (
                      <tr key={row.restaurantId} className="hover:bg-gray-900/50">
                        <td className="px-3 py-2 font-mono text-gray-200 whitespace-nowrap">{row.slug}</td>
                        <td className="px-3 py-2 text-gray-300 whitespace-nowrap">{row.name}</td>
                        <td className="px-3 py-2 text-center"><Bool v={row.isActive} /></td>
                        <td className="px-3 py-2 text-center"><Bool v={row.hasEvolutionConfig} /></td>
                        <td className="px-3 py-2 text-center"><Bool v={row.evoActive} /></td>
                        <td className="px-3 py-2 font-mono text-gray-400 whitespace-nowrap">
                          {row.instanceName ?? <span className="text-gray-700">—</span>}
                        </td>
                        <td className="px-3 py-2 text-center text-gray-200">{row.conversationCountLast90d}</td>
                        <td className="px-3 py-2 text-center text-gray-200">{row.openDrafts}</td>
                        <td className="px-3 py-2 text-center text-gray-200">{row.menuItemCount}</td>
                        <td className="px-3 py-2 text-center text-gray-200">{row.ordersLast30d}</td>
                        <td className="px-3 py-2"><RoleBadge role={row.likelyRole} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-500">Nenhum restaurante encontrado para este slug.</p>
            )}
          </section>

          {/* ── slugResolution ────────────────────────────────────────────────────────────────── */}
          {slugResolution && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
                Resolução do slug
              </h2>
              <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-4 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                <KV label="Slug consultado"      value={slugResolution.queriedSlug} />
                <KV label="ID resolvido"         value={slugResolution.resolvedRestaurantId ?? "(não encontrado)"} mono />
                <KV label="Nome resolvido"       value={slugResolution.resolvedRestaurantName ?? "—"} />
                <KV label="Tem Evolution config" value={slugResolution.hasEvolutionConfig ? "✓ SIM" : "✗ NÃO"}
                    valueClass={slugResolution.hasEvolutionConfig ? "text-green-400" : "text-red-400"} />
                <div className="col-span-2">
                  <span className="text-gray-500">Slugs relacionados: </span>
                  {slugResolution.relatedSlugs.length > 0
                    ? slugResolution.relatedSlugs.map((s) => (
                        <code key={s} className="ml-1 rounded bg-gray-800 px-1.5 py-0.5 text-xs text-yellow-300">{s}</code>
                      ))
                    : <span className="text-gray-600 text-xs">nenhum</span>
                  }
                </div>
              </div>
            </section>
          )}

          {/* ── diagnosis ──────────────────────────────────────────────────────────────────────── */}
          {diagnosis && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
                Diagnóstico
              </h2>
              <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-4 space-y-3 text-sm">
                <div className="flex items-center gap-3">
                  <span className="text-gray-500 w-40 shrink-0">Slug-swap seguro?</span>
                  {diagnosis.slugSwapSafe
                    ? <span className="rounded bg-green-900/50 border border-green-700 px-2 py-0.5 text-green-300 font-semibold text-xs">✓ SIM — swap seguro</span>
                    : <span className="rounded bg-red-900/40 border border-red-800 px-2 py-0.5 text-red-300 font-semibold text-xs">✗ NÃO — não fazer swap</span>
                  }
                </div>
                <div>
                  <p className="text-gray-500 mb-1">ID canônico (tem Evolution)</p>
                  <code className="text-violet-300 text-xs font-mono">
                    {diagnosis.likelyCanonicalRestaurantId ?? "(nenhum)"}
                  </code>
                </div>
                {diagnosis.likelyLegacyRestaurantIds.length > 0 && (
                  <div>
                    <p className="text-gray-500 mb-1">IDs legados (sem Evolution)</p>
                    {diagnosis.likelyLegacyRestaurantIds.map((id) => (
                      <code key={id} className="block text-yellow-300 text-xs font-mono">{id}</code>
                    ))}
                  </div>
                )}
                <div>
                  <p className="text-gray-500 mb-1">Causa raiz</p>
                  <p className="text-gray-200 leading-relaxed">{diagnosis.likelyRootCause}</p>
                </div>
                <div>
                  <p className="text-gray-500 mb-1">Recomendação</p>
                  <p className={`leading-relaxed ${diagnosis.slugSwapSafe ? "text-green-200" : "text-yellow-200"}`}>
                    {diagnosis.safeRecommendation}
                  </p>
                </div>
                {diagnosis.slugSwapSQL && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <p className="text-gray-500">SQL de slug-swap</p>
                      <CopyButton text={diagnosis.slugSwapSQL} />
                    </div>
                    <pre className="overflow-x-auto rounded-lg bg-gray-950 border border-gray-700 p-4 text-xs text-green-300 font-mono leading-relaxed">
                      {diagnosis.slugSwapSQL}
                    </pre>
                  </div>
                )}
              </div>
            </section>
          )}
        </>
      )}

      {/* ── Draft inspection (cart recovery path) ────────────────────────────────── */}
      {draftsResult && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
            Inspeção de drafts — por que o carrinho não vira recuperável
          </h2>

          {/* Root cause box */}
          <div className="rounded-lg border border-amber-700 bg-amber-950/40 px-4 py-3 text-sm text-amber-200 leading-relaxed">
            <span className="font-semibold text-amber-300">Causa raiz: </span>
            {draftsResult.rootCause}
          </div>

          {draftsResult.restaurants.map((r) => (
            <div key={r.restaurantId} className="rounded-lg border border-gray-800 overflow-hidden">
              {/* Restaurant header */}
              <div className="bg-gray-900 px-4 py-2 flex items-center gap-3 flex-wrap">
                <code className="text-xs text-gray-400 font-mono">{r.slug}</code>
                <span className="text-sm text-gray-200 font-medium">{r.name}</span>
                {r.hasEvolutionConfig
                  ? <span className="text-[10px] rounded border border-green-700 bg-green-900/40 px-1.5 py-0.5 text-green-300 font-semibold">✓ EVOLUTION</span>
                  : <span className="text-[10px] rounded border border-red-800 bg-red-900/30 px-1.5 py-0.5 text-red-400 font-semibold">✗ SEM EVOLUTION</span>
                }
                {r.instanceName && (
                  <span className="text-xs text-gray-500 font-mono">{r.instanceName}</span>
                )}
                <span className="ml-auto text-xs text-gray-500">{r.drafts.length} draft(s)</span>
              </div>

              {r.drafts.length === 0 ? (
                <div className="px-4 py-3 text-sm text-gray-600 italic">
                  Nenhum draft encontrado para este restaurante.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-900/50 text-gray-400">
                      <tr>
                        {["Draft ID", "Cliente", "Telefone (masked)", "Fone OK?",
                          "Status", "Itens", "updatedAt", "Tentativas", "Elegível?", "Skip reason",
                        ].map((h) => (
                          <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {r.drafts.map((d) => (
                        <tr key={d.draftId} className={d.recoveryEligible ? "bg-green-950/20" : "hover:bg-gray-900/30"}>
                          <td className="px-3 py-2 font-mono text-gray-500 whitespace-nowrap text-[10px]">
                            {d.draftId.slice(0, 12)}…
                          </td>
                          <td className="px-3 py-2 text-gray-300 whitespace-nowrap">
                            {d.customerName ?? <span className="text-gray-600 italic">sem nome</span>}
                          </td>
                          <td className="px-3 py-2 font-mono text-gray-400 whitespace-nowrap">
                            {d.customerPhoneMasked}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <Bool v={d.phoneValid} />
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                              d.status === "OPEN"     ? "bg-blue-900/40 text-blue-300 border border-blue-800" :
                              d.status === "ABANDONED"? "bg-gray-800 text-gray-400 border border-gray-700" :
                              "bg-gray-800 text-gray-500 border border-gray-700"
                            }`}>
                              {d.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center text-gray-200">{d.itemCount}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-gray-500">
                            {new Date(d.updatedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                          </td>
                          <td className="px-3 py-2 text-center text-gray-200">{d.recoveryAttempts}</td>
                          <td className="px-3 py-2 text-center">
                            {d.recoveryEligible
                              ? <span className="text-green-400 font-semibold">✓</span>
                              : <span className="text-red-400">✗</span>
                            }
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {d.skipReason
                              ? <code className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px] text-red-300">{d.skipReason}</code>
                              : <span className="text-gray-600">—</span>
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
