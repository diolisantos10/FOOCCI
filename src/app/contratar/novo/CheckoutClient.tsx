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
 *     na própria página. O servidor recusa sem ele — e a tela também, mas
 *     DIZENDO que falta (ver abaixo).
 *
 * Estados obrigatórios do DESIGN.md §6.1: enviando (botão travado + rótulo),
 * erro (mensagem com o motivo real) e — como não há lista carregada — nada de
 * vazio a tratar. Preço vem pronto do servidor, então não há loading de dados.
 *
 * ── P0 CORRIGIDO EM 05/08/2026: o botão morto ───────────────────────────────
 *
 * O botão "Aceitar e pagar" ficava DESABILITADO até tudo estar válido, e não
 * dizia o que faltava. Reproduzido em produção, no celular: com nome, e-mail,
 * WhatsApp, restaurante e senha preenchidos, o botão seguia apagado porque o
 * Termo, lá embaixo, não estava marcado — e NENHUMA mensagem aparecia em lugar
 * nenhum. Depois, com o e-mail inválido, o botão apagava de novo, também em
 * silêncio. No celular não existe `hover` nem foco visível: o dono toca, nada
 * acontece, e conclui que o site quebrou. É a última tela antes do dinheiro
 * entrar.
 *
 * A ESCOLHA, e o porquê: **o botão fica habilitado e a validação acontece no
 * toque.** Botão desabilitado é uma resposta que não se pode ouvir — ele não
 * tem estado de "por quê". Habilitado, o toque vira uma pergunta que a tela
 * responde em três lugares ao mesmo tempo:
 *   1. um resumo do que falta LOGO ACIMA do botão (onde o polegar já está),
 *      com cada item clicável, levando ao campo;
 *   2. a mensagem no campo, em vermelho, junto do rótulo;
 *   3. o foco vai para o primeiro campo com problema.
 * Assim ninguém precisa rolar a página para descobrir o que a tela quer, que é
 * exatamente o que o defeito custava.
 *
 * A trava real do dinheiro nunca foi o `disabled` — é o servidor, que valida
 * tudo de novo e recusa sem aceite. O botão só travado enquanto envia.
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

  /**
   * O que falta, em linguagem de gente, na ordem em que os campos aparecem.
   *
   * Uma lista só, lida por três consumidores (o resumo acima do botão, a
   * mensagem de cada campo e o foco no primeiro problema) — porque três
   * verificações separadas viram três verdades diferentes na mesma tela.
   */
  const problemas = useMemo(() => {
    const p: { campo: string; rotulo: string; mensagem: string }[] = [];

    if (nome.trim().length < 3)
      p.push({ campo: "nome", rotulo: "Seu nome", mensagem: "Escreva seu nome completo (ao menos 3 letras)." });

    if (!/.+@.+\..+/.test(email))
      p.push({
        campo: "email",
        rotulo: "E-mail",
        mensagem:
          email.trim() === ""
            ? "Informe o e-mail — é com ele que você entra no painel."
            : "Esse e-mail parece incompleto. Confira o @ e o final (ex.: voce@restaurante.com.br).",
      });

    if (whatsapp.replace(/\D/g, "").length < 10)
      p.push({ campo: "whatsapp", rotulo: "WhatsApp", mensagem: "Informe o WhatsApp com DDD." });

    if (restaurante.trim().length < 2)
      p.push({ campo: "restaurante", rotulo: "Nome do restaurante", mensagem: "Diga como o seu restaurante se chama." });

    const shape = validateSlugShape(slug);
    if (!shape.ok)
      p.push({
        campo: "slug",
        rotulo: "Endereço da loja",
        mensagem: shape.error ?? "Use letras minúsculas, números e hífen.",
      });
    else if (slugState.kind === "taken")
      p.push({ campo: "slug", rotulo: "Endereço da loja", mensagem: slugState.reason });

    if (senha.length < 8)
      p.push({ campo: "senha", rotulo: "Senha do painel", mensagem: "A senha precisa de ao menos 8 caracteres." });

    if (!aceite)
      p.push({
        campo: "aceite",
        rotulo: "Termo de Contratação",
        mensagem: "Marque o aceite do Termo para concluir a contratação.",
      });

    return p;
  }, [nome, email, whatsapp, restaurante, slug, slugState, senha, aceite]);

  /** Só depois do primeiro toque no botão — ninguém merece campo vermelho antes de tentar. */
  const [tentouEnviar, setTentouEnviar] = useState(false);
  const mostrarPendencias = tentouEnviar && problemas.length > 0;
  const erroDe = (campo: string) =>
    tentouEnviar ? (problemas.find((p) => p.campo === campo)?.mensagem ?? null) : null;

  /** Leva a pessoa ATÉ o campo — e deixa o cursor lá dentro. */
  const irParaCampo = useCallback((campo: string) => {
    const el = document.getElementById(campo);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    // O foco depois da rolagem: focar antes faz o navegador saltar de volta.
    window.setTimeout(() => el.focus({ preventScroll: true }), 250);
  }, []);

  const submit = useCallback(async () => {
    setTentouEnviar(true);
    // O botão nunca fica mudo: se falta algo, a tela DIZ o que falta e leva ao
    // primeiro campo, em vez de simplesmente não reagir ao toque.
    if (problemas.length > 0) {
      irParaCampo(problemas[0]!.campo);
      return;
    }

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
  }, [plan, cycle, nome, email, whatsapp, cnpj, restaurante, slug, senha, problemas, irParaCampo]);

  const inputBase =
    "mt-1.5 w-full rounded-xl border bg-paper px-4 py-3 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2";
  const inputClass = `${inputBase} border-line focus:border-brand-500 focus:ring-brand-100`;
  /**
   * Campo com problema: a borda vermelha é o que se vê de longe; a frase, o que resolve.
   *
   * ⚠️ O `!` NÃO É PREGUIÇA. A regra base de `globals.css`
   * (`input:not([type=checkbox]):not(…)` — sete `:not`) tem especificidade (0,7,1)
   * e ENGOLE qualquer utilitário de cor de borda em input, inclusive
   * `border-red-400`. Sem o `!important` a borda de erro simplesmente não pinta —
   * conferido no navegador: a cor computada continuava `rgb(229,229,229)`.
   * O anel de foco fica no laranja da marca de propósito (DESIGN.md §4: um único
   * acento de foco); quem diz "tem problema aqui" é a borda, que persiste.
   */
  const inputErroClass = `${inputBase} !border-red-400 focus:ring-brand-100`;
  const campoClass = (campo: string) => (erroDe(campo) ? inputErroClass : inputClass);
  const labelClass = "block text-sm font-semibold text-ink";

  /** A frase de erro do campo, no mesmo formato em todos eles. */
  function ErroCampo({ campo }: { campo: string }) {
    const msg = erroDe(campo);
    if (!msg) return null;
    return (
      <p id={`erro-${campo}`} className="mt-1 text-xs font-semibold text-red-600">
        {msg}
      </p>
    );
  }

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
            <input id="nome" className={campoClass("nome")} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome e sobrenome" autoComplete="name" aria-invalid={Boolean(erroDe("nome"))} aria-describedby={erroDe("nome") ? "erro-nome" : undefined} />
            <ErroCampo campo="nome" />
          </div>
          <div>
            <label className={labelClass} htmlFor="email">
              E-mail
            </label>
            <input id="email" type="email" className={campoClass("email")} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@restaurante.com.br" autoComplete="email" aria-invalid={Boolean(erroDe("email"))} aria-describedby={erroDe("email") ? "erro-email" : undefined} />
            {erroDe("email") ? <ErroCampo campo="email" /> : <p className="mt-1 text-xs text-muted">É com ele que você entra no painel.</p>}
          </div>
          <div>
            <label className={labelClass} htmlFor="whatsapp">
              WhatsApp
            </label>
            <input id="whatsapp" inputMode="tel" className={campoClass("whatsapp")} value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="(11) 90000-0000" autoComplete="tel" aria-invalid={Boolean(erroDe("whatsapp"))} aria-describedby={erroDe("whatsapp") ? "erro-whatsapp" : undefined} />
            <ErroCampo campo="whatsapp" />
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
            <input id="restaurante" className={campoClass("restaurante")} value={restaurante} onChange={(e) => setRestaurante(e.target.value)} placeholder="Pizzaria do Zé" aria-invalid={Boolean(erroDe("restaurante"))} aria-describedby={erroDe("restaurante") ? "erro-restaurante" : undefined} />
            <ErroCampo campo="restaurante" />
          </div>
          <div>
            <label className={labelClass} htmlFor="slug">
              Endereço da sua loja
            </label>
            <div
              className={`mt-1.5 flex items-center overflow-hidden rounded-xl border bg-paper focus-within:ring-2 ${
                erroDe("slug")
                  ? "border-red-400 focus-within:ring-brand-100"
                  : "border-line focus-within:border-brand-500 focus-within:ring-brand-100"
              }`}
            >
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
            {/* Um lugar só para a situação do endereço: o que falta (depois de
                tentar enviar) tem precedência sobre a dica neutra — a dica não
                explica por que o envio parou. */}
            {erroDe("slug") ? (
              <ErroCampo campo="slug" />
            ) : (
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
            )}
          </div>
          <div>
            <label className={labelClass} htmlFor="senha">
              Senha de acesso ao painel
            </label>
            <input id="senha" type="password" className={campoClass("senha")} value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Ao menos 8 caracteres" autoComplete="new-password" aria-invalid={Boolean(erroDe("senha"))} aria-describedby={erroDe("senha") ? "erro-senha" : undefined} />
            <ErroCampo campo="senha" />
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

        {/* Quando é ESTE o item que falta, ele precisa se anunciar: era o aceite
            não marcado, lá no fim da página, que deixava o botão apagado sem
            explicação nenhuma. */}
        <label
          className={`mt-4 flex cursor-pointer items-start gap-3 rounded-xl ${
            erroDe("aceite") ? "border border-red-200 bg-red-50 p-3" : ""
          }`}
        >
          <input
            id="aceite"
            type="checkbox"
            checked={aceite}
            onChange={(e) => setAceite(e.target.checked)}
            aria-invalid={Boolean(erroDe("aceite"))}
            aria-describedby={erroDe("aceite") ? "erro-aceite" : undefined}
            className={`mt-0.5 h-4 w-4 shrink-0 rounded text-brand-500 focus:ring-brand-500 ${
              erroDe("aceite") ? "border-red-400" : "border-line"
            }`}
          />
          <span className="text-sm leading-relaxed text-ink2">
            Li e aceito o Termo de Contratação do serviço Foocci. O aceite registra data, hora, IP e a versão do
            Termo — vale como assinatura eletrônica.
            <ErroCampo campo="aceite" />
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

      {/*
        O RESUMO DO QUE FALTA — colado no botão, que é onde a pessoa está olhando
        quando nada acontece. Cada item leva ao campo: no celular, procurar a
        pendência rolando uma página de quatro seções é o mesmo que não saber.
        Tom `amber` (aviso) e não `red` (erro) de propósito: isto é uma lista de
        pendências do próprio formulário; o vermelho fica reservado para a falha
        do servidor, logo acima, que é outra conversa.
      */}
      {mostrarPendencias && (
        <div
          id="pendencias"
          role="alert"
          className="rounded-2xl border border-amber-200 bg-amber-50 p-4"
        >
          <p className="text-sm font-semibold text-amber-700">
            {problemas.length === 1 ? "Falta 1 coisa para concluir" : `Faltam ${problemas.length} coisas para concluir`}
          </p>
          <ul className="mt-2 space-y-1.5">
            {problemas.map((p) => (
              <li key={p.campo}>
                {/* Sublinhado SÓ no rótulo: com a frase inteira sublinhada, três
                    itens empilhados viram um bloco riscado ilegível no celular.
                    O rótulo carrega a afordância de link; a frase, a instrução. */}
                <button
                  type="button"
                  onClick={() => irParaCampo(p.campo)}
                  className="text-left text-sm leading-relaxed text-amber-700 hover:text-amber-800"
                >
                  <span className="font-semibold underline decoration-amber-300 underline-offset-4">
                    {p.rotulo}
                  </span>
                  : {p.mensagem}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={state === "sending"}
        aria-describedby={mostrarPendencias ? "pendencias" : undefined}
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
