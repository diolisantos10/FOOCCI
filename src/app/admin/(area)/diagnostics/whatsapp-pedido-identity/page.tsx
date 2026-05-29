"use client";

import { useState, useCallback } from "react";

// ── API response shape ────────────────────────────────────────────────────────

interface Step2Customer {
  inputPhone:    string;
  candidates:    string[];
  found:         boolean;
  customerId:    string | null;
  customerPhone: string | null;
  customerName:  string | null;
  mismatchNote:  string | null;
}

interface Step3MenuUrl {
  configuredMenuUrl: string | null;
  rawMenuUrl:        string | null;
  fixedMenuUrl:      string | null;
  basePedidoUrl:     string | null;
  isRelativeUrl:     boolean | null;
  isQrUrl:           boolean;
  menuOptions:       unknown;
}

interface Step6Verify {
  token:           string;
  verifySucceeded: boolean;
  verifyError:     string | null;
  tokenPhone:      string | null;
  tokenName:       string | null;
  tokenExpISO:     string | null;
  phonesMatch:     boolean;
}

interface Step7PedidoUrl {
  basePedidoUrl:      string | null;
  pedidoUrlGenerated: boolean;
  pedidoUrlPreview:   string | null;
  hasWaTokenParam:    boolean;
  hasSrcParam:        boolean;
  urlBuildError:      string | null;
}

interface Step8SSR {
  tokenPhone?:    string;
  ssrCandidates?: string[];
  customerFound?: boolean;
  customerId?:    string | null;
  customerPhone?: string | null;
  customerName?:  string | null;
  ssrError?:      string | null;
  verdict:        string;
}

interface Step9Conv {
  conversationId?:        string;
  channel?:               string;
  status?:                string;
  conversationPhone?:     string | null;
  lastMessageAt?:         string | null;
  aiEnabled?:             boolean;
  lastAiReply?:           { preview: string; sentAt: string } | null;
  lastAiReplyHasLink?:    boolean | null;
  lastAiReplyHasWaToken?: boolean | null;
  lastAiReplyAgeHours?:   number | null;
  mightPreDateFix?:       boolean | null;
  step9Note?:             string;
  found?:                 boolean;
  note?:                  string;
}

interface DiagResult {
  generatedAt:          string;
  slug:                 string;
  phone:                string;
  step1_restaurant?:    { found: boolean; restaurantId?: string; name?: string; error?: string };
  step2_customer?:      Step2Customer;
  step3_menuUrl?:       Step3MenuUrl;
  step4_secret?:        { NEXTAUTH_SECRET_set: boolean; NEXTAUTH_SECRET_len: number; APP_SECRET_set: boolean; note: string };
  step5_signToken?:     { phoneUsed: string; signSucceeded: boolean; signError: string | null; tokenPreview: string | null; tokenLength: number | null };
  step6_verifyRoundTrip?: Step6Verify;
  step7_pedidoUrl?:     Step7PedidoUrl;
  step8_ssrResolution?: Step8SSR;
  step9_latestConversation?: Step9Conv;
  summary?:             { verdict: string; failures: string[]; warnings?: string[]; recommendation: string };
  error?:               string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Pill({ ok, label }: { ok: boolean | null; label: string }) {
  if (ok === null) return <span className="rounded px-1.5 py-0.5 text-[10px] font-mono bg-gray-800 text-gray-500">{label}</span>;
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold ${
      ok ? "bg-green-900/50 text-green-300" : "bg-red-900/50 text-red-300"
    }`}>
      {ok ? "✓" : "✗"} {label}
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-1.5 border-b border-gray-800/60 last:border-0">
      <span className="w-44 shrink-0 text-[11px] text-gray-500 pt-0.5">{label}</span>
      <div className="flex-1 text-xs text-gray-200 font-mono break-all">{children}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1">
      <h2 className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">{title}</h2>
      <div className="rounded-lg border border-gray-800 bg-gray-900/40 px-4 py-2 space-y-0">
        {children}
      </div>
    </section>
  );
}

function RawJson({ data }: { data: unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-[11px] text-gray-500 hover:text-gray-300 underline underline-offset-2 transition-colors"
      >
        {open ? "ocultar JSON completo" : "ver JSON completo"}
      </button>
      {open && (
        <pre className="mt-2 overflow-x-auto rounded-lg border border-gray-800 bg-gray-950 p-3 text-[10px] text-gray-300 font-mono leading-relaxed max-h-[600px]">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function WhatsAppPedidoIdentityPage() {
  const [slug,    setSlug]    = useState("sushi-cazza");
  const [phone,   setPhone]   = useState("+5511940595223");
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState<DiagResult | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const params = new URLSearchParams({ slug: slug.trim(), phone: phone.trim() });
      const res = await fetch(`/api/admin/diagnostics/whatsapp-pedido-identity?${params}`);
      if (res.status === 401 || res.status === 403) {
        setError("Sessão expirada ou sem permissão — faça login novamente em /admin/login.");
        return;
      }
      const json = await res.json() as DiagResult;
      if (json.error) { setError(json.error); return; }
      setResult(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [slug, phone]);

  const s2 = result?.step2_customer;
  const s3 = result?.step3_menuUrl;
  const s5 = result?.step5_signToken;
  const s6 = result?.step6_verifyRoundTrip;
  const s7 = result?.step7_pedidoUrl;
  const s8 = result?.step8_ssrResolution;
  const s9 = result?.step9_latestConversation;
  const sm = result?.summary;

  const verdictStyle = sm?.verdict === "PASS — identity chain intact"
    ? "bg-green-900/50 border-green-600 text-green-200"
    : "bg-red-900/50 border-red-700 text-red-200";

  return (
    <div className="p-6 space-y-6 max-w-3xl">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">Diagnóstico — WhatsApp → /pedido Identity</h1>
        <p className="mt-1 text-sm text-gray-400">
          Rastreia o caminho completo: cliente WhatsApp → waToken → URL → SSR → reconhecimento no /pedido.
        </p>
      </div>

      {/* Controls */}
      <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor="wa-slug" className="text-xs font-medium text-gray-400">
              Slug do restaurante
            </label>
            <input
              id="wa-slug"
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="sushi-cazza"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="wa-phone" className="text-xs font-medium text-gray-400">
              Telefone do cliente (E.164)
            </label>
            <input
              id="wa-phone"
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+5511999990000"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => void run()}
          disabled={loading || !slug.trim() || !phone.trim()}
          className="rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-white transition-colors"
        >
          {loading ? "Rodando…" : "Rodar diagnóstico"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-700 bg-red-900/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <>
          {/* Overall verdict */}
          {sm && (
            <div className={`rounded-xl border-2 px-5 py-4 space-y-2 ${verdictStyle}`}>
              <div className="text-xl font-bold">
                {sm.verdict === "PASS — identity chain intact" ? "✅ PASS — cadeia de identidade OK" : "❌ FAIL"}
              </div>
              {sm.failures.length > 0 && (
                <ul className="space-y-1">
                  {sm.failures.map((f, i) => (
                    <li key={i} className="text-sm flex items-start gap-2">
                      <span className="shrink-0">•</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              )}
              {sm.failures.length === 0 && sm.warnings?.length === 0 && (
                <p className="text-sm opacity-80">{sm.recommendation}</p>
              )}
            </div>
          )}

          {/* Warnings (non-blocking) */}
          {sm && sm.warnings && sm.warnings.length > 0 && (
            <div className="rounded-lg border border-yellow-700 bg-yellow-950/30 px-4 py-3 space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-yellow-400">Avisos (não bloqueadores)</p>
              {sm.warnings.map((w, i) => (
                <p key={i} className="text-sm text-yellow-200 flex items-start gap-2">
                  <span className="shrink-0">⚠️</span>
                  <span>{w}</span>
                </p>
              ))}
            </div>
          )}

          {/* Step 1 — Restaurant */}
          {result.step1_restaurant && (
            <Section title="Step 1 — Restaurante">
              <Row label="Encontrado">
                <Pill ok={result.step1_restaurant.found} label={result.step1_restaurant.found ? "sim" : "não"} />
              </Row>
              {result.step1_restaurant.name && (
                <Row label="Nome">{result.step1_restaurant.name}</Row>
              )}
              {result.step1_restaurant.error && (
                <Row label="Erro"><span className="text-red-300">{result.step1_restaurant.error}</span></Row>
              )}
            </Section>
          )}

          {/* Step 2 — Customer */}
          {s2 && (
            <Section title="Step 2 — Cliente por telefone">
              <Row label="Telefone de entrada">{s2.inputPhone}</Row>
              <Row label="Candidatos testados">
                <span className="flex flex-wrap gap-1">
                  {s2.candidates.map((c) => (
                    <code key={c} className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px]">{c}</code>
                  ))}
                  {s2.candidates.length === 0 && <span className="text-red-300">nenhum candidato gerado</span>}
                </span>
              </Row>
              <Row label="Cliente encontrado">
                <Pill ok={s2.found} label={s2.found ? "sim" : "não"} />
              </Row>
              {s2.found && (
                <>
                  <Row label="ID">{s2.customerId}</Row>
                  <Row label="Telefone no DB">{s2.customerPhone ?? "null"}</Row>
                  <Row label="Nome">{s2.customerName ?? "—"}</Row>
                </>
              )}
              {s2.mismatchNote && (
                <Row label="Mismatch">
                  <span className="text-yellow-300">{s2.mismatchNote}</span>
                </Row>
              )}
            </Section>
          )}

          {/* Step 3 — Menu URL */}
          {s3 && (
            <Section title="Step 3 — URL do cardápio (menuUrl)">
              <Row label="Configurado">{s3.configuredMenuUrl ?? <span className="text-gray-500">não configurado</span>}</Row>
              <Row label="Após fallback">{s3.rawMenuUrl ?? "null"}</Row>
              <Row label="Após remap /qr→/pedido">{s3.fixedMenuUrl ?? "null"}</Row>
              <Row label="Base URL final">{s3.basePedidoUrl ?? "null"}</Row>
              <Row label="É relativa?">
                <Pill ok={s3.isRelativeUrl === false} label={s3.isRelativeUrl ? "sim — PROBLEMA" : "não — OK"} />
              </Row>
              <Row label="Ainda usa /qr/?">
                <Pill ok={!s3.isQrUrl} label={s3.isQrUrl ? "sim — PROBLEMA" : "não — OK"} />
              </Row>
            </Section>
          )}

          {/* Step 4 — Secret */}
          {result.step4_secret && (
            <Section title="Step 4 — NEXTAUTH_SECRET">
              <Row label="Configurado">
                <Pill ok={result.step4_secret.NEXTAUTH_SECRET_set} label={result.step4_secret.NEXTAUTH_SECRET_set ? `sim (${result.step4_secret.NEXTAUTH_SECRET_len} chars)` : "ausente — PROBLEMA"} />
              </Row>
              <Row label="Nota">{result.step4_secret.note}</Row>
            </Section>
          )}

          {/* Step 5 + 6 — Token sign + verify */}
          {(s5 || s6) && (
            <Section title="Steps 5–6 — waToken (assinar + verificar)">
              {s5 && (
                <>
                  <Row label="Telefone usado p/ assinar">{s5.phoneUsed}</Row>
                  <Row label="Assinatura OK">
                    <Pill ok={s5.signSucceeded} label={s5.signSucceeded ? "sim" : "falhou"} />
                    {s5.signError && <span className="ml-2 text-red-300">{s5.signError}</span>}
                  </Row>
                  {s5.tokenPreview && (
                    <Row label="Token (preview)">{s5.tokenPreview}</Row>
                  )}
                </>
              )}
              {s6 && (
                <>
                  <Row label="Verificação round-trip">
                    <Pill ok={s6.verifySucceeded} label={s6.verifySucceeded ? "ok" : "falhou"} />
                    {s6.verifyError && <span className="ml-2 text-red-300">{s6.verifyError}</span>}
                  </Row>
                  <Row label="Token phone">{s6.tokenPhone ?? "null"}</Row>
                  <Row label="Phones batem">
                    <Pill ok={s6.phonesMatch} label={s6.phonesMatch ? "sim" : "não batem"} />
                  </Row>
                  <Row label="Expira em">{s6.tokenExpISO ?? "—"}</Row>
                </>
              )}
            </Section>
          )}

          {/* Step 7 — URL gerada */}
          {s7 && (
            <Section title="Step 7 — URL /pedido com waToken">
              <Row label="URL gerada">
                <Pill ok={s7.pedidoUrlGenerated} label={s7.pedidoUrlGenerated ? "sim" : "não"} />
                {s7.urlBuildError && <span className="ml-2 text-red-300">{s7.urlBuildError}</span>}
              </Row>
              {s7.pedidoUrlPreview && (
                <Row label="Preview">{s7.pedidoUrlPreview}</Row>
              )}
              <Row label="Tem waToken=">
                <Pill ok={s7.hasWaTokenParam} label={s7.hasWaTokenParam ? "sim" : "não — PROBLEMA"} />
              </Row>
              <Row label="Tem src=whatsapp">
                <Pill ok={s7.hasSrcParam} label={s7.hasSrcParam ? "sim" : "não"} />
              </Row>
            </Section>
          )}

          {/* Step 8 — SSR simulation */}
          {s8 && (
            <Section title="Step 8 — Simulação SSR (page.tsx resolveria cliente?)">
              <Row label="Veredicto">
                <span className={s8.verdict.startsWith("PASS") ? "text-green-300" : s8.verdict.startsWith("SKIP") ? "text-gray-400" : "text-red-300"}>
                  {s8.verdict}
                </span>
              </Row>
              {s8.tokenPhone && <Row label="Telefone do token">{s8.tokenPhone}</Row>}
              {s8.ssrCandidates && (
                <Row label="Candidatos SSR">
                  <span className="flex flex-wrap gap-1">
                    {s8.ssrCandidates.map((c) => (
                      <code key={c} className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px]">{c}</code>
                    ))}
                  </span>
                </Row>
              )}
              {s8.customerFound !== undefined && (
                <Row label="Cliente encontrado">
                  <Pill ok={s8.customerFound} label={s8.customerFound ? "sim" : "não"} />
                </Row>
              )}
              {s8.customerPhone && <Row label="Telefone no DB">{s8.customerPhone}</Row>}
              {s8.ssrError && <Row label="Erro"><span className="text-red-300">{s8.ssrError}</span></Row>}
            </Section>
          )}

          {/* Step 9 — Latest conversation */}
          {s9 && (
            <Section title="Step 9 — Última resposta IA enviada (histórico)">
              {s9.note ? (
                <Row label="Nota"><span className="text-gray-400">{s9.note}</span></Row>
              ) : s9.found === false ? (
                <Row label="Conversa"><span className="text-yellow-300">não encontrada</span></Row>
              ) : (
                <>
                  <Row label="ID">{s9.conversationId}</Row>
                  <Row label="Canal / status">{s9.channel} / {s9.status}</Row>
                  <Row label="Telefone na conversa">{s9.conversationPhone ?? "null"}</Row>
                  <Row label="Última mensagem">{s9.lastMessageAt ? new Date(s9.lastMessageAt).toLocaleString("pt-BR") : "—"}</Row>
                  <Row label="IA ativa">
                    <Pill ok={s9.aiEnabled ?? null} label={s9.aiEnabled ? "sim" : "não"} />
                  </Row>
                  {s9.lastAiReply ? (
                    <>
                      <Row label="Resposta IA enviada em">
                        <span className="text-gray-200">
                          {new Date(s9.lastAiReply.sentAt).toLocaleString("pt-BR")}
                          {s9.lastAiReplyAgeHours != null && (
                            <span className={`ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded ${
                              s9.mightPreDateFix ? "bg-yellow-900/50 text-yellow-300" : "bg-gray-800 text-gray-400"
                            }`}>
                              {s9.lastAiReplyAgeHours}h atrás
                              {s9.mightPreDateFix ? " · pode ser anterior ao fix" : ""}
                            </span>
                          )}
                        </span>
                      </Row>
                      <Row label="Preview">{s9.lastAiReply.preview}</Row>
                      <Row label="Tem link /pedido">
                        <Pill ok={s9.lastAiReplyHasLink ?? null} label={s9.lastAiReplyHasLink ? "sim" : "não"} />
                      </Row>
                      <Row label="Tem waToken=">
                        <Pill ok={s9.lastAiReplyHasWaToken ?? null} label={
                          s9.lastAiReplyHasWaToken
                            ? "sim ✓"
                            : s9.mightPreDateFix
                              ? "não — mensagem antiga, envie '1' no WhatsApp e rode novamente"
                              : "não — PROBLEMA"
                        } />
                      </Row>
                    </>
                  ) : (
                    <Row label="Última resposta IA"><span className="text-gray-500">nenhuma</span></Row>
                  )}
                  {s9.step9Note && (
                    <div className="mt-2 text-[10px] text-gray-600 leading-relaxed pt-2 border-t border-gray-800">
                      ℹ️ {s9.step9Note}
                    </div>
                  )}
                </>
              )}
            </Section>
          )}

          {/* Raw JSON */}
          <RawJson data={result} />
        </>
      )}
    </div>
  );
}
