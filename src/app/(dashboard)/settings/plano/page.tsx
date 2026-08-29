"use client";

/**
 * /settings/plano — o plano da loja, e o botão de cancelar.
 *
 * ── Por que esta tela existe ────────────────────────────────────────────────
 *
 * "Cancele quando quiser" está publicado em quatro lugares nossos, um deles o
 * Termo que o cliente assina. Até 29/08/2026 não havia botão: cancelar era
 * mandar mensagem e esperar alguém da Foocci clicar no admin.
 *
 * ── As três coisas que esta tela não pode fazer ─────────────────────────────
 *
 *  1. **Não pode esconder o que acontece depois.** As consequências vêm do
 *     SERVIDOR (`CONSEQUENCIAS_DO_CANCELAMENTO`), onde cada frase carrega a
 *     cláusula do Termo de onde saiu. Se estivessem escritas aqui, a primeira
 *     pessoa que "melhorasse o texto" poderia prometer devolução de dinheiro que
 *     o contrato não promete — e a promessa da tela valeria contra nós.
 *
 *  2. **Não pode cancelar com um clique só.** Confirmação em duas etapas, com o
 *     nome do plano à vista. É o único botão desta área que não tem desfazer:
 *     a reassinatura, nesta casa, é um registro NOVO — não a ressurreição do
 *     cancelado.
 *
 *  3. **Não pode dizer "pronto!" quando o Mercado Pago recusou.** Se o gateway
 *     falhar, a assinatura está cancelada aqui (a trava anti-reativação está
 *     armada), mas o cartão pode ser cobrado mais uma vez. A tela diz isso, com
 *     o que fazer — e não um visto verde que o extrato vai desmentir.
 *
 * ⚠️ A TELA NÃO CALCULA DATA NEM VALOR. O Termo v2 diz "ao fim do mês em curso",
 * e o sistema não guarda essa data (`PlanSubscription` não tem coluna de fim de
 * período). Derivar de `activatedAt` daria um dia plausível e às vezes errado —
 * e data errada numa tela de cancelamento é promessa quebrada. Então a tela
 * mostra a REGRA e as âncoras que existem de verdade (desde quando está ativa,
 * qual é o ciclo). Pendência registrada para o CEO.
 *
 * ⛔ E NÃO MOSTRA O VALOR DA DEVOLUÇÃO. A conta existe e é pura
 * (`@/lib/billing/saidaDoPlano`), mas exibi-la aqui seria anunciar um número que
 * ninguém se comprometeu a pagar em que prazo — e esta tela não move dinheiro.
 * Quem decide como o estorno é executado é o CEO; até lá, a tela diz a regra.
 */

import { useEffect, useState } from "react";
import { apiFetch, PageCard, SectionHeading, Feedback } from "../_shared";

const PLANO_LABEL: Record<string, string> = {
  STARTER: "Essencial",
  GROWTH: "Crescimento",
  PRO: "Performance",
};

const CICLO_LABEL: Record<string, string> = {
  MENSAL: "por mês",
  TRIMESTRAL: "a cada 3 meses",
  ANUAL: "por ano",
};

const SITUACAO_LABEL: Record<string, string> = {
  DRAFT: "Em preparação",
  AGUARDANDO_ACEITE: "Aguardando o aceite do Termo",
  ACEITO: "Termo aceito — aguardando o pagamento",
  AGUARDANDO_PAGAMENTO: "Aguardando o pagamento",
  ATIVA: "Ativa",
  INADIMPLENTE: "Pagamento em atraso",
  CANCELADA: "Cancelada",
};

interface Assinatura {
  id: string;
  plan: string;
  cycle: string;
  priceCents: number;
  status: string;
  activatedAt: string | null;
  canceledAt: string | null;
  veredito: "podeCancelar" | "jaCancelada" | "naoExiste";
}

function dinheiro(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dia(iso: string | null): string | null {
  return iso ? new Date(iso).toLocaleDateString("pt-BR") : null;
}

export default function PlanoPage() {
  const [assinatura, setAssinatura] = useState<Assinatura | null>(null);
  const [consequencias, setConsequencias] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [confirmando, setConfirmando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [avisoDoGateway, setAvisoDoGateway] = useState<string | null>(null);

  async function carregar() {
    const { ok, data } = await apiFetch("/api/billing/subscription");
    if (ok) {
      setAssinatura(data?.assinatura ?? null);
      setConsequencias(data?.consequencias ?? []);
    } else {
      setErro("Não deu para ler os dados do seu plano agora. Recarregue a página.");
    }
    setCarregando(false);
  }

  useEffect(() => {
    void carregar();
  }, []);

  async function cancelar() {
    setCancelando(true);
    setErro(null);
    setAvisoDoGateway(null);

    const { ok, data } = await apiFetch("/api/billing/subscription", "DELETE");
    setCancelando(false);

    if (!ok) {
      setErro(data?.error ?? "Não deu para cancelar agora. Tente de novo em alguns minutos.");
      return;
    }

    setConfirmando(false);
    setSucesso(
      data?.jaEstavaCancelada
        ? "Sua assinatura já estava cancelada — nada mudou."
        : "Assinatura cancelada. Você recebe a confirmação por e-mail.",
    );
    // A falha do gateway NÃO vira sucesso silencioso: o cancelamento valeu do
    // nosso lado, mas o cartão pode ser cobrado mais uma vez, e a pessoa
    // precisa saber disso hoje — não no extrato do mês que vem.
    if (data?.gatewayOk === false) {
      setAvisoDoGateway(
        "Cancelamos do nosso lado, mas não conseguimos avisar a operadora do cartão. " +
          "Pode cair mais uma cobrança. Fale com a gente pelo WhatsApp que resolvemos — " +
          "e guarde esta mensagem.",
      );
    }
    await carregar();
  }

  if (carregando) return <p className="py-8 text-sm text-muted">Carregando…</p>;

  if (!assinatura) {
    return (
      <PageCard>
        <SectionHeading
          title="Seu plano"
          subtitle="Esta loja não tem uma assinatura registrada no sistema."
        />
        <p className="text-sm leading-relaxed text-ink2">
          Se você paga pelo Foocci e esta tela diz o contrário, fale com a gente pelo WhatsApp:
          é um registro faltando, não uma cobrança a menos.
        </p>
      </PageCard>
    );
  }

  const cancelada = assinatura.veredito === "jaCancelada";

  return (
    <div className="space-y-5">
      <Feedback success={sucesso} error={erro} onDismiss={() => setErro(null)} />

      {avisoDoGateway && (
        <div
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-800"
        >
          {avisoDoGateway}
        </div>
      )}

      <PageCard>
        <SectionHeading title="Seu plano" />
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="text-lg font-semibold text-ink">
              {PLANO_LABEL[assinatura.plan] ?? assinatura.plan}
            </p>
            <p className="mt-0.5 text-sm text-muted">
              {SITUACAO_LABEL[assinatura.status] ?? assinatura.status}
              {cancelada && dia(assinatura.canceledAt) ? ` em ${dia(assinatura.canceledAt)}` : ""}
            </p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold tabular-nums text-brand-600">
              {dinheiro(assinatura.priceCents)}
            </p>
            <p className="mt-0.5 text-sm text-muted">
              {CICLO_LABEL[assinatura.cycle] ?? assinatura.cycle.toLowerCase()}
            </p>
          </div>
        </div>
        {dia(assinatura.activatedAt) && (
          <p className="mt-4 border-t border-line pt-4 text-sm text-muted">
            Ativa desde {dia(assinatura.activatedAt)}.
          </p>
        )}
      </PageCard>

      {cancelada ? (
        <PageCard>
          <SectionHeading title="Assinatura cancelada" />
          <ul className="space-y-2">
            {consequencias.map((c) => (
              <li key={c} className="flex gap-2 text-sm leading-relaxed text-ink2">
                <span aria-hidden="true" className="text-muted">
                  •
                </span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t border-line pt-4 text-sm leading-relaxed text-ink2">
            Quer voltar? Fale com a gente pelo WhatsApp. A volta é uma assinatura nova — o
            histórico desta fica guardado do jeito que está.
          </p>
        </PageCard>
      ) : (
        <PageCard>
          <SectionHeading
            title="Cancelar a assinatura"
            subtitle="Você pode cancelar a qualquer momento, sem multa e sem fidelidade."
          />

          <ul className="space-y-2">
            {consequencias.map((c) => (
              <li key={c} className="flex gap-2 text-sm leading-relaxed text-ink2">
                <span aria-hidden="true" className="text-muted">
                  •
                </span>
                <span>{c}</span>
              </li>
            ))}
          </ul>

          {!confirmando ? (
            <div className="mt-5 border-t border-line pt-5">
              <button
                type="button"
                onClick={() => setConfirmando(true)}
                className="rounded-xl border border-red-200 bg-paper px-5 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
              >
                Quero cancelar
              </button>
            </div>
          ) : (
            /* Duas etapas: o nome do plano aparece na confirmação de propósito —
               é o que impede o "cancelei sem ver o que estava cancelando". */
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-semibold text-red-800">
                Cancelar o plano {PLANO_LABEL[assinatura.plan] ?? assinatura.plan}?
              </p>
              {/* Dizia "até o fim do ciclo já pago" até 29/08/2026 — a frase da
                  v1 do Termo. Com a v2, o resto do ciclo é DEVOLVIDO, então o
                  acesso vai até o fim do mês em curso; manter o acesso o ano
                  inteiro E devolver o dinheiro seriam as duas coisas ao mesmo
                  tempo. O detalhe do dinheiro está nas consequências acima, que
                  vêm do servidor. */}
              <p className="mt-1 text-sm leading-relaxed text-red-700">
                Seu acesso continua até o fim do mês em curso, que você já pagou. Para voltar
                depois, será uma assinatura nova.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={cancelar}
                  disabled={cancelando}
                  className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                >
                  {cancelando ? "Cancelando…" : "Sim, cancelar minha assinatura"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmando(false)}
                  disabled={cancelando}
                  className="rounded-xl border border-line bg-paper px-5 py-2.5 text-sm font-semibold text-ink2 transition hover:bg-canvas disabled:opacity-50"
                >
                  Deixa pra lá
                </button>
              </div>
            </div>
          )}
        </PageCard>
      )}
    </div>
  );
}
