"use client";

/**
 * Facebook Messenger — integração do lojista (one-click connect).
 * Usa o mesmo Page Access Token que o Instagram (mesma Página do Facebook).
 * Caminho principal: "Conectar com Facebook" → escolher Página → conectado.
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface FacebookView {
  provider: string;
  status: "unconfigured" | "configured" | "active";
  isActive: boolean;
  facebookPageId: string | null;
  facebookPageName: string | null;
  connected: boolean;
  tokenConfigured: boolean;
  lastWebhookAt: string | null;
  lastError: string | null;
  metaConnectAvailable: boolean;
  missingEnv: string[];
}

interface PageCandidate {
  pageId: string;
  pageName: string;
  instagramBusinessAccountId: string | null;
  instagramUsername: string | null;
  hasInstagram: boolean;
}

const META_FLASH: Record<string, { kind: "ok" | "err" | "info"; text: string }> = {
  blocked_env: { kind: "err", text: "Conexão automática indisponível no momento. Fale com o suporte Foocci." },
  blocked_base_url: { kind: "err", text: "Conexão automática indisponível no momento. Fale com o suporte Foocci." },
  error: { kind: "err", text: "Não foi possível concluir a conexão com a Meta. Tente novamente." },
  no_pages: { kind: "err", text: "Nenhuma Página do Facebook foi encontrada na sua conta." },
  forbidden: { kind: "err", text: "Apenas o proprietário ou gerente pode conectar." },
  select_page: { kind: "info", text: "Conexão encontrada. Escolha a Página do Facebook que você quer usar para receber mensagens do Messenger." },
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("pt-BR"); } catch { return iso; }
}

function EnvCheck({ ok, label, soft }: { ok: boolean; label: string; soft?: boolean }) {
  const okColor = soft ? "text-ink2" : "text-emerald-600";
  return (
    <div className={`text-xs ${ok ? okColor : soft ? "text-muted" : "text-red-500"}`}>
      {ok ? "✓" : soft ? "○" : "✗"} {label}
    </div>
  );
}

export function FacebookIntegrationClient({ userRole }: { userRole: string }) {
  const canEdit = userRole === "OWNER" || userRole === "MANAGER";
  const [view, setView] = useState<FacebookView | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err" | "info"; text: string } | null>(null);
  const [flow, setFlow] = useState<"normal" | "select_page">("normal");
  const [candidates, setCandidates] = useState<PageCandidate[]>([]);

  // Support mode — technical/platform tooling is hidden from the lojista and only
  // shown to Foocci support via ?suporte=1. SSR-safe: starts false, set after mount.
  const [supportMode, setSupportMode] = useState(false);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setSupportMode(p.get("suporte") === "1" || p.get("support") === "1");
  }, []);

  const load = useCallback(async () => {
    const res = await fetch("/api/integrations/facebook");
    const json = await res.json().catch(() => ({}));
    // The endpoint returns the object directly (not nested under .data)
    const v: FacebookView | null = json?.provider ? (json as FacebookView) : null;
    setView(v);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Read ?meta=... once on mount.
  useEffect(() => {
    const flash = new URLSearchParams(window.location.search).get("meta");
    if (!flash) return;
    if (META_FLASH[flash]) setMsg(META_FLASH[flash]);
    if (flash === "select_page") {
      setFlow("select_page");
      fetch("/api/integrations/meta/oauth/candidates")
        .then((r) => r.json())
        .then((j) => setCandidates(j?.data?.candidates ?? []))
        .catch(() => {});
    }
  }, []);

  async function selectPageId(pId: string) {
    setSaving(true); setMsg(null);
    const res = await fetch("/api/integrations/meta/oauth/select-page", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageId: pId }),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setMsg({ kind: "err", text: json?.error ?? "Não foi possível conectar esta Página." });
      return;
    }
    setFlow("normal");
    setMsg({ kind: "ok", text: "Conectado! As mensagens do Facebook Messenger vão aparecer na Central." });
    window.history.replaceState({}, "", "/integracoes/facebook");
    await load();
  }

  async function disconnect() {
    if (!confirm("Desconectar o Facebook Messenger? O histórico de conversas é preservado.")) return;
    setSaving(true);
    await fetch("/api/integrations/meta/oauth/disconnect", { method: "POST" });
    setSaving(false);
    setMsg({ kind: "ok", text: "Integração desconectada. O histórico foi preservado." });
    await load();
  }

  if (loading) return <div className="p-6 text-sm text-muted">Carregando…</div>;

  const connected = view?.connected ?? false;

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 space-y-6 text-ink">
      <div>
        <Link href="/integracoes" className="text-sm text-muted hover:text-ink2">← Integrações</Link>
        <h1 className="mt-1 text-2xl font-bold">Facebook</h1>
        <p className="text-sm text-muted">Receba mensagens do Facebook Messenger na Central de Atendimento.</p>
      </div>

      {msg && (
        <div className={`rounded-lg px-3 py-2 text-sm ${
          msg.kind === "ok" ? "bg-emerald-50 text-emerald-700"
          : msg.kind === "info" ? "bg-sky-50 text-sky-700"
          : "bg-red-50 text-red-700"
        }`}>
          {msg.text}
        </div>
      )}

      {/* ── Seleção de Página (após retorno do OAuth) ── */}
      {flow === "select_page" && (
        <section className="rounded-xl border border-sky-200 bg-paper p-4">
          <h2 className="text-sm font-semibold">Escolha a Página do Facebook</h2>
          <p className="mt-1 text-sm text-muted">Esta é a Página que enviará e receberá mensagens no Messenger.</p>
          <div className="mt-3 space-y-2">
            {candidates.length === 0 && <p className="text-sm text-muted">Nenhuma Página encontrada.</p>}
            {candidates.map((c) => (
              <div key={c.pageId} className="flex items-center justify-between rounded-lg border border-line2 px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{c.pageName || "Página do Facebook"}</p>
                  <p className="text-xs text-muted">
                    {c.hasInstagram
                      ? `Instagram conectado: ${c.instagramUsername ? "@" + c.instagramUsername : "sim"}`
                      : "Página do Facebook sem Instagram profissional."}
                  </p>
                </div>
                <button
                  disabled={saving}
                  onClick={() => selectPageId(c.pageId)}
                  className="rounded-md bg-[#1877F2] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#166fe0] disabled:opacity-40"
                >
                  Conectar esta Página
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Não conectado: Conectar com Facebook ── */}
      {flow === "normal" && !connected && (
        <section className="rounded-xl border border-line2 bg-paper p-6 text-center">
          <p className="text-sm text-ink2">Conecte sua Página do Facebook para receber mensagens do Messenger na Central.</p>
          <a
            href="/api/integrations/meta/oauth/start?from=facebook"
            className="mt-3 inline-block rounded-md bg-[#1877F2] px-5 py-2.5 font-semibold text-white hover:bg-[#166fe0]"
          >
            Conectar com Facebook
          </a>
          <p className="mt-2 text-xs text-muted">Você será direcionado para a Meta para autorizar o Foocci.</p>
          {view && !view.metaConnectAvailable && (
            <div className="mx-auto mt-3 max-w-md rounded-md bg-amber-50 px-3 py-2 text-left text-xs text-amber-700">
              <p>Conexão automática indisponível no momento. Fale com o suporte Foocci.</p>
              {supportMode && (
                <ul className="mt-1 list-disc pl-4 font-mono">
                  {(view.missingEnv ?? []).map((m) => <li key={m}>{m}</li>)}
                </ul>
              )}
            </div>
          )}
        </section>
      )}

      {/* ── Conectado ── */}
      {flow === "normal" && connected && (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-emerald-800">Conectado</h2>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">Ativo</span>
          </div>
          <div className="mt-2 grid grid-cols-1 gap-y-1 text-sm sm:grid-cols-2">
            <p>Página: <b>{view?.facebookPageName ?? view?.facebookPageId ?? "—"}</b></p>
            <p>Última mensagem recebida: <b>{fmtDate(view?.lastWebhookAt ?? null)}</b></p>
          </div>
          {canEdit && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={disconnect}
                disabled={saving}
                className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-paper disabled:opacity-50"
              >
                Desconectar
              </button>
              <Link href="/atendimento" className="rounded-md border border-line2 px-3 py-1.5 text-sm hover:bg-paper">
                Abrir Central de Atendimento
              </Link>
            </div>
          )}
        </section>
      )}

      {/* ── Onde vou responder? ── */}
      <section className="rounded-xl border border-sky-200 bg-sky-50 p-4">
        <h2 className="text-sm font-semibold text-sky-800">Onde vou responder?</h2>
        <p className="mt-1 text-sm text-sky-700">
          As mensagens do Facebook Messenger aparecerão em <b>Atendimento</b>, com o selo <b>Messenger</b>.
        </p>
        <Link href="/atendimento" className="mt-2 inline-block text-sm font-semibold text-sky-700 hover:text-sky-900">
          Abrir Central de Atendimento →
        </Link>
      </section>

      {/* ── Avançado · Variáveis de ambiente (support gate) ── */}
      {supportMode && (
      <details className="rounded-xl border border-line2 bg-paper p-4">
        <summary className="cursor-pointer text-sm font-semibold text-ink2">Avançado · Uso interno Foocci</summary>
        <div className="mt-3 space-y-4 text-sm text-ink2">
          <div className="space-y-0.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Variáveis no servidor</p>
            <EnvCheck
              ok={!!(view?.missingEnv && !view.missingEnv.some((m) => m.includes("APP_ID")))}
              label="META_APP_ID ou FACEBOOK_APP_ID"
            />
            <EnvCheck
              ok={!!(view?.missingEnv && !view.missingEnv.some((m) => m.includes("APP_SECRET")))}
              label="META_APP_SECRET ou FACEBOOK_APP_SECRET"
            />
            <EnvCheck
              ok={!!(view?.missingEnv && !view.missingEnv.some((m) => m.includes("BASE_URL")))}
              label="FOOCCI_BASE_URL ou APP_URL"
            />
            <EnvCheck ok={view?.metaConnectAvailable ?? false} label="OAuth pronto (todas as vars acima configuradas)" />
          </div>

          <div className="space-y-0.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Fluxo de teste</p>
            <div className="text-xs text-muted">• 1. Conectar com Facebook → escolher Página</div>
            <div className="text-xs text-muted">• 2. Enviar uma mensagem via Messenger da Página</div>
            <div className="text-xs text-muted">• 3. Conferir na Central de Atendimento (selo Messenger)</div>
          </div>

          <div className="space-y-0.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Nota sobre token</p>
            <div className="text-xs text-muted">
              O mesmo Page Access Token é usado para o Instagram Direct e o Facebook Messenger.
              Conectar via Instagram também habilita o Messenger automaticamente (e vice-versa).
            </div>
          </div>
        </div>
      </details>
      )}
    </div>
  );
}
