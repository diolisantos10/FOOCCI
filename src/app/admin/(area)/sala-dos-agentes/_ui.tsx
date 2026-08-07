"use client";

/**
 * Sala dos Agentes — os primitivos visuais da tela (doutrina 20 do kit).
 *
 * ── A REGRA QUE GOVERNA ESTE ARQUIVO ──
 *
 * `Medida` tem TRÊS estados e a tela trata os três. Não existe `?? 0` aqui, nem
 * pode existir: "não medido" e "gastou zero" são coisas diferentes, e um painel
 * que confunde as duas ensina o dono a não confiar nele. Três telas do Foocci
 * mentiram exatamente assim — e nenhuma delas era feia.
 *
 * `ValorMedida` é o único lugar do produto autorizado a pintar uma `Medida`.
 * Quem precisar de outra variação acrescenta um `tom` aqui, não escreve o
 * ternário de novo na tela.
 */

import Link from "next/link";
import type { Medida } from "@/services/agents/salaDosAgentes.types";
import {
  DESENHO_DO_ESTADO,
  ORDEM_DOS_ESTADOS,
  desenhoDoEstado,
  nomeDoEstado,
} from "./_estados";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// ── Medida: os três estados ──────────────────────────────────────────────────

/** Formata o valor medido. `unidade` de dinheiro vira símbolo; o resto vai atrás. */
export function formatarValor(valor: number, unidade?: string): string {
  const u = (unidade ?? "").trim();
  if (u === "USD" || u === "US$") {
    return `US$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (u === "BRL" || u === "R$") {
    return `R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  const n = Number.isInteger(valor)
    ? valor.toLocaleString("pt-BR")
    : valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return u ? `${n} ${u}` : n;
}

/**
 * O valor de uma medida, nos três estados.
 *
 * - `medido`      → o número, tabular
 * - `naoMedido`   → "não medido", itálico e secundário (o motivo é impresso por
 *                   quem chama — ver `MotivosNaoMedido` e a ficha)
 * - `zeroProvado` → um traço
 */
export function ValorMedida({
  medida,
  tamanho = "cartao",
}: {
  medida: Medida;
  tamanho?: "cartao" | "linha" | "destaque";
}) {
  const forte =
    tamanho === "destaque"
      ? "text-[21px] leading-tight"
      : tamanho === "linha"
        ? "text-[13px]"
        : "text-[14px]";
  const fraco =
    tamanho === "destaque" ? "text-[15px]" : tamanho === "linha" ? "text-[13px]" : "text-[12px]";

  if (medida.estado === "medido") {
    return (
      <span className={cx("font-semibold tabular-nums tracking-[-.01em] text-ink", forte)}>
        {formatarValor(medida.valor, medida.unidade)}
      </span>
    );
  }

  if (medida.estado === "zeroProvado") {
    return (
      <span
        className={cx("font-semibold tabular-nums text-ink2", forte)}
        title="Existe medição e o valor é zero."
      >
        —
      </span>
    );
  }

  return (
    <em className={cx("font-normal italic text-muted", fraco)} title={medida.motivo}>
      não medido
    </em>
  );
}

/** true quando existe pelo menos uma medida sem instrumentação na lista. */
export function temNaoMedido(metricas: Array<{ rotulo: string; medida: Medida }>): boolean {
  return metricas.some((m) => m.medida.estado === "naoMedido");
}

/**
 * Agrupa as medidas sem instrumentação PELO MOTIVO, não pelo rótulo.
 *
 * Com dados reais, três métricas do mesmo agente ("Chamadas de IA", "Custo
 * atribuído", "Tokens") carregam a MESMA explicação de cinco linhas — e a tela
 * imprimia o parágrafo três vezes seguidas. Repetir a evidência não a torna
 * mais forte: torna o bloco ilegível e ensina a pular a leitura, que é o
 * oposito do que o motivo existe para fazer.
 *
 * A evidência aparece UMA vez, com a lista de rótulos que ela explica.
 */
export function agruparMotivos(
  metricas: Array<{ rotulo: string; medida: Medida }>,
): Array<{ motivo: string; rotulos: string[] }> {
  const porMotivo = new Map<string, string[]>();
  for (const m of metricas) {
    if (m.medida.estado !== "naoMedido") continue;
    const atual = porMotivo.get(m.medida.motivo);
    if (atual) atual.push(m.rotulo);
    else porMotivo.set(m.medida.motivo, [m.rotulo]);
  }
  return [...porMotivo].map(([motivo, rotulos]) => ({ motivo, rotulos }));
}

/**
 * O motivo do "não medido", ao alcance do dedo.
 *
 * `title` só existe no desktop — no celular não há hover, e uma explicação que
 * só o mouse alcança é explicação que ninguém lê. Por isso um `<details>`
 * nativo: abre no toque, funciona sem JS e não rouba o clique do cartão.
 */
export function MotivosNaoMedido({
  metricas,
  className,
}: {
  metricas: Array<{ rotulo: string; medida: Medida }>;
  className?: string;
}) {
  const grupos = agruparMotivos(metricas);
  if (grupos.length === 0) return null;

  return (
    <details className={cx("group/motivo relative z-10", className)}>
      <summary className="inline-flex w-fit cursor-pointer list-none items-center gap-1 rounded-lg px-1.5 py-0.5 -ml-1.5 text-[11.5px] font-semibold text-brand-700 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-100">
        <span aria-hidden="true" className="transition-transform group-open/motivo:rotate-90">
          ›
        </span>
        Por que não medido?
      </summary>
      <ul className="mt-1.5 space-y-1.5 rounded-xl border border-line bg-canvas px-3 py-2">
        {grupos.map((g) => (
          <li key={g.motivo} className="text-[11.5px] leading-snug text-ink2">
            <span className="font-semibold text-ink">{g.rotulos.join(" · ")}:</span> {g.motivo}
          </li>
        ))}
      </ul>
    </details>
  );
}

// ── Peças de estado ──────────────────────────────────────────────────────────

/**
 * O ponto de estado. A tabela de desenhos mora em `_estados.ts` (módulo puro),
 * para que um teste consiga afirmar que cada estado do contrato tem tratamento
 * próprio — ver `_estados.test.ts`.
 */
export function PontoEstado({ estado, className }: { estado: string; className?: string }) {
  const p = desenhoDoEstado(estado);
  return (
    <span
      className={cx("inline-block h-[7px] w-[7px] shrink-0 rounded-full", p.classe, className)}
      role="img"
      aria-label={p.texto}
      title={`${p.texto} — ${p.ajuda}`}
    />
  );
}

export { nomeDoEstado };

/**
 * A legenda dos quatro pontinhos, uma vez por tela.
 *
 * Existe porque um ponto de 7px não carrega quatro significados sozinho, e
 * repetir o rótulo em cada cartão encheria a grade de ruído. Uma linha discreta
 * resolve para todos os cartões abaixo dela.
 */
export function LegendaDeEstados() {
  return (
    <ul className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {ORDEM_DOS_ESTADOS.map((e) => (
        <li key={e} className="flex items-center gap-1.5">
          <PontoEstado estado={e} />
          <span className="text-[11.5px] text-muted">{DESENHO_DO_ESTADO[e].texto}</span>
        </li>
      ))}
    </ul>
  );
}

export function EtiquetaArea({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex w-fit items-center rounded-full border border-line bg-canvas px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[.08em] text-ink2">
      {children}
    </span>
  );
}

/** A marca dos cinco Essenciais (doutrina 23): não podem ser apagados. */
export function SeloEssencial() {
  return (
    <span
      className="inline-flex w-fit items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[.06em] text-brand-700"
      title="Um dos cinco Essenciais — vem com todo projeto da casa e não pode ser apagado."
    >
      <span aria-hidden="true">★</span> Essencial
    </span>
  );
}

/** Aviso âmbar — o bloco que carrega a própria evidência. */
export function Nota({
  marca = "Atenção",
  children,
}: {
  marca?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5">
      <span className="shrink-0 pt-[3px] text-[11px] font-semibold uppercase tracking-[.08em] text-amber-700">
        {marca}
      </span>
      <div className="min-w-0 space-y-1.5 text-[13px] leading-relaxed text-amber-700">{children}</div>
    </div>
  );
}

/**
 * O mesmo aviso, dobrado.
 *
 * A lista de lacunas é longa por natureza e, aberta, comia a primeira tela
 * inteira do celular — o dono via só ressalva e nenhum agente. Dobrada, a
 * existência do buraco continua visível (o contador do topo já grita), e o
 * detalhe fica a um toque. Fechado por padrão nos três tamanhos: um estado só,
 * porque `open` não tem variante responsiva sem JS e tela que muda de
 * comportamento com a largura confunde quem alterna.
 */
export function NotaColapsavel({
  marca = "Atenção",
  resumo,
  children,
}: {
  marca?: string;
  resumo: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <details className="group/nota overflow-hidden rounded-2xl border border-amber-200 bg-amber-50">
      <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200">
        <span className="shrink-0 pt-[3px] text-[11px] font-semibold uppercase tracking-[.08em] text-amber-700">
          {marca}
        </span>
        <span className="min-w-0 text-[13px] font-semibold leading-relaxed text-amber-700">
          {resumo}
        </span>
        <span
          aria-hidden="true"
          className="ml-auto shrink-0 pt-0.5 text-[13px] text-amber-700 transition-transform group-open/nota:rotate-90"
        >
          ›
        </span>
      </summary>
      <div className="space-y-1.5 px-4 pb-3.5 text-[13px] leading-relaxed text-amber-700 sm:pl-[92px]">
        {children}
      </div>
    </details>
  );
}

export function TituloSecao({ titulo, sub }: { titulo: string; sub?: string }) {
  return (
    <div className="mt-8">
      <h2 className="text-[15px] font-semibold tracking-[-.01em] text-ink">{titulo}</h2>
      {sub && <p className="mt-0.5 max-w-[76ch] text-[12.5px] leading-relaxed text-muted">{sub}</p>}
    </div>
  );
}

export function Resumo({
  itens,
}: {
  itens: Array<{ rotulo: string; valor: React.ReactNode; sub?: string; alerta?: boolean }>;
}) {
  return (
    <div className="mt-5 flex flex-wrap gap-2.5">
      {itens.map((i) => (
        <div
          key={i.rotulo}
          className={cx(
            "min-w-[130px] flex-1 rounded-xl border px-4 py-2.5",
            i.alerta ? "border-amber-200 bg-amber-50" : "border-line bg-paper",
          )}
        >
          <div
            className={cx(
              "text-[21px] font-semibold leading-tight tracking-[-.02em] tabular-nums",
              i.alerta ? "text-amber-700" : "text-ink",
            )}
          >
            {i.valor}
          </div>
          <div className="mt-0.5 text-[11px] uppercase tracking-[.07em] text-muted">{i.rotulo}</div>
          {i.sub && <div className="mt-1 text-[11px] leading-snug text-muted">{i.sub}</div>}
        </div>
      ))}
    </div>
  );
}

// ── Estados obrigatórios: carregando / vazio / erro ──────────────────────────

export function Carregando({ cartoes = 6 }: { cartoes?: number }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando a Sala dos Agentes…</span>
      <div className="mt-5 flex flex-wrap gap-2.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="min-w-[130px] flex-1 rounded-xl border border-line bg-paper px-4 py-2.5">
            <div className="h-5 w-10 animate-pulse rounded-lg bg-line2" />
            <div className="mt-2 h-2.5 w-20 animate-pulse rounded bg-line" />
          </div>
        ))}
      </div>
      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: cartoes }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-line bg-paper p-4">
            <div className="h-4 w-28 animate-pulse rounded bg-line2" />
            <div className="mt-2 h-2.5 w-16 animate-pulse rounded bg-line" />
            <div className="mt-4 h-2.5 w-full animate-pulse rounded bg-line" />
            <div className="mt-1.5 h-2.5 w-4/5 animate-pulse rounded bg-line" />
            <div className="mt-4 h-9 w-full animate-pulse rounded-xl bg-line" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function Vazio({
  titulo,
  descricao,
  acao,
}: {
  titulo: string;
  descricao: string;
  acao?: { texto: string; href: string };
}) {
  return (
    <div className="mt-6 rounded-2xl border border-dashed border-line2 bg-paper px-6 py-12 text-center">
      <p className="text-[15px] font-semibold text-ink">{titulo}</p>
      <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-ink2">{descricao}</p>
      {acao && (
        <Link
          href={acao.href}
          className="mt-4 inline-flex items-center justify-center rounded-xl border border-brand-500 bg-brand-500 px-4 py-2.5 text-[13.5px] font-semibold text-white shadow-[0_6px_16px_-6px_rgba(249,115,22,.55)] transition-colors hover:bg-brand-600"
        >
          {acao.texto}
        </Link>
      )}
    </div>
  );
}

/**
 * Erro com saída acionável. Diz o que houve, o que fazer, e dá o botão —
 * sem jargão e sem tela morta.
 */
export function Erro({
  detalhe,
  onTentarDeNovo,
}: {
  detalhe?: string | null;
  onTentarDeNovo: () => void;
}) {
  return (
    <div
      role="alert"
      className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-6 text-center sm:px-8"
    >
      <p className="text-[15px] font-semibold text-red-600">
        Não deu para carregar a Sala dos Agentes.
      </p>
      <p className="mx-auto mt-1.5 max-w-lg text-[13px] leading-relaxed text-ink2">
        A lista de agentes vem do servidor e a resposta não chegou. Tente de novo — se insistir,
        é sinal de que o serviço da Sala ainda não está no ar neste ambiente.
      </p>
      {detalhe && (
        <p className="mx-auto mt-2 max-w-lg font-mono text-[11.5px] leading-snug text-muted">
          {detalhe}
        </p>
      )}
      <button
        type="button"
        onClick={onTentarDeNovo}
        className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl border border-brand-500 bg-brand-500 px-4 py-2.5 text-[13.5px] font-semibold text-white shadow-[0_6px_16px_-6px_rgba(249,115,22,.55)] transition-colors hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-100"
      >
        Tentar de novo
      </button>
    </div>
  );
}
