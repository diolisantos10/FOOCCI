"use client";

/**
 * O formulário do checkout self-service.
 *
 * Três coisas aqui não são detalhe de UI, são regra de negócio na tela:
 *
 *  1. `idempotencyKey` nasce UMA vez por página e viaja em todo reenvio. É o que
 *     faz o duplo clique, o F5 no meio do POST e o retry de rede caírem na mesma
 *     assinatura em vez de virarem duas cobranças recorrentes no cartão. O botão
 *     também trava enquanto envia, mas botão travado é aviso; a chave é a trava.
 *  2. Os DOIS valores aparecem sempre juntos — o que sai hoje (com os 50% do 1º
 *     mês) e o que sai na renovação. Anunciar só o desconto e cobrar o cheio no
 *     segundo mês é a reclamação que a gente não vai ter.
 *  3. O aceite do Termo é um checkbox EXPLÍCITO, com o texto do contrato aberto
 *     na própria página. Sem ele o botão não habilita, e o servidor recusa.
 *
 * Estados obrigatórios do DESIGN.md §6.1: enviando (botão travado + rótulo),
 * erro (mensagem com o motivo real) e — como não há lista carregada — nada de
 * vazio a tratar. Preço vem pronto do servidor, então não há loading de dados.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlanCode, CycleCode } from "@/lib/billing/pricing";
import {
  formatBRL,
  quote,
  CYCLE_LABEL,
  CYCLE_CODES,
  PLAN_LABEL,
  SITE_PLAN_IDS,
  SITE_PLAN_TO_CODE,
} from "@/lib/billing/pricing";
import { suggestSlug, validateSlugShape } from "@/lib/billing/checkout-slug";

type SlugState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "free" }
  | { kind: "taken"; reason: string };

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `ck-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function CheckoutClient({
  initialPlan,
  initialCycle,
  terms,
  termsVersion,
}: {
  initialPlan: PlanCode;
  initialCycle: CycleCode;
  terms: { title: string; body: string }[];
  termsVersion: string;
}) {
  const [plan, setPlan] = useState<PlanCode>(initialPlan);
  const [cycle, setCycle] = useState<CycleCode>(initialCycle);

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [restaurante, setRestaurante] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [senha, setSenha] = useState("");
  const [aceite, setAceite] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  const [slugState, setSlugState] = useState<SlugState>({ kind: "idle" });
  const [state, setState] = useState<"idle" | "sending" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  // Uma chave por página. NÃO se regenera a cada tentativa — é justamente o
  // reenvio que ela precisa cobrir.
  const idempotencyKeyRef = useRef<string>("");
  if (!idempotencyKeyRef.current) idempotencyKeyRef.current = newIdempotencyKey();

  // O preço é calculado pela MESMA função que o servidor usa para cobrar. Não há
  // tabela de preço no cliente para divergir da do servidor.
  const q = useMemo(() => quote(plan, cycle), [plan, cycle]);
  const planCodes = useMemo(() => SITE_PLAN_IDS.map((id) => SITE_PLAN_TO_CODE[id]), []);
  const cycleCodes = CYCLE_CODES;

  // Sugere o endereço da loja a partir do nome, até o cliente mexer no campo.
  useEffect(() => {
    if (slugTouched) return;
    setSlug(suggestSlug(restaurante));
  }, [restaurante, slugTouched]);

  // Disponibilidade do endereço enquanto digita. É conveniência: a trava real é
  // o POST + o UNIQUE do banco.
  useEffect(() => {
    const shape = validateSlugShape(slug);
    if (!shape.ok) {
      setSlugState(slug.length === 0 ? { kind: "idle" } : { kind: "taken", reason: shape.error! });
      return;
    }
    setSlugState({ kind: "checking" });
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/billing/slug-check?slug=${encodeURIComponent(slug)}`);
        const body = (await res.json()) as { available?: boolean; reason?: string | null };
        setSlugState(
          body.available ? { kind: "free" } : { kind: "taken", reason: body.reason ?? "Endereço indisponível." },
        );
      } catch {
        // Falha de rede não vira "ocupado" — ausência de informação não é
        // informação. Volta a neutro; o servidor decide na hora do envio.
        setSlugState({ kind: "idle" });
      }
    }, 450);
    return () => clearTimeout(t);
  }, [slug]);

  const canSubmit =
    state !== "sending" &&
    nome.trim().length >= 3 &&
    /.+@.+\..+/.test(email) &&
    whatsapp.replace(/\D/g, "").length >= 10 &&
    restaurante.trim().length >= 2 &&
    validateSlugShape(slug).ok &&
    slugState.kind !== "taken" &&
    senha.length >= 8 &&
    aceite;

  const submit = useCallback(async () => {
    setState("sending");
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plano: plan,
          ciclo: cycle,
          nome,
          email,
          whatsapp,
          cnpj: cnpj || undefined,
          restaurante,
          slug,
          senha,
          aceiteTermos: true,
          idempotencyKey: idempotencyKeyRef.current,
        }),
      });
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        paymentUrl?: string | null;
        thankYouUrl?: string;
      } | null;

      if (!res.ok || !body?.ok) {
        setError(body?.error ?? "Não foi possível concluir a contratação. Tente de novo em instantes.");
        setState("error");
        return;
      }
      // Pagamento hospedado no Mercado Pago; sem gateway, a tela pós-contratação
      // explica o que vem agora. Em nenhum caso o cliente fica sem destino.
      window.location.href = body.paymentUrl || body.thankYouUrl || "/contratar/obrigado";
    } catch {
      setError("Falha de conexão. Verifique a internet e tente de novo — nada foi cobrado.");
      setState("error");
    }
  }, [plan, cycle, nome, email, whatsapp, cnpj, restaurante, slug, senha]);

  const inputClass =
    "mt-1.5 w-full rounded-xl border border-line bg-paper px-4 py-3 text-sm text-ink placeholder:text-muted focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100";
  const labelClass = "block text-sm font-semibold text-ink";

  return (
    <div className="space-y-5">
      {/* ── 1. Plano e ciclo ─────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-line bg-paper p-5 sm:p-6">
        <h2 className="text-base font-semibold text-ink">1. Seu plano</h2>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {planCodes.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPlan(p)}
              aria-pressed={p === plan}
              className={`rounded-xl border px-2 py-3 text-center text-sm font-semibold transition ${
                p === plan
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-line bg-canvas text-ink2 hover:border-line2"
              }`}
            >
              {PLAN_LABEL[p]}
            </button>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {cycleCodes.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCycle(c)}
              aria-pressed={c === cycle}
              className={`rounded-xl border px-2 py-2.5 text-center text-[13px] font-semibold transition ${
                c === cycle
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-line bg-canvas text-ink2 hover:border-line2"
              }`}
            >
              {CYCLE_LABEL[c]}
            </button>
          ))}
        </div>

        {/* Os dois valores, sempre juntos. */}
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-700">Você paga hoje</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{formatBRL(q.firstChargeCents)}</p>
            <p className="mt-0.5 text-xs text-ink2">
              Já com os 50% do primeiro mês (−{formatBRL(q.discountCents)}).
            </p>
          </div>
          <div className="rounded-xl border border-line bg-canvas p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
              Depois, a cada {q.months === 1 ? "mês" : `${q.months} meses`}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{formatBRL(q.recurringCents)}</p>
            <p className="mt-0.5 text-xs text-ink2">
              Equivale a {formatBRL(q.monthlyEquivalentCents)}/mês. Cancele quando quiser.
            </p>
          </div>
        </div>
      </section>

      {/* ── 2. Dados ─────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-line bg-paper p-5 sm:p-6">
        <h2 className="text-base font-semibold text-ink">2. Seus dados</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="nome">
              Seu nome completo
            </label>
            <input id="nome" className={inputClass} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome e sobrenome" autoComplete="name" />
          </div>
          <div>
            <label className={labelClass} htmlFor="email">
              E-mail
            </label>
            <input id="email" type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@restaurante.com.br" autoComplete="email" />
            <p className="mt-1 text-xs text-muted">É com ele que você entra no painel.</p>
          </div>
          <div>
            <label className={labelClass} htmlFor="whatsapp">
              WhatsApp
            </label>
            <input id="whatsapp" inputMode="tel" className={inputClass} value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="(11) 90000-0000" autoComplete="tel" />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="cnpj">
              CNPJ <span className="font-normal text-muted">(opcional — usado na nota fiscal)</span>
            </label>
            <input id="cnpj" className={inputClass} value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0001-00" />
          </div>
        </div>
      </section>

      {/* ── 3. A loja ────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-line bg-paper p-5 sm:p-6">
        <h2 className="text-base font-semibold text-ink">3. Sua loja</h2>
        <div className="mt-4 space-y-4">
          <div>
            <label className={labelClass} htmlFor="restaurante">
              Nome do restaurante
            </label>
            <input id="restaurante" className={inputClass} value={restaurante} onChange={(e) => setRestaurante(e.target.value)} placeholder="Pizzaria do Zé" />
          </div>
          <div>
            <label className={labelClass} htmlFor="slug">
              Endereço da sua loja
            </label>
            <div className="mt-1.5 flex items-center overflow-hidden rounded-xl border border-line bg-paper focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
              <span className="shrink-0 border-r border-line bg-canvas px-3 py-3 text-sm text-muted">foocci.com.br/pedido/</span>
              <input
                id="slug"
                className="w-full bg-transparent px-3 py-3 text-sm text-ink placeholder:text-muted focus:outline-none"
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"));
                }}
                placeholder="pizzaria-do-ze"
              />
            </div>
            <p
              className={`mt-1 text-xs ${
                slugState.kind === "taken" ? "text-red-600" : slugState.kind === "free" ? "text-green-700" : "text-muted"
              }`}
            >
              {slugState.kind === "checking" && "Conferindo se está livre…"}
              {slugState.kind === "free" && "Endereço livre."}
              {slugState.kind === "taken" && slugState.reason}
              {slugState.kind === "idle" && "Letras minúsculas, números e hífen."}
            </p>
          </div>
          <div>
            <label className={labelClass} htmlFor="senha">
              Senha de acesso ao painel
            </label>
            <input id="senha" type="password" className={inputClass} value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Ao menos 8 caracteres" autoComplete="new-password" />
            <p className="mt-1 text-xs text-muted">
              É a senha que você vai usar com o seu e-mail para entrar assim que o pagamento for confirmado.
            </p>
          </div>
        </div>
      </section>

      {/* ── 4. Termo ─────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-line bg-paper p-5 sm:p-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold text-ink">4. Termo de Contratação</h2>
          <button type="button" onClick={() => setShowTerms((v) => !v)} className="text-sm font-semibold text-brand-600 hover:text-brand-700">
            {showTerms ? "Fechar" : "Ler o Termo"}
          </button>
        </div>
        <p className="mt-1 text-xs text-muted">Versão {termsVersion}</p>

        {showTerms && (
          <div className="mt-4 max-h-[45vh] space-y-4 overflow-y-auto rounded-xl border border-line bg-canvas p-4 pr-3 text-sm leading-relaxed text-ink2">
            {terms.map((s) => (
              <section key={s.title}>
                <h3 className="font-semibold text-ink">{s.title}</h3>
                <p className="mt-1">{s.body}</p>
              </section>
            ))}
          </div>
        )}

        <label className="mt-4 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={aceite}
            onChange={(e) => setAceite(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-line text-brand-500 focus:ring-brand-500"
          />
          <span className="text-sm leading-relaxed text-ink2">
            Li e aceito o Termo de Contratação do serviço Foocci. O aceite registra data, hora, IP e a versão do
            Termo — vale como assinatura eletrônica.
          </span>
        </label>
      </section>

      {/* ── Envio ────────────────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-700">Não deu para concluir</p>
          <p className="mt-1 text-sm leading-relaxed text-red-700">{error}</p>
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        className="w-full rounded-xl bg-brand-500 px-6 py-4 text-[15px] font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {state === "sending" ? "Preparando o pagamento…" : `Aceitar e pagar ${formatBRL(q.firstChargeCents)}`}
      </button>
      <p className="text-center text-xs leading-relaxed text-muted">
        O pagamento é processado pelo Mercado Pago. A Foocci não vê nem guarda os dados do seu cartão.
      </p>
    </div>
  );
}
