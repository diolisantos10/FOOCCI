"use client";

/**
 * Google integration — lojista UX (one-click connect).
 *
 * Owner rule: zero technical setup. One "Conectar Google" button → Google login →
 * back here connected. Then the owner picks their Meu Negócio location and GA4
 * property from dropdowns. Tokens never appear. Platform setup (env, redirect URIs)
 * lives only in the collapsed "Avançado" block for the Foocci team.
 */

import { useCallback, useEffect, useState } from "react";
import { buildGoogleSetupInstructions } from "@/services/google/googleSetupInstructions";

interface StatusView {
  featureEnabled: boolean;
  connected: boolean;
  googleEmail: string | null;
  scopes: string[];
  hasBusinessScope: boolean;
  hasAnalyticsScope: boolean;
  businessLocationId: string | null;
  businessLocationName: string | null;
  ga4PropertyId: string | null;
  ga4PropertyName: string | null;
  connectedAt: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  env?: { oauthConfigured: boolean; encryptionKey: boolean; publicBaseUrl: boolean };
}

interface BusinessLocation { name: string; title: string; accountName: string; address: string | null }
interface Ga4Property { property: string; displayName: string; account: string }

interface ReviewSummary {
  available: boolean;
  averageRating: number | null;
  totalReviewCount: number | null;
  reviews: Array<{ reviewer: string; starRating: number | null; comment: string | null; createTime: string | null; reply: string | null }>;
  reason?: string;
}
interface Ga4Snapshot {
  ok: boolean;
  rangeDays: number;
  totals: { activeUsers: number; sessions: number; screenPageViews: number; conversions: number };
  topPages: Array<{ path: string; views: number }>;
  byDay: Array<{ date: string; activeUsers: number; sessions: number }>;
  error?: string;
}

async function api(url: string, method = "GET", body?: object) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, data: json?.data ?? json, error: json?.error as string | undefined };
}

const FLAG_MESSAGES: Record<string, { ok: boolean; text: string }> = {
  connected:        { ok: true,  text: "Google conectado com sucesso." },
  error:            { ok: false, text: "Não foi possível concluir a conexão com o Google. Tente novamente." },
  forbidden:        { ok: false, text: "Apenas o proprietário ou gerente pode conectar o Google." },
  blocked_env:      { ok: false, text: "Integração Google ainda não habilitada pela Foocci. Fale com o suporte." },
  blocked_base_url: { ok: false, text: "Configuração de domínio pendente. Fale com o suporte Foocci." },
};

export function GoogleIntegrationClient({ userRole }: { userRole: string }) {
  const isManager = userRole === "OWNER" || userRole === "MANAGER";

  const [status, setStatus]   = useState<StatusView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState<string | null>(null);
  const [msg, setMsg]         = useState<{ ok: boolean; text: string } | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [copied, setCopied]   = useState(false);

  // Meu Negócio
  const [locations, setLocations] = useState<BusinessLocation[] | null>(null);
  const [reviews, setReviews]     = useState<ReviewSummary | null>(null);

  // GA4
  const [properties, setProperties] = useState<Ga4Property[] | null>(null);
  const [snapshot, setSnapshot]     = useState<Ga4Snapshot | null>(null);
  const [rangeDays, setRangeDays]   = useState(28);

  const flash = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 6000); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { ok, data } = await api("/api/integrations/google");
      if (ok) setStatus(data as StatusView);
    } catch { /* leave null */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // OAuth redirect flag → flash + clean the URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const flag = params.get("google");
    if (flag && FLAG_MESSAGES[flag]) {
      const m = FLAG_MESSAGES[flag];
      setMsg(m);
      setTimeout(() => setMsg(null), 6000);
      params.delete("google");
      const qs = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
  }, []);

  function connect() {
    window.location.href = "/api/integrations/google/oauth/start";
  }

  async function disconnect() {
    if (!confirm("Desconectar o Google? As credenciais e seleções serão removidas.")) return;
    setBusy("disconnect");
    const { ok } = await api("/api/integrations/google/oauth/disconnect", "POST");
    setBusy(null);
    if (ok) { flash(true, "Google desconectado."); setLocations(null); setReviews(null); setProperties(null); setSnapshot(null); void load(); }
    else flash(false, "Falha ao desconectar.");
  }

  // ── Meu Negócio ──────────────────────────────────────────────────────────────
  async function loadLocations() {
    setBusy("locations");
    const { ok, data, error } = await api("/api/integrations/google/business");
    setBusy(null);
    if (ok) setLocations((data as { locations: BusinessLocation[] }).locations);
    else flash(false, error ?? "Não foi possível carregar os locais.");
  }
  async function selectLocation(loc: BusinessLocation | null) {
    setBusy("select-location");
    const { ok, error } = await api("/api/integrations/google/business", "POST",
      loc ? { name: loc.name, accountName: loc.accountName, title: loc.title } : {});
    setBusy(null);
    if (ok) { flash(true, loc ? "Local selecionado." : "Seleção removida."); void load(); setReviews(null); }
    else flash(false, error ?? "Falha ao selecionar o local.");
  }
  async function loadReviews() {
    setBusy("reviews");
    const { ok, data, error } = await api("/api/integrations/google/business/reviews");
    setBusy(null);
    if (ok) setReviews(data as ReviewSummary);
    else flash(false, error ?? "Não foi possível carregar avaliações.");
  }

  // ── GA4 ──────────────────────────────────────────────────────────────────────
  async function loadProperties() {
    setBusy("properties");
    const { ok, data, error } = await api("/api/integrations/google/analytics");
    setBusy(null);
    if (ok) setProperties((data as { properties: Ga4Property[] }).properties);
    else flash(false, error ?? "Não foi possível carregar as propriedades.");
  }
  async function selectProperty(prop: Ga4Property | null) {
    setBusy("select-property");
    const { ok, error } = await api("/api/integrations/google/analytics", "POST",
      prop ? { property: prop.property, displayName: prop.displayName } : {});
    setBusy(null);
    if (ok) { flash(true, prop ? "Propriedade selecionada." : "Seleção removida."); void load(); setSnapshot(null); }
    else flash(false, error ?? "Falha ao selecionar a propriedade.");
  }
  const loadSnapshot = useCallback(async (days: number) => {
    setBusy("snapshot");
    const { ok, data, error } = await api(`/api/integrations/google/analytics/report?days=${days}`);
    setBusy(null);
    if (ok) setSnapshot(data as Ga4Snapshot);
    else flash(false, error ?? "Não foi possível carregar o relatório.");
  }, []);

  // Auto-load snapshot when a property is selected
  useEffect(() => {
    if (status?.connected && status.ga4PropertyId) void loadSnapshot(rangeDays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.ga4PropertyId, rangeDays]);

  async function copyInstructions() {
    try {
      await navigator.clipboard.writeText(buildGoogleSetupInstructions(window.location.origin));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { flash(false, "Não foi possível copiar."); }
  }

  if (loading) {
    return <div className="mx-auto max-w-2xl px-4 pt-6 sm:px-6"><div className="h-40 animate-pulse rounded-2xl bg-gray-100" /></div>;
  }

  const connected = status?.connected ?? false;

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 pt-6 sm:px-6 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-base font-bold text-gray-900">Google</h1>
        <p className="mt-1 text-sm text-gray-500">
          Conecte sua conta Google uma vez para usar o <strong>Meu Negócio</strong> (avaliações) e o{" "}
          <strong>Analytics GA4</strong> (métricas do site). Um clique, sem códigos.
        </p>
      </div>

      {msg && (
        <div className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>{msg.text}</div>
      )}

      {/* Connection card */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500 text-lg text-white">G</div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Conta Google</p>
              {connected
                ? <p className="text-xs text-green-700">✓ Conectado{status?.googleEmail ? ` · ${status.googleEmail}` : ""}</p>
                : <p className="text-xs text-gray-500">Não conectado</p>}
            </div>
          </div>
          {connected ? (
            isManager && (
              <button type="button" disabled={busy === "disconnect"} onClick={disconnect}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">
                Desconectar
              </button>
            )
          ) : (
            isManager ? (
              <button type="button" disabled={!status?.featureEnabled} onClick={connect}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                {status?.featureEnabled ? "Conectar Google" : "Em breve"}
              </button>
            ) : null
          )}
        </div>
        {!status?.featureEnabled && !connected && (
          <p className="mt-3 text-xs text-gray-400">Disponível quando ativado pela Foocci.</p>
        )}
        {!isManager && (
          <p className="mt-3 text-xs text-gray-400">Apenas o proprietário ou gerente pode conectar o Google.</p>
        )}
      </div>

      {connected && (
        <>
          {/* Google Meu Negócio */}
          <section className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-900">Google Meu Negócio</h2>
              <span className="text-[10px] font-semibold text-gray-400">Avaliações &amp; perfil</span>
            </div>

            {!status?.hasBusinessScope ? (
              <p className="mt-2 text-xs text-amber-600">Permissão do Meu Negócio não concedida. Reconecte e aceite todas as permissões.</p>
            ) : status?.businessLocationName ? (
              <div className="mt-3">
                <p className="text-xs text-gray-500">Local selecionado</p>
                <p className="text-sm font-semibold text-gray-800">{status.businessLocationName}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" disabled={!!busy} onClick={loadReviews}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                    {busy === "reviews" ? "Carregando…" : "Ver avaliações"}
                  </button>
                  <button type="button" disabled={!!busy} onClick={() => { setLocations(null); void loadLocations(); }}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50">
                    Trocar local
                  </button>
                </div>
                {reviews && <ReviewsBlock reviews={reviews} />}
              </div>
            ) : (
              <div className="mt-3">
                <p className="text-xs text-gray-500">Escolha o local do seu restaurante no Google Meu Negócio.</p>
                {!locations ? (
                  <button type="button" disabled={!!busy} onClick={loadLocations}
                    className="mt-2 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black disabled:opacity-50">
                    {busy === "locations" ? "Buscando…" : "Buscar meus locais"}
                  </button>
                ) : (
                  <LocationPicker locations={locations} busy={!!busy} onSelect={selectLocation} />
                )}
              </div>
            )}
          </section>

          {/* Google Analytics GA4 */}
          <section className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-900">Google Analytics (GA4)</h2>
              <span className="text-[10px] font-semibold text-gray-400">Métricas do site</span>
            </div>

            {!status?.hasAnalyticsScope ? (
              <p className="mt-2 text-xs text-amber-600">Permissão do Analytics não concedida. Reconecte e aceite todas as permissões.</p>
            ) : status?.ga4PropertyName ? (
              <div className="mt-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500">Propriedade selecionada</p>
                    <p className="text-sm font-semibold text-gray-800">{status.ga4PropertyName}</p>
                  </div>
                  <div className="flex gap-1">
                    {[7, 28, 90].map((d) => (
                      <button key={d} type="button" onClick={() => setRangeDays(d)}
                        className={`rounded-md px-2 py-1 text-[11px] font-semibold ${rangeDays === d ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                        {d}d
                      </button>
                    ))}
                  </div>
                </div>
                {snapshot ? <SnapshotBlock snapshot={snapshot} loading={busy === "snapshot"} />
                  : <p className="mt-3 text-xs text-gray-400">{busy === "snapshot" ? "Carregando métricas…" : "—"}</p>}
                <button type="button" disabled={!!busy} onClick={() => { setProperties(null); void loadProperties(); }}
                  className="mt-3 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50">
                  Trocar propriedade
                </button>
              </div>
            ) : (
              <div className="mt-3">
                <p className="text-xs text-gray-500">Escolha a propriedade GA4 do seu site.</p>
                {!properties ? (
                  <button type="button" disabled={!!busy} onClick={loadProperties}
                    className="mt-2 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black disabled:opacity-50">
                    {busy === "properties" ? "Buscando…" : "Buscar minhas propriedades"}
                  </button>
                ) : (
                  <PropertyPicker properties={properties} busy={!!busy} onSelect={selectProperty} />
                )}
              </div>
            )}
          </section>
        </>
      )}

      {/* Advanced — platform setup (managers only) */}
      {isManager && status?.env && (
        <div>
          <button type="button" onClick={() => setShowAdvanced((s) => !s)}
            className="text-[11px] font-medium text-gray-400 hover:text-gray-600">
            {showAdvanced ? "Ocultar avançado" : "Avançado · configuração da plataforma"}
          </button>
          {showAdvanced && (
            <div className="mt-2 space-y-2 rounded-lg bg-gray-50 px-3 py-3 text-[11px] text-gray-600">
              <button type="button" onClick={copyInstructions}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-50">
                {copied ? "Copiado ✓" : "Copiar instruções para configurar Google"}
              </button>
              <div className="space-y-0.5 pt-1">
                <Check ok={status.env.oauthConfigured} label="Credenciais OAuth do Google configuradas" />
                <Check ok={status.env.encryptionKey}   label="Chave de criptografia configurada" />
                <Check ok={status.env.publicBaseUrl}   label="Domínio público configurado" />
              </div>
              {status.lastError && <p className="text-red-500">Último erro: {status.lastError}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LocationPicker({ locations, busy, onSelect }: { locations: BusinessLocation[]; busy: boolean; onSelect: (l: BusinessLocation) => void }) {
  if (locations.length === 0) return <p className="mt-2 text-xs text-amber-600">Nenhum local encontrado nesta conta Google.</p>;
  return (
    <div className="mt-2 space-y-1.5">
      {locations.map((loc) => (
        <button key={loc.name} type="button" disabled={busy} onClick={() => onSelect(loc)}
          className="flex w-full items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-left hover:border-blue-300 hover:bg-blue-50/40 disabled:opacity-50">
          <div>
            <p className="text-sm font-medium text-gray-800">{loc.title}</p>
            {loc.address && <p className="text-[11px] text-gray-400">{loc.address}</p>}
          </div>
          <span className="text-xs font-semibold text-blue-600">Selecionar</span>
        </button>
      ))}
    </div>
  );
}

function PropertyPicker({ properties, busy, onSelect }: { properties: Ga4Property[]; busy: boolean; onSelect: (p: Ga4Property) => void }) {
  if (properties.length === 0) return <p className="mt-2 text-xs text-amber-600">Nenhuma propriedade GA4 encontrada nesta conta.</p>;
  return (
    <div className="mt-2 space-y-1.5">
      {properties.map((p) => (
        <button key={p.property} type="button" disabled={busy} onClick={() => onSelect(p)}
          className="flex w-full items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-left hover:border-blue-300 hover:bg-blue-50/40 disabled:opacity-50">
          <div>
            <p className="text-sm font-medium text-gray-800">{p.displayName}</p>
            <p className="text-[11px] text-gray-400">{p.account}</p>
          </div>
          <span className="text-xs font-semibold text-blue-600">Selecionar</span>
        </button>
      ))}
    </div>
  );
}

function ReviewsBlock({ reviews }: { reviews: ReviewSummary }) {
  if (!reviews.available) {
    return <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">{reviews.reason}</p>;
  }
  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center gap-3 text-xs">
        {reviews.averageRating != null && (
          <span className="font-semibold text-gray-800">★ {reviews.averageRating.toFixed(1)}</span>
        )}
        {reviews.totalReviewCount != null && (
          <span className="text-gray-500">{reviews.totalReviewCount} avaliações</span>
        )}
      </div>
      {reviews.reviews.length === 0 ? (
        <p className="text-[11px] text-gray-400">Nenhuma avaliação recente.</p>
      ) : (
        <div className="space-y-1.5">
          {reviews.reviews.slice(0, 8).map((r, i) => (
            <div key={i} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-700">{r.reviewer}</span>
                {r.starRating != null && <span className="text-[11px] text-amber-500">{"★".repeat(r.starRating)}</span>}
              </div>
              {r.comment && <p className="mt-0.5 text-[11px] text-gray-500 line-clamp-3">{r.comment}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SnapshotBlock({ snapshot, loading }: { snapshot: Ga4Snapshot; loading: boolean }) {
  if (!snapshot.ok) {
    return <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">{snapshot.error}</p>;
  }
  const t = snapshot.totals;
  const cells: Array<[string, number]> = [
    ["Usuários ativos", t.activeUsers],
    ["Sessões", t.sessions],
    ["Visualizações", t.screenPageViews],
    ["Conversões", t.conversions],
  ];
  return (
    <div className={`mt-3 ${loading ? "opacity-50" : ""}`}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {cells.map(([label, val]) => (
          <div key={label} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
            <p className="text-lg font-bold text-gray-900">{val.toLocaleString("pt-BR")}</p>
            <p className="text-[10px] text-gray-500">{label}</p>
          </div>
        ))}
      </div>
      {snapshot.topPages.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-[11px] font-semibold text-gray-500">Páginas mais vistas</p>
          <div className="space-y-1">
            {snapshot.topPages.map((p, i) => (
              <div key={i} className="flex items-center justify-between text-[11px]">
                <span className="truncate text-gray-600">{p.path}</span>
                <span className="ml-2 shrink-0 font-semibold text-gray-800">{p.views.toLocaleString("pt-BR")}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return <div className={ok ? "text-green-600" : "text-red-500"}>{ok ? "✓" : "✗"} {label}</div>;
}
