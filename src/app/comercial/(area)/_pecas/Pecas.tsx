/**
 * AS PEÇAS COMPARTILHADAS DAS TELAS NOVAS DA ÁREA COMERCIAL.
 *
 * ── POR QUE COMPARTILHAR SÓ ISTO, E NADA MAIS ───────────────────────────────
 *
 * Torre, Central SDR e CRM IA são três telas com três perguntas diferentes.
 * O que elas têm em comum não é o conteúdo — é a GRAMÁTICA: o que é uma seção,
 * como um número aparece, e, sobretudo, **como se escreve um número que
 * ninguém mediu**. Essa última é a que não pode divergir entre telas: se uma
 * escreve "0" e a outra escreve "não medido" para a mesma ausência, o operador
 * aprende a ler zero como ausência — e a partir daí o zero verdadeiro, o que
 * merece ação, passa despercebido.
 *
 * Nada aqui inventa, arredonda ou completa dado. Estas peças só desenham.
 *
 * ⚠️ Pasta com `_` na frente: o Next não cria rota a partir dela.
 */

import * as React from "react";

export function cx(...p: Array<string | false | null | undefined>): string {
  return p.filter(Boolean).join(" ");
}

/** O formato que os serviços da casa usam para "medi ou não medi". */
export type Medida<T> = { medido: true; valor: T } | { medido: false; motivo: string };

export function Secao({
  titulo,
  descricao,
  children,
}: {
  titulo: string;
  descricao?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div>
        <h2 className="text-[11px] font-semibold uppercase tracking-[.08em] text-muted">{titulo}</h2>
        {descricao ? (
          <p className="mt-0.5 max-w-[80ch] text-[12px] leading-snug text-muted">{descricao}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/**
 * A ausência de medição, escrita.
 *
 * Nunca um traço mudo e nunca um zero: o motivo aparece junto, porque
 * "não medido" sem motivo é a mesma parede de "0" — ninguém sabe o que fazer
 * com ela.
 */
export function NaoMedido({ motivo }: { motivo: string }) {
  return (
    <span className="inline-flex flex-col gap-0.5">
      <span className="text-[13px] font-normal italic text-muted">não medido</span>
      <span className="max-w-[60ch] text-[11.5px] leading-snug text-muted">{motivo}</span>
    </span>
  );
}

/**
 * O cartão de número: rótulo em cima, número embaixo, e o motivo no lugar do
 * número quando não houve medição.
 */
export function Numero({
  rotulo,
  valor,
  motivo,
  rodape,
  destaque,
}: {
  rotulo: string;
  /** `null` significa NÃO MEDIDO, e exige `motivo`. Zero é zero, e é medido. */
  valor: number | string | null;
  motivo?: string;
  rodape?: React.ReactNode;
  destaque?: "alerta" | "neutro";
}) {
  const semMedida = valor === null;
  return (
    <div
      className={cx(
        "rounded-2xl border p-3",
        destaque === "alerta" && !semMedida ? "border-red-200 bg-red-50" : "border-line bg-paper",
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-[.04em] text-muted">{rotulo}</p>
      <div className="mt-1">
        {semMedida ? (
          <NaoMedido motivo={motivo ?? "o serviço não devolveu motivo — e isso também é um defeito"} />
        ) : (
          <span
            className={cx(
              "text-2xl font-semibold tabular-nums",
              destaque === "alerta" ? "text-red-700" : "text-ink",
            )}
          >
            {valor}
          </span>
        )}
      </div>
      {rodape ? <div className="mt-1 text-[11.5px] leading-snug text-muted">{rodape}</div> : null}
    </div>
  );
}

/** A grade de cartões — uma coluna no celular, sempre. */
export function Grade({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}

export function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <p className="max-w-[80ch] rounded-2xl border border-amber-200 bg-amber-50 p-4 text-[13px] leading-relaxed text-amber-950">
      {children}
    </p>
  );
}

export function Caixa({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-[80ch] rounded-2xl border border-line bg-paper p-4 text-[13.5px] leading-relaxed text-ink2">
      {children}
    </div>
  );
}

/** O cabeçalho de uma tela: título, subtítulo e nada mais. */
export function Cabecalho({ titulo, subtitulo }: { titulo: string; subtitulo: string }) {
  return (
    <header>
      <h1 className="text-[22px] font-semibold tracking-tight text-ink">{titulo}</h1>
      <p className="mt-0.5 max-w-[80ch] text-[13px] leading-snug text-ink2">{subtitulo}</p>
    </header>
  );
}

/** O estado de uma tela que busca dados. Igual nas três, de propósito. */
export type Fase<T> =
  | { fase: "carregando" }
  | { fase: "pronto"; dados: T }
  | { fase: "semAcesso" }
  | { fase: "erro"; detalhe: string | null };

export function Carregando({ texto }: { texto: string }) {
  return <Caixa>{texto}</Caixa>;
}

export function SemAcesso() {
  return (
    <Caixa>
      <strong>Esta tela não é sua.</strong> A recusa vem do servidor, não desta
      página: ela mostra a operação comercial inteira, e o SDR não vê a régua
      comparada do time.
    </Caixa>
  );
}

export function Erro({ detalhe }: { detalhe: string | null }) {
  return (
    <Caixa>
      <strong>Não deu para medir agora.</strong>{" "}
      {detalhe ?? "O servidor não explicou o motivo."} Nada aqui foi estimado para
      preencher o buraco — a tela prefere ficar vazia a ficar errada.
    </Caixa>
  );
}

/**
 * A variação entre duas janelas, escrita sem chute.
 *
 * Base zero não vira "+100%": crescer de 0 para 3 não tem porcentagem, e
 * inventar uma faz um dia comum parecer um recorde.
 */
export function textoDaVariacao(de: number, para: number): string {
  if (de === 0 && para === 0) return "zero nos dois dias";
  if (de === 0) return `sem base ontem para comparar (hoje: ${para})`;
  const p = Math.round(((para - de) / de) * 100);
  return `${p > 0 ? "+" : ""}${p}% vs. ontem (${de} → ${para})`;
}

/** Centavos em reais. Não arredonda para cima, e não esconde o centavo. */
export function emReais(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
