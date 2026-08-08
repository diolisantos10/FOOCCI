"use client";

/**
 * A tela da carteira. Três estados obrigatórios em tudo: carregando, vazio, erro.
 * Dinheiro digitado em reais, guardado em centavos.
 */

import { useCallback, useEffect, useState } from "react";
// A QUARTA tabela de preço do repositório morava aqui, digitada à mão, e
// sugeria ao CEO um valor de ciclo SEM o desconto do trimestral/anual (179×3 em
// vez de 483). Agora vem da mesma fonte que cobra.
import { PLAN_CYCLE_CENTS, PLAN_LABEL, CYCLE_MONTHS } from "@/lib/billing/pricing";

interface Invoice {
  id: string;
  amountCents: number;
  referenceMonth: string;
  status: string;
  pdfUrl: string | null;
  errorMessage: string | null;
}

interface Subscription {
  id: string;
  customerName: string;
  customerWhatsapp: string;
  customerCnpj: string | null;
  customerEmail: string | null;
  plan: "STARTER" | "GROWTH" | "PRO";
  cycle: "MENSAL" | "TRIMESTRAL" | "ANUAL";
  priceCents: number;
  status: string;
  acceptToken: string;
  termsAcceptedAt: string | null;
  termsAcceptedBy: string | null;
  mpInitPoint: string | null;
  /** Alertas operacionais que NÃO podem morrer só no log do servidor. */
  provisionError: string | null;
  priceSyncError: string | null;
  provisionedAt: string | null;
  restaurant: { name: string; slug: string } | null;
  invoices: Invoice[];
}


/** O que `/api/admin/billing/gateway` responde. Espelho leve, sem importar server. */
interface GatewayVerdict {
  vivo: boolean;
  motivo?: string;
  recado: string;
  conta?: { id: number | null; apelido: string | null; pais: string | null };
}

const STATUS_STYLE: Record<string, string> = {
  ATIVA: "bg-green-50 text-green-700 border-green-200",
  AGUARDANDO_ACEITE: "bg-amber-50 text-amber-700 border-amber-200",
  ACEITO: "bg-blue-50 text-blue-700 border-blue-200",
  AGUARDANDO_PAGAMENTO: "bg-blue-50 text-blue-700 border-blue-200",
  INADIMPLENTE: "bg-red-50 text-red-700 border-red-200",
  CANCELADA: "bg-gray-100 text-gray-500 border-gray-200",
  DRAFT: "bg-gray-100 text-gray-600 border-gray-200",
};

function money(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function AssinaturasClient() {
  const [subs, setSubs] = useState<Subscription[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [nfseReason, setNfseReason] = useState<string | null>(null);
  const [mpConfigured, setMpConfigured] = useState(false);
  /** Veredito do gateway. `null` = ainda não sei — nunca "está tudo bem". */
  const [gateway, setGateway] = useState<GatewayVerdict | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [form, setForm] = useState({
    customerName: "",
    customerWhatsapp: "",
    customerCnpj: "",
    customerEmail: "",
    plan: "STARTER" as Subscription["plan"],
    cycle: "MENSAL" as Subscription["cycle"],
    priceReais: String(PLAN_CYCLE_CENTS.STARTER.MENSAL / 100),
    notes: "",
  });

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/billing/subscriptions");
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setSubs(body.subscriptions);
      setNfseReason(body.nfse?.reason ?? null);
      setMpConfigured(!!body.gateway?.mpConfigured);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Falha ao carregar");
      setSubs([]);
    }

    /*
      A SEGUNDA PERGUNTA, e a que realmente importa. A de cima só sabe dizer que
      a variável existe — token vencido ou rotacionado responde "configurado" do
      mesmo jeito, e quem descobre a diferença é o cliente, na tela sem link de
      pagamento. Esta chamada pergunta ao Mercado Pago se a chave responde.
      Vai DEPOIS e em separado de propósito: é uma ida à rede externa, e ela não
      pode atrasar nem derrubar a lista de assinaturas, que é o conteúdo da tela.
    */
    try {
      const res = await fetch("/api/admin/billing/gateway");
      const body = await res.json();
      setGateway(body?.gateway ?? null);
    } catch {
      // Sem veredito é DIFERENTE de veredito ruim: a tela dirá "não deu para
      // conferir", nunca "está tudo bem". Guardrail 1.
      setGateway(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function updatePlanOrCycle(plan: Subscription["plan"], cycle: Subscription["cycle"]) {
    // Prefill honesto: tabela × meses, sem desconto automático — desconto é
    // decisão do CEO, digitada por cima.
    setForm((f) => ({ ...f, plan, cycle, priceReais: String(PLAN_CYCLE_CENTS[plan][cycle] / 100) }));
  }

  async function createSubscription() {
    setBusy("create");
    setNotice(null);
    try {
      const priceCents = Math.round(parseFloat(form.priceReais.replace(",", ".")) * 100);
      const res = await fetch("/api/admin/billing/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, priceCents, priceReais: undefined }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Falha ao criar");
      await navigator.clipboard.writeText(body.acceptUrl).catch(() => {});
      setNotice(
        `Assinatura criada. Link de aceite copiado: ${body.acceptUrl}` +
          (body.mpError ? ` · ⚠️ Link de cobrança não gerado: ${body.mpError}` : ""),
      );
      setShowForm(false);
      await load();
    } catch (err) {
      setNotice(`❌ ${err instanceof Error ? err.message : "Erro"}`);
    } finally {
      setBusy(null);
    }
  }

  async function act(subId: string, action: string, extra: Record<string, unknown> = {}) {
    setBusy(`${subId}:${action}`);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/billing/subscriptions/${subId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error ?? body.detail ?? "Falha");
      setNotice(`✅ ${action} ok${body.detail ? ` — ${body.detail}` : ""}${body.nfse ? ` · NFS-e: ${body.nfse.detail}` : ""}`);
      await load();
    } catch (err) {
      setNotice(`❌ ${err instanceof Error ? err.message : "Erro"}`);
    } finally {
      setBusy(null);
    }
  }

  if (subs === null) {
    return <div className="p-8 text-sm text-muted">Carregando carteira…</div>;
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Assinaturas</h1>
          <p className="mt-1 text-sm text-ink2">A carteira de clientes pagantes — criar, acompanhar, faturar.</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
        >
          {showForm ? "Fechar" : "+ Nova assinatura"}
        </button>
      </div>

      {nfseReason ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          🧾 NFS-e em fila: {nfseReason} As cobranças pagas acumulam como PENDENTE e são emitidas quando liberar.
        </div>
      ) : null}
      {/*
        UM aviso sobre o gateway, não dois. A pergunta fraca ("a variável existe")
        só aparece quando ela é a resposta inteira — sem variável não há o que
        perguntar ao Mercado Pago. Havendo variável, quem fala é o veredito real.
      */}
      {!mpConfigured ? (
        <div className="mt-2 rounded-xl border border-line bg-canvas px-4 py-3 text-sm text-ink2">
          💳 Gateway não configurado (MP_PLATFORM_ACCESS_TOKEN) — modo manual: combine o pagamento e use “Ativar”.
        </div>
      ) : gateway === null ? (
        /* Não deu para conferir NUNCA vira "está tudo bem" (guardrail 1). */
        <div className="mt-2 rounded-xl border border-line bg-canvas px-4 py-3 text-sm text-ink2">
          💳 Não deu para conferir a chave de cobrança agora. A variável existe; se o
          Mercado Pago estiver recusando, o cliente contrata e não recebe link.
        </div>
      ) : gateway.vivo ? (
        <div className="mt-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          💳 Chave de cobrança respondendo{gateway.conta?.apelido ? ` — conta ${gateway.conta.apelido}` : ""}. O
          checkout emite link de pagamento.
        </div>
      ) : (
        /* Guardrail 6: o alerta traz o motivo que o gateway deu, não "falhou". */
        <div className="mt-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <strong>💳 O checkout NÃO consegue cobrar.</strong> {gateway.recado}
          {gateway.motivo ? <span className="mt-1 block text-red-600">Motivo: {gateway.motivo}</span> : null}
        </div>
      )}
      {notice ? <div className="mt-3 rounded-xl border border-line bg-paper px-4 py-3 text-sm text-ink break-all">{notice}</div> : null}
      {loadError ? <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</div> : null}

      {showForm ? (
        <div className="mt-6 rounded-2xl border border-line bg-paper p-6">
          <h2 className="text-base font-semibold text-ink">Nova assinatura (venda fechada 1:1)</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="text-sm">
              <span className="font-semibold text-ink">Nome do restaurante/responsável *</span>
              <input className="mt-1 w-full rounded-xl border border-line px-3 py-2" value={form.customerName}
                onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))} />
            </label>
            <label className="text-sm">
              <span className="font-semibold text-ink">WhatsApp *</span>
              <input className="mt-1 w-full rounded-xl border border-line px-3 py-2" value={form.customerWhatsapp}
                onChange={(e) => setForm((f) => ({ ...f, customerWhatsapp: e.target.value }))} />
            </label>
            <label className="text-sm">
              <span className="font-semibold text-ink">CNPJ (para a nota)</span>
              <input className="mt-1 w-full rounded-xl border border-line px-3 py-2" value={form.customerCnpj}
                onChange={(e) => setForm((f) => ({ ...f, customerCnpj: e.target.value }))} />
            </label>
            <label className="text-sm">
              <span className="font-semibold text-ink">E-mail (exigido pelo MP para o link)</span>
              <input className="mt-1 w-full rounded-xl border border-line px-3 py-2" value={form.customerEmail}
                onChange={(e) => setForm((f) => ({ ...f, customerEmail: e.target.value }))} />
            </label>
            <label className="text-sm">
              <span className="font-semibold text-ink">Plano</span>
              <select className="mt-1 w-full rounded-xl border border-line px-3 py-2" value={form.plan}
                onChange={(e) => updatePlanOrCycle(e.target.value as Subscription["plan"], form.cycle)}>
                {/*
                  ESTES TRÊS VALORES ERAM DIGITADOS. Achado em 08/08/2026 no bloco
                  do preço no SDR: eram a SEGUNDA fonte do mesmo número, com
                  `PLAN_CYCLE_CENTS` já importado três linhas acima do arquivo.
                  Ninguém percebia porque nada aqui reprova — provado sabotando
                  `pricing.ts`: a tabela passou a dizer R$ 255,00 e este seletor
                  continuou oferecendo R$ 179/mês, calado.
                */}
                {(["STARTER", "GROWTH", "PRO"] as const).map((code) => (
                  <option key={code} value={code}>
                    {PLAN_LABEL[code]} ({money(PLAN_CYCLE_CENTS[code].MENSAL)}/mês)
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="font-semibold text-ink">Ciclo</span>
              <select className="mt-1 w-full rounded-xl border border-line px-3 py-2" value={form.cycle}
                onChange={(e) => updatePlanOrCycle(form.plan, e.target.value as Subscription["cycle"])}>
                <option value="MENSAL">Mensal</option>
                <option value="TRIMESTRAL">Trimestral</option>
                <option value="ANUAL">Anual</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="font-semibold text-ink">Valor do ciclo (R$) — ajuste o desconto aqui</span>
              <input className="mt-1 w-full rounded-xl border border-line px-3 py-2" value={form.priceReais}
                onChange={(e) => setForm((f) => ({ ...f, priceReais: e.target.value }))} />
            </label>
            <label className="text-sm md:col-span-2">
              <span className="font-semibold text-ink">Observações</span>
              <input className="mt-1 w-full rounded-xl border border-line px-3 py-2" value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </label>
          </div>
          <button
            onClick={createSubscription}
            disabled={busy === "create" || form.customerName.trim().length < 2 || form.customerWhatsapp.trim().length < 8}
            className="mt-4 rounded-xl bg-brand-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {busy === "create" ? "Criando…" : "Criar e copiar link de aceite"}
          </button>
        </div>
      ) : null}

      {subs.length === 0 && !showForm ? (
        <div className="mt-10 rounded-2xl border border-dashed border-line bg-canvas p-10 text-center text-sm text-muted">
          Nenhuma assinatura ainda. A primeira venda começa no botão “Nova assinatura”.
        </div>
      ) : null}

      <div className="mt-6 space-y-4">
        {subs.map((s) => (
          <div key={s.id} className="rounded-2xl border border-line bg-paper p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-ink">{s.customerName}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[s.status] ?? ""}`}>
                    {s.status.replaceAll("_", " ")}
                  </span>
                </div>
                <div className="mt-1 text-sm text-ink2">
                  {PLAN_LABEL[s.plan]} · {s.cycle.toLowerCase()} · <b>{money(s.priceCents)}</b> · {s.customerWhatsapp}
                  {s.customerCnpj ? ` · CNPJ ${s.customerCnpj}` : ""}
                </div>
                {s.termsAcceptedAt ? (
                  <div className="mt-1 text-xs text-green-700">
                    ✍️ Termo aceito por {s.termsAcceptedBy} em {new Date(s.termsAcceptedAt).toLocaleString("pt-BR")}
                  </div>
                ) : (
                  <div className="mt-1 text-xs text-amber-700">⏳ Termo ainda não aceito</div>
                )}
                {s.restaurant ? (
                  <div className="mt-1 text-xs text-green-700">
                    🏪 Conta criada: {s.restaurant.name} (foocci.com.br/pedido/{s.restaurant.slug})
                  </div>
                ) : null}
                {/* Guardrail 6: o alerta carrega a própria evidência, e aparece
                    onde o operador olha — não só no log do servidor. */}
                {s.provisionError ? (
                  <div className="mt-2 rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs leading-relaxed text-red-700">
                    <b>Pagou e a conta não foi criada.</b> {s.provisionError}
                  </div>
                ) : null}
                {s.priceSyncError ? (
                  <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs leading-relaxed text-amber-800">
                    <b>Valor da renovação não subiu no Mercado Pago.</b> {s.priceSyncError}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <button
                  onClick={() =>
                    navigator.clipboard.writeText(`https://foocci.com.br/contratar/${s.acceptToken}`).then(() => setNotice("Link de aceite copiado."))
                  }
                  className="rounded-lg border border-line px-3 py-1.5 hover:bg-canvas"
                >
                  Copiar link de aceite
                </button>
                {s.mpInitPoint ? (
                  <button
                    onClick={() => navigator.clipboard.writeText(s.mpInitPoint!).then(() => setNotice("Link de pagamento copiado."))}
                    className="rounded-lg border border-line px-3 py-1.5 hover:bg-canvas"
                  >
                    Copiar link de pagamento
                  </button>
                ) : (
                  <button onClick={() => act(s.id, "mp-link")} disabled={busy === `${s.id}:mp-link`}
                    className="rounded-lg border border-line px-3 py-1.5 hover:bg-canvas disabled:opacity-50">
                    Gerar link MP
                  </button>
                )}
                {s.status !== "ATIVA" && s.status !== "CANCELADA" ? (
                  <button onClick={() => act(s.id, "activate")} disabled={busy === `${s.id}:activate`}
                    className="rounded-lg border border-green-300 bg-green-50 px-3 py-1.5 text-green-700 hover:bg-green-100 disabled:opacity-50">
                    Ativar (manual)
                  </button>
                ) : null}
                {s.status === "ATIVA" ? (
                  <button onClick={() => act(s.id, "record-charge")} disabled={busy === `${s.id}:record-charge`}
                    className="rounded-lg border border-line px-3 py-1.5 hover:bg-canvas disabled:opacity-50">
                    Registrar cobrança paga → NFS-e
                  </button>
                ) : null}
                {s.status !== "CANCELADA" ? (
                  <button onClick={() => act(s.id, "cancel")} disabled={busy === `${s.id}:cancel`}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50">
                    Cancelar
                  </button>
                ) : null}
              </div>
            </div>

            {s.invoices.length > 0 ? (
              <div className="mt-4 border-t border-line pt-3">
                <div className="text-xs font-semibold text-muted">Cobranças / NFS-e</div>
                <div className="mt-2 space-y-1">
                  {s.invoices.map((inv) => (
                    <div key={inv.id} className="flex flex-wrap items-center gap-2 text-xs text-ink2">
                      <span className="font-mono">{inv.referenceMonth}</span>
                      <span className="font-semibold">{money(inv.amountCents)}</span>
                      <span className={`rounded-full border px-2 py-0.5 ${inv.status === "AUTORIZADA" ? "border-green-200 bg-green-50 text-green-700" : inv.status === "REJEITADA" || inv.status === "ERRO" ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                        {inv.status}
                      </span>
                      {inv.pdfUrl ? (
                        <a href={inv.pdfUrl} target="_blank" rel="noreferrer" className="text-brand-600 underline">PDF</a>
                      ) : null}
                      {inv.status === "PROCESSANDO" ? (
                        <button onClick={() => act(s.id, "refresh-invoice", { invoiceId: inv.id })} className="underline">
                          atualizar
                        </button>
                      ) : null}
                      {inv.status === "PENDENTE" || inv.status === "ERRO" ? (
                        <button
                          onClick={() => {
                            const url = window.prompt("Link do PDF da nota (opcional — Enter para pular):") || undefined;
                            void act(s.id, "mark-invoice-emitted", { invoiceId: inv.id, ...(url ? { pdfUrl: url } : {}) });
                          }}
                          className="underline"
                          title="Emitiu à mão no Emissor Nacional (gov.br)? Registre aqui para a fila não mentir."
                        >
                          marcar emitida (manual)
                        </button>
                      ) : null}
                      {inv.errorMessage ? <span className="text-muted">— {inv.errorMessage.slice(0, 120)}</span> : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
